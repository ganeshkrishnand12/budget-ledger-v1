/* ===========================================================
   Budget Ledger — admin page
   Lets an admin set each user's role and, for editor/viewer roles,
   pick exactly which other members' records they can touch
   (editor = full access to those, viewer = view-only).
   =========================================================== */

(function () {
  const ROLES = ['admin', 'editor', 'viewer', 'member'];
  let currentUserId = null;

  fetch('/api/session')
    .then(function (res) {
      if (!res.ok) throw new Error('not-logged-in');
      return res.json();
    })
    .then(function (data) {
      if (data.user.role !== 'admin') {
        window.location.href = 'dashboard.html';
        return;
      }
      currentUserId = data.user.id;
      return loadUsers();
    })
    .catch(function () {
      window.authToken.clear();
      window.location.href = 'index.html';
    });

  function loadUsers() {
    return fetch('/api/users')
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        renderTable(data.users);
      })
      .catch(function () {
        document.getElementById('adminContent').innerHTML =
          '<p class="muted-note">Could not load users.</p>';
      });
  }

  function renderTable(users) {
    const container = document.getElementById('adminContent');

    const table = document.createElement('table');
    table.className = 'admin-table';

    const thead = document.createElement('thead');
    thead.innerHTML =
      '<tr><th>Name</th><th>Email</th><th>Role</th><th>Access grants (view/edit for these members)</th>' +
      '<th>Feature access</th><th></th><th></th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    users.forEach(function (user) {
      const row = document.createElement('tr');

      const roleOptions = ROLES.map(function (r) {
        return (
          '<option value="' + r + '"' + (r === user.role ? ' selected' : '') + '>' +
          r.charAt(0).toUpperCase() + r.slice(1) +
          '</option>'
        );
      }).join('');

      const otherUsers = users.filter(function (u) {
        return u.id !== user.id;
      });

      const grantsRelevant = user.role === 'editor' || user.role === 'viewer';

      const chips = otherUsers
        .map(function (other) {
          const checked = user.allowedMembers.indexOf(other.id) !== -1 ? 'checked' : '';
          return (
            '<label class="grant-chip">' +
            '<input type="checkbox" data-user-id="' + user.id + '" value="' + other.id + '" ' + checked + '>' +
            escapeHtml(other.name) +
            '</label>'
          );
        })
        .join('');

      const isAdmin = user.role === 'admin';
      const features = user.features || { reports: false, loans: false, income: false };
      const featureCheckbox = function (name, label) {
        return (
          '<label style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">' +
          '<input type="checkbox" data-feature-for="' + user.id + '" data-feature-name="' + name + '" ' +
          (isAdmin ? 'checked disabled' : features[name] ? 'checked' : '') + '>' +
          label +
          '</label>'
        );
      };

      row.innerHTML =
        '<td>' + escapeHtml(user.name) + '</td>' +
        '<td>' + escapeHtml(user.email) + '</td>' +
        '<td><select class="role-select" data-user-id="' + user.id + '">' + roleOptions + '</select></td>' +
        '<td>' +
        '<div class="grant-list" data-grants-for="' + user.id + '" style="' + (grantsRelevant ? '' : 'opacity:0.4;') + '">' +
        (otherUsers.length ? chips : '<span class="muted-note">No other members yet</span>') +
        '</div>' +
        (grantsRelevant ? '' : '<div class="muted-note">Only used for editor/viewer roles</div>') +
        '</td>' +
        '<td style="' + (isAdmin ? 'opacity:0.5;' : '') + '">' +
        featureCheckbox('reports', 'Reports') +
        featureCheckbox('loans', 'Loans') +
        featureCheckbox('income', 'Income') +
        (isAdmin ? '<div class="muted-note">Admin always has all</div>' : '') +
        '</td>' +
        '<td><button class="save-btn" data-save-for="' + user.id + '">Save</button></td>' +
        '<td>' +
        (user.id === currentUserId
          ? '<span class="muted-note">Use Account page</span>'
          : '<button class="icon-btn" data-delete-user="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Delete</button>') +
        '</td>';

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('[data-save-for]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveUser(btn.getAttribute('data-save-for'));
      });
    });

    container.querySelectorAll('[data-delete-user]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteUser(btn.getAttribute('data-delete-user'), btn.getAttribute('data-user-name'));
      });
    });
  }

  function deleteUser(userId, name) {
    const sure = confirm(
      'Delete ' + name + '? This permanently removes their account and all their budget data. This cannot be undone.'
    );
    if (!sure) return;

    fetch('/api/users/' + encodeURIComponent(userId), { method: 'DELETE' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          alert(result.data.error || 'Could not delete user.');
          return;
        }
        loadUsers();
      })
      .catch(function () {
        alert('Could not reach the server.');
      });
  }

  function saveUser(userId) {
    const roleSelect = document.querySelector('select[data-user-id="' + userId + '"]');
    const role = roleSelect.value;

    const grantCheckboxes = document.querySelectorAll(
      'input[type="checkbox"][data-user-id="' + userId + '"]'
    );
    const allowedMembers = Array.prototype.filter
      .call(grantCheckboxes, function (cb) {
        return cb.checked;
      })
      .map(function (cb) {
        return cb.value;
      });

    const featureCheckboxes = document.querySelectorAll(
      'input[type="checkbox"][data-feature-for="' + userId + '"]'
    );
    const features = { reports: false, loans: false, income: false };
    Array.prototype.forEach.call(featureCheckboxes, function (cb) {
      features[cb.getAttribute('data-feature-name')] = cb.checked;
    });

    Promise.all([
      fetch('/api/users/' + encodeURIComponent(userId) + '/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role }),
      }),
      fetch('/api/users/' + encodeURIComponent(userId) + '/allowed-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedMembers: allowedMembers }),
      }),
      fetch('/api/users/' + encodeURIComponent(userId) + '/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: features }),
      }),
    ])
      .then(function () {
        return loadUsers();
      })
      .catch(function () {
        alert('Could not save changes. Please try again.');
      });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(function () {
      window.authToken.clear();
      window.location.href = 'index.html';
    });
  });
})();
