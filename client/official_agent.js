const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const state = {
  token: localStorage.getItem('officialAgentToken') || null,
  agent: null,
};

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : null });
  return res.json();
}

async function login() {
  const username = $('#loginUsername').value.trim();
  const password = $('#loginPassword').value.trim();
  const errorEl = $('#loginError');
  errorEl.textContent = '';
  const result = await api('/api/official-agent/login', 'POST', { username, password });
  if (!result.ok) {
    errorEl.textContent = result.error || 'فشل تسجيل الدخول';
    return;
  }
  state.token = result.token;
  state.agent = result.officialAgent;
  localStorage.setItem('officialAgentToken', result.token);
  showPanel();
  await loadAll();
}

function showPanel() {
  $('#loginScreen').classList.add('hidden');
  $('#panel').classList.remove('hidden');
  $('#agentMeta').textContent = `${state.agent?.name || ''} — ${state.agent?.wallet_name || ''}`;
}

function logout() {
  localStorage.removeItem('officialAgentToken');
  state.token = null;
  state.agent = null;
  location.reload();
}

async function bootstrap() {
  if (!state.token) return;
  const me = await api('/api/official-agent/me');
  if (!me.ok) {
    logout();
    return;
  }
  state.agent = me.officialAgent;
  showPanel();
  await loadAll();
}

async function loadAll() {
  await Promise.all([
    loadDashboard(),
    loadUsers(),
    loadWallet(),
    loadTodayTimes(),
    loadOpenTrades(),
    loadClosedTrades(),
    loadProfits(),
    loadReports(),
    loadAgentKyc(),
  ]);
}

async function loadDashboard() {
  const r = await api('/api/official-agent/dashboard');
  if (!r.ok) return;
  const { wallet, stats } = r.data;
  $('#dashboardCards').innerHTML = `
    <div class="stat-card glass"><div>رصيد المحفظة</div><div class="stat-value">$${Number(wallet.balance).toFixed(2)}</div></div>
    <div class="stat-card glass"><div>المشحون</div><div class="stat-value">$${Number(wallet.total_allocated).toFixed(2)}</div></div>
    <div class="stat-card glass"><div>الموزع</div><div class="stat-value">$${Number(wallet.total_sent).toFixed(2)}</div></div>
    <div class="stat-card glass"><div>جميع الأشخاص</div><div class="stat-value">${stats.total_users}</div></div>
    <div class="stat-card glass"><div>الدعوات</div><div class="stat-value">${stats.total_referrals}</div></div>
    <div class="stat-card glass"><div>الصفقات المفتوحة</div><div class="stat-value">${stats.open_trades}</div></div>
    <div class="stat-card glass"><div>الصفقات المغلقة</div><div class="stat-value">${stats.closed_trades}</div></div>
    <div class="stat-card glass"><div>إجمالي الأرباح</div><div class="stat-value">$${Number(stats.total_profit).toFixed(2)}</div></div>
  `;
}

async function loadUsers() {
  const r = await api('/api/official-agent/users');
  if (!r.ok) return;
  $('#usersTable').innerHTML = `
    <div class="table-row header" style="grid-template-columns:80px 1fr 130px 120px 140px 220px;">
      <div>ID</div><div>الاسم</div><div>الرصيد</div><div>الدعوات</div><div>الصفقات المفتوحة</div><div>إجراءات</div>
    </div>
    ${(r.users || []).map(user => `
      <div class="table-row" style="grid-template-columns:80px 1fr 130px 120px 140px 220px;">
        <div>${user.id}</div>
        <div>${user.name || '-'}<br><small>${user.tg_id || '-'}</small></div>
        <div>$${Number(user.balance || 0).toFixed(2)}</div>
        <div>${user.referral_count || 0}</div>
        <div>${user.open_trades_count || 0}</div>
        <div class="table-actions">
          <button class="mini-btn" onclick="transferToUser(${user.id})">💵 شحن</button>
          <button class="mini-btn" onclick="prefillReport(${user.id})">🚨 بلاغ</button>
        </div>
      </div>
    `).join('')}
  `;
}

window.transferToUser = async (userId) => {
  const amount = Number(prompt('أدخل المبلغ بالدولار:'));
  if (!amount) return toast('❌ المبلغ غير صحيح');
  const note = prompt('ملاحظة العملية:', 'Official agent transfer') || 'Official agent transfer';
  const r = await api('/api/official-agent/transfers', 'POST', { user_id: userId, amount, note });
  if (r.ok) {
    toast('✅ تم الشحن بنجاح');
    loadAll();
  } else {
    toast('❌ ' + (r.error || 'خطأ'));
  }
};

