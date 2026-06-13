// API Endpoints Base
const API_BASE = '/api';

// Application State
const state = {
  view: 'landing', // 'landing' | 'owner-dashboard' | 'user-dashboard'
  ownerSession: JSON.parse(localStorage.getItem('ownerSession')) || null,
  userSession: JSON.parse(localStorage.getItem('userSession')) || null,
  groups: [],
  selectedGroupId: null,
  activeGroupData: null, // Full details (group, members, auctions, payments)
  activePaymentToEdit: null // Payment record reference for owner payment update modal
};

// ================= DOM ELEMENT REFERENCES =================
const views = {
  landing: document.getElementById('view-landing'),
  ownerDashboard: document.getElementById('view-owner-dashboard'),
  userDashboard: document.getElementById('view-user-dashboard')
};

// Helper: Get JWT authorization header
function getAuthHeader() {
  if (state.ownerSession && state.ownerSession.token) {
    return { 'Authorization': 'Bearer ' + state.ownerSession.token };
  }
  return {};
}

// Helper: Calculate Month-Year date label for a chit month number
function getMonthYearLabel(createdDateStr, monthNumber) {
  if (!createdDateStr) return '';
  const date = new Date(createdDateStr);
  date.setMonth(date.getMonth() + (monthNumber - 1));
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ================= ROUTING & STATE CONTROLLERS =================

function setView(viewName) {
  state.view = viewName;
  
  // Toggle visibility of views
  document.getElementById('view-landing').classList.add('d-none');
  document.getElementById('view-owner-dashboard').classList.add('d-none');
  document.getElementById('view-user-dashboard').classList.add('d-none');

  if (viewName === 'landing') {
    document.getElementById('view-landing').classList.remove('d-none');
    document.getElementById('nav-user-info').innerHTML = '';
  } else if (viewName === 'owner-dashboard') {
    const adminName = state.ownerSession.owner ? state.ownerSession.owner.username : (state.ownerSession.username || 'Owner');
    document.getElementById('view-owner-dashboard').classList.remove('d-none');
    document.getElementById('nav-user-info').innerHTML = `
      <div class="nav-user">
        <span>👤 Admin: <strong>${adminName}</strong></span>
        <button class="btn btn-secondary btn-sm" onclick="logoutOwner()">Logout</button>
      </div>
    `;
    loadGroups();
  } else if (viewName === 'user-dashboard') {
    document.getElementById('view-user-dashboard').classList.remove('d-none');
    document.getElementById('nav-user-info').innerHTML = `
      <div class="nav-user">
        <span>👤 Client: <strong>${state.userSession.member.name}</strong></span>
        <button class="btn btn-secondary btn-sm" onclick="logoutUser()">Logout</button>
      </div>
    `;
    loadUserDashboard();
  }

  // Telemetry: POST layout measurements to server debug endpoint
  setTimeout(() => {
    try {
      const landing = document.getElementById('view-landing');
      const owner = document.getElementById('view-owner-dashboard');
      const user = document.getElementById('view-user-dashboard');
      const navbar = document.querySelector('.navbar');
      const appContainer = document.querySelector('.app-container');
      
      const data = {
        view: viewName,
        landing: landing ? {
          classes: landing.className,
          display: window.getComputedStyle(landing).display,
          height: landing.offsetHeight,
          visible: landing.offsetWidth > 0 && landing.offsetHeight > 0
        } : null,
        owner: owner ? {
          classes: owner.className,
          display: window.getComputedStyle(owner).display,
          height: owner.offsetHeight
        } : null,
        user: user ? {
          classes: user.className,
          display: window.getComputedStyle(user).display,
          height: user.offsetHeight,
          marginTop: window.getComputedStyle(user).marginTop,
          paddingTop: window.getComputedStyle(user).paddingTop,
          flex: window.getComputedStyle(user).flex,
          children: Array.from(user.children).map((c, i) => ({
            index: i,
            tagName: c.tagName,
            id: c.id,
            className: c.className,
            display: window.getComputedStyle(c).display,
            height: c.offsetHeight,
            offsetTop: c.offsetTop,
            marginTop: window.getComputedStyle(c).marginTop,
            marginBottom: window.getComputedStyle(c).marginBottom
          }))
        } : null,
        navbar: navbar ? {
          height: navbar.offsetHeight,
          marginBottom: window.getComputedStyle(navbar).marginBottom
        } : null,
        appContainer: appContainer ? {
          display: window.getComputedStyle(appContainer).display,
          flexDirection: window.getComputedStyle(appContainer).flexDirection,
          justifyContent: window.getComputedStyle(appContainer).justifyContent,
          alignItems: window.getComputedStyle(appContainer).alignItems,
          height: appContainer.offsetHeight,
          children: Array.from(appContainer.children).map((c, i) => ({
            index: i,
            tagName: c.tagName,
            id: c.id,
            className: c.className,
            display: window.getComputedStyle(c).display,
            height: c.offsetHeight,
            offsetTop: c.offsetTop,
            marginTop: window.getComputedStyle(c).marginTop,
            marginBottom: window.getComputedStyle(c).marginBottom
          }))
        } : null
      };
      fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(err => {});
    } catch (e) {}
  }, 1200);
}

// Check initial authentication state on page load
function checkAuth() {
  if (state.ownerSession) {
    setView('owner-dashboard');
  } else if (state.userSession) {
    setView('user-dashboard');
  } else {
    setView('landing');
  }
}

// ================= AUTHENTICATION HANDLERS =================

async function handleOwnerLogin(event) {
  event.preventDefault();
  const form = event.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  const errorEl = document.getElementById('owner-login-error');

  errorEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/owner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    state.ownerSession = data;
    localStorage.setItem('ownerSession', JSON.stringify(data));
    form.reset();
    setView('owner-dashboard');
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
}

async function handleUserLogin(event) {
  event.preventDefault();
  const form = event.target;
  const clientId = form.clientId.value.trim();
  const phone = form.phone.value.trim();
  const errorEl = document.getElementById('user-login-error');

  errorEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/client/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, phone })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Store memberships and make the first membership active by default
    state.userSession = {
      memberships: data.memberships,
      member: data.memberships[0].member,
      group: data.memberships[0].group
    };
    localStorage.setItem('userSession', JSON.stringify(state.userSession));
    form.reset();
    setView('user-dashboard');
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
}

function logoutOwner() {
  state.ownerSession = null;
  localStorage.removeItem('ownerSession');
  setView('landing');
}

function logoutUser() {
  state.userSession = null;
  localStorage.removeItem('userSession');
  setView('landing');
}

// ================= OWNER DASHBOARD LOGIC =================

// Fetch all groups and display them
async function loadGroups() {
  try {
    const response = await fetch(`${API_BASE}/groups`);
    if (!response.ok) throw new Error('Failed to fetch groups');
    
    state.groups = await response.json();
    renderGroupsList();
  } catch (error) {
    console.error('Error fetching groups:', error);
  }
}

function renderGroupsList() {
  const container = document.getElementById('groups-list-container');
  if (state.groups.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); padding: 2rem;">
        <span style="font-size: 2rem;">📂</span>
        <p style="margin-top: 0.5rem;">No groups created yet. Create a group to get started!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.groups.map(g => `
    <div class="group-item" onclick="selectGroup('${g.id}')">
      <div class="group-badge">${g.name.substring(0, 2).toUpperCase()}</div>
      <div class="group-details-col">
        <div class="group-name">${g.name}</div>
        <div class="group-meta">
          <span>Value: <strong>₹${Number(g.total_value).toLocaleString()}</strong></span>
          <span>Commission: <strong>₹${Number(g.commission_amount).toLocaleString()}</strong></span>
          <span>Members: <strong>${g.memberCount}/${g.duration_months}</strong></span>
        </div>
      </div>
      <div>
        <span class="badge ${g.chit_type === 'auction' ? 'badge-primary' : 'badge-accent'}">
          ${g.chit_type.toUpperCase()}
        </span>
      </div>
    </div>
  `).join('');
}

