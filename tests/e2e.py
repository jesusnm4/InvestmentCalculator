"""Regression suite: every flow that has broken before, checked in real browsers.

Run before every commit (dev-only; needs the .venv from the README):

    .venv/bin/python -I tests/e2e.py            # everything
    .venv/bin/python -I tests/e2e.py share      # only checks whose name contains "share"

It serves the project on a spare port itself, drives Chromium and WebKit (iPhone 13),
and exits non-zero if any check fails. Each check starts from empty storage.
"""
import base64
import json
import os
import re
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = 'investment-projection-v1'
JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
NO_SMOOTH = "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');" \
            "s.textContent='html{scroll-behavior:auto!important}';document.head.appendChild(s)})"

CHECKS = []
FAILURES = []


def check(fn):
    CHECKS.append(fn)
    return fn


def expect(cond, what):
    if not cond:
        raise AssertionError(what)


# ---------------------------------------------------------------- helpers

def season(name, months, **kw):
    return dict(name=name, months=months, monthlyContribution=kw.get('amt', 0),
                annualRatePercent=kw.get('rate', 4), compounding='monthly',
                flow=kw.get('flow', 'save'), withdrawUnit=kw.get('unit', 'percent'),
                withdrawPercent=kw.get('pct', 4), colorSlot=kw.get('slot', 0), lengthUnit='years')


def extra(name, at, amount, every=0, fixed=False):
    return {'name': name, 'atMonth': at, 'amount': amount, 'repeatEvery': every, 'repeatUntil': None,
            'shapeSlot': 0, 'atUnit': 'months', 'everyUnit': 'years', 'untilUnit': 'years', 'fixed': fixed}


def plan(periods, windfalls=(), start=10000, money='today'):
    return {'startingAmount': start, 'inflationPercent': 2.5, 'periods': list(periods),
            'windfalls': list(windfalls), 'view': {'money': money}}


class Session:
    """One browser context with error capture; `open(state)` loads the page with that plan."""

    def __init__(self, browser, base, **ctx):
        self.base = base
        self.ctx = browser.new_context(**ctx)
        self.ctx.add_init_script(NO_SMOOTH)
        self.errors = []
        self.pg = self.ctx.new_page()
        self.pg.on('pageerror', lambda e: self.errors.append(str(e)))
        self.pg.on('console', lambda m: m.type == 'error' and self.errors.append(m.text))

    def open(self, state=None, path='/'):
        self.pg.goto(self.base + '/')
        self.pg.evaluate('s => s ? localStorage.setItem("%s", JSON.stringify(s)) : localStorage.clear()' % KEY, state)
        self.pg.goto(self.base + path)
        self.pg.wait_for_selector('#final-amount')
        self.pg.wait_for_timeout(150)
        return self.pg

    def text(self, sel):
        return self.pg.text_content(sel).strip() if self.pg.is_visible(sel) else None

    def stored(self):
        return self.pg.evaluate('JSON.parse(localStorage.getItem("%s"))' % KEY)

    def close(self):
        expect(not self.errors, 'page errors: %s' % self.errors)
        self.ctx.close()


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


# ---------------------------------------------------------------- static checks

@check
def css_braces_balance(env):
    css = re.sub(r'/\*.*?\*/', '', open(os.path.join(ROOT, 'styles.css')).read(), flags=re.S)
    depth = low = 0
    for c in css:
        depth += (c == '{') - (c == '}')
        low = min(low, depth)
    expect(depth == 0 and low == 0, 'styles.css braces unbalanced (depth %d, min %d)' % (depth, low))


@check
def cache_versions_match(env):
    html = open(os.path.join(ROOT, 'index.html')).read()
    versions = set(re.findall(r'\?v=([\w.-]+)"', html))
    expect(len(versions) == 1, 'index.html ?v= values differ: %s' % versions)


@check
def math_suite(env):
    if not os.path.exists(JSC):
        return
    src = 'var window = this;\n' + open(os.path.join(ROOT, 'js/calc.js')).read() + open(os.path.join(ROOT, 'js/calc.test.js')).read() + \
        '\nCalcTests.results.forEach(function(t){ if(!t.pass) print("FAIL " + t.name + " " + t.detail) }); print("total " + CalcTests.results.length);'
    path = os.path.join(env['tmp'], 'calc_suite.js')
    open(path, 'w').write(src)
    out = subprocess.run([JSC, path], capture_output=True, text=True).stdout
    expect('FAIL' not in out and 'total' in out, 'calc tests failed:\n' + out)


