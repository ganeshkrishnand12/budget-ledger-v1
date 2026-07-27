/* ===========================================================
   Budget Ledger — auth page behavior
   This is a front-end-only placeholder for now: no real backend
   yet. It validates input, gives feedback, and stores a stub
   "session" in localStorage so later bricks (like the dashboard)
   have something to check against. Swap this out once real
   authentication is wired up.
   =========================================================== */

(function () {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showBanner(message, type) {
    const banner = document.getElementById('statusBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.className = 'status-banner show ' + type;
  }

  function setError(fieldId, message) {
    const errorEl = document.getElementById(fieldId + 'Error');
    if (errorEl) errorEl.textContent = message || '';
  }

  function clearErrors(ids) {
    ids.forEach(function (id) { setError(id, ''); });
  }

  /* ---------- Login page ---------- */
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const signupBtn = document.getElementById('signupBtn');
    if (signupBtn) {
      signupBtn.addEventListener('click', function () {
        window.location.href = 'signup.html';
      });
    }

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(['email', 'password']);

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      let hasError = false;

      if (!EMAIL_RE.test(email)) {
        setError('email', 'Enter a valid email address.');
        hasError = true;
      }
      if (password.length < 6) {
        setError('password', 'Password must be at least 6 characters.');
        hasError = true;
      }

      if (hasError) {
        showBanner('Please fix the highlighted fields.', 'error');
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          submitBtn.disabled = false;
          if (!result.ok) {
            showBanner(result.data.error || 'Unable to log in.', 'error');
            return;
          }
          showBanner('Logged in — welcome back, ' + result.data.user.name + '.', 'success');
          window.authToken.set(result.data.token);
          setTimeout(function () {
            window.location.href = 'dashboard.html';
          }, 500);
        })
        .catch(function () {
          submitBtn.disabled = false;
          showBanner('Could not reach the server. Is it running?', 'error');
        });
    });
  }

  /* ---------- Signup page ---------- */
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(['name', 'email', 'password', 'confirmPassword']);

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      let hasError = false;

      if (name.length < 2) {
        setError('name', 'Enter your full name.');
        hasError = true;
      }
      if (!EMAIL_RE.test(email)) {
        setError('email', 'Enter a valid email address.');
        hasError = true;
      }
      if (password.length < 6) {
        setError('password', 'Password must be at least 6 characters.');
        hasError = true;
      }
      if (confirmPassword !== password) {
        setError('confirmPassword', 'Passwords do not match.');
        hasError = true;
      }

      if (hasError) {
        showBanner('Please fix the highlighted fields.', 'error');
        return;
      }

      const submitBtn = signupForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, password: password }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          submitBtn.disabled = false;
          if (!result.ok) {
            showBanner(result.data.error || 'Unable to create account.', 'error');
            return;
          }
          showBanner('Account created — redirecting to log in...', 'success');
          setTimeout(function () {
            window.location.href = 'index.html';
          }, 1200);
        })
        .catch(function () {
          submitBtn.disabled = false;
          showBanner('Could not reach the server. Is it running?', 'error');
        });
    });
  }
})();