window.prefillReport = (userId) => {
  $('#reportUserId').value = userId;
  document.querySelector('[data-tab="reports"]').click();
};

async function loadWallet() {
  const r = await api('/api/official-agent/wallet');
  if (!r.ok) return;
  const wallet = r.wallet || {};
  $('#walletSummary').innerHTML = `
    <div class="cards">
      <div class="stat-card glass"><div>الرصيد الحالي</div><div class="stat-value">$${Number(wallet.balance || 0).toFixed(2)}</div></div>
      <div class="stat-card glass"><div>إجمالي ما تم شحنه</div><div class="stat-value">$${Number(wallet.total_allocated || 0).toFixed(2)}</div></div>
      <div class="stat-card glass"><div>إجمالي ما تم توزيعه</div><div class="stat-value">$${Number(wallet.total_sent || 0).toFixed(2)}</div></div>
    </div>
  `;
  $('#walletTransactions').innerHTML = `
    <div class="table-row header" style="grid-template-columns:120px 100px 120px 120px 1fr;">
      <div>النوع</div><div>المبلغ</div><div>قبل</div><div>بعد</div><div>ملاحظة</div>
    </div>
    ${(r.transactions || []).map(t => `
      <div class="table-row" style="grid-template-columns:120px 100px 120px 120px 1fr;">
        <div>${t.type}</div>
        <div>$${Number(t.amount || 0).toFixed(2)}</div>
        <div>$${Number(t.balance_before || 0).toFixed(2)}</div>
        <div>$${Number(t.balance_after || 0).toFixed(2)}</div>
        <div>${t.note || '-'}</div>
      </div>
    `).join('')}
  `;
}

async function loadTodayTimes() {
  const r = await api('/api/official-agent/trades/today-times');
  if (!r.ok) return;
  $('#todayTimes').innerHTML = `
    <div class="table-row header" style="grid-template-columns:120px 1fr 120px;">
      <div>النوع</div><div>الرمز</div><div>الوقت</div>
    </div>
    ${(r.times || []).map(t => `
      <div class="table-row" style="grid-template-columns:120px 1fr 120px;">
        <div>${t.type}</div><div>${t.symbol}</div><div>${t.time}</div>
      </div>
    `).join('')}
  `;
}

async function loadOpenTrades() {
  const r = await api('/api/official-agent/trades/open');
  if (!r.ok) return;
  $('#openTradesTable').innerHTML = renderTradesTable(r.trades || [], false);
}

async function loadClosedTrades() {
  const r = await api('/api/official-agent/trades/closed');
  if (!r.ok) return;
  $('#closedTradesTable').innerHTML = renderTradesTable(r.trades || [], true);
}

function renderTradesTable(trades, closed) {
  return `
    <div class="table-row header" style="grid-template-columns:90px 1fr 120px 120px 120px ${closed ? '120px' : ''};">
      <div>النوع</div><div>المستخدم</div><div>الرمز</div><div>الاتجاه</div><div>الربح</div>${closed ? '<div>الإغلاق</div>' : ''}
    </div>
    ${trades.map(t => `
      <div class="table-row" style="grid-template-columns:90px 1fr 120px 120px 120px ${closed ? '120px' : ''};">
        <div>${t.trade_type || 'history'}</div>
        <div>${t.user_name || '-'}<br><small>${t.tg_id || '-'}</small></div>
        <div>${t.symbol}</div>
        <div>${t.direction}</div>
        <div style="color:${Number(t.pnl || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">$${Number(t.pnl || 0).toFixed(2)}</div>
        ${closed ? `<div>${t.closed_at ? new Date(t.closed_at).toLocaleString('ar') : '-'}</div>` : ''}
      </div>
    `).join('')}`;
}

async function loadProfits() {
  const r = await api('/api/official-agent/trades/profits');
  if (!r.ok) return;
  $('#profitsTable').innerHTML = `
    <div class="card glass" style="margin-bottom:12px;">
      <strong>إجمالي الأرباح:</strong> $${Number(r.summary?.total_profit || 0).toFixed(2)}
      <br><strong>عدد الصفقات:</strong> ${Number(r.summary?.total_trades || 0)}
    </div>
    <div class="table-row header" style="grid-template-columns:80px 1fr 120px 120px;">
      <div>ID</div><div>المستخدم</div><div>الربح</div><div>عدد الصفقات</div>
    </div>
    ${(r.users || []).map(user => `
      <div class="table-row" style="grid-template-columns:80px 1fr 120px 120px;">
        <div>${user.id}</div>
        <div>${user.name || '-'}<br><small>${user.tg_id || '-'}</small></div>
        <div style="color:${Number(user.profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">$${Number(user.profit || 0).toFixed(2)}</div>
        <div>${user.trades_count || 0}</div>
      </div>
    `).join('')}
  `;
}