# ---------------------------------------------------------------- layout

@check
def desktop_is_styled_and_pinned(env):
    for theme in ('light', 'dark'):
        for h in (800, 900):
            s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': h}, color_scheme=theme)
            pg = s.open()
            css = pg.evaluate("""(() => {
              const r = document.getElementById('results');
              return { hero: parseFloat(getComputedStyle(document.getElementById('final-amount')).fontSize),
                       kpis: getComputedStyle(document.querySelector('.kpis')).display,
                       pos: getComputedStyle(r).position, unpinned: r.classList.contains('unpinned'),
                       bottom: r.getBoundingClientRect().bottom, vh: innerHeight };
            })()""")
            expect(css['hero'] > 30 and css['kpis'] == 'grid', '%s %d: page looks unstyled %s' % (theme, h, css))
            expect(css['pos'] == 'sticky' and not css['unpinned'], '%s %d: results not pinned %s' % (theme, h, css))
            expect(css['bottom'] <= css['vh'], '%s %d: results column runs past the window %s' % (theme, h, css))
            s.close()


@check
def phone_fits_and_targets(env):
    s = Session(env['webkit'], env['base'], **env['iphone'])
    pg = s.open()
    pg.click('.period:nth-child(3) .card-summary')
    pg.click('#add-windfall')
    small = pg.evaluate("""[...document.querySelectorAll('button, input, select, summary, a, label.repeat-toggle')].filter(e => {
        if (!e.offsetParent || e.closest('details:not([open]) > :not(summary)') || e.classList.contains('skip-link')) return false;
        // Documented exceptions: unit pickers inset in a 44px field; boxes inside 44px labels.
        if (e.closest('.unit-select') || (e.type === 'checkbox' || e.type === 'radio')) return false;
        const r = e.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      }).map(e => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))""")
    expect(not small, 'touch targets under 44px: %s' % small)
    expect(not pg.evaluate('document.documentElement.scrollWidth > innerWidth'), 'phone page scrolls sideways')
    s.close()


# ---------------------------------------------------------------- answers

@check
def canonical_answers(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    expect(s.text('#final-amount') == 'Lasts through Retirement', 'example headline: %s' % s.text('#final-amount'))
    expect(s.text('#kpi-contributed') == '$63,111', 'example paid in: %s' % s.text('#kpi-contributed'))
    pg.click('#kpi-sum-wrap summary')
    expect(s.text('#kpi-sum').endswith('= $26,781 left.'), 'example sum: %s' % s.text('#kpi-sum'))
    # Running out.
    s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)]))
    expect(s.text('#final-amount').startswith('Runs out ') and 'into Retirement' in s.text('#final-amount'), 'run-out headline: %s' % s.text('#final-amount'))
    expect('unpaid' in s.text('#final-sub'), 'run-out sub-line: %s' % s.text('#final-sub'))
    # A saving plan an expense leaves below zero: not "runs out", and never green growth.
    s.open(plan([season('Saving', 120, amt=300, rate=6)], [extra('House', 60, -80000)]))
    expect(s.text('#final-amount').startswith('Ends ') and 'below zero' in s.text('#final-amount'), 'debt headline: %s' % s.text('#final-amount'))
    expect('up' not in pg.get_attribute('#kpi-growth', 'class'), 'growth is green beside a debt ending')
    expect(s.text('#kpi-third-label') == 'Owed at the end', 'debt third figure: %s' % s.text('#kpi-third-label'))
    # A pension refilling an empty account must not hide the run-out.
    s.open(plan([season('Saving', 240, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=2500, slot=2)],
                [extra('Pension', 252, 6000, 12, fixed=True)], start=0))
    expect(s.text('#final-amount').startswith('Runs out'), 'pension hid the run-out: %s' % s.text('#final-amount'))
    s.close()


# ---------------------------------------------------------------- editing and undo

