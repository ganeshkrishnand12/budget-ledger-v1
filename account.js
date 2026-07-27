/* ===========================================================
   Budget Ledger — account page
   Shows the logged-in user's profile and lets them change their
   own password (requires the current password to confirm).
   =========================================================== */

(function () {
  const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer', member: 'Member' };

  function goToLogin() {
    window.authToken.clear();
    window.location.href = 'index.html';
  }

  function setError(fieldId, message) {
    const el = document.getElementById(fieldId + 'Error');
    if (el) el.textContent = message || '';
  }

  function clearErrors() {
    ['currentPassword', 'newPassword', 'confirmNewPassword'].forEach(function (id) {
      setError(id, '');
    });
  }

  function showBanner(message, type) {
    const banner = document.getElementById('statusBanner');
    banner.textContent = message;
    banner.className = 'status-banner show ' + type;
  }

  fetch('/api/session')
    .then(function (res) {
      if (!res.ok) throw new Error('not-logged-in');
      return res.json();
    })
    .then(function (data) {
      const user = data.user;
      const badge = document.getElementById('roleBadge');
      badge.textContent = ROLE_LABELS[user.role] || user.role;
      badge.className = 'badge badge-' + user.role;
      window.applyFeatureNav(user);
      if (user.role === 'admin') document.getElementById('adminLink').style.display = '';

      document.getElementById('profileName').textContent = user.name;
      document.getElementById('profileEmail').textContent = user.email;
    })
    .catch(goToLogin);

  document.getElementById('passwordForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    let hasError = false;

    if (!currentPassword) {
      setError('currentPassword', 'Enter your current password.');
      hasError = true;
    }
    if (newPassword.length < 6) {
      setError('newPassword', 'Must be at least 6 characters.');
      hasError = true;
    }
    if (confirmNewPassword !== newPassword) {
      setError('confirmNewPassword', 'Passwords do not match.');
      hasError = true;
    }

    if (hasError) {
      showBanner('Please fix the highlighted fields.', 'error');
      return;
    }

    fetch('/api/account/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          showBanner(result.data.error || 'Could not update password.', 'error');
          return;
        }
        showBanner('Password updated.', 'success');
        document.getElementById('passwordForm').reset();
      })
      .catch(function () {
        showBanner('Could not reach the server.', 'error');
      });
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(goToLogin);
  });

  document.getElementById('showDeleteFormBtn').addEventListener('click', function () {
    document.getElementById('deleteAccountForm').style.display = '';
    this.style.display = 'none';
  });

  document.getElementById('deleteAccountForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const passwordInput = document.getElementById('deletePassword');
    document.getElementById('deletePasswordError').textContent = '';

    if (!passwordInput.value) {
      document.getElementById('deletePasswordError').textContent = 'Enter your password to confirm.';
      return;
    }

    const sure = confirm(
      'This permanently deletes your account and all your budget data. This cannot be undone. Continue?'
    );
    if (!sure) return;

    fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          const banner = document.getElementById('deleteStatusBanner');
          banner.textContent = result.data.error || 'Could not delete account.';
          banner.className = 'status-banner show error';
          return;
        }
        goToLogin();
      })
      .catch(function () {
        const banner = document.getElementById('deleteStatusBanner');
        banner.textContent = 'Could not reach the server.';
        banner.className = 'status-banner show error';
      });
  });
})();
