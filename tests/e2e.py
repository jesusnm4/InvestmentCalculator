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
    pg.fill('#starting-amount', '20000')  # the page speaks after an edit that changes the answer, not on load
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


@check
def withdrawing_plan_in_debt_does_not_run_out(env):
    # An expense sinks the balance before a 4%-rule season: nothing goes unpaid, so it ends in debt.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 240, amt=500, rate=7), season('Retirement', 300, flow='withdraw', slot=2)],
                     [extra('House', 12, -150000)]))
    head = s.text('#final-amount')
    # The 4% season starts with nothing: said as that (#23), never as a run-out.
    expect('nothing to withdraw' in head and 'House' in head and 'below zero' in s.text('#final-sub'), 'debt in a withdrawing plan: %r / %r' % (head, s.text('#final-sub')))
    expect('Short by' not in s.text('#final-sub'), 'debt called a shortfall: %r' % s.text('#final-sub'))
    bar = pg.text_content('#result-bar-value')
    expect('Runs out' not in bar, 'bar says runs out: %r' % bar)
    expect(s.text('#kpi-third-label') == 'Owed at the end', 'third figure: %s' % s.text('#kpi-third-label'))
    expect('while there was money' not in s.text('#kpi-growth-note'), 'growth note: %r' % s.text('#kpi-growth-note'))
    chart = pg.evaluate("[...document.querySelectorAll('.chart-svg text')].map(t => t.textContent).join('|')")
    expect('Runs out' not in chart and 'Below zero' in chart, 'chart hides the debt: %s' % chart[:200])
    # A real unpaid withdrawal after the expense still runs out.
    s.open(plan([season('Saving', 240, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)],
                [extra('House', 12, -150000)]))
    # Withdrawing dollars from the same empty start: the same answer, whichever way it withdraws.
    expect('nothing to withdraw' in s.text('#final-amount'), 'unpaid withdrawals: %r' % s.text('#final-amount'))
    s.close()


@check
def baseline_compares_outcomes_first(env):
    # Keep a plan that runs out, then make it last on a shorter timeline: that is better, not "shorter".
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)]))
    expect(s.text('#final-amount').startswith('Runs out'), 'setup should run out: %r' % s.text('#final-amount'))
    pg.click('#keep-baseline')
    pg.click('.period:nth-child(2) .card-summary')
    pg.fill('.period:nth-child(2) [data-field="months"]', '3')
    pg.fill('.period:nth-child(2) [data-field="monthlyContribution"]', '300')
    pg.wait_for_timeout(100)
    expect(s.text('#final-amount').startswith('Lasts'), 'edit should last: %r' % s.text('#final-amount'))
    delta = s.text('#baseline-delta') or ''
    expect('shorter' not in delta and 'ran out' in delta, 'lasting plan vs a run-out baseline: %r' % delta)
    expect(pg.locator('#baseline-delta .down').count() == 0, 'a lasting plan is coloured as a loss: %r' % delta)
    s.close()


@check
def fields_and_math_never_disagree(env):
    # A cleared or unreadable field keeps the last value, and shows it again on leaving the field.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    head = s.text('#final-amount')
    pg.click('.period:nth-child(1) .card-summary')
    for field in ('annualRatePercent', 'monthlyContribution', 'months'):
        sel = '.period:nth-child(1) [data-field="%s"]' % field
        before = pg.input_value(sel)
        pg.fill(sel, '')
        pg.wait_for_timeout(50)
        expect(s.text('#final-amount') == head, 'clearing %s changed the answer: %r' % (field, s.text('#final-amount')))
        pg.locator(sel).blur()
        expect(pg.input_value(sel) == before, 'cleared %s shows %r, the math uses %r' % (field, pg.input_value(sel), before))
    pg.fill('#starting-amount', 'abc')
    pg.locator('#starting-amount').blur()
    expect(pg.input_value('#starting-amount') == '10,000', 'unreadable start shows %r' % pg.input_value('#starting-amount'))
    expect(s.text('#final-amount') == head, 'unreadable start changed the answer: %r' % s.text('#final-amount'))
    pg.fill('#inflation', '')
    pg.locator('#inflation').blur()
    expect(pg.input_value('#inflation') == '2.5' and '2.5%' in s.text('#money-note'), 'inflation field vs note: %r / %r' % (pg.input_value('#inflation'), s.text('#money-note')))
    s.close()


CONTRAST_JS = """(() => {
  const rgb = c => (c.match(/[\\d.]+/g) || []).map(Number);
  const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0) return c; } return [255, 255, 255]; };
  const bad = [];
  // Field boundaries against what surrounds them (WCAG 1.4.11).
  document.querySelectorAll('input[type=number], input[type=text], select, .segmented').forEach(el => {
    const cs = getComputedStyle(el);
    if (!el.offsetParent || parseFloat(cs.borderTopWidth) === 0) return;
    const r = ratio(rgb(cs.borderTopColor), bgOf(el.parentElement));
    if (r < 3) bad.push((el.id || el.dataset.field || el.className) + ' border ' + r.toFixed(2));
  });
  // Series strokes against the chart card.
  const surface = bgOf(document.querySelector('.chart-svg'));
  for (let k = 0; k < Chart.slotCount; k++) {
    const hex = Chart.colorFor(k), c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const r = ratio(c, surface);
    if (r < 3) bad.push('series ' + k + ' ' + hex + ' ' + r.toFixed(2));
  }
  return bad;
})()"""


@check
def lines_and_fields_are_visible(env):
    for theme in ('light', 'dark'):
        s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, color_scheme=theme)
        pg = s.open()
        pg.click('.period:nth-child(1) .card-summary')
        bad = pg.evaluate(CONTRAST_JS)
        expect(not bad, '%s: under 3:1: %s' % (theme, sorted(set(bad))))
        s.close()