@check
def delete_undo_and_keyboard_focus(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.click('.period:nth-child(2) .card-summary')
    pg.focus('.period:nth-child(2) [data-action="delete"]')
    pg.keyboard.press('Enter')
    expect(pg.locator('.period').count() == 2, 'delete did not remove the season')
    expect(pg.evaluate("document.activeElement.classList.contains('card-summary')"), 'keyboard delete lost focus')
    pg.keyboard.press('Meta+z')
    names = pg.evaluate("[...document.querySelectorAll('[data-role=sum-name]')].map(e => e.textContent)")
    expect(names == ['Saving', 'Letting it grow', 'Retirement'], 'undo did not restore the order: %s' % names)
    expect(s.text('#toast-undo') is None, 'after an undo the toast re-offers an older entry')
    s.close()


@check
def phone_delete_keeps_your_place(env):
    s = Session(env['webkit'], env['base'], **env['iphone'])
    pg = s.open()
    pg.click('.period:nth-child(2) .card-summary')
    pg.locator('.period:nth-child(2) .danger-link').scroll_into_view_if_needed()
    pg.tap('.period:nth-child(2) .danger-link')
    pg.wait_for_timeout(600)
    pos = pg.evaluate("""(() => { const a = document.activeElement.getBoundingClientRect(), t = document.getElementById('toast').getBoundingClientRect();
        return { top: a.top, bottom: a.bottom, vh: innerHeight, toastBottom: document.getElementById('toast').hidden ? 0 : t.bottom }; })()""")
    expect(pos['top'] >= pos['toastBottom'] and pos['bottom'] <= pos['vh'], 'focused row off screen or under the toast: %s' % pos)
    s.close()


@check
def flow_switch_undo_keeps_card_open(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.click('.period:nth-child(3) .card-summary')
    pg.click('.period:nth-child(3) [data-flow="dollars"]')
    pg.click('#toast-undo')
    expect(not pg.evaluate("document.querySelector('.period:nth-child(3)').classList.contains('collapsed')"), 'undo collapsed the card')
    s.close()


@check
def repeat_toast_matches_note(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.click('#add-windfall')
    pg.fill('.windfall [data-field="amount"]', '5000')
    pg.check('.windfall [data-field="repeat"]')
    toast, note = s.text('#toast-text'), pg.text_content('.windfall [data-role="at-note"]')
    count = lambda t: re.search(r'(\d+) payments, (\$[\d,]+)', t).groups()
    expect(count(toast) == count(note), 'toast %r vs note %r' % (toast, note))
    s.close()


@check
def anchored_extra_moves_with_its_season(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.click('#add-windfall')
    rid = s.stored()['periods'][2]['id']
    pg.select_option('.windfall [data-field="anchor"]', rid)
    pg.fill('.windfall [data-field="atMonth"]', '0')
    pg.check('.windfall [data-field="repeat"]')
    pg.fill('.windfall [data-field="repeatUntil"]', '10')
    before = pg.text_content('.windfall [data-role="at-note"]')
    pg.click('.period:nth-child(1) .card-summary')
    pg.fill('.period:nth-child(1) [data-field="months"]', '15')
    after = pg.text_content('.windfall [data-role="at-note"]')
    expect('20y 1m into the plan' in before and '25y 1m into the plan' in after, 'anchor did not follow: %r -> %r' % (before, after))
    expect('10 payments' in after, 'until did not follow the season: %r' % after)
    s.close()


# ---------------------------------------------------------------- sharing

def share_url(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = s.open()
    pg.fill('#starting-amount', '123456')
    pg.click('#share-link')
    pg.wait_for_timeout(200)
    url = pg.evaluate('navigator.clipboard.readText()')
    s.close()
    return url


@check
def share_opens_and_never_loses_your_plan(env):
    url = share_url(env)
    expect('#plan=' in url, 'copy link gave %r' % url)
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Mine only', 120, amt=100)], start=777))
    pg = s.pg
    pg.goto(url)
    pg.wait_for_selector('#final-amount')
    pg.wait_for_timeout(200)
    expect(pg.input_value('#starting-amount') == '123,456', 'shared plan not shown')
    # Opening a link must not overwrite the visitor's saved plan before they choose to keep it.
    expect(s.stored()['startingAmount'] == 777, 'opening a link overwrote the saved plan')
    expect(s.text('#shared-note') is not None, 'no note saying this is a shared plan')
    # Leaving without editing: a plain visit shows your own plan again.
    pg.goto(s.base + '/')
    pg.wait_for_selector('#final-amount')
    pg.wait_for_timeout(200)
    names = lambda: pg.evaluate("[...document.querySelectorAll('[data-role=sum-name]')].map(e => e.textContent)")
    expect(names() == ['Mine only'], 'own plan gone after leaving a shared link: %s' % names())
    # Editing a shared plan makes it yours, with your old plan kept aside and one tap away.
    pg.goto(url)
    pg.wait_for_selector('#final-amount')
    pg.wait_for_timeout(200)
    pg.fill('#starting-amount', '200000')
    pg.wait_for_timeout(100)
    expect(s.stored()['startingAmount'] == 200000, 'edits to a shared plan were not saved')
    pg.reload()
    pg.wait_for_selector('#final-amount')
    expect(pg.input_value('#starting-amount') == '200,000', 'reload reopened the link over your edits')
    expect(s.text('#shared-note') is not None, 'after editing, nothing says your own plan is kept aside')
    pg.click('#shared-back')
    pg.wait_for_timeout(200)
    expect(names() == ['Mine only'] and pg.input_value('#starting-amount') == '777', 'Back to your own plan did not restore it: %s' % names())
    expect(s.text('#shared-note') is None, 'shared note still showing after going back')
    pg.reload()
    pg.wait_for_selector('#final-amount')
    expect(names() == ['Mine only'], 'own plan not kept after going back and reloading')
    s.close()


@check
def share_rejects_bad_links(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Mine only', 120, amt=100)], start=777))
    s.pg.goto(s.base + '/#plan=%%%not-base64')
    s.pg.wait_for_selector('#final-amount')
    expect(s.pg.input_value('#starting-amount') == '777', 'a broken link changed the plan')
    hostile = base64.urlsafe_b64encode(json.dumps({'periods': [{'name': '<img src=x onerror=alert(1)>', 'months': 12}]}).encode()).decode().rstrip('=')
    s.pg.goto('about:blank')
    s.pg.goto(s.base + '/#plan=' + hostile)
    s.pg.wait_for_selector('#final-amount')
    s.pg.wait_for_timeout(200)
    expect(s.pg.evaluate("document.querySelectorAll('img').length") == 0, 'hostile link injected markup')
    s.close()


# ---------------------------------------------------------------- chart

@check
def chart_by_keyboard(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.focus('#chart')
    pg.keyboard.press('ArrowRight')
    pg.keyboard.press('ArrowRight')
    expect(s.text('.chart-tooltip .tip-head') == '1 yr', 'arrow keys: %s' % s.text('.chart-tooltip .tip-head'))
    pg.keyboard.press('End')
    expect(s.text('.chart-tooltip .tip-head') == '45 yrs', 'End key: %s' % s.text('.chart-tooltip .tip-head'))
    pg.keyboard.press('Escape')
    expect(pg.evaluate("document.querySelector('.chart-tooltip').hidden"), 'Escape did not hide the readout')
    s.close()


# ---------------------------------------------------------------- tightening (critique #16)

@check
def flagged_return_is_visible_and_sane(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 360, amt=500, rate=80)]))
    meta = pg.text_content('.period:nth-child(1) [data-role="sum-meta"]')
    expect('typo' in meta, 'a flagged return is invisible while its season is collapsed: %r' % meta)
    note = s.text('#kpi-growth-note') or ''
    expect(re.search(r'\d{5,}%', note) is None, 'growth shown as a huge percent: %r' % note)
    lever = s.text('#lever-note') or ''
    expect('Saving $100 more' not in lever, 'save-more pitch on a plan with a flagged return: %r' % lever)
    s.close()


@check
def screen_reader_names(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)]))
    chart = pg.evaluate("[document.getElementById('chart').getAttribute('role'), document.getElementById('chart').getAttribute('aria-label')]")
    expect(chart[0] == 'group' and chart[1], 'focusable chart has no role/name: %s' % chart)
    pg.fill('#starting-amount', '10001')  # the page speaks after an edit, not on load
    pg.wait_for_timeout(1100)
    spoken, shown = pg.text_content('#live-summary'), s.text('#final-amount')
    expect(shown in spoken, 'announcement %r does not use the visible answer %r' % (spoken, shown))
    groups = pg.evaluate("[...document.querySelectorAll('.kpi')].map(k => k.getAttribute('role') + ':' + !!k.getAttribute('aria-labelledby'))")
    expect(all(g == 'group:true' for g in groups), 'figures are not labelled groups: %s' % groups)
    s.close()


@check
def toast_clear_of_the_chart_key(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = s.open()
    pg.click('#add-windfall')
    pg.fill('.windfall [data-field="amount"]', '5000')
    pg.evaluate('window.scrollTo(0, 0)')
    pg.click('#share-link')  # the longest toast ("Link copied. Whoever opens it…")
    pg.wait_for_timeout(200)
    hit = pg.evaluate("""(() => { const t = document.getElementById('toast').getBoundingClientRect(), k = document.getElementById('extras-legend').getBoundingClientRect();
        return !document.getElementById('toast').hidden && t.left < k.right && t.right > k.left && t.top < k.bottom && t.bottom > k.top; })()""")
    expect(not hit, 'the toast covers the chart key')
    s.close()


@check
def dark_placeholder_and_broken_link_feedback(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    pg = s.open()
    pg.click('#add-windfall')
    color = pg.evaluate("getComputedStyle(document.querySelector('.windfall [data-field=amount]'), '::placeholder').color")
    expect(color != 'rgb(117, 117, 117)', 'placeholder uses the browser grey (4:1 on dark): %s' % color)
    pg.goto(s.base + '/#plan=%%%not-base64')
    pg.wait_for_selector('#final-amount')
    pg.wait_for_timeout(200)
    expect('link' in (s.text('#toast-text') or '').lower(), 'a broken link gives no feedback')
    s.close()


@check
def small_wording_and_states(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.click('.period:nth-child(2) .card-summary')
    pg.click('.period:nth-child(2) [data-action="delete"]')
    pg.click('#toast-undo')
    expect('is back' in s.text('#toast-text'), 'undoing a delete reads backwards: %r' % s.text('#toast-text'))
    s.close()
    s = Session(env['webkit'], env['base'], **env['iphone'])
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)]))
    expect('short' in (pg.get_attribute('#result-bar', 'class') or ''), 'phone bar is not marked as a run-out')
    pg.click('.period:nth-child(2) .card-summary')
    gap = pg.evaluate("""(() => { const a = document.querySelector('.period:nth-child(2) [data-role=flow-note]').getBoundingClientRect(),
        b = document.querySelector('.period:nth-child(2) details.more').getBoundingClientRect(); return b.top - a.bottom; })()""")
    expect(gap < 30, 'empty gap before More options on touch: %dpx' % gap)
    s.close()