async function loadReports() {
  const r = await api('/api/official-agent/reports');
  if (!r.ok) return;
  $('#reportsTable').innerHTML = `
    <div class="table-row header" style="grid-template-columns:80px 1fr 120px 140px;">
      <div>ID</div><div>المستخدم</div><div>الحالة</div><div>التاريخ</div>
    </div>
    ${(r.reports || []).map(report => `
      <div class="table-row" style="grid-template-columns:80px 1fr 120px 140px;">
        <div>${report.id}</div>
        <div>${report.reported_user_name || '-'}<br><small>${report.reported_user_tg_id || '-'}</small><br><small>${report.reason}</small></div>
        <div>${report.status}</div>
        <div>${new Date(report.created_at).toLocaleString('ar')}</div>
      </div>
    `).join('')}
  `;
}

async function submitReport() {
  const reported_user_id = Number($('#reportUserId').value);
  const reason = $('#reportReason').value.trim();
  if (!reported_user_id || !reason) return toast('❌ أكمل بيانات البلاغ');
  const r = await api('/api/official-agent/reports', 'POST', { reported_user_id, reason });
  if (r.ok) {
    toast('✅ تم إرسال البلاغ');
    $('#reportUserId').value = '';
    $('#reportReason').value = '';
    loadReports();
  } else {
    toast('❌ ' + (r.error || 'خطأ'));
  }
}

$('#loginBtn').addEventListener('click', login);
$('#logoutBtn').addEventListener('click', logout);
$('#submitReportBtn').addEventListener('click', submitReport);

async function loadAgentKyc(statusFilter = '') {
  const url = statusFilter ? `/api/official-agent/kyc?status=${statusFilter}` : '/api/official-agent/kyc';
  const r = await api(url);
  const table = $('#agentKycTable');
  if (!table) return;
  if (!r.ok) { table.innerHTML = '<div style="color:#f85149;">خطأ في تحميل البيانات</div>'; return; }
  const requests = r.requests || [];
  const badge = (s) => {
    const m = { pending: ['قيد المراجعة', '#e3b341'], approved: ['مقبول', '#3fb950'], rejected: ['مرفوض', '#f85149'] };
    const [l, c] = m[s] || [s, '#8b949e'];
    return `<span style="color:${c};font-weight:600;">${l}</span>`;
  };
  table.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      <button class="mini-btn ${!statusFilter?'active':''}" onclick="loadAgentKyc('')">الكل</button>
      <button class="mini-btn ${statusFilter==='pending'?'active':''}" onclick="loadAgentKyc('pending')">قيد المراجعة</button>
      <button class="mini-btn ${statusFilter==='approved'?'active':''}" onclick="loadAgentKyc('approved')">مقبول</button>
      <button class="mini-btn ${statusFilter==='rejected'?'active':''}" onclick="loadAgentKyc('rejected')">مرفوض</button>
    </div>
    <div class="table-row header" style="grid-template-columns: 50px 1fr 120px 120px 100px;">
      <div>#</div><div>المستخدم</div><div>الدولة</div><div>الوثيقة</div><div>الحالة</div>
    </div>
    ${requests.length === 0 ? '<div class="table-row"><div style="grid-column:1/-1;text-align:center;color:#8b949e;">لا توجد طلبات</div></div>' : requests.map(item => `
      <div class="table-row" style="grid-template-columns: 50px 1fr 120px 120px 100px;">
        <div>${item.id}</div>
        <div><strong>${item.user_name || '-'}</strong><br><small>${item.first_name || '-'} ${item.last_name || ''}</small><br><small style="color:#8b949e">${item.tg_id}</small></div>
        <div>${item.country_name || '-'}</div>
        <div>${item.document_type === 'driving_license' ? 'رخصة' : 'هوية'}</div>
        <div>${badge(item.status)}</div>
      </div>`).join('')}`;
}
window.loadAgentKyc = loadAgentKyc;

$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(item => item.classList.remove('active'));
    $$('.tab-content').forEach(item => item.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

bootstrap();
