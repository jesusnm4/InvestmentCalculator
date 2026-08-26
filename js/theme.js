/* theme.js — resolves the effective color theme and stamps it on <html>.
   Loaded blocking in <head> so the first paint is already correct, and so the
   rest of the app can just read data-theme instead of asking matchMedia. */
(function (global) {
  'use strict';

  var KEY = 'investment-projection-theme';
  var pref = 'system'; // 'light' | 'dark' | 'system'

  try { pref = localStorage.getItem(KEY) || 'system'; } catch (e) { /* private mode */ }
  if (['light', 'dark', 'system'].indexOf(pref) < 0) pref = 'system';

  function systemIsDark() {
    return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function apply() {
    var dark = pref === 'dark' || (pref === 'system' && systemIsDark());
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  global.Theme = {
    get: function () { return pref; },
    set: function (next) {
      pref = next;
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
      apply();
    },
    isDark: function () { return document.documentElement.dataset.theme === 'dark'; },
    /* Fires whenever the effective theme changes — i.e. the OS flipped while the
       preference is "system". Explicit choices notify through Theme.set's caller. */
    onSystemChange: function (fn) {
      var q = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)');
      if (!q) return;
      var handler = function () { if (pref === 'system') { apply(); fn(); } };
      if (q.addEventListener) q.addEventListener('change', handler);
      else if (q.addListener) q.addListener(handler);
    }
  };

  apply();
})(window);