// Select a group and show full detail screen
async function selectGroup(groupId) {
  state.selectedGroupId = groupId;
  document.getElementById('owner-group-detail-view').classList.remove('d-none');
  
  // Scroll to detail panel on mobile
  document.getElementById('owner-group-detail-view').scrollIntoView({ behavior: 'smooth' });

  await refreshActiveGroupData();
  renderNotificationLogs();
}

async function refreshActiveGroupData() {
  if (!state.selectedGroupId) return;

  try {
    const response = await fetch(`${API_BASE}/groups/${state.selectedGroupId}`);
    if (!response.ok) throw new Error('Failed to fetch group details');

    const data = await response.json();
    state.activeGroupData = data;
    
    renderGroupDetailsHeader();
    renderGroupMembersTab();
    renderAuctionPanel();
    renderLedgerTable();
    renderPaymentMatrix();
    refreshGroupQueries();
  } catch (error) {
    console.error('Error fetching group details:', error);
  }
}

function renderGroupDetailsHeader() {
  const { group, members } = state.activeGroupData;
  document.getElementById('detail-group-name').textContent = group.name;
  document.getElementById('detail-group-id').textContent = group.id;
  document.getElementById('header-group-value').textContent = `₹${Number(group.total_value).toLocaleString()}`;
  document.getElementById('header-commission-amount').textContent = `₹${Number(group.commission_amount).toLocaleString()}`;
  document.getElementById('header-duration-months').textContent = `${group.duration_months} months`;
  document.getElementById('header-members-joined').textContent = `${members.length} / ${group.duration_months}`;
  
  const currentMonthLabel = group.current_month <= group.duration_months
    ? ` | Current: Month ${group.current_month} (${getMonthYearLabel(group.created_at, group.current_month)})`
    : ` | Completed`;
  
  const descEl = document.getElementById('detail-group-id').parentNode.parentNode.querySelector('p');
  if (descEl) {
    descEl.innerHTML = `Share this Group ID with members so they can log in directly from their phones.${currentMonthLabel}`;
  }

  // Hide details action button depending on completion
  const actionContainer = document.getElementById('group-actions-container');
  let actionsHtml = '';
  
  if (group.current_month > group.duration_months) {
    actionsHtml += `<span class="badge badge-accent" style="padding: 0.5rem 1rem; margin-right: 0.5rem;">Chit Fund Completed</span>`;
  } else {
    actionsHtml += `
      <button class="btn btn-secondary btn-sm" style="margin-right: 0.5rem;" onclick="sendPaymentReminders()">
        📢 Send Payment Reminders
      </button>
    `;
  }

  // Add Start New Phase button if there are members enrolled
  if (members.length > 0) {
    actionsHtml += `
      <button class="btn btn-primary btn-sm" style="margin-right: 0.5rem;" onclick="openCloneGroupModal()">
        🆕 Start New Phase
      </button>
    `;
  }

  // Always show delete option
  actionsHtml += `
    <button class="btn btn-danger btn-sm" onclick="deleteGroup('${group.id}')">
      🗑️ Delete Group
    </button>
  `;
  actionContainer.innerHTML = actionsHtml;
}