@check
def toasts_speak_from_a_standing_live_region(env):
    # A live region that is itself un-hidden is announced unreliably; the words go to one that is always there.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    live = pg.evaluate("""(() => { const r = document.getElementById('toast-live');
        return r && { role: r.getAttribute('role'), hidden: r.hidden || getComputedStyle(r).display === 'none', text: r.textContent }; })()""")
    expect(live and live['role'] == 'status' and not live['hidden'], 'no standing live region for toasts: %s' % live)
    expect(pg.evaluate("!document.getElementById('toast').hasAttribute('role') && !document.getElementById('toast').hasAttribute('aria-live')"),
           'the toast that hides and shows is still a live region')
    pg.click('.period:nth-child(3) .card-summary')
    pg.click('.period:nth-child(3) .danger-link')
    pg.wait_for_timeout(100)
    said = pg.text_content('#toast-live')
    expect('deleted' in said, 'delete not announced: %r' % said)
    pg.click('#share-link')
    pg.wait_for_timeout(100)
    expect(pg.text_content('#toast-live') == pg.text_content('#toast-text'), 'notice not announced: %r' % pg.text_content('#toast-live'))
    s.close()


@check
def debt_then_runout_keeps_the_debt_in_sight(env):
    # An expense sinks the plan, then withdrawals go unpaid: the debt stays on the chart and the expense stays named.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    # $600 a month lasts without the expense, so the expense is the lever.
    pg = s.open(plan([season('Saving', 240, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=600, slot=2)],
                     [extra('House', 12, -150000)]))
    head = s.text('#final-amount')
    expect('after House' in head, 'culprit lost: %r' % head)
    expect(s.text('#kpi-third-label') == 'Owed at the end', 'third figure: %s' % s.text('#kpi-third-label'))
    expect('while there was money' not in s.text('#kpi-growth-note'), 'growth note: %r' % s.text('#kpi-growth-note'))
    expect((s.text('#lever-note') or '').startswith('An expense'), 'lever: %r' % s.text('#lever-note'))
    low = pg.evaluate("Math.min(...[...document.querySelectorAll('.chart-svg path')].map(p => p.getAttribute('d') || '')"
                      ".flatMap(d => (d.match(/[-\\d.]+/g) || []).filter((_, i) => i % 2).map(Number)))")
    zero = pg.evaluate("[...document.querySelectorAll('.chart-svg text')].find(t => t.textContent === '$0').getAttribute('y')")
    ticks = pg.evaluate("[...document.querySelectorAll('.chart-svg text')].map(t => t.textContent).filter(t => /^[−-]\\$/.test(t)).length")
    expect(ticks > 0, 'chart axis has no negative ticks: the debt is hidden (lowest y %s, $0 at %s)' % (low, zero))
    drawn = pg.evaluate("!!document.querySelector('.chart-svg path[stroke=\"' + Chart.colorFor(2) + '\"]')")
    expect(drawn, 'Retirement, all of it after the run-out, is not drawn though it carries the debt')
    tip = pg.evaluate("(() => { const c = document.getElementById('chart'); c.__showAt(c.__chart.maxMonth); return document.querySelector('.tip-value').textContent; })()")
    expect(tip.startswith('\u2212') or tip.startswith('-'), 'readout at the end hides the debt: %r' % tip)
    s.close()


@check
def fully_paid_counts_only_paid_months(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    s.open(plan([season('Saving', 12, rate=4), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)], start=0))
    expect(s.text('#kpi-income-note') == 'never fully paid', 'nothing paid: %r' % s.text('#kpi-income-note'))
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)]))
    note = s.text('#kpi-income-note')
    out, start = pg.evaluate("(() => { const p = Calc.project(JSON.parse(localStorage.getItem('%s'))); return [p.totals.depletedAt, p.perPeriod[1].startMonth]; })()" % KEY)
    expect(note.startswith('fully paid for the first ' + pg.evaluate('m => Chart.durationLabel(m)', out - 1 - start)),
           'paid months should stop before the first short month (%d): %r' % (out, note))
    s.close()


@check
def plan_holds_at_most_40_of_each(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('S%d' % i, 12) for i in range(40)], [extra('E%d' % i, 1, 100) for i in range(40)]))
    pg.click('#add-windfall')
    pg.click('#add-period')
    st = s.stored()
    expect(len(st['windfalls']) == 40 and len(st['periods']) == 40, 'past 40: %d extras, %d seasons' % (len(st['windfalls']), len(st['periods'])))
    expect('40' in (s.text('#toast-text') or ''), 'no notice at the limit: %r' % s.text('#toast-text'))
    s.close()


@check
def phone_header_fits_with_undo(env):
    bad = []
    for w in (320, 360, 375, 390):
        s = Session(env['webkit'], env['base'], viewport={'width': w, 'height': 800}, is_mobile=True, has_touch=True)
        pg = s.open()
        pg.tap('#add-windfall')
        pg.wait_for_timeout(100)
        m = pg.evaluate("""(() => { const p = document.querySelector('.panel-head').closest('section, .panel') || document.querySelector('.panel-head').parentElement;
            const pr = p.getBoundingClientRect(); const over = [...document.querySelectorAll('.panel-actions > *')].filter(e => e.offsetParent)
              .map(e => e.getBoundingClientRect()).some(r => r.right > pr.right + 0.5);
            return { scroll: document.documentElement.scrollWidth - innerWidth, over, undo: !document.getElementById('undo-link').hidden }; })()""")
        if m['scroll'] > 0 or m['over'] or not m['undo']:
            bad.append((w, m))
        s.close()
    expect(not bad, 'header overflows: %s' % bad)


@check
def baseline_on_another_timeline_says_so(env):
    # Deleting Retirement ends the plan 25 years early: more money at an earlier date is no green win.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=300, slot=2)]))
    pg.click('#keep-baseline')
    pg.click('.period:nth-child(2) .card-summary')
    pg.click('.period:nth-child(2) [data-action="delete"]')
    pg.wait_for_timeout(100)
    delta = s.text('#baseline-delta') or ''
    expect(pg.locator('#baseline-delta .up').count() == 0, 'a shorter plan is coloured as a win: %r' % delta)
    expect('10 yrs' in delta and '35 yrs' in delta, 'the two timelines are not named: %r' % delta)
    span = pg.evaluate("document.getElementById('chart').__chart.maxMonth")
    expect(span == 420, 'the axis stops at %r, hiding the baseline past month 120' % span)
    pg.hover('.hover-target', position={'x': 1, 'y': 50}, force=True)
    box = pg.locator('.hover-target').bounding_box()
    pg.mouse.move(box['x'] + box['width'] - 2, box['y'] + 50)
    tip = pg.text_content('.chart-tooltip') or ''
    expect('Baseline' in tip, 'no readout past the plan end: %r' % tip)
    s.close()


@check
def money_fields_read_like_people_write(env):
    # One rule: k / M are thousands / millions; anything else unreadable keeps the last value.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    for typed, shown in (('5k', '5,000'), ('1.5M', '1,500,000'), ('1e9', '10,000'), ('-500', '10,000'), ('1.234.567', '10,000'), ('$2,500', '2,500')):
        pg.fill('#starting-amount', '10000')
        pg.locator('#starting-amount').blur()
        pg.fill('#starting-amount', typed)
        pg.locator('#starting-amount').blur()
        got = pg.input_value('#starting-amount')
        expect(got == shown, '%r shows %r, expected %r' % (typed, got, shown))
        expect(s.stored()['startingAmount'] == float(shown.replace(',', '')), '%r stored %r' % (typed, s.stored()['startingAmount']))
    s.close()


@check
def extra_fields_never_hide_their_value(env):
    # A cleared or negative entry shows what the math uses once you leave the field.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7)], [extra('Bonus', 12, 1000, every=12)]))
    bad = []
    for sel in ('#windfall-list [data-field="repeatEvery"]', '#windfall-list [data-field="atMonth"]',
                '.period:nth-child(1) [data-field="months"]', '.period:nth-child(1) [data-field="monthlyContribution"]'):
        if sel.startswith('.period'):
            if not pg.is_visible(sel):
                pg.click('.period:nth-child(1) .card-summary')
        for typed in ('', '-5'):
            before = pg.input_value(sel)
            pg.fill(sel, typed)
            pg.locator(sel).blur()
            pg.wait_for_timeout(50)
            if pg.input_value(sel) != before:
                bad.append('%s %r -> %r (was %r)' % (sel, typed, pg.input_value(sel), before))
    expect(not bad, 'fields show values the math does not use: %s' % bad)
    s.close()


@check
def absurd_rates_stay_readable(env):
    bad = []
    for w in (1440, 320):
        s = Session(env['chromium'], env['base'], viewport={'width': w, 'height': 900})
        pg = s.open()
        for rate in ('1e9', '5000', '300'):
            if not pg.is_visible('.period:nth-child(1) [data-field="annualRatePercent"]'):
                pg.click('.period:nth-child(1) .card-summary')
            pg.fill('.period:nth-child(1) [data-field="annualRatePercent"]', rate)
            pg.locator('.period:nth-child(1) [data-field="annualRatePercent"]').blur()
            pg.wait_for_timeout(100)
            body = pg.text_content('#results')
            if 'NaN' in body or '∞' in body or 'Infinity' in body:
                bad.append('%dpx %s%%: %s' % (w, rate, re.findall(r'.{0,20}(?:NaN|∞|Infinity).{0,10}', body)[:2]))
            over = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
            if over > 0:
                bad.append('%dpx %s%%: page scrolls %dpx sideways' % (w, rate, over))
        s.errors and bad.append('%dpx: %d console errors' % (w, len(s.errors)))
        s.errors = []
        s.close()
    expect(not bad, '; '.join(bad))


FOCUS_JS = "(() => { const a = document.activeElement; return !a || a === document.body || !a.isConnected || !a.offsetParent ? null : (a.id || a.dataset.field || a.className); })()"


@check
def focus_survives_whole_plan_actions(env):
    # Buttons that hide or rebuild themselves must hand focus on, not drop it to the page.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7)], [extra('Bonus', 12, 1000)]))
    lost = []
    pg.focus('#reset-btn'); pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    pg.evaluate(FOCUS_JS) or lost.append('Start from the example')
    pg.focus('#undo-link'); pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    pg.evaluate(FOCUS_JS) or lost.append('undo of the example')
    pg.focus('#keep-baseline'); pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    pg.evaluate(FOCUS_JS) or lost.append('Keep as baseline')
    pg.check('#windfall-list [data-field="repeat"]')
    pg.focus('#undo-link'); pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    pg.evaluate(FOCUS_JS) or lost.append('undo of a repeat')
    pg.focus('#clear-baseline'); pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    pg.focus('.toast-undo'); pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    pg.evaluate(FOCUS_JS) or lost.append('toast undo of a cleared baseline')
    expect(not lost, 'focus fell to the page after: %s' % lost)
    s.close()


@check
def os_theme_flip_keeps_typing(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, color_scheme='light')
    pg = s.open()
    pg.click('.period:nth-child(1) .card-summary')
    sel = '.period:nth-child(1) [data-field="name"]'
    pg.fill(sel, '')
    pg.keyboard.type('ab')
    pg.emulate_media(color_scheme='dark')
    pg.wait_for_timeout(50)
    pg.keyboard.type('cd')
    expect(pg.input_value(sel) == 'abcd', 'typing across a theme flip gave %r' % pg.input_value(sel))
    s.close()


@check
def chart_readout_speaks_from_a_standing_region(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    expect(pg.evaluate("!document.querySelector('.chart-tooltip').hasAttribute('aria-live')"), 'the tooltip that hides itself is the live region')
    pg.focus('#chart')
    pg.keyboard.press('ArrowRight')
    pg.wait_for_timeout(100)
    live = pg.evaluate("(() => { const r = document.getElementById('chart-live'); return r && r.getAttribute('aria-live') && r.textContent; })()")
    expect(live and 'Start' in live, 'no standing chart readout region: %r' % live)
    s.close()


@check
def landscape_toast_clear_of_the_field(env):
    # A short landscape screen: the toast may sit on the result bar, never on the extra you just changed.
    s = Session(env['webkit'], env['base'], viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
    pg = s.open()
    pg.tap('#add-windfall')
    pg.wait_for_timeout(200)
    pg.evaluate("window.scrollBy(0, document.querySelector('#windfall-list li:last-child [data-field=repeat]').getBoundingClientRect().top - 60)")
    pg.locator('#windfall-list li:last-child [data-field="repeat"]').tap()
    pg.wait_for_timeout(200)
    hit = pg.evaluate("""(() => { const toast = document.getElementById('toast'); if (toast.hidden) return 'no toast';
        const bar = document.getElementById('result-bar'), floor = bar && !bar.hidden ? bar.getBoundingClientRect().top : innerHeight;
        const t = toast.getBoundingClientRect(), c = document.querySelector('#windfall-list li:last-child').getBoundingClientRect();
        const top = Math.max(0, c.top), bottom = Math.min(floor, c.bottom);
        return (t.bottom > top && t.top < bottom) ? [Math.round(t.top), Math.round(t.bottom), Math.round(top), Math.round(bottom)] : null; })()""")
    expect(hit is None, 'the toast covers the extra being edited: %s' % (hit,))
    s.close()


# Colour-vision simulation (Machado et al. 2009, severity 1.0) and OKLab distance, x100.
CVD = {'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
       'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
       'tritan': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]}


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _oklab(lin):
    r, g, b = lin
    l, m, s_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
                0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    l, m, s_ = [max(0, v) ** (1 / 3) for v in (l, m, s_)]
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s_, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s_,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s_)


def _seen(hexc, kind):
    lin = [_lin(int(hexc[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    if kind:
        lin = [min(1, max(0, sum(CVD[kind][i][j] * lin[j] for j in range(3)))) for i in range(3)]
    return _oklab(lin)


@check
def series_tellable_apart_in_every_vision(env):
    bad = []
    for theme in ('light', 'dark'):
        s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, color_scheme=theme)
        pg = s.open()
        hexes = pg.evaluate('[...Array(Chart.slotCount).keys()].map(k => Chart.colorFor(k))')
        names = pg.evaluate('Chart.colorNames')
        for kind in (None, 'protan', 'deutan', 'tritan'):
            seen = [_seen(h, kind) for h in hexes]
            for i in range(len(seen)):
                for j in range(i + 1, len(seen)):
                    d = sum((a - b) ** 2 for a, b in zip(seen[i], seen[j])) ** 0.5 * 100
                    if d < (10 if kind is None else 5):
                        bad.append('%s %s %s/%s %.1f' % (theme, kind or 'normal', names[i], names[j], d))
        # The dashed season dividers above the curve are the only mark of a handoff there.
        div = pg.evaluate("""(() => { const l = document.querySelector('.chart-svg line[stroke-dasharray="2 3"]'); return l && l.getAttribute('stroke'); })()""")
        surface = pg.evaluate("getComputedStyle(document.querySelector('.chart')).backgroundColor")
        r = pg.evaluate("""([a, b]) => { const rgb = c => c.startsWith('#') ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.match(/[\\d.]+/g).map(Number);
            const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
            const x = L(rgb(a)), y = L(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }""", [div, surface]) if div else 0
        if r < 3:
            bad.append('%s season divider %s %.2f:1' % (theme, div, r))
        s.close()
    expect(not bad, 'too close: %s' % bad)


@check
def small_wording_round_20(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    # A withdrawing season at $0 a month, sunk by an expense: still the "will it last" question.
    s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=0, slot=2)],
                [extra('House', 60, -150000)]))
    if s.text('#final-amount').startswith('Ends') and s.text('#final-label') != 'Will it last?':
        bad.append('label %r over %r' % (s.text('#final-label'), s.text('#final-amount')))
    # Money lost to a negative return is not "growth while there was money".
    s.open(plan([season('Saving', 120, amt=100, rate=-5), season('Retirement', 300, flow='withdraw', unit='dollars', amt=900, slot=2)]))
    if s.text('#kpi-growth').startswith('−') and 'money to grow' in (s.text('#kpi-growth-note') or ''):
        bad.append('negative growth: %r' % s.text('#kpi-growth-note'))
    # Inflation as people write it, not as floats print.
    st = plan([season('Saving', 120, amt=500)]); st['inflationPercent'] = 1e-9
    s.open(st)
    if 'e-' in (s.text('#money-note') or ''):
        bad.append('note: %r' % s.text('#money-note'))
    # The 100-year cap in years, and every season it leaves without time.
    pg = s.open(plan([season('Saving', 1300, amt=500), season('Retirement', 120, flow='withdraw', slot=2), season('Legacy', 120, flow='withdraw', slot=3)]))
    warn = pg.text_content('.period:nth-child(1) [data-role="warn"]')
    if '1200' in warn:
        bad.append('warn: %r' % warn)
    hero = s.text('#final-amount')
    if 'Retirement' not in hero or 'Legacy' not in hero:
        bad.append('hero names only one: %r' % hero)
    # "1 years" in the extra pickers.
    pg = s.open(plan([season('Saving', 120, amt=500)], [extra('Bonus', 12, 1000, every=12)]))
    unit = pg.evaluate("(() => { const s = document.querySelector('#windfall-list [data-unit=repeatEvery]'); return s.options[s.selectedIndex].text; })()")
    if unit != 'year':
        bad.append('picker says 1 %s' % unit)
    s.close()
    expect(not bad, '; '.join(bad))


@check
def small_marks_and_targets(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open()
    pg.click('.period:nth-child(1) .card-summary')
    pg.click('#add-windfall')
    small = pg.evaluate("""[...document.querySelectorAll('.more summary, .why summary, .hint-more summary, label.repeat-toggle')]
        .filter(e => e.offsetParent).map(e => [e.textContent.trim().slice(0, 20), e.getBoundingClientRect().height]).filter(x => x[1] < 24)""")
    small and bad.append('pointer targets under 24px: %s' % small)
    # A season wholly after a run-out: its faint line still clears 3:1 once its opacity is counted.
    s.open(plan([season('Saving', 12, rate=4), season('Retirement', 120, flow='withdraw', unit='dollars', amt=900, slot=2),
                 season('Legacy', 120, flow='withdraw', unit='dollars', amt=900, slot=3)], start=1000))
    faint = pg.evaluate("""(() => { const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
        const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
        const bg = hex(Chart.ink ? Chart.ink().surface : '#fcfcfb');
        return [...document.querySelectorAll('.chart-svg line[opacity]')].filter(l => l.getAttribute('stroke').startsWith('#') && +l.getAttribute('opacity') > 0 && +l.getAttribute('opacity') < 1)
          .map(l => { const a = +l.getAttribute('opacity'), c = hex(l.getAttribute('stroke')).map((v, i) => v * a + bg[i] * (1 - a));
            const x = L(c), y = L(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }).filter(r => r < 3); })()""")
    faint and bad.append('faint season line after a run-out: %s' % ['%.2f' % r for r in faint])
    s.close()
    s = Session(env['webkit'], env['base'], viewport={'width': 320, 'height': 700}, is_mobile=True, has_touch=True)
    pg = s.open(plan([season('Saving', 120, amt=500)], [extra('A long-named yearly bonus', 12, 12000)]))
    w = pg.evaluate("[+document.querySelector('.chart-svg').getAttribute('width'), document.getElementById('chart').clientWidth]")
    w[0] != w[1] and bad.append('chart drawn %dpx wide into %dpx (text scaled)' % tuple(w))
    pg.locator('#windfall-list [data-field="repeat"]').tap()
    pg.wait_for_timeout(150)
    clip = pg.evaluate("(() => { const t = document.getElementById('toast-text'); return t.scrollHeight - t.clientHeight; })()")
    clip > 1 and bad.append('repeat toast clipped by %dpx' % clip)
    s.close()
    expect(not bad, '; '.join(bad))


@check
def names_say_which_and_from_where(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 120, amt=500)], [extra('A', 12, 100, every=12), extra('B', 24, 100, every=12)]))
    names = pg.evaluate("[...document.querySelectorAll('#windfall-list [data-field=repeatEvery], #windfall-list [data-field=repeatUntil]')].map(e => e.getAttribute('aria-label'))")
    len(set(names)) != len(names) and bad.append('repeat fields share names: %s' % names)
    until = pg.text_content('#windfall-list li:first-child .repeat-fields .field:last-child .field-label')
    'start' not in until and bad.append('Until has no reference point: %r' % until)
    intro = pg.text_content('.windfall-head .hint')
    intro.startswith('A lump sum') and bad.append('intro: %r' % intro[:40])
    h = pg.evaluate("[...document.querySelectorAll('h1, h2, h3')].filter(e => e.offsetParent || e.closest('.sr-only') || e.classList.contains('sr-only')).map(e => e.textContent.trim())")
    len([x for x in h if x == 'Seasons']) > 1 and bad.append('two headings read just "Seasons": %s' % h)
    s.close()
    expect(not bad, '; '.join(bad))


@check
def repeating_expense_after_runout_shows_its_debt(env):
    # A withdrawal that can't be paid stops at $0, but a planned expense keeps adding debt: say so, in Loss Red.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    st = plan([season('Saving', 120, amt=500, rate=7), season('Growing', 120, rate=5, slot=1),
               season('Retirement', 300, flow='withdraw', slot=2)], [extra('Care', 300, -60000, every=12)])
    pg = s.open(st)
    owed = s.text('#kpi-income')
    sub = s.text('#final-sub') or ''
    expect('below zero' in sub and 'Care' in sub, 'headline sub-line hides a %s debt: %r' % (owed, sub))
    got = pg.evaluate("""(() => { const c = document.getElementById('chart').__chart, bad = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim();
        const depX = c.x(c.dep);
        const red = [...document.querySelectorAll('.chart-svg path')].filter(p => (p.getAttribute('stroke') || '').toLowerCase() === bad.toLowerCase());
        const green = [...document.querySelectorAll('.chart-svg path[fill="none"]')].filter(p => p.getAttribute('stroke') === Chart.colorFor(2));
        const pastGreen = green.some(p => (p.getAttribute('d').match(/[ML]([\\d.]+) /g) || []).some(t => parseFloat(t.slice(1)) > depX + 2));
        const marks = [...document.querySelectorAll('.chart-svg [data-month]')].filter(g => +g.dataset.month > c.dep).length;
        return { red: red.length, pastGreen, marks }; })()""")
    expect(got['red'] > 0 and not got['pastGreen'], 'debt after the run-out is drawn in the season colour: %s' % got)
    expect(got['marks'] > 0, 'the expenses that dig the debt have no markers: %s' % got)
    s.close()


@check
def every_number_field_shows_what_the_math_uses(env):
    # One rule: blank, unreadable or out of range keeps the last value; leaving a field shows the value in use.
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    st = plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', slot=2)],
              [dict(extra('Bonus', 12, 1000, every=12), atUnit='months')])
    pg = s.open(st)
    cases = [('.period:nth-child(1) [data-field="monthlyContribution"]', '1e9', '500'),
             ('.period:nth-child(2) [data-field="withdrawPercent"]', '150', '100'),
             ('.period:nth-child(1) [data-field="months"]', '0.3', '0.33'),
             ('#windfall-list [data-field="repeatEvery"]', '0', '1'),
             ('#windfall-list [data-field="atMonth"]', '2.5', '3'),
             ('#windfall-list [data-field="amount"]', '', '1000'),
             ('#windfall-list [data-field="amount"]', '1e9', '1000'),
             ('#starting-amount', '', '10,000')]
    for sel, typed, shown in cases:
        if sel.startswith('.period') and not pg.is_visible(sel):
            pg.click(sel.split(' ')[0] + ' .card-summary')
        pg.fill(sel, typed)
        pg.locator(sel).blur()
        pg.wait_for_timeout(30)
        got = pg.input_value(sel)
        got != shown and bad.append('%s %r shows %r, the math uses %r' % (sel.split(' ')[-1], typed, got, shown))
    w = s.stored()['windfalls'][0]
    w['repeatEvery'] != 12 and bad.append('Every 0 stored as %r months' % w['repeatEvery'])
    s.close()
    expect(not bad, '; '.join(bad))


@check
def os_theme_flip_keeps_number_typing_and_recolours(env):
    bad = []
    for engine in ('chromium', 'webkit'):
        s = Session(env[engine], env['base'], viewport={'width': 1440, 'height': 900}, color_scheme='light')
        pg = s.open(plan([season('Saving', 120, amt=500, rate=7)], [extra('Bonus', 12, 1000)]))
        pg.click('.period:nth-child(1) .card-summary')
        sel = '.period:nth-child(1) [data-field="monthlyContribution"]'
        pg.click(sel)
        pg.keyboard.press('End')
        pg.keyboard.type('1')
        pg.emulate_media(color_scheme='dark')
        pg.wait_for_timeout(50)
        pg.keyboard.type('2')
        got = pg.input_value(sel)
        got != '50012' and bad.append('%s: typing across a theme flip gave %r' % (engine, got))
        stale = pg.evaluate("""(() => { const li = document.querySelector('.period'); const sw = li.querySelector('.swatch[data-slot="0"]');
            const want = Chart.colorFor(0).toLowerCase(), rgb = c => c.match(/\\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
            return [li.style.getPropertyValue('--period-color').trim().toLowerCase() === want, sw && rgb(sw.style.background) === want.slice(1)]; })()""")
        not all(stale) and bad.append('%s: card colours stale after the flip %s' % (engine, stale))
        s.close()
    expect(not bad, '; '.join(bad))


@check
def one_clock_for_when(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    st = plan([season('Saving', 120, amt=500, rate=7), season('Growing', 120, rate=5, slot=1),
               season('Retirement', 300, flow='withdraw', unit='dollars', amt=1000, slot=2)], [dict(extra('Car', 300, -1000), atUnit='years')])
    pg = s.open(st)
    # 25 yrs from the plan start is 5 yrs into Retirement (which starts at 20 yrs).
    pg.select_option('#windfall-list [data-field="anchor"]', label='Retirement')
    pg.wait_for_timeout(50)
    shown = pg.input_value('#windfall-list [data-field="atMonth"]')
    note = pg.text_content('#windfall-list [data-role="at-note"]')
    shown != '5' and bad.append('At 25 yrs re-anchored to Retirement shows %r' % shown)
    '5 yrs into Retirement' not in note and bad.append('note: %r' % note)
    stored = s.stored()['windfalls'][0]['atMonth']
    stored != 300 and bad.append('re-anchoring moved it to month %r' % stored)
    # The baseline's run-out is said the way the headline says it.
    head = s.text('#final-amount')
    when = re.search(r'Runs out (.+? into Retirement)', head)
    pg.click('#keep-baseline')
    pg.click('.period:nth-child(3) .card-summary')
    pg.fill('.period:nth-child(3) [data-field="monthlyContribution"]', '300')
    pg.wait_for_timeout(50)
    delta = s.text('#baseline-delta') or ''
    when and when.group(1) not in delta and bad.append('headline said %r; the baseline delta says %r' % (when.group(1), delta))
    s.close()
    expect(not bad, '; '.join(bad))


@check
def small_round_21(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    # The 100-year cap leaves Retirement no time: still the plan's question (owner, #23), the answer says why.
    s.open(plan([season('Saving', 1300, amt=500), season('Retirement', 120, flow='withdraw', slot=2)]))
    s.text('#final-label') != 'Will it last?' and bad.append('cap label %r over %r' % (s.text('#final-label'), s.text('#final-amount')))
    # Seasons after the last withdrawal: say which end the money is left at.
    s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', slot=2), season('Legacy', 120, slot=3)]))
    '45 yrs' not in (s.text('#final-sub') or '') and bad.append('sub-line: %r' % s.text('#final-sub'))
    # Switching 4% to dollars: the amount still rises with prices, so it is not "fixed".
    pg = s.open(plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', slot=2)]))
    pg.click('.period:nth-child(2) .card-summary')
    pg.click('.period:nth-child(2) [data-flow="dollars"]')
    'fixed' in (s.text('#toast-text') or '') and bad.append('toast: %r' % s.text('#toast-text'))
    # Undoing a deleted extra is said like a season's.
    pg = s.open(plan([season('Saving', 120, amt=500)], [extra('Car', 12, -5000)]))
    pg.click('#windfall-list [data-action="delete"]')
    pg.click('#toast-undo')
    'is back' not in (s.text('#toast-text') or '') and bad.append('undo: %r' % s.text('#toast-text'))
    # The readout stays on a theme flip while the chart has focus.
    pg.focus('#chart'); pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowRight')
    pg.emulate_media(color_scheme='dark'); pg.wait_for_timeout(50)
    s.text('.chart-tooltip .tip-head') != '1 yr' and bad.append('readout after a flip: %r' % s.text('.chart-tooltip .tip-head'))
    pg.emulate_media(color_scheme='light')
    # A flip with nothing new to say re-reads nothing.
    pg.wait_for_timeout(1000)
    pg.evaluate("window.__said = 0; new MutationObserver(() => window.__said++).observe(document.getElementById('live-summary'), {childList: true, characterData: true, subtree: true})")
    pg.emulate_media(color_scheme='dark'); pg.wait_for_timeout(1100)
    pg.evaluate('window.__said') and bad.append('a theme flip re-read the result')
    # A plan longer than its baseline: past the baseline's end the readout says it ended.
    pg = s.open(plan([season('Saving', 120, amt=500)]))
    pg.click('#keep-baseline')
    pg.click('.period:nth-child(1) .card-summary')
    pg.fill('.period:nth-child(1) [data-field="months"]', '20')
    pg.focus('#chart'); pg.keyboard.press('End'); pg.wait_for_timeout(50)
    'Baseline ended' not in (pg.text_content('.chart-tooltip') or '') and bad.append('past the baseline: %r' % pg.text_content('.chart-tooltip'))
    s.close()
    # Dark: the toast's Undo on hover keeps 4.5:1.
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    pg = s.open(plan([season('Saving', 120, amt=500)], [extra('Car', 12, -5000)]))
    pg.click('#windfall-list [data-action="delete"]')
    pg.hover('#toast-undo'); pg.wait_for_timeout(300)
    r = pg.evaluate("""(() => { const rgba = c => { const n = c.match(/[\\d.]+/g).map(Number); return n.length === 3 ? n.concat(1) : n; };
        const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
        const u = document.getElementById('toast-undo'), t = document.getElementById('toast');
        const base = rgba(getComputedStyle(t).backgroundColor), over = rgba(getComputedStyle(u).backgroundColor), fg = rgba(getComputedStyle(u).color);
        const bg = [0, 1, 2].map(i => over[i] * over[3] + base[i] * (1 - over[3]));
        const x = L(fg), y = L(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); })()""")
    r < 4.5 and bad.append('dark Undo hover %.2f:1' % r)
    s.close()
    # Phone 320: long names end in an ellipsis, and a big amount fits the result bar.
    s = Session(env['webkit'], env['base'], viewport={'width': 320, 'height': 700}, is_mobile=True, has_touch=True)
    long = 'Retirement' + 'Supercalifragilistic' * 11
    pg = s.open(plan([season(long, 480, amt=5000, rate=7), season('Spend', 120, flow='withdraw', unit='dollars', amt=100, slot=2)]))
    nm = pg.evaluate("""(() => { const e = document.querySelector('[data-role=sum-name]'), cs = getComputedStyle(e);
        return [e.scrollHeight > e.clientHeight + 1 ? cs.textOverflow + '/' + (cs.webkitLineClamp || cs.lineClamp) : 'fits', e.title]; })()""")
    (nm[0] not in ('fits',) and 'ellipsis' not in nm[0] and '2' not in nm[0]) and bad.append('long name cut bare: %s' % nm[0])
    pg.evaluate('window.scrollTo(0, 400)'); pg.wait_for_timeout(200)
    cut = pg.evaluate("(() => { const v = document.querySelector('.result-bar-value'); return v.offsetParent ? v.scrollWidth - v.clientWidth : -1; })()")
    cut > 0 and bad.append('result bar cut by %dpx: %r' % (cut, pg.text_content('.result-bar-value')))
    s.close()
    expect(not bad, '; '.join(bad))


def _names(s):
    return [p['name'] + ('/' + p['flow'] if p['flow'] == 'withdraw' else '') for p in s.stored()['periods']]


@check
def undo_after_reorder_touches_only_its_own_season(env):
    bad = []
    st = plan([season(n, 60, amt=100) for n in 'ABCD'] + [season('E', 120, flow='withdraw', slot=4)])
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(st)
    pg.click('#add-period')
    pg.fill('.period:nth-child(6) [data-field="name"]', 'F')
    pg.click('.period:nth-child(6) [data-action="up"]')
    pg.click('#undo-link')
    _names(s) != ['A', 'B', 'C', 'D', 'E/withdraw'] and bad.append('undo add after a move: %s' % _names(s))
    pg = s.open(st)
    pg.click('.period:nth-child(5) .card-summary')
    pg.click('.period:nth-child(5) [data-flow="save"]')
    pg.click('.period:nth-child(5) [data-action="up"]')
    pg.click('#undo-link')
    _names(s) != ['A', 'B', 'C', 'E/withdraw', 'D'] and bad.append('undo switch after a move: %s' % _names(s))
    ids = [p['id'] for p in s.stored()['periods']]
    len(set(ids)) != len(ids) and bad.append('duplicate season ids: %s' % ids)
    # Extras: undo of a repeat after deleting an earlier extra still reaches its own extra.
    pg = s.open(plan([season('S', 120, amt=100)], [extra('X', 12, 100), extra('Y', 24, 100)]))
    pg.check('#windfall-list li:nth-child(2) [data-field="repeat"]')
    pg.click('#windfall-list li:nth-child(1) [data-action="delete"]')
    pg.click('#undo-link'); pg.click('#undo-link')
    w = {x['name']: x['repeatEvery'] for x in s.stored()['windfalls']}
    w != {'X': 0, 'Y': 0} and bad.append('undo repeat after a delete: %s' % w)
    s.close()
    expect(not bad, '; '.join(bad))


@check
def anchors_survive_moves_and_undo(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    st = plan([season('Saving', 120, amt=500), season('Growing', 120, slot=1), season('Retirement', 300, flow='withdraw', slot=2)],
              [dict(extra('Gift', 121, 1000), anchor=None)])
    pg = s.open(st)
    pg.select_option('#windfall-list [data-field="anchor"]', label='Growing')
    pg.click('.period:nth-child(2) .card-summary')
    pg.click('.period:nth-child(2) [data-action="up"]')
    w = s.stored()['windfalls'][0]
    (w.get('anchor') is None or w['atMonth'] != 1) and bad.append('moved to the top: anchor %r, month %r' % (w.get('anchor'), w['atMonth']))
    pg.click('.period:nth-child(1) [data-action="down"]')
    w = s.stored()['windfalls'][0]
    w['atMonth'] != 121 and bad.append('moved back: month %r' % w['atMonth'])
    # Undoing a season delete brings back its extras' anchors.
    pg = s.open(st)
    pg.select_option('#windfall-list [data-field="anchor"]', label='Retirement')
    before = s.stored()['windfalls'][0]
    pg.click('.period:nth-child(3) .card-summary')
    pg.click('.period:nth-child(3) [data-action="delete"]')
    pg.click('#undo-link')
    after = s.stored()['windfalls'][0]
    (after.get('anchor') != before.get('anchor') or after['atMonth'] != before['atMonth']) and \
        bad.append('undo delete: anchor %r -> %r, month %r -> %r' % (before.get('anchor'), after.get('anchor'), before['atMonth'], after['atMonth']))
    s.close()
    expect(not bad, '; '.join(bad))


@check
def expense_that_sinks_the_plan_is_named(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    base = [season('Saving', 120, amt=500, rate=7), season('Growing', 120, rate=5, slot=1),
            season('Retirement', 300, flow='withdraw', unit='dollars', amt=1500, slot=2)]
    # Retirement starts empty here: named by the headline.
    s.open(plan(base, [extra('Roof', 12, -80000)]))
    head = s.text('#final-amount') or ''
    'Roof' not in head and bad.append('headline: %r' % head)
    # A dip that recovers before the money runs out: the warning names it, with its own depth.
    s.open(plan(base, [extra('Roof', 12, -20000)]))
    warn = s.text('#depletion-warn') or ''
    ('Roof' not in warn or 'recovers' not in warn) and bad.append('dip warning: %r' % warn)
    label = s.pg.evaluate("[...document.querySelectorAll('.chart-svg text')].map(t => t.textContent).filter(t => /below zero/.test(t))")
    not label and bad.append('no dip label on the chart')
    # A dip that recovers names its expense too.
    s.open(plan([season('Saving', 120, amt=500, rate=7)], [extra('Wedding', 12, -20000)]))
    'Wedding' not in (s.text('#depletion-warn') or '') and bad.append('recovered dip: %r' % s.text('#depletion-warn'))
    s.close()
    expect(not bad, '; '.join(bad))


@check
def until_junk_keeps_the_last_value(env):
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    pg = s.open(plan([season('Saving', 360, amt=500)], [dict(extra('Bonus', 12, 1000, every=12), repeatUntil=120, untilUnit='years')]))
    bad = []
    for typed in ('abc', '-5', '.', '1e9'):
        pg.fill('#windfall-list [data-field="repeatUntil"]', '10')
        pg.locator('#windfall-list [data-field="repeatUntil"]').blur()
        pg.focus('#windfall-list [data-field="repeatUntil"]')
        pg.keyboard.press('ControlOrMeta+a')
        pg.keyboard.type(typed)
        pg.locator('#windfall-list [data-field="repeatUntil"]').blur()
        u = s.stored()['windfalls'][0]['repeatUntil']
        shown = pg.input_value('#windfall-list [data-field="repeatUntil"]')
        # Junk never moves it silently: the field shows exactly what the math uses (blank = to the end).
        agree = (u is None and shown == '') or (shown != '' and u == round(float(shown) * 12))
        (not agree or (typed in ('-5', '.') and u != 120)) and bad.append('%r: until %r, field %r' % (typed, u, shown))
    s.close()
    expect(not bad, 'junk in Until changed the plan: %s' % bad)


@check
def phone_toast_and_keyboard_stay_out_of_the_way(env):
    bad = []
    for h in (664, 553):
        s = Session(env['webkit'], env['base'], viewport={'width': 375, 'height': h}, is_mobile=True, has_touch=True)
        pg = s.open()
        pg.tap('#add-period')
        pg.wait_for_timeout(300)
        hit = pg.evaluate("""(() => { const t = document.getElementById('toast').getBoundingClientRect();
            const f = document.querySelector('.period:last-child [data-field="name"]').getBoundingClientRect();
            return document.getElementById('toast').hidden ? null : (t.bottom > f.top && t.top < f.bottom) ? [t.top, t.bottom, f.top, f.bottom] : null; })()""")
        hit and bad.append('%d tall: toast over the new card name %s' % (h, hit))
        s.close()
    s = Session(env['webkit'], env['base'], viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    pg = s.open(plan([season('Saving', 120, amt=500)], [extra('A', 12, 100), extra('B', 24, 100)]))
    pg.tap('#windfall-list li:nth-child(1) [data-action="delete"]')
    pg.wait_for_timeout(100)
    tag = pg.evaluate("document.activeElement.tagName + '.' + (document.activeElement.dataset.field || '')")
    tag.startswith('INPUT') and bad.append('deleting an extra focuses %s (keyboard pops up)' % tag)
    pg.tap('#toast-undo')
    pg.wait_for_timeout(100)
    tag = pg.evaluate("document.activeElement.tagName + '.' + (document.activeElement.dataset.field || '')")
    tag.startswith('INPUT') and bad.append('undoing it focuses %s' % tag)
    # Scrolling to the results with a toast up: the toast steps aside.
    pg.tap('#add-windfall'); pg.wait_for_timeout(100)
    pg.evaluate("document.getElementById('results').scrollIntoView()"); pg.wait_for_timeout(300)
    over = pg.evaluate("""(() => { const t = document.getElementById('toast'); if (t.hidden) return null;
        const a = t.getBoundingClientRect(), h = document.querySelector('.hero').getBoundingClientRect();
        return a.bottom > h.top && a.top < h.bottom ? [a.top, a.bottom, h.top] : null; })()""")
    over and bad.append('toast over the hero %s' % over)
    s.close()
    expect(not bad, '; '.join(bad))


@check
def small_round_22(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    two = plan([season('Saving', 120, amt=500, rate=7), season('Retirement', 300, flow='withdraw', unit='dollars', amt=300, slot=2)])
    pg = s.open(two)
    pg.click('.period:nth-child(2) .card-summary')
    pg.click('.period:nth-child(2) [data-flow="percent"]')
    t = s.text('#toast-text') or ''
    ('(the 4% rule)' not in t or re.search(r'\)\s*\(', t)) and bad.append('switch toast: %r' % t)
    pg.click('.period:nth-child(2) [data-flow="save"]')
    pg.click('#toast-undo')
    t = s.text('#toast-text') or ''
    'Retirement' not in t and bad.append('undo toast: %r' % t)
    # Inflation follows the shared rule: junk keeps the last value.
    for typed in ('1e9', '-5'):
        pg.fill('#inflation', typed); pg.locator('#inflation').blur()
        pg.input_value('#inflation') != '2.5' and bad.append('inflation %r -> %r' % (typed, pg.input_value('#inflation')))
    # The return hint sits with the return, above the Each month choice.
    pg.click('.period:nth-child(1) .card-summary')
    order = pg.evaluate("""(() => { const li = document.querySelector('.period'); const h = [...li.querySelectorAll('.field-note.wide')].find(e => /returns before inflation/.test(e.textContent));
        const f = li.querySelector('[data-role="flow-note"]'); return h && f ? h.getBoundingClientRect().top < f.getBoundingClientRect().top : null; })()""")
    order is not True and bad.append('return hint below the Each month field')
    # Baseline row: the result before the actions; no "over 0 mo".
    pg.click('#keep-baseline')
    pg.fill('.period:nth-child(1) [data-field="monthlyContribution"]', '600')
    first = pg.evaluate("(() => { const d = document.getElementById('baseline-delta'), k = document.getElementById('keep-baseline'); return !!(d.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING); })()")
    not first and bad.append('baseline row leads with an action')
    for _ in range(2):
        pg.click('.period:nth-child(1) .card-summary') if not pg.is_visible('.period:nth-child(1) [data-action="delete"]') else None
        pg.click('.period:nth-child(1) [data-action="delete"]')
    '0 mo' in (s.text('#baseline-delta') or '') and bad.append('no seasons: %r' % s.text('#baseline-delta'))
    # Crosshair readable (3:1).
    pg = s.open(two)
    stroke = pg.evaluate("document.querySelector('.chart-svg .crosshair').getAttribute('stroke')")
    stroke.lower() != '#6e6c66' and bad.append('crosshair stroke %s' % stroke)
    # A debt ending: no season colour below $0.
    pg = s.open(plan([season('Saving', 120, amt=100)], [extra('House', 60, -80000)]))
    low = pg.evaluate("""(() => { const c = document.getElementById('chart').__chart, zero = c.y(0);
        return [...document.querySelectorAll('.chart-svg path')].filter(p => /url\\(#/.test(p.getAttribute('fill') || ''))
          .some(p => (p.getAttribute('d').match(/[\\d.]+ [\\d.]+/g) || []).some(xy => +xy.split(' ')[1] > zero + 0.5)); })()""")
    low and bad.append('season fill below $0 in a debt ending')
    # Seasons after the money ran out say so in their rows.
    pg = s.open(plan([season('Saving', 12, rate=4), season('Retirement', 120, flow='withdraw', unit='dollars', amt=900, slot=2), season('Later', 120, slot=3)], start=1000))
    meta = pg.text_content('.period:nth-child(3) [data-role="sum-meta"]')
    'ran out' not in meta and bad.append('season after a run-out: %r' % meta)
    # Absurd balances get no "save $100 more".
    st = plan([season('Saving', 600, amt=500, rate=7)]); st['startingAmount'] = 1e12
    s.open(st)
    'Saving $100 more' in (s.text('#lever-note') or '') and bad.append('lever at $1e12: %r' % s.text('#lever-note'))
    s.close()
    # 80-character unbroken names at 320.
    s = Session(env['webkit'], env['base'], viewport={'width': 320, 'height': 700}, is_mobile=True, has_touch=True)
    pg = s.open(plan([season('W' * 80, 120, amt=500), season('X' * 80, 120, flow='withdraw', slot=2)], [extra('Y' * 80, 12, 1000)]))
    over = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
    over > 0 and bad.append('80-char names scroll the page %dpx sideways' % over)
    s.close()
    expect(not bad, '; '.join(bad))


# ---------------------------------------------------------------- invariants (guards against regressions)

INVARIANTS_JS = """(() => {
  const st = JSON.parse(localStorage.getItem('%s')), p = Calc.project(st), t = p.totals;
  const txt = id => (document.getElementById(id) && !document.getElementById(id).hidden ? document.getElementById(id).textContent : '');
  const head = txt('final-amount'), sub = txt('final-sub'), warn = txt('depletion-warn'), lever = txt('lever-note');
  const label = txt('final-label'), bar = document.querySelector('.result-bar-label').textContent;
  const all = document.getElementById('results').textContent, bad = [];
  if (/NaN|Infinity|\u221e/.test(all)) bad.push('NaN or infinity on screen');
  if (t.finalAmount < 0 && /recovers/.test(head + sub + warn)) bad.push('"recovers" on a plan that ends below zero');
  const unpaid = p.points.some(pt => pt.short > 0);
  if (/^Lasts/.test(head) && (unpaid || t.finalAmount < 0)) bad.push('"Lasts" with unpaid months or debt');
  if (/^Runs out/.test(head) && !unpaid) bad.push('"Runs out" with nothing unpaid');
  if (label !== bar && !(label === 'Shortfall at the end' && bar === 'Final amount')) bad.push('labels differ: ' + label + ' / ' + bar);
  const withdraws = st.periods.some(q => q.flow === 'withdraw');
  if (withdraws !== (label === 'Will it last?')) bad.push('label ' + label + ' for a plan that ' + (withdraws ? 'withdraws' : 'does not withdraw'));
  // A withdrawing season that starts with nothing: said the same way however it withdraws.
  const empty = p.perPeriod.find((pp, i) => Calc.isWithdrawing(st.periods[i]) && pp.months > 0 && pp.startBalance <= 0);
  if (empty && !/nothing to withdraw/.test(head)) bad.push('a withdrawing season starts empty but the headline says: ' + head);
  if (empty) { const i = p.perPeriod.indexOf(empty), row = document.querySelectorAll('.period [data-role="sum-meta"]')[i];
    if (row && !/nothing to withdraw/.test(row.textContent)) bad.push('the empty season row says: ' + row.textContent); }
  const fed = st.startingAmount > 0 || st.periods.some(q => q.flow !== 'withdraw' && q.monthlyContribution > 0) || st.windfalls.some(w => w.amount > 0);
  if (!fed && /still last|comfortably/.test(lever)) bad.push('a plan with no money is told it lasts comfortably');
  return bad;
})()""" % KEY


def _matrix():
    sv = lambda **k: season('Saving', 120, amt=500, rate=7, **k)
    gr = season('Growing', 120, rate=5, slot=1)
    pct = season('Retirement', 300, flow='withdraw', slot=2)
    usd = lambda a: season('Retirement', 300, flow='withdraw', unit='dollars', amt=a, slot=2)
    return {
        'saving only': plan([sv()]),
        'withdraw % lasts': plan([sv(), gr, pct]),
        'withdraw $ lasts': plan([sv(), gr, usd(300)]),
        'withdraw $ runs out': plan([sv(), gr, usd(900)]),
        'dip recovers, saving': plan([sv()], [extra('Wedding', 12, -20000)]),
        'dip recovers, then runs out': plan([sv(), gr, usd(1500)], [extra('Roof', 12, -20000)]),
        'sunk for good, $': plan([sv(), gr, usd(360)], [extra('Big', 12, -150000)]),
        'sunk for good, %': plan([sv(), gr, pct], [extra('Big', 12, -150000)]),
        'retirement starts empty, %': plan([sv(), gr, pct], [extra('Car', 180, -120000)]),
        'retirement starts empty, $': plan([sv(), gr, usd(360)], [extra('Car', 180, -120000)]),
        'debt after run-out': plan([sv(), gr, pct], [extra('Care', 300, -60000, every=12)]),
        'saving debt ending': plan([season('Saving', 120, amt=100)], [extra('House', 60, -80000)]),
        '100-year cap': plan([season('Saving', 1300, amt=500), pct]),
        'zero plan': plan([season('Saving', 120, amt=0, rate=7), gr, pct], start=0),
        'seasons after retirement': plan([sv(), pct, season('Legacy', 120, slot=3)]),
    }


@check
def state_matrix_invariants(env):
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    for name, st in _matrix().items():
        s.open(st)
        for b in s.pg.evaluate(INVARIANTS_JS):
            bad.append('%s: %s' % (name, b))
    s.close()
    expect(not bad, '; '.join(bad))


UNDO_STATE_JS = """(() => { const st = JSON.parse(localStorage.getItem('%s'));
  // Reordering is not an undoable step (parked), so order is not compared; everything else is.
  const k = a => a.map(x => JSON.stringify(x)).sort();
  return JSON.stringify({ periods: k(st.periods.map(p => [p.name, p.flow, p.withdrawUnit, p.months, p.monthlyContribution])),
    windfalls: k(st.windfalls.map(w => [w.name, w.amount, w.repeatEvery, w.anchor || null])) }); })()""" % KEY


@check
def undo_walk_returns_to_the_start(env):
    import random
    bad = []
    s = Session(env['chromium'], env['base'], viewport={'width': 1440, 'height': 900})
    st = plan([season('A', 60, amt=100), season('B', 60, amt=200, slot=1), season('C', 120, flow='withdraw', slot=2)],
              [extra('X', 24, 1000), extra('Y', 70, -500)])
    actions = ['add_season', 'delete_season', 'up', 'down', 'flow', 'add_extra', 'delete_extra', 'repeat', 'reset', 'keep']
    for seed in range(6):
        rnd = random.Random(seed)
        pg = s.open(st)
        start = pg.evaluate(UNDO_STATE_JS)
        done = []
        for _ in range(8):
            a = rnd.choice(actions)
            pg.set_default_timeout(3000)
            n = pg.locator('.period').count()
            m = pg.locator('#windfall-list > li').count()
            i = rnd.randrange(max(1, n)) + 1
            if a == 'add_season' and n < 40:
                pg.click('#add-period')
            elif a == 'delete_season' and n > 1:
                pg.click('.period:nth-child(%d) .card-summary' % i) if not pg.is_visible('.period:nth-child(%d) [data-action="delete"]' % i) else None
                pg.click('.period:nth-child(%d) [data-action="delete"]' % i)
            elif a in ('up', 'down') and n > 1:
                j = rnd.randrange(2, n + 1) if a == 'up' else rnd.randrange(1, n)
                pg.click('.period:nth-child(%d) .card-summary' % j) if not pg.is_visible('.period:nth-child(%d) [data-action="%s"]' % (j, a)) else None
                pg.click('.period:nth-child(%d) [data-action="%s"]' % (j, a))
            elif a == 'flow' and n:
                pg.click('.period:nth-child(%d) .card-summary' % i) if not pg.is_visible('.period:nth-child(%d) [data-flow="save"]' % i) else None
                cur = pg.evaluate("i => document.querySelector('.period:nth-child(' + i + ') [data-flow][aria-pressed=true]').dataset.flow", i)
                pg.click('.period:nth-child(%d) [data-flow="%s"]' % (i, rnd.choice([f for f in ('save', 'percent', 'dollars') if f != cur])))
            elif a == 'add_extra':
                pg.click('#add-windfall')
            elif a == 'delete_extra' and m:
                pg.click('#windfall-list > li:nth-child(%d) [data-action="delete"]' % (rnd.randrange(m) + 1))
            elif a == 'repeat' and m:
                pg.click('#windfall-list > li:nth-child(%d) [data-field="repeat"]' % (rnd.randrange(m) + 1))
            elif a == 'reset':
                pg.click('#reset-btn') if pg.is_visible('#reset-btn') else None
            elif a == 'keep':
                pg.click('#keep-baseline') if pg.is_visible('#keep-baseline') else None
            else:
                continue
            done.append(a)
            pg.keyboard.press('Escape')
        for _ in range(12):
            if not pg.is_visible('#undo-link'):
                break
            pg.click('#undo-link')
        end = pg.evaluate(UNDO_STATE_JS)
        ids = [p['id'] for p in s.stored()['periods']]
        end != start and bad.append('seed %d %s: plan did not come back' % (seed, done))
        end != start and print('  seed %d\n   start %s\n   end   %s' % (seed, start, end), file=sys.stderr)
        len(set(ids)) != len(ids) and bad.append('seed %d: duplicate ids' % seed)
    s.close()
    expect(not bad, '; '.join(bad))


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