@check
def repeating_extras_have_no_stems(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 240, amt=500, rate=7), season('Retirement', 300, flow='withdraw', slot=2)],
                     [dict(extra('Pension', 252, 12000, 12), repeatUntil=360)]))  # 10 payments: under the dot-only limit
    stems = pg.evaluate("document.querySelectorAll('.chart-svg line[stroke-dasharray=\"3 3\"]').length")
    expect(stems == 0, 'a yearly pension draws %d drop lines' % stems)
    s.close()


# ---------------------------------------------------------------- critique #17

@check
def share_then_reset_keeps_your_plan(env):
    url = share_url(env)
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Mine only', 120, amt=100)], start=777))
    pg = s.pg
    pg.goto(url)
    pg.wait_for_selector('#final-amount')
    pg.wait_for_timeout(200)
    pg.click('#reset-btn')  # "Start from the example" while looking at a shared plan
    pg.wait_for_timeout(200)
    pg.reload()
    pg.wait_for_selector('#final-amount')
    expect(s.text('#shared-note') is not None, 'after reset from a shared plan, nothing says your plan is kept aside')
    pg.click('#shared-back')
    pg.wait_for_timeout(200)
    pg.reload()
    pg.wait_for_selector('#final-amount')
    expect(pg.input_value('#starting-amount') == '777', 'own plan lost after reset from a shared plan: %s' % pg.input_value('#starting-amount'))
    s.close()