function renderGroupMembersTab() {
  const { members, group } = state.activeGroupData;
  const container = document.getElementById('members-list-table-body');
  
  if (members.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" class="text-center" style="color: var(--text-secondary); padding: 2rem;">
          No members in this group yet. Add manually or upload CSV.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = members.map((m, index) => `
    <tr>
      <td><strong>${index + 1}</strong></td>
      <td>${m.name}</td>
      <td>${m.phone}</td>
      <td>${m.email || '-'}</td>
      <td><span class="badge badge-secondary" style="text-transform: capitalize; background: rgba(255, 255, 255, 0.08); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${m.language || 'english'}</span></td>
      <td class="text-right">
        <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
          <button class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="openEditMemberModal('${m.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="removeMember('${m.id}')">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderAuctionPanel() {
  const { group, members, auctions } = state.activeGroupData;
  const container = document.getElementById('auction-action-area');
  
  // Can only start auctions once members count matches duration
  if (members.length < group.duration_months) {
    container.innerHTML = `
      <div style="background: rgba(245, 158, 11, 0.05); border: 1px dashed var(--accent); border-radius: 8px; padding: 1rem; font-size: 0.85rem; color: var(--accent);">
        <strong>⚠️ Cannot Hold Auction:</strong> This group has ${members.length} members. You need exactly ${group.duration_months} members to match the duration before starting auctions. Please add more members.
      </div>
    `;
    return;
  }

  const currentMonth = group.current_month;

  if (currentMonth > group.duration_months) {
    container.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid var(--primary); border-radius: 8px; padding: 1rem; font-size: 0.85rem; color: var(--primary); text-align: center;">
        🎉 <strong>All ${group.duration_months} months completed!</strong> No more auctions left.
      </div>
    `;
    return;
  }

  // Filter members who haven't won an auction yet
  const wonMemberIds = auctions.map(a => a.winner_member_id);
  const eligibleMembers = members.filter(m => !wonMemberIds.includes(m.id));

  let selectionDropdown = `<select class="form-control" name="winnerMemberId" required>`;
  selectionDropdown += `<option value="">-- Choose Member --</option>`;
  eligibleMembers.forEach(m => {
    selectionDropdown += `<option value="${m.id}">${m.name} (${m.phone})</option>`;
  });
  selectionDropdown += `</select>`;

  container.innerHTML = `
    <form id="hold-auction-form" onsubmit="holdAuction(event)">
      <h4 style="margin-bottom: 1rem; font-family: Outfit;">Hold Auction for Month ${currentMonth} (${getMonthYearLabel(group.created_at, currentMonth)})</h4>
      
      <div class="form-group">
        <label>Select Month ${currentMonth} Winner</label>
        ${selectionDropdown}
      </div>

      <div class="form-group">
        <label>Total prize pot won by winner (₹)</label>
        <input type="number" id="auc-amount-won" name="amountWon" class="form-control" value="${group.total_value}" oninput="updateCalculatedAuctionFields()" required />
      </div>

      <div class="form-group">
        <label>Installment amount payable by non-winners for this month (₹)</label>
        <input type="number" id="auc-net-payable" name="netPayablePerMember" class="form-control" value="${(group.total_value / members.length).toFixed(2)}" readonly />
        <span style="font-size: 0.75rem; color: var(--text-secondary);">Automatically calculated as: <code>Winner Prize Pot / Total Members</code>.</span>
      </div>

      <div class="form-group">
        <label>Owner's commission (₹)</label>
        <input type="number" name="commissionAmount" class="form-control" value="${group.commission_amount}" required />
      </div>

      <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">
        ✅ Submit Winner & Process Monthly Installments
      </button>
    </form>
  `;
}

function updateCalculatedAuctionFields() {
  const amountWonInput = document.getElementById('auc-amount-won');
  const netPayableInput = document.getElementById('auc-net-payable');
  if (amountWonInput && netPayableInput && state.activeGroupData) {
    const totalMembers = state.activeGroupData.members.length;
    const amountWon = Number(amountWonInput.value || 0);
    netPayableInput.value = (amountWon / totalMembers).toFixed(2);
  }
}

function renderLedgerTable() {
  const { auctions, group } = state.activeGroupData;
  const container = document.getElementById('ledger-table-body');
  
  if (auctions.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="color: var(--text-secondary); padding: 2rem;">
          No auctions held yet. Fill group members and hold the first month's auction.
        </td>
      </tr>
    `;
    return;
  }

  let totalDiscount = 0;
  let totalCommission = 0;
  let totalWinnerPayout = 0;

  let html = auctions.map(a => {
    totalDiscount += Number(a.bid_discount);
    totalCommission += Number(a.commission_earned);
    totalWinnerPayout += Number(a.net_amount_paid_to_winner);

    return `
      <tr>
        <td><strong>Month ${a.month_number} (${getMonthYearLabel(group.created_at, a.month_number)})</strong></td>
        <td>${a.winner_name}</td>
        <td>₹${Number(a.bid_discount).toLocaleString()}</td>
        <td>₹${Number(a.commission_earned).toLocaleString()}</td>
        <td>₹${Number(a.dividend_per_member).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
        <td>₹${Number(a.net_payable_per_member).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
        <td class="text-success" style="font-weight: 600;">₹${Number(a.net_amount_paid_to_winner).toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  // Add Sum Total Row
  html += `
    <tr class="ledger-total-row">
      <td colspan="2">TOTAL</td>
      <td>₹${totalDiscount.toLocaleString()}</td>
      <td>₹${totalCommission.toLocaleString()}</td>
      <td>-</td>
      <td>-</td>
      <td class="text-success">₹${totalWinnerPayout.toLocaleString()}</td>
    </tr>
  `;

  container.innerHTML = html;
}

function renderPaymentMatrix() {
  const { group, members, payments } = state.activeGroupData;
  const headerContainer = document.getElementById('payment-matrix-headers');
  const bodyContainer = document.getElementById('payment-matrix-body');

  if (members.length === 0) {
    headerContainer.innerHTML = '<th>Member</th>';
    bodyContainer.innerHTML = `
      <tr>
        <td style="color: var(--text-secondary); padding: 2rem; text-align: center;">
          Add members to display the payment board matrix.
        </td>
      </tr>
    `;
    return;
  }

  // Create columns: Member Name, then Month 1 to Month duration
  let headersHtml = '<th>Member Name</th>';
  for (let m = 1; m <= group.duration_months; m++) {
    const isCurrent = m === group.current_month;
    const highlightStyle = isCurrent ? ' style="background: rgba(16, 185, 129, 0.15); font-weight: bold; color: white;"' : '';
    const currentText = isCurrent ? ' <span class="badge badge-primary" style="font-size:0.55rem; padding:0.1rem 0.2rem; vertical-align: middle;">Current</span>' : '';
    headersHtml += `<th${highlightStyle}>Month ${m}${currentText}<br/><small style="font-weight: normal; font-size: 0.7rem; color: var(--text-secondary);">${getMonthYearLabel(group.created_at, m)}</small></th>`;
  }
  headerContainer.innerHTML = headersHtml;

  // Build matrix rows
  let rowsHtml = '';
  members.forEach(member => {
    rowsHtml += `<tr>`;
    rowsHtml += `<td><strong>${member.name}</strong></td>`;
    
    for (let m = 1; m <= group.duration_months; m++) {
      // Find payment record for this member and month
      const payRecord = payments.find(p => p.member_id === member.id && p.month_number === m);
      
      if (!payRecord) {
        // Auction hasn't been held for this month yet
        rowsHtml += `<td style="color: var(--text-muted); font-size: 0.75rem;">-</td>`;
      } else {
        const isPaid = payRecord.status === 'paid';
        const badgeClass = isPaid ? 'paid' : 'unpaid';
        const formattedAmount = Number(payRecord.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        const label = isPaid ? `₹${formattedAmount} Paid` : `₹${formattedAmount} Due`;
        
        rowsHtml += `
          <td class="matrix-cell ${badgeClass}" onclick="openPaymentDetailsModal('${payRecord.id}')">
            ${label}
          </td>
        `;
      }
    }
    rowsHtml += `</tr>`;
  });

  bodyContainer.innerHTML = rowsHtml;
}

// Fetch all SMS notifications sent
async function renderNotificationLogs() {
  try {
    const response = await fetch(`${API_BASE}/notifications`);
    if (!response.ok) throw new Error('Failed to fetch notifications');

    const logs = await response.json();
    const container = document.getElementById('notifications-container');

    if (logs.length === 0) {
      container.innerHTML = `
        <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">
          No notifications sent yet.
        </div>
      `;
      return;
    }

    container.innerHTML = logs.map(l => {
      const date = new Date(l.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let statusBadge = '';
      if (l.status === 'sent') {
        statusBadge = `<span class="badge" style="font-size: 0.65rem; padding: 0.1rem 0.4rem; background-color: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); margin-left: 0.5rem; border-radius: 4px;">Sent</span>`;
      } else if (l.status === 'simulated') {
        statusBadge = `<span class="badge" style="font-size: 0.65rem; padding: 0.1rem 0.4rem; background-color: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); margin-left: 0.5rem; border-radius: 4px;">Simulated</span>`;
      } else if (l.status === 'failed') {
        const titleAttr = l.error_message ? `title="${l.error_message.replace(/"/g, '&quot;')}"` : 'title="Delivery failed"';
        statusBadge = `<span class="badge" ${titleAttr} style="font-size: 0.65rem; padding: 0.1rem 0.4rem; background-color: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); margin-left: 0.5rem; border-radius: 4px; cursor: help;">Failed</span>`;
      } else {
        const statusClean = (l.status || 'unknown').toUpperCase();
        statusBadge = `<span class="badge" style="font-size: 0.65rem; padding: 0.1rem 0.4rem; background-color: rgba(156, 163, 175, 0.2); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); margin-left: 0.5rem; border-radius: 4px;">${statusClean}</span>`;
      }

      return `
        <div class="notif-item ${l.type}">
          <div class="notif-meta">
            <span>📞 ${l.recipient} (${l.type.toUpperCase()})${statusBadge}</span>
            <span>${date}</span>
          </div>
          <div class="notif-body">${l.message}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading notification logs:', error);
  }
}

// Add Group manual action
async function createGroup(event) {
  event.preventDefault();
  const form = event.target;
  
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> Creating...`;
  
  const groupPayload = {
    name: form.name.value.trim(),
    totalValue: Number(form.totalValue.value),
    durationMonths: Number(form.durationMonths.value),
    commissionAmount: Number(form.commissionAmount.value),
    winnerExtraAmount: Number(form.winnerExtraAmount.value || 0),
    chitType: form.chitType.value
  };

  try {
    const response = await fetch(`${API_BASE}/groups`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(groupPayload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create group');

    closeModal('create-group-modal');
    form.reset();
    await loadGroups();
    selectGroup(data.id);
  } catch (error) {
    alert(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// Open Clone Group modal prefilling details from current group
function openCloneGroupModal() {
  if (!state.activeGroupData) return;
  const { group, members } = state.activeGroupData;

  document.getElementById('clone-group-name').value = `${group.name} - New Phase`;
  document.getElementById('clone-group-total-value').value = group.total_value;
  document.getElementById('clone-group-duration').value = members.length;
  document.getElementById('clone-group-commission').value = group.commission_amount;
  document.getElementById('clone-group-extra').value = group.winner_extra_amount || 0;
  document.getElementById('clone-group-type').value = group.chit_type;

  openModal('clone-group-modal');
}

// Clone Group manual action (New Phase)
async function cloneGroup(event) {
  event.preventDefault();
  const form = event.target;
  
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> Starting...`;
  
  const clonePayload = {
    name: form.name.value.trim(),
    totalValue: Number(form.totalValue.value),
    durationMonths: Number(form.durationMonths.value),
    commissionAmount: Number(form.commissionAmount.value),
    winnerExtraAmount: Number(form.winnerExtraAmount.value || 0),
    chitType: form.chitType.value
  };

  try {
    const response = await fetch(`${API_BASE}/groups/${state.selectedGroupId}/clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(clonePayload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to clone group');

    closeModal('clone-group-modal');
    form.reset();
    await loadGroups();
    selectGroup(data.newGroupId);
  } catch (error) {
    alert(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// Add Member manual action
async function addMember(event) {
  event.preventDefault();
  const form = event.target;
  const memberPayload = {
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    language: form.language.value
  };

  try {
    const response = await fetch(`${API_BASE}/groups/${state.selectedGroupId}/members`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(memberPayload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to add member');

    form.reset();
    refreshActiveGroupData();
  } catch (error) {
    alert(error.message);
  }
}

// Remove member manually
async function removeMember(memberId) {
  if (!confirm('Are you sure you want to remove this member?')) return;

  try {
    const response = await fetch(`${API_BASE}/members/${memberId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete member');

    refreshActiveGroupData();
  } catch (error) {
    alert(error.message);
  }
}

// Delete group manually
async function deleteGroup(groupId) {
  if (!confirm('⚠️ WARNING: Are you sure you want to delete this chit group? This will permanently delete all members, auction logs, payments, and SMS logs associated with this group. This action CANNOT be undone.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/groups/${groupId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete group');

    alert('Group deleted successfully!');
    
    // Hide details panel
    document.getElementById('owner-group-detail-view').classList.add('d-none');
    
    // Reset selected group state
    state.selectedGroupId = null;
    state.activeGroupData = null;
    
    // Reload group list
    loadGroups();
  } catch (error) {
    alert(error.message);
  }
}

// HOLD MONTHLY AUCTION RECORD
async function holdAuction(event) {
  event.preventDefault();
  const form = event.target;

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnContent = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner" style="margin-right: 0.5rem;"></span> Processing Auction...`;
  }

  const payload = {
    winnerMemberId: form.winnerMemberId.value,
    netPayablePerMember: Number(form.netPayablePerMember.value),
    amountWon: Number(form.amountWon.value),
    commissionAmount: Number(form.commissionAmount.value)
  };

  try {
    const response = await fetch(`${API_BASE}/groups/${state.selectedGroupId}/auctions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to hold auction');

    refreshActiveGroupData();
    renderNotificationLogs();
  } catch (error) {
    alert(error.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
    }
  }
}

// Send Monthly Payment Reminders
async function sendPaymentReminders() {
  const currentMonth = state.activeGroupData.group.current_month;
  const targetMonth = currentMonth - 1;
  if (targetMonth < 1) {
    alert('No active auctions have been held yet to remind.');
    return;
  }

  if (!confirm(`Send alerts to all unpaid members for Month ${targetMonth}?`)) return;

  try {
    const response = await fetch(`${API_BASE}/groups/${state.selectedGroupId}/remind`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ monthNumber: targetMonth })
    });

    const data = await response.json();
    alert(`Success! SMS & email reminders sent to ${data.count} unpaid members.`);
    renderNotificationLogs();
  } catch (error) {
    alert('Failed to send reminders.');
  }
}

// CSV Excel Upload Importer Parser
function handleCsvUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      alert('CSV file is empty or invalid format');
      return;
    }

    // Parse headers (e.g. Name, Phone, Email, Language)
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number'));
    const emailIdx = headers.findIndex(h => h.includes('email'));
    const langIdx = headers.findIndex(h => h.includes('lang') || h.includes('preferred'));

    if (nameIdx === -1 || phoneIdx === -1) {
      alert('CSV must contain column headers for "Name" and "Phone"');
      return;
    }

    const membersToImport = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      if (row.length <= Math.max(nameIdx, phoneIdx)) continue;
      
      const name = row[nameIdx] ? row[nameIdx].trim() : '';
      const phone = row[phoneIdx] ? row[phoneIdx].trim() : '';
      const email = (emailIdx !== -1 && row[emailIdx]) ? row[emailIdx].trim() : '';
      const rawLang = (langIdx !== -1 && row[langIdx]) ? row[langIdx].trim().toLowerCase() : 'english';
      const language = ['english', 'hindi', 'telugu'].includes(rawLang) ? rawLang : 'english';

      if (name && phone) {
        membersToImport.push({ name, phone, email, language });
      }
    }

    if (membersToImport.length === 0) {
      alert('No valid members found in the CSV file');
      return;
    }

    // Get Progress Bar Elements
    const progressContainer = document.getElementById('csv-upload-progress-container');
    const progressBar = document.getElementById('csv-upload-bar');
    const progressPercent = document.getElementById('csv-upload-percentage');
    const progressStatus = document.getElementById('csv-upload-status');

    // Show Progress Bar and reset states
    progressContainer.classList.remove('d-none');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Uploading & enrolling members...';

    // Disable input to block concurrent uploads
    event.target.disabled = true;

    // Simulated progress bar animation (goes up to 90% while waiting for API call)
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      if (currentProgress < 90) {
        const step = (90 - currentProgress) * 0.15;
        currentProgress += Math.max(step, 1);
        const displayProgress = Math.round(currentProgress);
        progressBar.style.width = `${displayProgress}%`;
        progressPercent.textContent = `${displayProgress}%`;
      }
    }, 150);

    // Send array to server
    try {
      const response = await fetch(`${API_BASE}/groups/${state.selectedGroupId}/members/bulk`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ members: membersToImport })
      });

      clearInterval(progressInterval);

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Bulk upload failed');

      // Complete progress bar
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';
      progressStatus.textContent = 'Enrolled successfully!';

      // Give 600ms to let the user see the completed bar, then close and alert
      setTimeout(() => {
        progressContainer.classList.add('d-none');
        alert(`Successfully imported ${data.count} members!`);
        event.target.value = ''; // Reset input
        event.target.disabled = false;
        refreshActiveGroupData();
      }, 600);

    } catch (error) {
      clearInterval(progressInterval);
      progressContainer.classList.add('d-none');
      event.target.disabled = false;
      alert(error.message);
    }
  };
  
  reader.readAsText(file);
}

// Payment modal management
function openPaymentDetailsModal(paymentId) {
  const payment = state.activeGroupData.payments.find(p => p.id === paymentId);
  if (!payment) return;

  state.activePaymentToEdit = payment;

  document.getElementById('modal-pay-member-name').textContent = payment.member_name;
  document.getElementById('modal-pay-month-num').textContent = payment.month_number;
  document.getElementById('modal-pay-amount').textContent = `₹${Number(payment.amount_paid).toFixed(2)}`;

  const isPaid = payment.status === 'paid';
  
  // Set values in form
  const statusSelect = document.getElementById('payment-status-select');
  statusSelect.value = payment.status;
  
  const methodSelect = document.getElementById('payment-method-select');
  methodSelect.value = payment.payment_method || 'cash';
  
  const notesField = document.getElementById('payment-notes-input');
  notesField.value = payment.notes || '';

  // Show detailed info if already paid
  const logInfo = document.getElementById('payment-log-info');
  if (isPaid) {
    const dateStr = payment.paid_at ? new Date(payment.paid_at).toLocaleString() : 'N/A';
    logInfo.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid var(--primary); border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.85rem;">
        🟢 <strong>Paid On:</strong> ${dateStr}<br/>
        🎯 <strong>Method:</strong> ${payment.payment_method.toUpperCase()}<br/>
        📝 <strong>Ref:</strong> ${payment.notes || 'No remarks'}
      </div>
    `;
  } else {
    logInfo.innerHTML = '';
  }

  openModal('payment-edit-modal');
}

async function savePaymentUpdate(event) {
  event.preventDefault();
  const status = document.getElementById('payment-status-select').value;
  const paymentMethod = document.getElementById('payment-method-select').value;
  const notes = document.getElementById('payment-notes-input').value.trim();

  try {
    const response = await fetch(`${API_BASE}/payments/${state.activePaymentToEdit.id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ status, paymentMethod, notes })
    });

    if (!response.ok) throw new Error('Failed to update payment');

    closeModal('payment-edit-modal');
    refreshActiveGroupData();
    renderNotificationLogs();
  } catch (error) {
    alert(error.message);
  }
}

// ================= USER DASHBOARD LOGIC =================

async function loadUserDashboard() {
  const { member } = state.userSession;

  try {
    const response = await fetch(`${API_BASE}/client/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: member.client_id, phone: member.phone })
    });
    if (response.ok) {
      const data = await response.json();
      state.userSession.memberships = data.memberships;
      localStorage.setItem('userSession', JSON.stringify(state.userSession));
    }
  } catch (err) {
    console.error('Failed to sync user memberships:', err);
  }

  const { memberships } = state.userSession;

  document.getElementById('user-profile-name').textContent = member.name;
  document.getElementById('user-profile-id').textContent = member.client_id;
  document.getElementById('user-profile-phone').textContent = member.phone;

  document.getElementById('user-stat-active-groups').textContent = memberships ? memberships.length : 0;

  // Populate support query group dropdown selector
  const queryGroupContainer = document.getElementById('query-group-select-container');
  if (queryGroupContainer && memberships && memberships.length > 0) {
    let selectHtml = `
      <label for="query-group-id-select">Select Chit Group:</label>
      <select id="query-group-id-select" class="form-control" required style="margin-top: 0.25rem;">
    `;
    memberships.forEach(m => {
      selectHtml += `<option value="${m.group.id}">${m.group.name}</option>`;
    });
    selectHtml += `</select>`;
    queryGroupContainer.innerHTML = selectHtml;
    queryGroupContainer.style.display = 'block';
  } else if (queryGroupContainer) {
    queryGroupContainer.style.display = 'none';
  }

  await refreshUserDashboardData();
}

function handleClientGroupSwitch(event) {
  // Not used in the multi-group dashboard, but left as stub for compatibility
}

async function refreshUserDashboardData() {
  const { memberships, member } = state.userSession;

  if (!memberships || memberships.length === 0) {
    document.getElementById('user-groups-grid').innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 3rem;">
        <span style="font-size: 2.5rem;">👥</span>
        <p style="margin-top: 0.5rem;">You are not registered in any chit groups.</p>
      </div>
    `;
    document.getElementById('user-stat-total-dues').textContent = '₹0';
    document.getElementById('user-bulk-pay-container').innerHTML = '';
    document.getElementById('user-payments-cards-container').innerHTML = '';
    document.getElementById('user-ledger-table-body').innerHTML = '';
    return;
  }

  try {
    // Fetch live details for all groups in parallel
    const promises = memberships.map(m => 
      fetch(`${API_BASE}/groups/${m.group.id}`).then(res => {
        if (!res.ok) throw new Error(`Failed to fetch details for group ${m.group.name}`);
        return res.json();
      })
    );

    const allGroupsData = await Promise.all(promises);

    let totalPendingVal = 0;
    let myAllPayments = [];
    let allAuctions = [];
    let winningGroupData = null;
    let currentWinnerAuction = null;

    // Aggregate payments, auctions, and check winner status for each group
    const groupsListHtml = allGroupsData.map(liveData => {
      const g = liveData.group;
      const auctions = liveData.auctions;

      // Find the specific membership for this group to get the correct member_id
      const currentMembership = memberships.find(m => m.group.id === g.id);
      const currentMemberId = currentMembership ? currentMembership.member.id : member.id;
      
      // Find my payments in this group
      const myGroupPayments = liveData.payments.filter(p => p.member_id === currentMemberId);
      myAllPayments.push(...myGroupPayments.map(p => ({ ...p, groupName: g.name })));

      // Sum unpaid dues for this group
      const unpaidGroupPayments = myGroupPayments.filter(p => p.status === 'unpaid');
      const groupDues = unpaidGroupPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
      totalPendingVal += groupDues;

      // Check if she was ever a winner in this group
      const isPastOrPresentWinner = auctions.some(a => a.winner_member_id === currentMemberId);

      // Check if they won the current month's auction OR the latest completed month's auction in this group
      const currentMonthAuction = auctions.find(a => a.month_number === g.current_month);
      const latestCompletedAuction = auctions.find(a => a.month_number === g.current_month - 1);
      
      const isCurrentMonthWinner = currentMonthAuction && currentMonthAuction.winner_member_id === currentMemberId;
      const isLatestCompletedWinner = latestCompletedAuction && latestCompletedAuction.winner_member_id === currentMemberId;

      if (isCurrentMonthWinner) {
        winningGroupData = g;
        currentWinnerAuction = currentMonthAuction;
      } else if (isLatestCompletedWinner) {
        winningGroupData = g;
        currentWinnerAuction = latestCompletedAuction;
      }

      // Add auctions to unified list (we'll display them in the ledger table)
      allAuctions.push(...auctions.map(a => ({ ...a, groupName: g.name, groupCreatedAt: g.created_at })));

      // Winner Badge styling
      const badgeClass = isPastOrPresentWinner ? 'badge-primary' : 'badge-danger';
      const badgeText = isPastOrPresentWinner ? 'Winner' : 'Not Won Yet';
      const badgeBg = isPastOrPresentWinner ? '#10B981' : '#EF4444';

      return `
        <div class="card" style="background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.05); padding: 1.25rem; border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <h4 style="font-family: Outfit; font-size: 1.1rem; color: white; margin: 0;">${g.name}</h4>
              <span class="badge ${badgeClass}" style="background-color: ${badgeBg}; color: white; border: none; padding: 0.25rem 0.6rem; font-size: 0.7rem;">${badgeText}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
              <span>📅 Started Date: <strong>${new Date(g.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</strong></span>
              <span>🔄 Month: <strong>Month ${g.current_month} / ${g.duration_months}</strong></span>
              <span>💵 Monthly Contribution: <strong>₹${Number(g.monthly_contribution).toLocaleString()}</strong></span>
              <span>📈 Total Value: <strong>₹${Number(g.total_value).toLocaleString()}</strong></span>
            </div>
          </div>
          ${isCurrentMonthWinner ? `
            <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: 8px; padding: 0.75rem; font-size: 0.8rem;">
              <span style="color: var(--primary); font-weight: 700; display: block; margin-bottom: 0.25rem;">🏆 Current Month Winner!</span>
              <span>Payout Amount: <strong>₹${Number(currentMonthAuction.net_amount_paid_to_winner).toLocaleString()}</strong></span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Update group grid
    document.getElementById('user-groups-grid').innerHTML = groupsListHtml;

    // Calculate if dues are covered by a winning payout (netPayout > 0)
    let isDuesCovered = false;
    if (winningGroupData && currentWinnerAuction) {
      const winnerAmount = Number(currentWinnerAuction.net_amount_paid_to_winner);
      const otherGroupsUnpaidPayments = myAllPayments.filter(p => p.status === 'unpaid' && p.group_id !== winningGroupData.id);
      const remainingGroupsPayingAmount = otherGroupsUnpaidPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
      const netPayout = winnerAmount - remainingGroupsPayingAmount;
      if (netPayout > 0) {
        isDuesCovered = true;
      }
    }

    // Render stats (show 2 decimal places to prevent rounding errors)
    document.getElementById('user-stat-total-dues').textContent = `₹${totalPendingVal.toFixed(2)}`;

    // Render Pay Total Dues button if there are any dues
    const unpaidPayments = myAllPayments.filter(p => p.status === 'unpaid');
    const bulkPayContainer = document.getElementById('user-bulk-pay-container');
    if (isDuesCovered) {
      bulkPayContainer.innerHTML = `
        <button class="btn btn-secondary" disabled style="padding: 0.6rem 1.25rem; font-family: Outfit; font-size: 0.9rem; background: rgba(16, 185, 129, 0.1); color: var(--primary); border-color: rgba(16, 185, 129, 0.2);">
          ✅ Covered by Payout
        </button>
      `;
    } else if (unpaidPayments.length > 0) {
      const unpaidIdsJson = JSON.stringify(unpaidPayments.map(p => p.id));
      bulkPayContainer.innerHTML = `
        <button class="btn btn-primary" onclick='payTotalDues(${unpaidIdsJson})' style="font-weight: 600; padding: 0.6rem 1.25rem; font-family: Outfit; font-size: 0.9rem;">
          💳 Pay Total Dues: ₹${totalPendingVal.toFixed(2)}
        </button>
      `;
    } else {
      bulkPayContainer.innerHTML = `
        <button class="btn btn-secondary" disabled style="padding: 0.6rem 1.25rem; font-family: Outfit; font-size: 0.9rem; background: rgba(255,255,255,0.05); color: var(--text-muted); border-color: transparent;">
          ✅ All Dues Paid
        </button>
      `;
    }

    // Check if she is the current month's winner in any group to show the Net Payout block
    const netPayoutContainer = document.getElementById('user-net-payout-container');
    if (winningGroupData && currentWinnerAuction) {
      const winnerAmount = Number(currentWinnerAuction.net_amount_paid_to_winner);
      
      // Calculate dues in OTHER groups (remaining groups paying amount)
      const otherGroupsUnpaidPayments = unpaidPayments.filter(p => p.group_id !== winningGroupData.id);
      const remainingGroupsPayingAmount = otherGroupsUnpaidPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
      const netPayout = winnerAmount - remainingGroupsPayingAmount;

      netPayoutContainer.classList.remove('d-none');
      
      if (netPayout > 0) {
        netPayoutContainer.innerHTML = `
          <div class="card" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.02)); border-color: rgba(16, 185, 129, 0.25); display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem; border-radius: 12px; margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.35rem;">🎉</span>
              <strong style="font-family: Outfit; font-size: 1.2rem; color: white;">Congratulations! You won the Month ${currentWinnerAuction.month_number} auction in ${winningGroupData.name}</strong>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-wrap: wrap; gap: 1.5rem; margin-top: 0.15rem;">
              <span>🏆 Gross Payout: <strong style="color: white;">₹${winnerAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>
              <span>⏳ Other Groups Dues: <strong style="color: var(--danger);">₹${remainingGroupsPayingAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>
            </div>
            <div style="background: rgba(16, 185, 129, 0.12); border-radius: 8px; padding: 0.85rem; margin-top: 0.35rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
              <div>
                <span style="font-size: 0.78rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 0.15rem;">Net Receivable Amount</span>
                <strong style="font-size: 1.45rem; color: var(--primary); font-family: Outfit;">You get this amount: ₹${netPayout.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
              </div>
              <span style="font-size: 0.75rem; color: var(--text-muted); max-width: 320px; text-align: right;">This amount is calculated as your winner payout minus unpaid installment dues in your other registered chit groups.</span>
            </div>
          </div>
        `;
      } else {
        netPayoutContainer.innerHTML = `
          <div class="card" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.02)); border-color: rgba(239, 68, 68, 0.25); display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem; border-radius: 12px; margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.35rem;">⚠️</span>
              <strong style="font-family: Outfit; font-size: 1.2rem; color: white;">Auction Winner Status (Month ${currentWinnerAuction.month_number})</strong>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-wrap: wrap; gap: 1.5rem; margin-top: 0.15rem;">
              <span>🏆 Gross Payout: <strong style="color: white;">₹${winnerAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>
              <span>⏳ Other Groups Dues: <strong style="color: var(--danger);">₹${remainingGroupsPayingAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>
            </div>
            <div style="background: rgba(239, 68, 68, 0.12); border-radius: 8px; padding: 0.85rem; margin-top: 0.35rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
              <div>
                <span style="font-size: 0.78rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 0.15rem;">Net Payable Amount</span>
                <strong style="font-size: 1.45rem; color: var(--danger); font-family: Outfit;">You pay this amount: ₹${Math.abs(netPayout).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
              </div>
              <span style="font-size: 0.75rem; color: var(--text-muted); max-width: 320px; text-align: right;">This amount is calculated as your unpaid installment dues in other registered groups minus your winner payout.</span>
            </div>
          </div>
        `;
      }
    } else {
      netPayoutContainer.classList.add('d-none');
    }

    state.activeUserPayments = myAllPayments;

    // Render User Payments list (bills across all groups)
    renderUserPaymentsList(myAllPayments, isDuesCovered);
    
    // Render Unified Ledger history (auctions across all groups)
    renderUserLedgerTable(allAuctions);

    refreshUserQueries();
  } catch (error) {
    console.error('Error refreshing user dashboard:', error);
  }
}

function renderUserPaymentsList(myPayments, isDuesCovered) {
  const container = document.getElementById('user-payments-cards-container');
  
  if (myPayments.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); padding: 2rem;">
        <span style="font-size: 2rem;">💳</span>
        <p style="margin-top: 0.5rem;">No bills generated yet. Installments are created when the monthly auction holds.</p>
      </div>
    `;
    return;
  }

  // Sort: unpaid/due first, then by month number descending
  const sortedPayments = [...myPayments].sort((a, b) => {
    if (a.status === 'unpaid' && b.status === 'paid') return -1;
    if (a.status === 'paid' && b.status === 'unpaid') return 1;
    return b.month_number - a.month_number;
  });

  container.innerHTML = sortedPayments.map(p => {
    const isPaid = p.status === 'paid';
    const cardBg = isPaid ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)';
    const cardBorder = isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    const badge = isPaid ? 
      `<span class="badge badge-primary" style="background-color: rgba(16,185,129,0.2); color: var(--primary);">Paid</span>` : 
      `<span class="badge badge-danger" style="background-color: rgba(239,68,68,0.2); color: var(--danger);">Unpaid</span>`;
    
    const actionButton = isPaid ? `
      <button class="btn btn-secondary btn-sm" onclick="printReceipt('${p.id}')">
        🖨️ Receipt
      </button>
    ` : (isDuesCovered ? `
      <span style="font-size: 0.8rem; color: var(--primary); font-weight: 600; padding: 0.25rem 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: 4px;">
        Covered by Payout
      </span>
    ` : `
      <button class="btn btn-primary btn-sm" onclick="payWithRazorpay('${p.id}')">
        💳 Pay Now Online
      </button>
    `);

    return `
      <div style="
        background: ${cardBg};
        border: 1px solid ${cardBorder};
        border-radius: 12px;
        padding: 1rem 1.25rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
      ">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <strong style="font-size: 1.05rem; font-family: Outfit; color: white;">${p.groupName}</strong>
            <span style="font-size: 0.85rem; color: var(--text-secondary); font-family: Outfit;">(Month ${p.month_number})</span>
            ${badge}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
            Amount: <strong style="color: white; font-size: 0.95rem;">₹${Number(p.amount_paid).toFixed(2)}</strong>
            ${isPaid && p.payment_method ? ` | Paid via: ${p.payment_method.toUpperCase()}` : ''}
          </div>
          ${p.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Note: ${p.notes}</div>` : ''}
        </div>
        <div>
          ${actionButton}
        </div>
      </div>
    `;
  }).join('');
}

function renderUserLedgerTable(auctions) {
  const container = document.getElementById('user-ledger-table-body');
  
  if (auctions.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" class="text-center" style="color: var(--text-secondary); padding: 2rem;">
          No auctions held yet. Ledger will show history once auctions start.
        </td>
      </tr>
    `;
    return;
  }

  // Sort auctions by date descending
  const sortedAuctions = [...auctions].sort((a, b) => new Date(b.auction_date) - new Date(a.auction_date));

  container.innerHTML = sortedAuctions.map(a => `
    <tr>
      <td>
        <strong style="color: white; display: block; font-size: 0.85rem;">${a.groupName}</strong>
        <span style="font-size: 0.75rem; color: var(--text-secondary);">Month ${a.month_number} (${getMonthYearLabel(a.groupCreatedAt, a.month_number)})</span>
      </td>
      <td><span style="font-size: 0.85rem;">${a.winner_name}</span></td>
      <td><span style="font-size: 0.85rem;">₹${Number(a.dividend_per_member).toLocaleString(undefined, {maximumFractionDigits: 0})}</span></td>
      <td style="font-weight:600; color: white;"><span style="font-size: 0.85rem;">₹${Number(a.net_payable_per_member).toLocaleString(undefined, {maximumFractionDigits: 0})}</span></td>
    </tr>
  `).join('');
}

// REAL RAZORPAY FRONTEND TRIGGER
async function payWithRazorpay(paymentId) {
  try {
    // 1. Create order on the backend
    const response = await fetch(`${API_BASE}/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to initialize payment order');

    // 2. Configure Razorpay options
    const options = {
      key: data.keyId,
      amount: data.amount,
      currency: data.currency,
      name: "ChitLite Portal",
      description: "Monthly Chit Fund Subscription Due",
      order_id: data.orderId,
      config: {
        display: {
          blocks: {
            upi: {
              name: 'Pay using UPI',
              instruments: [
                {
                  method: 'upi'
                }
              ]
            }
          },
          sequence: ['block.upi', 'block.other']
        }
      },
      handler: async function (paymentSuccessResponse) {
        // Payment success callback from Razorpay
        try {
          const verifyRes = await fetch(`${API_BASE}/payments/verify-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentId: data.paymentId,
              razorpay_order_id: paymentSuccessResponse.razorpay_order_id,
              razorpay_payment_id: paymentSuccessResponse.razorpay_payment_id,
              razorpay_signature: paymentSuccessResponse.razorpay_signature
            })
          });

          const verifyData = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(verifyData.error || 'Signature verification failed');

          alert('Payment Successful & Receipt Generated!');
          refreshUserDashboardData();
        } catch (err) {
          alert('Failed to verify payment signature: ' + err.message);
        }
      },
      prefill: {
        name: state.userSession.member.name,
        email: state.userSession.member.email || "",
        contact: state.userSession.member.phone
      },
      notes: {
        address: "Chit Fund Office"
      },
      theme: {
        color: "#10b981" // Emerald theme matching UI
      }
    };

    // 3. Open Razorpay checkout frame
    const rzp = new Razorpay(options);
    rzp.open();
  } catch (error) {
    alert('Failed to initiate gateway transaction: ' + error.message);
  }
}

// Generate printable payment receipt in new window
async function printReceipt(paymentId) {
  try {
    const payment = state.activeUserPayments.find(p => p.id === paymentId);
    if (!payment) return;

    const groupResponse = await fetch(`${API_BASE}/groups/${payment.group_id}`);
    const liveData = await groupResponse.json();

    const printWindow = window.open('', '_blank', 'width=600,height=500');
    const dateStr = payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() + ' ' + new Date(payment.paid_at).toLocaleTimeString() : 'N/A';

    printWindow.document.write(`
      <html>
        <head>
          <title>Payment Receipt</title>
          <style>
            body { font-family: sans-serif; padding: 30px; color: #333; }
            .receipt-box { border: 1px solid #ddd; padding: 25px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
            .header h2 { margin: 0; color: #10b981; }
            .header p { margin: 5px 0 0 0; font-size: 14px; color: #666; }
            .row { display: flex; justify-content: space-between; margin: 10px 0; font-size: 15px; }
            .label { color: #666; font-weight: 500; }
            .value { font-weight: bold; }
            .total { font-size: 18px; border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px; }
            .total .value { color: #10b981; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; }
            button { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 5px; font-weight: bold; cursor: pointer; display: block; margin: 20px auto 0 auto; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="receipt-box">
            <div class="header">
              <h2>CHIT FUND RECEIPT</h2>
              <p>Thank You For Your Payment</p>
            </div>
            <div class="row">
              <span class="label">Group Name:</span>
              <span class="value">${liveData.group.name}</span>
            </div>
            <div class="row">
              <span class="label">Group ID:</span>
              <span class="value">${liveData.group.id}</span>
            </div>
            <div class="row">
              <span class="label">Member Name:</span>
              <span class="value">${payment.member_name}</span>
            </div>
            <div class="row">
              <span class="label">Month Paid:</span>
              <span class="value">Month ${payment.month_number}</span>
            </div>
            <div class="row">
              <span class="label">Payment Date:</span>
              <span class="value">${dateStr}</span>
            </div>
            <div class="row">
              <span class="label">Payment Method:</span>
              <span class="value">${payment.payment_method.toUpperCase()}</span>
            </div>
            <div class="row">
              <span class="label">Reference details:</span>
              <span class="value">${payment.notes || 'Direct Clearance'}</span>
            </div>
            <div class="row total">
              <span class="label">Amount Paid:</span>
              <span class="value">₹${Number(payment.amount_paid).toLocaleString()}</span>
            </div>
            <div class="footer">
              This is a computer-generated transaction receipt.
            </div>
            <button onclick="window.print()">Print Receipt</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  } catch (error) {
    alert('Error generating print view.');
  }
}

// REAL RAZORPAY FRONTEND TRIGGER FOR BULK PAYMENT
async function payTotalDues(paymentIds) {
  try {
    // 1. Create bulk order on the backend
    const response = await fetch(`${API_BASE}/payments/create-bulk-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIds })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to initialize bulk payment order');

    // 2. Configure Razorpay options
    const options = {
      key: data.keyId,
      amount: data.amount,
      currency: data.currency,
      name: "ChitLite Portal",
      description: "Pay Total Chit Dues (Bulk)",
      order_id: data.orderId,
      config: {
        display: {
          blocks: {
            upi: {
              name: 'Pay using UPI',
              instruments: [
                {
                  method: 'upi'
                }
              ]
            }
          },
          sequence: ['block.upi', 'block.other']
        }
      },
      handler: async function (paymentSuccessResponse) {
        try {
          const verifyRes = await fetch(`${API_BASE}/payments/verify-bulk-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentIds: data.paymentIds,
              razorpay_order_id: paymentSuccessResponse.razorpay_order_id,
              razorpay_payment_id: paymentSuccessResponse.razorpay_payment_id,
              razorpay_signature: paymentSuccessResponse.razorpay_signature
            })
          });

          const verifyData = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(verifyData.error || 'Bulk signature verification failed');

          alert('Bulk Payment Successful & Receipts Generated!');
          refreshUserDashboardData();
        } catch (err) {
          alert('Failed to verify bulk payment signature: ' + err.message);
        }
      },
      prefill: {
        name: state.userSession.member.name,
        email: state.userSession.member.email || "",
        contact: state.userSession.member.phone
      },
      notes: {
        address: "Chit Fund Office"
      },
      theme: {
        color: "#10b981"
      }
    };

    // 3. Open Razorpay checkout frame
    const rzp = new Razorpay(options);
    rzp.open();
  } catch (error) {
    alert('Failed to initiate bulk gateway transaction: ' + error.message);
  }
}

// ================= MODAL & UI ACTION HELPERS =================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    modal.querySelector('.modal-content').style.transform = 'translateY(0)';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
    modal.querySelector('.modal-content').style.transform = 'translateY(20px)';
    modal.classList.remove('active');
  }
}

// Toggle Auth cards inside Hero section
function toggleAuthCard(mode) {
  const ownerCard = document.getElementById('card-owner-auth');
  const userCard = document.getElementById('card-user-auth');
  const ownerTab = document.getElementById('tab-owner');
  const userTab = document.getElementById('tab-user');

  if (mode === 'owner') {
    ownerCard.classList.remove('d-none');
    userCard.classList.add('d-none');
    ownerTab.classList.add('active');
    userTab.classList.remove('active');
  } else {
    ownerCard.classList.add('d-none');
    userCard.classList.remove('d-none');
    ownerTab.classList.remove('active');
    userTab.classList.add('active');
  }
}

// Owner Register / Login toggler
function toggleOwnerAuthSubView(subView) {
  const loginView = document.getElementById('owner-login-view');
  const registerView = document.getElementById('owner-register-view');
  
  // Clear any existing errors
  document.getElementById('owner-login-error').style.display = 'none';
  document.getElementById('owner-register-error').style.display = 'none';

  if (subView === 'register') {
    loginView.classList.add('d-none');
    registerView.classList.remove('d-none');
  } else {
    loginView.classList.remove('d-none');
    registerView.classList.add('d-none');
  }
}

// Handle Owner Registration
async function handleOwnerRegister(event) {
  event.preventDefault();
  const form = event.target;
  const fullName = form.fullName.value.trim();
  const username = form.username.value.trim();
  const password = form.password.value;
  const errorEl = document.getElementById('owner-register-error');

  errorEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/owner/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, username, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    state.ownerSession = data;
    localStorage.setItem('ownerSession', JSON.stringify(data));
    form.reset();
    setView('owner-dashboard');
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
}

// CSV drag and drop click trigger
function triggerCsvSelect() {
  document.getElementById('csv-file-input').click();
}

// Check auth status when page has finished rendering
window.addEventListener('DOMContentLoaded', () => {
  // Bind simple toggle events
  document.getElementById('tab-owner').addEventListener('click', () => toggleAuthCard('owner'));
  document.getElementById('tab-user').addEventListener('click', () => toggleAuthCard('user'));
  
  checkAuth();
});

// ================= MEMBER PROFILE MANAGEMENT (OWNER) =================

function openEditMemberModal(memberId) {
  const member = state.activeGroupData.members.find(m => m.id === memberId);
  if (!member) return;

  document.getElementById('edit-member-id').value = member.id;
  document.getElementById('edit-member-name').value = member.name;
  document.getElementById('edit-member-phone').value = member.phone;
  document.getElementById('edit-member-email').value = member.email || '';
  document.getElementById('edit-member-language').value = member.language || 'english';

  openModal('edit-member-modal');
}

async function saveMemberUpdate(event) {
  event.preventDefault();
  const form = event.target;
  const memberId = form.id.value;
  const payload = {
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    language: form.language.value
  };

  try {
    const response = await fetch(`${API_BASE}/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update member');

    closeModal('edit-member-modal');
    refreshActiveGroupData();
  } catch (error) {
    alert(error.message);
  }
}

// ================= SUPPORT QUERY PORTAL HANDLERS =================

// Fetch member queries (Client Dashboard)
async function refreshUserQueries() {
  const { memberships } = state.userSession;
  if (!memberships || memberships.length === 0) return;
  try {
    const promises = memberships.map(m =>
      fetch(`${API_BASE}/members/${m.member.id}/queries`).then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
    );
    const allQueriesResults = await Promise.all(promises);
    const allQueries = allQueriesResults.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderClientQueriesList(allQueries);
  } catch (err) {
    console.error('Error fetching member queries:', err);
  }
}

function renderClientQueriesList(queries) {
  const container = document.getElementById('client-queries-list-container');
  if (queries.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 1rem; font-size: 0.8rem;">No questions submitted yet.</div>`;
    return;
  }
  const { memberships } = state.userSession;
  container.innerHTML = queries.map(q => {
    const dateStr = new Date(q.created_at).toLocaleDateString() + ' ' + new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isResolved = q.status === 'resolved';
    const badgeClass = isResolved ? 'badge-primary' : 'badge-accent';
    const statusText = isResolved ? 'Replied' : 'Pending';
    
    const matchedM = memberships.find(m => m.group.id === q.group_id);
    const groupName = matchedM ? matchedM.group.name : 'Unknown Group';

    return `
      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 8px; font-size: 0.8rem; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <span class="badge ${badgeClass}" style="font-size: 0.65rem; padding: 0.15rem 0.35rem; font-family: Outfit;">${statusText}</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">${dateStr}</span>
        </div>
        <div style="font-size: 0.72rem; color: var(--primary); margin-bottom: 0.3rem; font-weight: 500;">Group: ${groupName}</div>
        <div><strong>Q:</strong> ${q.message}</div>
        ${q.reply ? `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.05); color: var(--primary);"><strong>Reply:</strong> ${q.reply}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Client query form submit
async function submitClientQuery(event) {
  event.preventDefault();
  const form = event.target;
  const { memberships } = state.userSession;
  
  const selectEl = document.getElementById('query-group-id-select');
  const selectedGroupId = selectEl ? selectEl.value : (memberships[0] ? memberships[0].group.id : null);
  
  if (!selectedGroupId) {
    alert('No active group found to submit inquiry.');
    return;
  }
  
  const matchedMembership = memberships.find(m => m.group.id === selectedGroupId);
  const memberId = matchedMembership ? matchedMembership.member.id : null;

  const payload = {
    groupId: selectedGroupId,
    memberId: memberId,
    message: form.message.value.trim()
  };
  try {
    const response = await fetch(`${API_BASE}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to submit inquiry');
    form.reset();
    refreshUserQueries();
  } catch (error) {
    alert(error.message);
  }
}

// Fetch group queries (Owner Dashboard)
async function refreshGroupQueries() {
  if (!state.selectedGroupId) return;
  try {
    const response = await fetch(`${API_BASE}/groups/${state.selectedGroupId}/queries`, {
      headers: getAuthHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch group queries');
    const queries = await response.json();
    renderOwnerQueriesList(queries);
  } catch (err) {
    console.error('Error fetching group queries:', err);
  }
}

function renderOwnerQueriesList(queries) {
  const container = document.getElementById('owner-queries-container');
  if (queries.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 1.5rem; font-size: 0.85rem;">No client inquiries found for this group.</div>`;
    return;
  }
  container.innerHTML = queries.map(q => {
    const dateStr = new Date(q.created_at).toLocaleDateString() + ' ' + new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isResolved = q.status === 'resolved';
    return `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); padding: 1rem; border-radius: 8px; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary);">
          <span>👤 Member: <strong>${q.member_name}</strong></span>
          <span>${dateStr}</span>
        </div>
        <div style="color: white;"><strong>Message:</strong> ${q.message}</div>
        ${isResolved ? `
          <div style="padding: 0.5rem; background: rgba(16, 185, 129, 0.04); border-radius: 4px; color: var(--primary); font-size: 0.8rem;">
            <strong>Admin Reply:</strong> ${q.reply}
          </div>
        ` : `
          <form onsubmit="submitOwnerReply(event, '${q.id}')" style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <input type="text" name="replyText" class="form-control form-control-sm" placeholder="Type reply here..." required style="flex-grow: 1;">
            <button type="submit" class="btn btn-primary btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.85rem;">Reply</button>
          </form>
        `}
      </div>
    `;
  }).join('');
}

// Owner query reply submit
async function submitOwnerReply(event, queryId) {
  event.preventDefault();
  const form = event.target;
  const reply = form.replyText.value.trim();
  try {
    const response = await fetch(`${API_BASE}/queries/${queryId}/reply`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ reply })
    });
    if (!response.ok) throw new Error('Failed to send reply');
    refreshGroupQueries();
  } catch (error) {
    alert(error.message);
  }
}
