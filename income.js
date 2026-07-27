/* ===========================================================
   Budget Ledger — income page
   Its own page now (previously bundled inside the budget page),
   same pattern as Loans: pick a month, see total income, log
   entries by source and date. Same access rules — view-only
   users see the list but can't add sources or entries.
   =========================================================== */

(function () {
  const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer', member: 'Member' };
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const params = new URLSearchParams(window.location.search);
  let targetUserId = params.get('id');
  let currentMonth = currentMonthString();
  let currentAccessLevel = 'none';
  let sourcesCache = [];

  function currentMonthString() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function shiftMonth(monthStr, delta) {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatMonthLabel(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    return MONTH_NAMES[m - 1] + ' ' + y;
  }

  function formatCurrency(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function showBanner(message, type) {
    const banner = document.getElementById('statusBanner');
    banner.textContent = message;
    banner.className = 'status-banner show ' + type;
    setTimeout(function () {
      banner.className = 'status-banner';
    }, 3000);
  }

  function goToLogin() {
    window.authToken.clear();
    window.location.href = 'index.html';
  }

  /* ---------- boot sequence ---------- */

  fetch('/api/session')
    .then(function (res) {
      if (!res.ok) throw new Error('not-logged-in');
      return res.json();
    })
    .then(function (data) {
      const user = data.user;
      if (!targetUserId) targetUserId = user.id;

      const badge = document.getElementById('roleBadge');
      badge.textContent = ROLE_LABELS[user.role] || user.role;
      badge.className = 'badge badge-' + user.role;
      window.applyFeatureNav(user);
      if (user.role === 'admin') document.getElementById('adminLink').style.display = '';

      document.getElementById('incomeTitle').textContent =
        targetUserId === user.id ? 'Your Income' : 'Income';

      if (user.role !== 'admin' && !(user.features && user.features.income)) {
        document.getElementById('featureLockedMessage').style.display = '';
        document.getElementById('incomeContent').style.display = 'none';
        return;
      }

      document.getElementById('monthLabel').textContent = formatMonthLabel(currentMonth);
      wireMonthNav();
      wireIncomeSourceAdd();
      wireIncomeForm();

      if (targetUserId !== user.id) {
        loadViewingBanner();
      }

      return loadAll();
    })
    .catch(function () {
      goToLogin();
    });

  function loadViewingBanner() {
    return fetch('/api/users/' + encodeURIComponent(targetUserId) + '/profile')
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        const banner = document.getElementById('viewingBanner');
        banner.style.display = 'flex';

        const badge = document.getElementById('viewingBadge');
        badge.textContent = ROLE_LABELS[data.user.role] || data.user.role;
        badge.className = 'badge badge-' + data.user.role;

        document.getElementById('viewingName').textContent = data.user.name;
        document.getElementById('viewingEmail').textContent = data.user.email;
        document.getElementById('viewingAccessNote').textContent =
          data.accessLevel === 'full' ? 'You can edit this' : 'View-only for you';
      })
      .catch(function () {
        // Non-fatal.
      });
  }

  function wireMonthNav() {
    document.getElementById('prevMonth').addEventListener('click', function () {
      currentMonth = shiftMonth(currentMonth, -1);
      document.getElementById('monthLabel').textContent = formatMonthLabel(currentMonth);
      loadAll();
    });
    document.getElementById('nextMonth').addEventListener('click', function () {
      currentMonth = shiftMonth(currentMonth, 1);
      document.getElementById('monthLabel').textContent = formatMonthLabel(currentMonth);
      loadAll();
    });
  }

  function loadAll() {
    return Promise.all([loadIncomeSources(), loadIncomeSummary(), loadIncomes()]);
  }

  /* ---------- income sources ---------- */

  function loadIncomeSources() {
    return fetch('/api/income-sources/' + encodeURIComponent(targetUserId))
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        sourcesCache = data.sources;
        currentAccessLevel = data.accessLevel;
        applyAccessLevelUI();
        populateIncomeSourceSelect();
        renderIncomeSourceChips();
      })
      .catch(function () {
        showBanner('Could not load income sources.', 'error');
      });
  }

  function applyAccessLevelUI() {
    const isFull = currentAccessLevel === 'full';
    document.getElementById('addIncomeSourceBox').style.display = isFull ? '' : 'none';
    document.getElementById('incomeForm').style.display = isFull ? 'grid' : 'none';
    document.getElementById('incomeViewOnlyNote').style.display = isFull ? 'none' : '';
  }

  function renderIncomeSourceChips() {
    const container = document.getElementById('incomeSourceChips');
    const isFull = currentAccessLevel === 'full';

    if (!sourcesCache.length) {
      container.innerHTML = '<span class="muted-note">No income sources yet.</span>';
      return;
    }

    container.innerHTML = sourcesCache
      .map(function (s) {
        return (
          '<span class="grant-chip">' +
          escapeHtml(s.name) +
          (isFull
            ? ' <button class="icon-btn" style="padding:0 4px; border:none;" data-delete-source="' +
              s.id + '" data-source-name="' + escapeHtml(s.name) + '">×</button>'
            : '') +
          '</span>'
        );
      })
      .join('');

    if (isFull) {
      container.querySelectorAll('[data-delete-source]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          deleteIncomeSource(btn.getAttribute('data-delete-source'), btn.getAttribute('data-source-name'));
        });
      });
    }
  }

  function wireIncomeSourceAdd() {
    document.getElementById('addIncomeSourceBtn').addEventListener('click', function () {
      const input = document.getElementById('newIncomeSourceName');
      const name = input.value.trim();
      if (!name) return;

      fetch('/api/income-sources/' + encodeURIComponent(targetUserId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            showBanner(result.data.error || 'Could not add income source.', 'error');
            return;
          }
          input.value = '';
          loadIncomeSources();
        });
    });
  }

  function deleteIncomeSource(sourceId, name) {
    if (!confirm('Delete "' + name + '"? This also removes its logged income entries.')) return;

    fetch('/api/income-sources/' + encodeURIComponent(targetUserId) + '/' + encodeURIComponent(sourceId), {
      method: 'DELETE',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          showBanner(result.data.error || 'Could not delete income source.', 'error');
          return;
        }
        return loadAll();
      });
  }

  function populateIncomeSourceSelect() {
    const select = document.getElementById('incSource');
    select.innerHTML = sourcesCache
      .map(function (s) {
        return '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>';
      })
      .join('');
  }

  /* ---------- income summary + entries ---------- */

  function loadIncomeSummary() {
    return fetch('/api/income-summary/' + encodeURIComponent(targetUserId) + '/' + currentMonth)
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        renderSummaryStrip(data.total);
      })
      .catch(function () {
        showBanner('Could not load income summary.', 'error');
      });
  }

  function renderSummaryStrip(total) {
    const strip = document.getElementById('summaryStrip');
    strip.innerHTML =
      '<div class="summary-card">' +
      '<div class="summary-label">Total income this month</div>' +
      '<div class="summary-value positive">' + formatCurrency(total) + '</div>' +
      '</div>';
  }

  function wireIncomeForm() {
    const form = document.getElementById('incomeForm');
    const dateInput = document.getElementById('incDate');
    dateInput.valueAsDate = new Date();

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const sourceId = document.getElementById('incSource').value;
      const amount = document.getElementById('incAmount').value;
      const date = document.getElementById('incDate').value;
      const note = document.getElementById('incNote').value;

      if (!sourceId) {
        showBanner('Add an income source first.', 'error');
        return;
      }

      fetch('/api/incomes/' + encodeURIComponent(targetUserId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: sourceId, amount: amount, date: date, note: note }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            showBanner(result.data.error || 'Could not add income.', 'error');
            return;
          }
          document.getElementById('incAmount').value = '';
          document.getElementById('incNote').value = '';
          showBanner('Income logged.', 'success');

          const incomeMonth = date.slice(0, 7);
          if (incomeMonth === currentMonth) {
            Promise.all([loadIncomeSummary(), loadIncomes()]);
          }
        })
        .catch(function () {
          showBanner('Could not add income.', 'error');
        });
    });
  }

  function loadIncomes() {
    return fetch('/api/incomes/' + encodeURIComponent(targetUserId) + '/' + currentMonth)
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        renderIncomeTable(data.incomes);
      })
      .catch(function () {
        showBanner('Could not load income entries.', 'error');
      });
  }

  function renderIncomeTable(incomes) {
    const tbody = document.getElementById('incomeTableBody');
    const emptyState = document.getElementById('incomeEmptyState');
    tbody.innerHTML = '';

    if (!incomes.length) {
      emptyState.style.display = '';
      return;
    }
    emptyState.style.display = 'none';

    const isFull = currentAccessLevel === 'full';

    incomes.forEach(function (inc) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + inc.date + '</td>' +
        '<td>' + escapeHtml(inc.sourceName) + '</td>' +
        '<td class="amount-mono remaining-positive">' + formatCurrency(inc.amount) + '</td>' +
        '<td>' + escapeHtml(inc.note) + '</td>' +
        '<td>' + (isFull ? '<button class="icon-btn" data-delete-income="' + inc.id + '">Delete</button>' : '') + '</td>';
      tbody.appendChild(tr);
    });

    if (isFull) {
      tbody.querySelectorAll('[data-delete-income]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const incomeId = btn.getAttribute('data-delete-income');
          fetch('/api/incomes/' + encodeURIComponent(targetUserId) + '/' + encodeURIComponent(incomeId), {
            method: 'DELETE',
          })
            .then(function (res) {
              if (!res.ok) throw new Error('failed');
              return Promise.all([loadIncomeSummary(), loadIncomes()]);
            })
            .catch(function () {
              showBanner('Could not delete income entry.', 'error');
            });
        });
      });
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(goToLogin);
  });
})();