@check
def back_to_own_plan_keeps_focus(env):
    url = share_url(env)
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Mine only', 120, amt=100)], start=777))  # someone with a plan of their own to go back to
    s.pg.goto(url)
    s.pg.wait_for_selector('#final-amount')
    s.pg.focus('#shared-back')
    s.pg.keyboard.press('Enter')
    s.pg.wait_for_timeout(200)
    expect(s.pg.evaluate('document.activeElement !== document.body && document.activeElement.offsetParent !== null'),
           'focus dropped to the page (or a hidden button) after Back to your own plan')
    s.close()


@check
def flagged_return_tempers_the_answer(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Crash', 120, rate=-150), season('Retirement', 300, flow='withdraw', slot=2)], start=100000))
    lever = s.text('#lever-note') or ''
    expect('typo' in lever and 'withdraw up to' not in lever, 'results answer confidently despite a flagged return: %r' % lever)
    s.close()


@check
def future_money_is_one_kind(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Saving', 240, amt=800, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=300, slot=2)], money='future'))
    lever = s.text('#lever-note') or ''
    expect('today' not in lever, 'Future $ lever mixes in today\u2019s dollars: %r' % lever)
    s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)], money='future'))
    lever = s.text('#lever-note') or ''
    expect(re.search(r'more \(', lever) is None, 'the dollars tag landed on the starting-amount clause: %r' % lever)
    s.close()


