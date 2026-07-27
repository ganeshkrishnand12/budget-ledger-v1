/* ===========================================================
   Budget Ledger — shared UI helpers
   Custom password show/hide toggle, since browsers render their
   own reveal icons inconsistently (or not at all) and don't
   reliably pick up dark-theme colors. This draws our own icon
   in the theme's text color, so it's always visible.
   =========================================================== */

(function () {
  const TOKEN_KEY = 'bl_auth_token';

  // Every fetch() call in every page script just calls fetch('/api/...')
  // like normal — this wrapper transparently attaches the current tab's
  // token as an Authorization header, so no other file needs to change.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      init = init || {};
      init.headers = Object.assign({}, init.headers || {}, {
        Authorization: 'Bearer ' + token,
      });
    }
    return originalFetch(input, init);
  };

  window.authToken = {
    set: function (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    },
    clear: function () {
      sessionStorage.removeItem(TOKEN_KEY);
    },
  };

  const EYE_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>' +
    '<circle cx="12" cy="12" r="3"></circle></svg>';

  const EYE_OFF_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 ' +
    '21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.22 4.5M14.12 14.12a3 3 0 1 1-4.24-4.24">' +
    '</path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

  function initPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(function (btn) {
      btn.innerHTML = EYE_ICON;
      btn.setAttribute('aria-label', 'Show password');

      btn.addEventListener('click', function () {
        const input = document.getElementById(btn.getAttribute('data-target'));
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.innerHTML = isHidden ? EYE_OFF_ICON : EYE_ICON;
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPasswordToggles);
  } else {
    initPasswordToggles();
  }

  // Hides the Reports/Loans/Income nav links (and, by extension, tells the
  // page whether it should even try to load that data) based on the
  // logged-in user's own feature flags. Admins always see everything;
  // everyone else needs each feature explicitly enabled for them.
  // Exposed on window so every page's own script can call it right after
  // it fetches /api/session.
  window.applyFeatureNav = function (user) {
    const isAdmin = user.role === 'admin';
    const features = user.features || {};
    ['reports', 'loans', 'income'].forEach(function (name) {
      const el = document.getElementById('nav' + name.charAt(0).toUpperCase() + name.slice(1));
      if (!el) return;
      const allowed = isAdmin || features[name];
      el.style.display = allowed ? '' : 'none';
    });
  };
})();
