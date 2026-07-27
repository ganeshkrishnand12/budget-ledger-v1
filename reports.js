/* ===========================================================
   Budget Ledger — reports page
   Three charts, all read-only regardless of access level (view
   or full — charts never let you edit anything, so there's no
   access gating beyond "can you see this record at all"):

     1. Bar chart  — planned vs spent, per category, selected month
     2. Pie chart  — spending breakdown, per category, selected month
     3. Line chart — planned vs spent totals, last 6 months

   Uses Chart.js from a CDN (loaded in reports.html).
   =========================================================== */

(function () {
  const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer', member: 'Member' };
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const MONTH_NAMES_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const PALETTE = ['#3ecf8e', '#d4a853', '#8fb4d9', '#e07a5f', '#c792ea', '#6ec6ca', '#f2a65a', '#9fd356', '#e8a0bf', '#7ea8a0'];

  const params = new URLSearchParams(window.location.search);
  let targetUserId = params.get('id');
  let currentMonth = currentMonthString();

  let barChart = null;
  let pieChart = null;
  let lineChart = null;
  let loanBarChart = null;
  let loanOweToChart = null;
  let loanOwedFromChart = null;
  let incomePieChart = null;

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

  function formatMonthShort(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    return MONTH_NAMES_SHORT[m - 1] + ' ' + y;
  }

  function formatCurrency(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function showBanner(message, type) {
    const banner = document.getElementById('statusBanner');
    banner.textContent = message;
    banner.className = 'status-banner show ' + type;
  }

  function goToLogin() {
    window.authToken.clear();
    window.location.href = 'index.html';
  }

  // Shared Chart.js styling to match the site's dark ledger theme.
  const CHART_TEXT_COLOR = '#8fa69c';
  const CHART_GRID_COLOR = 'rgba(143, 166, 156, 0.15)';

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

      document.getElementById('monthLabel').textContent = formatMonthLabel(currentMonth);
      wireMonthNav();

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
      loadMonthCharts();
      loadIncomeChart();
    });
    document.getElementById('nextMonth').addEventListener('click', function () {
      currentMonth = shiftMonth(currentMonth, 1);
      document.getElementById('monthLabel').textContent = formatMonthLabel(currentMonth);
      loadMonthCharts();
      loadIncomeChart();
    });
  }

  function loadAll() {
    return Promise.all([loadMonthCharts(), loadTrendChart(), loadLoanCharts(), loadIncomeChart()]);
  }

  /* ---------- bar + pie: this month's category breakdown ---------- */

  function loadMonthCharts() {
    return fetch('/api/budget-summary/' + encodeURIComponent(targetUserId) + '/' + currentMonth)
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        renderBarChart(data.rows);
        renderPieChart(data.rows);
      })
      .catch(function () {
        showBanner('Could not load this month\u2019s data.', 'error');
      });
  }

  function renderBarChart(rows) {
    const emptyState = document.getElementById('barEmptyState');
    const canvas = document.getElementById('categoryBarChart');

    if (!rows.length) {
      canvas.style.display = 'none';
      emptyState.style.display = '';
      if (barChart) { barChart.destroy(); barChart = null; }
      return;
    }
    canvas.style.display = '';
    emptyState.style.display = 'none';

    const labels = rows.map((r) => r.categoryName);
    const planned = rows.map((r) => r.planned);
    const spent = rows.map((r) => r.spent);

    const config = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Planned', data: planned, backgroundColor: '#d4a853', borderRadius: 4 },
          { label: 'Spent', data: spent, backgroundColor: '#3ecf8e', borderRadius: 4 },
        ],
      },
      options: chartOptions({
        scales: {
          x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
          y: {
            ticks: { color: CHART_TEXT_COLOR, callback: (v) => formatCurrency(v) },
            grid: { color: CHART_GRID_COLOR },
            beginAtZero: true,
          },
        },
      }),
    };

    if (barChart) {
      barChart.data = config.data;
      barChart.update();
    } else {
      barChart = new Chart(canvas.getContext('2d'), config);
    }
  }

  function renderPieChart(rows) {
    const emptyState = document.getElementById('pieEmptyState');
    const canvas = document.getElementById('categoryPieChart');
    const withSpend = rows.filter((r) => r.spent > 0);

    if (!withSpend.length) {
      canvas.style.display = 'none';
      emptyState.style.display = '';
      if (pieChart) { pieChart.destroy(); pieChart = null; }
      return;
    }
    canvas.style.display = '';
    emptyState.style.display = 'none';

    const labels = withSpend.map((r) => r.categoryName);
    const data = withSpend.map((r) => r.spent);
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    const config = {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: colors, borderColor: '#123028', borderWidth: 2 }],
      },
      options: chartOptions({
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: CHART_TEXT_COLOR, boxWidth: 12, padding: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.label + ': ' + formatCurrency(ctx.parsed),
            },
          },
        },
      }),
    };

    if (pieChart) {
      pieChart.data = config.data;
      pieChart.update();
    } else {
      pieChart = new Chart(canvas.getContext('2d'), config);
    }
  }

  /* ---------- line: trend over the last 6 months ---------- */

  function loadTrendChart() {
    const canvas = document.getElementById('trendLineChart');
    const emptyState = document.getElementById('trendEmptyState');

    return fetch('/api/budget-trend/' + encodeURIComponent(targetUserId) + '?months=6')
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          canvas.style.display = 'none';
          emptyState.style.display = '';
          emptyState.textContent =
            result.status === 403
              ? (result.data.error || 'Reports isn\u2019t enabled for you yet — ask an admin.')
              : 'Could not load the trend chart.';
          if (lineChart) { lineChart.destroy(); lineChart = null; }
          return;
        }
        canvas.style.display = '';
        emptyState.style.display = 'none';
        renderTrendChart(result.data.trend);
      })
      .catch(function () {
        showBanner('Could not load the trend chart.', 'error');
      });
  }

  function renderTrendChart(trend) {
    const canvas = document.getElementById('trendLineChart');
    const labels = trend.map((t) => formatMonthShort(t.month));
    const planned = trend.map((t) => t.planned);
    const spent = trend.map((t) => t.spent);
    const income = trend.map((t) => t.income);

    const config = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Income',
            data: income,
            borderColor: '#8fb4d9',
            backgroundColor: 'rgba(143, 180, 217, 0.1)',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
          },
          {
            label: 'Planned',
            data: planned,
            borderColor: '#d4a853',
            backgroundColor: 'transparent',
            borderDash: [5, 4],
            tension: 0.25,
            pointRadius: 3,
          },
          {
            label: 'Spent',
            data: spent,
            borderColor: '#3ecf8e',
            backgroundColor: 'rgba(62, 207, 142, 0.12)',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: chartOptions({
        scales: {
          x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
          y: {
            ticks: { color: CHART_TEXT_COLOR, callback: (v) => formatCurrency(v) },
            grid: { color: CHART_GRID_COLOR },
            beginAtZero: true,
          },
        },
      }),
    };

    if (lineChart) {
      lineChart.data = config.data;
      lineChart.update();
    } else {
      lineChart = new Chart(canvas.getContext('2d'), config);
    }
  }

  /* ---------- income: this month's breakdown by source ---------- */

  function loadIncomeChart() {
    return fetch('/api/income-summary/' + encodeURIComponent(targetUserId) + '/' + currentMonth)
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          const message =
            result.status === 403
              ? (result.data.error || 'Income isn\u2019t enabled for you yet — ask an admin.')
              : 'Could not load income data.';
          showFeatureUnavailable('incomePieChart', 'incomePieEmptyState', message);
          if (incomePieChart) { incomePieChart.destroy(); incomePieChart = null; }
          return;
        }
        renderIncomePieChart(result.data.rows);
      })
      .catch(function () {
        showBanner('Could not load income data.', 'error');
      });
  }

  function renderIncomePieChart(rows) {
    const emptyState = document.getElementById('incomePieEmptyState');
    const canvas = document.getElementById('incomePieChart');
    const withAmount = rows.filter((r) => r.amount > 0);

    if (!withAmount.length) {
      canvas.style.display = 'none';
      emptyState.style.display = '';
      if (incomePieChart) { incomePieChart.destroy(); incomePieChart = null; }
      return;
    }
    canvas.style.display = '';
    emptyState.style.display = 'none';

    const labels = withAmount.map((r) => r.sourceName);
    const data = withAmount.map((r) => r.amount);
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    const config = {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: colors, borderColor: '#123028', borderWidth: 2 }],
      },
      options: chartOptions({
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: CHART_TEXT_COLOR, boxWidth: 12, padding: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.label + ': ' + formatCurrency(ctx.parsed),
            },
          },
        },
      }),
    };

    if (incomePieChart) {
      incomePieChart.data = config.data;
      incomePieChart.update();
    } else {
      incomePieChart = new Chart(canvas.getContext('2d'), config);
    }
  }

  /* ---------- loans: outstanding balances by person ---------- */

  function loadLoanCharts() {
    return fetch('/api/loans/' + encodeURIComponent(targetUserId))
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          const message =
            result.status === 403
              ? (result.data.error || 'Loans isn\u2019t enabled for you yet — ask an admin.')
              : 'Could not load loan data.';
          showFeatureUnavailable('loanBarChart', 'loanBarEmptyState', message);
          showFeatureUnavailable('loanOweToChart', 'loanOweToEmptyState', message);
          showFeatureUnavailable('loanOwedFromChart', 'loanOwedFromEmptyState', message);
          if (loanBarChart) { loanBarChart.destroy(); loanBarChart = null; }
          if (loanOweToChart) { loanOweToChart.destroy(); loanOweToChart = null; }
          if (loanOwedFromChart) { loanOwedFromChart.destroy(); loanOwedFromChart = null; }
          return;
        }
        const byPerson = aggregateLoansByPerson(result.data.loans);
        renderLoanBarChart(byPerson);
        renderLoanBreakdownChart(byPerson, 'youOwe', 'loanOweToChart', 'loanOweToEmptyState', 'oweTo');
        renderLoanBreakdownChart(byPerson, 'owedToYou', 'loanOwedFromChart', 'loanOwedFromEmptyState', 'owedFrom');
      })
      .catch(function () {
        showBanner('Could not load loan data.', 'error');
      });
  }

  function showFeatureUnavailable(canvasId, emptyStateId, message) {
    const canvas = document.getElementById(canvasId);
    const emptyState = document.getElementById(emptyStateId);
    canvas.style.display = 'none';
    emptyState.style.display = '';
    emptyState.textContent = message;
  }

  // Groups outstanding (remaining > 0) loans by person, splitting into
  // what you owe them vs what they owe you.
  function aggregateLoansByPerson(loans) {
    const map = {};
    loans.forEach(function (l) {
      if (l.remaining <= 0) return;
      if (!map[l.personName]) map[l.personName] = { youOwe: 0, owedToYou: 0 };
      if (l.direction === 'owe_to') map[l.personName].youOwe += l.remaining;
      else map[l.personName].owedToYou += l.remaining;
    });
    return map;
  }

  function renderLoanBarChart(byPerson) {
    const canvas = document.getElementById('loanBarChart');
    const emptyState = document.getElementById('loanBarEmptyState');
    const names = Object.keys(byPerson);

    if (!names.length) {
      canvas.style.display = 'none';
      emptyState.style.display = '';
      if (loanBarChart) { loanBarChart.destroy(); loanBarChart = null; }
      return;
    }
    canvas.style.display = '';
    emptyState.style.display = 'none';

    const config = {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          { label: 'You owe', data: names.map((n) => byPerson[n].youOwe), backgroundColor: '#e07a5f', borderRadius: 4 },
          { label: 'Owed to you', data: names.map((n) => byPerson[n].owedToYou), backgroundColor: '#3ecf8e', borderRadius: 4 },
        ],
      },
      options: chartOptions({
        scales: {
          x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
          y: {
            ticks: { color: CHART_TEXT_COLOR, callback: (v) => formatCurrency(v) },
            grid: { color: CHART_GRID_COLOR },
            beginAtZero: true,
          },
        },
      }),
    };

    if (loanBarChart) {
      loanBarChart.data = config.data;
      loanBarChart.update();
    } else {
      loanBarChart = new Chart(canvas.getContext('2d'), config);
    }
  }

  function renderLoanBreakdownChart(byPerson, field, canvasId, emptyStateId, which) {
    const canvas = document.getElementById(canvasId);
    const emptyState = document.getElementById(emptyStateId);

    const names = Object.keys(byPerson).filter((n) => byPerson[n][field] > 0);

    if (!names.length) {
      canvas.style.display = 'none';
      emptyState.style.display = '';
      const existing = which === 'oweTo' ? loanOweToChart : loanOwedFromChart;
      if (existing) existing.destroy();
      if (which === 'oweTo') loanOweToChart = null;
      else loanOwedFromChart = null;
      return;
    }
    canvas.style.display = '';
    emptyState.style.display = 'none';

    const data = names.map((n) => byPerson[n][field]);
    const colors = names.map((_, i) => PALETTE[i % PALETTE.length]);

    const config = {
      type: 'doughnut',
      data: {
        labels: names,
        datasets: [{ data: data, backgroundColor: colors, borderColor: '#123028', borderWidth: 2 }],
      },
      options: chartOptions({
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: CHART_TEXT_COLOR, boxWidth: 12, padding: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.label + ': ' + formatCurrency(ctx.parsed),
            },
          },
        },
      }),
    };

    if (which === 'oweTo') {
      if (loanOweToChart) { loanOweToChart.data = config.data; loanOweToChart.update(); }
      else loanOweToChart = new Chart(canvas.getContext('2d'), config);
    } else {
      if (loanOwedFromChart) { loanOwedFromChart.data = config.data; loanOwedFromChart.update(); }
      else loanOwedFromChart = new Chart(canvas.getContext('2d'), config);
    }
  }

  /* ---------- shared chart option defaults ---------- */

  function chartOptions(overrides) {
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: CHART_TEXT_COLOR, font: { size: 12 } },
        },
      },
    };
    return deepMerge(base, overrides || {});
  }

  function deepMerge(target, source) {
    Object.keys(source).forEach(function (key) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object'
      ) {
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    });
    return target;
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(goToLogin);
  });
})();
