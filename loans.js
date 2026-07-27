/* ===========================================================
   Budget Ledger — loans page
   Tracks money you owe other people and money other people owe
   you, kept separate from the monthly budget/expense tracking.
   Same access rules as everywhere else: view-only users see the
   list but can't add, settle, or delete.
   =========================================================== */

(function () {
  const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer', member: 'Member' };
  const params = new URLSearchParams(window.location.search);
  let targetUserId = params.get('id');
  let currentAccessLevel = 'none';
  let loansCache = [];
  let showSettled = false;

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

      if (user.role !== 'admin' && !(user.features && user.features.loans)) {
        document.getElementById('featureLockedMessage').style.display = '';
        document.getElementById('loansContent').style.display = 'none';
        return;
      }

      document.getElementById('loanDate').valueAsDate = new Date();
      wireForm();
      wireSettledToggle();

      if (targetUserId !== user.id) {
        loadViewingBanner();
      }

      return loadLoans();
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

  function wireSettledToggle() {
    document.getElementById('showSettledToggle').addEventListener('change', function (e) {
      showSettled = e.target.checked;
      renderLoanTable();
    });
  }

  function applyAccessLevelUI() {
    const isFull = currentAccessLevel === 'full';
    document.getElementById('loanForm').style.display = isFull ? 'grid' : 'none';
    document.getElementById('viewOnlyNote').style.display = isFull ? 'none' : '';
  }

  /* ---------- loading ---------- */

  function loadLoans() {
    return fetch('/api/loans/' + encodeURIComponent(targetUserId))
      .then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then(function (data) {
        loansCache = data.loans;
        currentAccessLevel = data.accessLevel;
        applyAccessLevelUI();
        renderSummary(data.totals);
        renderLoanTable();
      })
      .catch(function () {
        showBanner('Could not load loans.', 'error');
      });
  }

  function renderSummary(totals) {
    const strip = document.getElementById('summaryStrip');
    const netClass = totals.net >= 0 ? 'positive' : 'negative';
    strip.innerHTML =
      summaryCard('You owe', formatCurrency(totals.youOwe), totals.youOwe > 0 ? 'negative' : '') +
      summaryCard('Owed to you', formatCurrency(totals.owedToYou), totals.owedToYou > 0 ? 'positive' : '') +
      summaryCard('Net position', formatCurrency(totals.net), netClass);
  }

  function summaryCard(label, value, valueClass) {
    return (
      '<div class="summary-card">' +
      '<div class="summary-label">' + label + '</div>' +
      '<div class="summary-value ' + valueClass + '">' + value + '</div>' +
      '</div>'
    );
  }

  /* ---------- add ---------- */

  function wireForm() {
    document.getElementById('loanForm').addEventListener('submit', function (e) {
      e.preventDefault();

      const direction = document.getElementById('loanDirection').value;
      const personName = document.getElementById('loanPerson').value.trim();
      const amount = document.getElementById('loanAmount').value;
      const date = document.getElementById('loanDate').value;
      const note = document.getElementById('loanNote').value;

      if (!personName) {
        showBanner('Enter who this loan is with.', 'error');
        return;
      }

      fetch('/api/loans/' + encodeURIComponent(targetUserId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: direction, personName: personName, amount: amount, date: date, note: note }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            showBanner(result.data.error || 'Could not add loan.', 'error');
            return;
          }
          document.getElementById('loanPerson').value = '';
          document.getElementById('loanAmount').value = '';
          document.getElementById('loanNote').value = '';
          showBanner('Loan added.', 'success');
          loadLoans();
        })
        .catch(function () {
          showBanner('Could not add loan.', 'error');
        });
    });
  }

  /* ---------- render + row actions ---------- */

  function renderLoanTable() {
    const tbody = document.getElementById('loanTableBody');
    const emptyState = document.getElementById('loanEmptyState');
    const isFull = currentAccessLevel === 'full';

    const visibleLoans = loansCache.filter(function (l) {
      return showSettled || l.status === 'open';
    });

    tbody.innerHTML = '';

    if (!visibleLoans.length) {
      emptyState.style.display = '';
      return;
    }
    emptyState.style.display = 'none';

    visibleLoans.forEach(function (loan) {
      const tr = document.createElement('tr');
      if (loan.status === 'settled') tr.style.opacity = '0.55';

      const directionLabel = loan.direction === 'owe_to' ? 'You owe' : 'Owed to you';
      const directionClass = loan.direction === 'owe_to' ? 'remaining-negative' : 'remaining-positive';

      const remainingCell =
        loan.status === 'settled'
          ? '<span class="badge badge-editor">Settled</span>'
          : '<span class="amount-mono remaining-negative">' + formatCurrency(loan.remaining) + '</span>';

      let actions = '';
      if (isFull) {
        actions =
          '<div style="display:flex; flex-direction:column; gap:6px; min-width:150px;">' +
          (loan.status !== 'settled'
            ? '<div style="display:flex; gap:6px;">' +
              '<input type="number" min="1" step="1" max="' + loan.remaining + '" ' +
              'class="planned-input" style="width:90px;" placeholder="Amount" data-payment-input="' + loan.id + '">' +
              '<button class="icon-btn" data-add-payment="' + loan.id + '">Pay</button>' +
              '</div>'
            : '') +
          '<div style="display:flex; gap:6px;">' +
          (loan.settledAmount > 0
            ? '<button class="icon-btn" data-reset-loan="' + loan.id + '">Reset</button>'
            : '') +
          '<button class="icon-btn" data-delete-loan="' + loan.id + '">Delete</button>' +
          '</div>' +
          '</div>';
      }

      tr.innerHTML =
        '<td class="' + directionClass + '">' + directionLabel + '</td>' +
        '<td>' + escapeHtml(loan.personName) + '</td>' +
        '<td class="amount-mono">' + formatCurrency(loan.amount) + '</td>' +
        '<td class="amount-mono">' + formatCurrency(loan.settledAmount || 0) + '</td>' +
        '<td>' + remainingCell + '</td>' +
        '<td>' + loan.date + '</td>' +
        '<td>' + escapeHtml(loan.note) + '</td>' +
        '<td>' + actions + '</td>';

      tbody.appendChild(tr);
    });

    if (isFull) {
      tbody.querySelectorAll('[data-add-payment]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const loanId = btn.getAttribute('data-add-payment');
          const input = tbody.querySelector('[data-payment-input="' + loanId + '"]');
          const amount = Number(input.value);

          if (!Number.isFinite(amount) || amount <= 0) {
            showBanner('Enter a payment amount greater than 0.', 'error');
            return;
          }

          fetch('/api/loans/' + encodeURIComponent(targetUserId) + '/' + encodeURIComponent(loanId) + '/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount }),
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { ok: res.ok, data: data };
              });
            })
            .then(function (result) {
              if (!result.ok) {
                showBanner(result.data.error || 'Could not record payment.', 'error');
                return;
              }
              showBanner('Payment recorded.', 'success');
              loadLoans();
            })
            .catch(function () {
              showBanner('Could not record payment.', 'error');
            });
        });
      });

      tbody.querySelectorAll('[data-reset-loan]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('Reset payments on this loan back to ₹0?')) return;
          const loanId = btn.getAttribute('data-reset-loan');
          fetch('/api/loans/' + encodeURIComponent(targetUserId) + '/' + encodeURIComponent(loanId) + '/reset', {
            method: 'PUT',
          })
            .then(function (res) {
              if (!res.ok) throw new Error('failed');
              return loadLoans();
            })
            .catch(function () {
              showBanner('Could not reset loan.', 'error');
            });
        });
      });

      tbody.querySelectorAll('[data-delete-loan]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('Delete this loan entry? This cannot be undone.')) return;
          const loanId = btn.getAttribute('data-delete-loan');
          fetch('/api/loans/' + encodeURIComponent(targetUserId) + '/' + encodeURIComponent(loanId), {
            method: 'DELETE',
          })
            .then(function (res) {
              if (!res.ok) throw new Error('failed');
              return loadLoans();
            })
            .catch(function () {
              showBanner('Could not delete loan.', 'error');
            });
        });
      });
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(goToLogin);
  });
})();
