/* ===========================================================
   Budget Ledger — budget page
   The core screen: pick a month, see planned vs spent per
   category, adjust the plan (if you have full access), and log
   expenses as you spend. Works for your own record or, if you're
   an editor/viewer with access, someone else's — the server
   decides accessLevel ('full' | 'view') and this page just
   reflects it.
   =========================================================== */

(function () {
  const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer', member: 'Member' };
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const params = new URLSearchParams(window.location.search);
  let targetUserId = params.get('id'); // set once we know the session user, if absent
  let currentMonth = currentMonthString();
  let currentAccessLevel = 'none';
  let categoriesCache = [];
  let latestIncomeTotal = 0;
  let latestSpentTotal = 0;
  let incomeAvailable = true;

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

      document.getElementById('budgetTitle').textContent =
        targetUserId === user.id ? 'Your Budget' : 'Budget';

      document.getElementById('monthLabel').textContent = formatMonthLabel(currentMonth);
      wireMonthNav();
      wireCategoryAdd();
      wireExpenseForm();

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
        // Non-fatal: the page still works without the banner.
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
    return Promise.all([
      loadCategories(),
      loadBudgetSummary(),
      loadExpenses(),
      loadIncomeTotalForStrip(),
    ]).then(renderCashFlowStrip);
  }

  /* ---------- categories ---------- */

  function loadCategories() {
    return fetch('/api/categories/' + encodeURIComponent(targetUserId))
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        categoriesCache = data.categories;
        currentAccessLevel = data.accessLevel;
        applyAccessLevelUI();
        populateExpenseCategorySelect();
      })
      .catch(function () {
        showBanner('Could not load categories.', 'error');
      });
  }

  function applyAccessLevelUI() {
    const isFull = currentAccessLevel === 'full';
    document.getElementById('addCategoryBox').style.display = isFull ? '' : 'none';
    document.getElementById('savePlansBtn').style.display = isFull ? '' : 'none';
    document.getElementById('expenseForm').style.display = isFull ? 'grid' : 'none';
    document.getElementById('viewOnlyNote').style.display = isFull ? 'none' : '';
  }

  function renderCashFlowStrip() {
    const strip = document.getElementById('cashFlowStrip');

    if (!incomeAvailable) {
      strip.innerHTML =
        summaryCard('Income', 'Not enabled', '') +
        summaryCard('Expenses', formatCurrency(latestSpentTotal), latestSpentTotal > 0 ? 'negative' : '') +
        summaryCard('Net', '—', '');
      return;
    }

    const net = latestIncomeTotal - latestSpentTotal;
    const netClass = net >= 0 ? 'positive' : 'negative';
    strip.innerHTML =
      summaryCard('Income', formatCurrency(latestIncomeTotal), 'positive') +
      summaryCard('Expenses', formatCurrency(latestSpentTotal), latestSpentTotal > 0 ? 'negative' : '') +
      summaryCard('Net', formatCurrency(net), netClass);
  }

  function wireCategoryAdd() {
    document.getElementById('addCategoryBtn').addEventListener('click', function () {
      const input = document.getElementById('newCategoryName');
      const name = input.value.trim();
      if (!name) return;

      fetch('/api/categories/' + encodeURIComponent(targetUserId), {
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
            showBanner(result.data.error || 'Could not add category.', 'error');
            return;
          }
          input.value = '';
          loadCategories().then(loadBudgetSummary);
        });
    });
  }

  function deleteCategory(categoryId, name) {
    if (!confirm('Delete "' + name + '"? This also removes its planned amounts and logged expenses.')) {
      return;
    }
    fetch('/api/categories/' + encodeURIComponent(targetUserId) + '/' + encodeURIComponent(categoryId), {
      method: 'DELETE',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return loadAll();
      })
      .catch(function () {
        showBanner('Could not delete category.', 'error');
      });
  }

  /* ---------- budget summary (planned vs spent) ---------- */

  function loadBudgetSummary() {
    return fetch('/api/budget-summary/' + encodeURIComponent(targetUserId) + '/' + currentMonth)
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        currentAccessLevel = data.accessLevel;
        applyAccessLevelUI();
        renderCategoryTable(data.rows);
        renderSummaryStrip(data.totals);
        latestSpentTotal = data.totals.spent;
      })
      .catch(function () {
        showBanner('Could not load budget summary.', 'error');
      });
  }

  function renderSummaryStrip(totals) {
    const strip = document.getElementById('summaryStrip');
    const remainingClass = totals.remaining < 0 ? 'negative' : 'positive';
    strip.innerHTML =
      summaryCard('Planned', formatCurrency(totals.planned), '') +
      summaryCard('Spent', formatCurrency(totals.spent), '') +
      summaryCard('Remaining', formatCurrency(totals.remaining), remainingClass);
  }

  function summaryCard(label, value, valueClass) {
    return (
      '<div class="summary-card">' +
      '<div class="summary-label">' + label + '</div>' +
      '<div class="summary-value ' + valueClass + '">' + value + '</div>' +
      '</div>'
    );
  }

  function renderCategoryTable(rows) {
    const tbody = document.getElementById('categoryTableBody');
    const isFull = currentAccessLevel === 'full';
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted-note">No categories yet.</td></tr>';
      return;
    }

    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      const remainingClass = row.remaining < 0 ? 'remaining-negative' : 'remaining-positive';

      tr.innerHTML =
        '<td>' + escapeHtml(row.categoryName) + '</td>' +
        '<td><input type="number" min="0" step="1" class="planned-input" ' +
        'data-category-id="' + row.categoryId + '" value="' + row.planned + '" ' +
        (isFull ? '' : 'disabled') + '></td>' +
        '<td class="amount-mono">' + formatCurrency(row.spent) + '</td>' +
        '<td class="amount-mono ' + remainingClass + '">' + formatCurrency(row.remaining) + '</td>' +
        '<td>' +
        (isFull
          ? '<button class="icon-btn" data-delete-category="' + row.categoryId + '" data-category-name="' + escapeHtml(row.categoryName) + '">Delete</button>'
          : '') +
        '</td>';

      tbody.appendChild(tr);
    });

    if (isFull) {
      tbody.querySelectorAll('[data-delete-category]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          deleteCategory(btn.getAttribute('data-delete-category'), btn.getAttribute('data-category-name'));
        });
      });
    }

    document.getElementById('savePlansBtn').onclick = function () {
      const inputs = tbody.querySelectorAll('.planned-input');
      const entries = Array.prototype.map.call(inputs, function (input) {
        return {
          categoryId: input.getAttribute('data-category-id'),
          plannedAmount: Number(input.value) || 0,
        };
      });

      fetch('/api/budgets/' + encodeURIComponent(targetUserId) + '/' + currentMonth, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entries }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('failed');
          showBanner('Planned amounts saved.', 'success');
          return loadBudgetSummary();
        })
        .catch(function () {
          showBanner('Could not save planned amounts.', 'error');
        });
    };
  }

  /* ---------- expenses ---------- */

  function populateExpenseCategorySelect() {
    const select = document.getElementById('expCategory');
    select.innerHTML = categoriesCache
      .map(function (c) {
        return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
      })
      .join('');
  }

  function wireExpenseForm() {
    const form = document.getElementById('expenseForm');
    const dateInput = document.getElementById('expDate');
    dateInput.valueAsDate = new Date();

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const categoryId = document.getElementById('expCategory').value;
      const amount = document.getElementById('expAmount').value;
      const date = document.getElementById('expDate').value;
      const note = document.getElementById('expNote').value;

      if (!categoryId) {
        showBanner('Add a category first.', 'error');
        return;
      }

      fetch('/api/expenses/' + encodeURIComponent(targetUserId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: categoryId, amount: amount, date: date, note: note }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            showBanner(result.data.error || 'Could not add expense.', 'error');
            return;
          }
          document.getElementById('expAmount').value = '';
          document.getElementById('expNote').value = '';
          showBanner('Expense logged.', 'success');

          const expenseMonth = date.slice(0, 7);
          if (expenseMonth === currentMonth) {
            loadBudgetSummary();
            loadExpenses();
          }
        })
        .catch(function () {
          showBanner('Could not add expense.', 'error');
        });
    });
  }

  function loadExpenses() {
    return fetch('/api/expenses/' + encodeURIComponent(targetUserId) + '/' + currentMonth)
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        renderExpenseTable(data.expenses);
      })
      .catch(function () {
        showBanner('Could not load expenses.', 'error');
      });
  }

  function renderExpenseTable(expenses) {
    const tbody = document.getElementById('expenseTableBody');
    const emptyState = document.getElementById('expenseEmptyState');
    tbody.innerHTML = '';

    if (!expenses.length) {
      emptyState.style.display = '';
      return;
    }
    emptyState.style.display = 'none';

    const isFull = currentAccessLevel === 'full';

    expenses.forEach(function (exp) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + exp.date + '</td>' +
        '<td>' + escapeHtml(exp.categoryName) + '</td>' +
        '<td class="amount-mono">' + formatCurrency(exp.amount) + '</td>' +
        '<td>' + escapeHtml(exp.note) + '</td>' +
        '<td>' + (isFull ? '<button class="icon-btn" data-delete-expense="' + exp.id + '">Delete</button>' : '') + '</td>';
      tbody.appendChild(tr);
    });

    if (isFull) {
      tbody.querySelectorAll('[data-delete-expense]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const expenseId = btn.getAttribute('data-delete-expense');
          fetch('/api/expenses/' + encodeURIComponent(targetUserId) + '/' + encodeURIComponent(expenseId), {
            method: 'DELETE',
          })
            .then(function (res) {
              if (!res.ok) throw new Error('failed');
              return Promise.all([loadBudgetSummary(), loadExpenses()]);
            })
            .catch(function () {
              showBanner('Could not delete expense.', 'error');
            });
        });
      });
    }
  }

  /* ---------- income total (just for the cash-flow strip — full
     income management now lives on its own Income page) ---------- */

  function loadIncomeTotalForStrip() {
    return fetch('/api/income-summary/' + encodeURIComponent(targetUserId) + '/' + currentMonth)
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          incomeAvailable = false;
          return;
        }
        incomeAvailable = true;
        latestIncomeTotal = result.data.total;
      })
      .catch(function () {
        incomeAvailable = false;
      });
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(goToLogin);
  });
})();