@check
def toast_covers_no_text(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    pg = s.open()
    pg.click('#add-windfall')
    pg.fill('.windfall [data-field="amount"]', '5000')
    for y in (0, 300, 400, 600, 900, 100000):
        pg.evaluate('window.scrollTo(0, %d)' % y)
        pg.click('#share-link')
        pg.wait_for_timeout(250)
        hit = pg.evaluate("""(() => {
          const t = document.getElementById('toast'); if (t.hidden) return null; const a = t.getBoundingClientRect();
          const texts = [...document.querySelectorAll('.chart-svg text, #legend, #extras-legend, .details-title, .breakdown th, .breakdown td .cell, .kpi, .lever, .why summary, .back-link')];
          const over = texts.find(e => { const r = e.getBoundingClientRect(); return r.width && r.height && a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top; });
          return over ? (over.textContent || over.id).trim().slice(0, 40) : null; })()""")
        expect(hit is None, 'at scroll %d the toast covers %r' % (y, hit))
    s.close()


# ---------------------------------------------------------------- critique #18

@check
def shared_exits_are_undoable(env):
    url = share_url(env)
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Mine only', 120, amt=100)], start=777))
    pg = s.pg
    pg.goto(url)
    pg.wait_for_selector('#final-amount')
    pg.wait_for_timeout(200)
    pg.fill('#starting-amount', '200000')  # edit the shared plan: it becomes yours, your old one aside
    pg.wait_for_timeout(100)
    pg.click('#shared-back')
    pg.wait_for_timeout(200)
    expect(s.text('#toast-undo') is not None, 'Back to your own plan offers no undo')
    pg.click('#toast-undo')
    pg.wait_for_timeout(200)
    expect(pg.input_value('#starting-amount') == '200,000', 'undoing Back did not bring the edited plan back')
    pg.click('#shared-forget')
    pg.wait_for_timeout(200)
    expect(s.text('#toast-undo') is not None, 'Forget my old plan offers no undo')
    pg.click('#toast-undo')
    pg.wait_for_timeout(200)
    pg.click('#shared-back')
    pg.wait_for_timeout(200)
    expect(pg.input_value('#starting-amount') == '777', 'undoing Forget did not keep your old plan')
    s.close()


@check
def first_visitor_has_no_phantom_plan(env):
    url = share_url(env)
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open()  # never saved anything
    s.pg.goto(url)
    s.pg.wait_for_selector('#final-amount')
    s.pg.wait_for_timeout(200)
    note = s.text('#shared-note-text') or ''
    expect('your own plan' not in note.lower() and s.text('#shared-back') is None,
           'a first-time visitor is offered a plan they never had: %r' % note)
    s.close()


@check
def shared_note_after_reset_is_true(env):
    url = share_url(env)
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Mine only', 120, amt=100)], start=777))
    s.pg.goto(url)
    s.pg.wait_for_selector('#final-amount')
    s.pg.click('#reset-btn')
    s.pg.wait_for_timeout(200)
    note = s.text('#shared-note') or ''
    expect('came from a shared link' not in note, 'note says the example came from a shared link: %r' % note)
    s.close()


@check
def adding_an_extra_is_undoable(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.click('#add-windfall')
    pg.keyboard.press('Escape')
    pg.click('#toast-undo')
    expect(pg.locator('.windfall').count() == 0, 'adding an extra could not be undone')
    s.close()


@check
def withdrawal_wording(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 240, amt=800, rate=7), season('Retirement', 300, flow='withdraw', pct=5, slot=2)]))
    pg.click('.period:nth-child(2) .card-summary')
    note = pg.text_content('.period:nth-child(2) [data-role="flow-note"]')
    expect('(the 4% rule)' not in note, 'a 5%% withdrawal is called the 4%% rule: %r' % note)
    s.open(plan([season('Boom', 120, rate=80), season('Retirement', 300, flow='withdraw', slot=2)]))
    expect('an 80%' in (s.text('#lever-note') or ''), 'article before 80%%: %r' % s.text('#lever-note'))
    s.open(plan([season('Saving', 240, amt=800, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=3000, slot=2)], money='future'))
    pg = s.pg
    pg.click('.period:nth-child(2) .card-summary')
    note = pg.text_content('.period:nth-child(2) [data-role="flow-note"]')
    start = pg.evaluate("document.querySelector('.breakdown tbody tr:nth-child(2) td:last-child .cell').firstChild.textContent")
    expect(start.strip() in note, 'Future $ card note quotes a different start balance than the table (%s): %r' % (start, note))
    s.close()


