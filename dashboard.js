/* ===========================================================
   Budget Ledger — dashboard page
   Confirms the user is logged in, shows their role, and lists
   every record they currently have access to (self, plus any
   members granted to them if they're an editor/viewer, plus
   everyone if they're admin).
   =========================================================== */

(function () {
  const ROLE_LABELS = {
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
    member: 'Member',
  };

  let viewerUser = null;

  function goToLogin() {
    window.authToken.clear();
    window.location.href = 'index.html';
  }

  fetch('/api/session')
    .then(function (res) {
      if (!res.ok) throw new Error('not-logged-in');
      return res.json();
    })
    .then(function (data) {
      viewerUser = data.user;
      renderUser(data.user);
      return loadMembers();
    })
    .catch(function () {
      goToLogin();
    });

  function renderUser(user) {
    document.getElementById('userName').textContent = user.name;
    const badge = document.getElementById('roleBadge');
    badge.textContent = ROLE_LABELS[user.role] || user.role;
    badge.className = 'badge badge-' + user.role;
      window.applyFeatureNav(user);

    if (user.role === 'admin') {
      document.getElementById('adminLink').style.display = '';
    }
  }

  function loadMembers() {
    return fetch('/api/members')
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        renderMembers(data.members);
      })
      .catch(function () {
        document.getElementById('ledeText').textContent =
          'Could not load your budgets right now.';
      });
  }

  function renderMembers(members) {
    const grid = document.getElementById('memberGrid');
    const lede = document.getElementById('ledeText');
    grid.innerHTML = '';

    if (!members.length) {
      grid.innerHTML = '<div class="empty-state">No budgets to show yet.</div>';
      lede.textContent = 'Nothing to show yet.';
      return;
    }

    lede.textContent =
      members.length === 1
        ? 'You have access to 1 budget.'
        : 'You have access to ' + members.length + ' budgets.';

    members.forEach(function (m) {
      const card = document.createElement('div');
      card.className = 'member-card';

      const actionLabel = m.accessLevel === 'full' ? 'Edit' : 'View';
      const isAdmin = viewerUser && viewerUser.role === 'admin';
      const viewerFeatures = (viewerUser && viewerUser.features) || {};

      const extraLinks =
        (isAdmin || viewerFeatures.reports
          ? '<a class="link-btn" href="reports.html?id=' + encodeURIComponent(m.id) + '">Reports →</a>'
          : '') +
        (isAdmin || viewerFeatures.loans
          ? '<a class="link-btn" href="loans.html?id=' + encodeURIComponent(m.id) + '">Loans →</a>'
          : '') +
        (isAdmin || viewerFeatures.income
          ? '<a class="link-btn" href="income.html?id=' + encodeURIComponent(m.id) + '">Income →</a>'
          : '');

      card.innerHTML =
        '<div class="member-name">' + escapeHtml(m.name) + '</div>' +
        '<div class="member-email">' + escapeHtml(m.email) + '</div>' +
        '<div class="member-actions">' +
        '<span class="badge badge-' + m.role + '">' + (ROLE_LABELS[m.role] || m.role) + '</span>' +
        '<span style="display:flex; gap:14px; flex-wrap:wrap;">' +
        extraLinks +
        '<a class="link-btn" href="budget.html?id=' + encodeURIComponent(m.id) + '">' + actionLabel + ' →</a>' +
        '</span>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(goToLogin);
  });
})();