@check
def phone_delete_last_focuses_the_row_button(env):
    s = Session(env['webkit'], env['base'], **env['iphone'])
    pg = s.open()
    pg.click('.period:nth-child(3) .card-summary')
    pg.locator('.period:nth-child(3) .danger-link').scroll_into_view_if_needed()
    pg.tap('.period:nth-child(3) .danger-link')
    pg.wait_for_timeout(300)
    expect(pg.evaluate("document.activeElement.classList.contains('card-summary')"), 'focus landed on %s' % pg.evaluate('document.activeElement.className'))
    s.close()


@check
def phone_runout_label_sits_in_the_wash(env):
    s = Session(env['webkit'], env['base'], **env['iphone'])
    bad = []
    for amt in (900, 1200, 1500, 2000, 2500, 3000):
        pg = s.open(plan([season('Saving', 120, amt=500, rate=7), season('Coast', 120, rate=5, slot=1),
                          season('Retirement', 300, flow='withdraw', unit='dollars', amt=amt, slot=2)]))
        pos = pg.evaluate("""(() => { const t = [...document.querySelectorAll('.chart-svg text')].find(e => /^Runs out/.test(e.textContent));
            const rule = [...document.querySelectorAll('.chart-svg line')].find(l => l.getAttribute('stroke-dasharray') === '4 3');
            if (!t || !rule) return null; const svg = document.querySelector('.chart-svg');
            const right = svg.viewBox.baseVal.width - 16 - Number(rule.getAttribute('x1'));
            return { anchor: t.getAttribute('text-anchor'), room: right, text: t.textContent }; })()""")
        # Whenever there is room for even the short label on the right, it must sit there (in the wash, not over the curve).
        if pos and pos['room'] >= 70 and pos['anchor'] != 'start':
            bad.append((amt, pos))
    expect(not bad, 'run-out label over the curve: %s' % bad)
    s.close()


@check
def skip_link_leaves_no_smudge(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    shadow = pg.evaluate("getComputedStyle(document.querySelector('.skip-link')).boxShadow")
    expect(shadow == 'none', 'the hidden skip link still casts a shadow: %s' % shadow)
    s.close()


# ---------------------------------------------------------------- run

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    port = free_port()
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                              cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tmp = os.path.join(ROOT, '.venv', 'e2e-tmp')
    os.makedirs(tmp, exist_ok=True)
    try:
        for _ in range(50):
            try:
                socket.create_connection(('127.0.0.1', port), timeout=0.1).close()
                break
            except OSError:
                time.sleep(0.1)
        with sync_playwright() as p:
            env = {'base': 'http://127.0.0.1:%d' % port, 'tmp': tmp,
                   'chromium': p.chromium.launch(), 'webkit': p.webkit.launch(), 'iphone': p.devices['iPhone 13']}
            for fn in CHECKS:
                if only and only not in fn.__name__:
                    continue
                t0 = time.time()
                try:
                    fn(env)
                    print('PASS  %-42s %.1fs' % (fn.__name__, time.time() - t0))
                except Exception as e:  # report every failure, not just the first
                    FAILURES.append(fn.__name__)
                    print('FAIL  %-42s %s' % (fn.__name__, str(e).splitlines()[0][:300]))
    finally:
        server.terminate()
    print('\n%d failed' % len(FAILURES) if FAILURES else '\nall passed')
    sys.exit(1 if FAILURES else 0)


if __name__ == '__main__':
    main()
