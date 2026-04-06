/* =====================================================
   EcoWaste Management System – Main App JS
   ===================================================== */

const API = window.ECOWASTE_API_BASE_URL || '/api';
let currentUser = null;
let currentView = 'dashboard';
let notifInterval = null;
const API_CONNECTION_ERROR =
  'Could not connect to the server. Please wait a few seconds for the Render backend to wake up and try again.';
let apiWarmupPromise = null;

// ==================== INIT ====================
window.addEventListener('load', () => {
  warmBackendConnection();
  setTimeout(() => {
    document.getElementById('page-loader').classList.add('hidden');
    initRevealAnimations();
  }, 1200);

  const token = localStorage.getItem('token');
  if (token) {
    verifyAndLoadApp(token);
  }
});

function warmBackendConnection() {
  if (apiWarmupPromise) return apiWarmupPromise;
  const isRemoteRenderApi = typeof API === 'string' && API.includes('onrender.com');
  if (!isRemoteRenderApi) return Promise.resolve();

  apiWarmupPromise = fetch(API + '/health', { method: 'GET' }).catch(() => null);
  return apiWarmupPromise;
}

// ==================== API HELPER ====================
async function api(method, path, body = null) {
  if (path === '/auth/login' || path === '/auth/register' || path === '/auth/me') {
    await warmBackendConnection();
  }

  const isAuthPath = path === '/auth/login' || path === '/auth/register' || path === '/auth/me';
  const timeoutMs = isAuthPath ? 25000 : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const token = localStorage.getItem('token');
  const opts = {
    method,
    signal: controller.signal,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + path, opts);
    const contentType = res.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = {
        success: false,
        message: res.ok ? 'Unexpected response from server.' : `Request failed with status ${res.status}.`,
        raw: text
      };
    }

    if (!res.ok && !data.message) {
      data.message = `Request failed with status ${res.status}.`;
    }

    if ((res.status === 401 || res.status === 403) && path !== '/auth/login') {
      logout();
      return { success: false, message: data.message || 'Your session has expired.' };
    }

    return data;
  } catch (error) {
    console.error(`API request failed for ${path}:`, error);
    if (error.name === 'AbortError') {
      return {
        success: false,
        message: 'The server took too long to respond. If Render is waking up, wait a few seconds and try again.'
      };
    }
    return { success: false, message: API_CONNECTION_ERROR };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==================== AUTH ====================
async function verifyAndLoadApp(token) {
  const data = await api('GET', '/auth/me');
  if (data.success) {
    currentUser = data.user;
    showApp();
  } else {
    localStorage.removeItem('token');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...'; btn.disabled = true;
  let data;
  try {
    data = await api('POST', '/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value
    });
  } finally {
    btn.textContent = 'Sign In 🌿';
    btn.disabled = false;
  }

  if (data.success) {
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    closeModal('login-modal');
    showApp();
    showToast('success', 'Welcome back!', `Hello ${data.user.name} 👋`);
  } else {
    showToast('error', 'Login Failed', data.message || API_CONNECTION_ERROR);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  btn.textContent = 'Creating...'; btn.disabled = true;
  let data;
  try {
    data = await api('POST', '/auth/register', {
      name: document.getElementById('reg-name').value,
      email: document.getElementById('reg-email').value,
      phone: document.getElementById('reg-phone').value,
      password: document.getElementById('reg-password').value,
      address: document.getElementById('reg-address').value
    });
  } finally {
    btn.textContent = 'Create Account 🚀';
    btn.disabled = false;
  }

  if (data.success) {
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    closeModal('register-modal');
    showApp();
    showToast('success', 'Account Created!', `Welcome to EcoWaste, ${data.user.name}! 🌿`);
  } else {
    showToast('error', 'Registration Failed', data.message || API_CONNECTION_ERROR);
  }
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  if (notifInterval) clearInterval(notifInterval);
  document.getElementById('app').classList.remove('active');
  const cw = document.getElementById('chatbot-widget');
  if (cw) cw.style.display = 'none';
  document.getElementById('landing-page').style.display = 'block';
  showToast('info', 'Signed Out', 'See you again soon! 👋');
}

// ==================== SHOW APP ====================
function showApp() {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('app').classList.add('active');
  const cw = document.getElementById('chatbot-widget');
  if (cw) cw.style.display = 'block';
  buildSidebar();
  updateSidebarUser();
  navigateTo('dashboard');
  loadNotifications();
  notifInterval = setInterval(loadNotifications, 30000);
  initChatbot();
}

function buildSidebar() {
  const isAdmin = currentUser.role === 'admin';
  const isDriver = currentUser.role === 'driver';
  const nav = document.getElementById('sidebar-nav');

  const userItems = [
    { icon: '📊', label: 'Dashboard', view: 'dashboard' },
    { icon: '📋', label: 'My Requests', view: 'my-requests' },
    { icon: '➕', label: 'New Pickup', view: 'new-request' },
    { icon: '🗑️', label: 'Waste Guide', view: 'waste-guide' },
    { icon: '👤', label: 'My Profile', view: 'profile' },
  ];

  const adminItems = [
    { icon: '📊', label: 'Dashboard', view: 'dashboard' },
    { icon: '📋', label: 'All Requests', view: 'admin-requests' },
    { icon: '👥', label: 'Users', view: 'admin-users' },
    { icon: '🚛', label: 'Vehicles', view: 'admin-vehicles' },
    { icon: '🗑️', label: 'Waste Guide', view: 'waste-guide' },
    { icon: '👤', label: 'Profile', view: 'profile' },
  ];

  const items = isAdmin ? adminItems : userItems;
  nav.innerHTML = items.map(it => `
    <div class="sidebar-item" id="nav-${it.view}" onclick="navigateTo('${it.view}')">
      <span class="item-icon">${it.icon}</span>
      <span>${it.label}</span>
    </div>
  `).join('');
}

function updateSidebarUser() {
  if (!currentUser) return;
  document.getElementById('sidebar-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-role').textContent = currentUser.role;
}

function navigateTo(view) {
  currentView = view;
  // Update active sidebar item
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById('nav-' + view);
  if (activeEl) activeEl.classList.add('active');

  const titles = {
    'dashboard': 'Dashboard',
    'my-requests': 'My Pickup Requests',
    'new-request': 'Schedule Pickup',
    'waste-guide': 'Waste Segregation Guide',
    'profile': 'My Profile',
    'admin-requests': 'Manage All Requests',
    'admin-users': 'Manage Users',
        'admin-vehicles': 'Manage Vehicles',
    'ai-classifier': 'AI Waste Classifier',
    'ai-recommend': 'Smart Schedule Recommendations',
    'ai-analytics': 'AI Analytics & Predictions',
  };
  document.getElementById('topbar-title').textContent = titles[view] || 'EcoWaste';

  const content = document.getElementById('content-area');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:300px"><div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary)"></div></div>';

  const renderers = {
    'dashboard': currentUser.role === 'admin' ? renderAdminDashboard : renderUserDashboard,
    'my-requests': renderMyRequests,
    'new-request': renderNewRequest,
    'waste-guide': renderWasteGuide,
    'profile': renderProfile,
    'admin-requests': renderAdminRequests,
    'admin-users': renderAdminUsers,
        'admin-vehicles': renderAdminVehicles,
    'ai-classifier': renderAIClassifier,
    'ai-recommend': renderAIRecommend,
    'ai-analytics': renderAIAnalytics,
  };

  if (renderers[view]) {
    renderers[view]();
  } else {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🚧</div><h3>Coming Soon</h3></div>';
  }
}

// ==================== USER DASHBOARD ====================
async function renderUserDashboard() {
  const data = await api('GET', '/requests');
  const requests = data.requests || [];

  const total = requests.length;
  const pending = requests.filter(r => r.status === 'pending').length;
  const completed = requests.filter(r => r.status === 'completed').length;
  const inProgress = requests.filter(r => ['assigned','in_progress','confirmed'].includes(r.status)).length;
  const recent = requests.slice(0, 5);

  document.getElementById('content-area').innerHTML = `
    <div class="stats-grid fade-in">
      <div class="stat-card">
        <div class="stat-icon green">📋</div>
        <div><div class="stat-num">${total}</div><div class="stat-label">Total Requests</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">⏳</div>
        <div><div class="stat-num">${pending}</div><div class="stat-label">Pending</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">🚛</div>
        <div><div class="stat-num">${inProgress}</div><div class="stat-label">In Progress</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✅</div>
        <div><div class="stat-num">${completed}</div><div class="stat-label">Completed</div></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem" class="fade-in delay-2">
      <div class="card" style="background:linear-gradient(135deg,var(--primary),var(--primary-light));color:white;border:none;cursor:pointer" onclick="navigateTo('new-request')">
        <div style="font-size:2.5rem;margin-bottom:0.8rem">🚛</div>
        <h3 style="font-size:1.1rem;font-weight:700;color:white;margin-bottom:0.4rem">Request Pickup</h3>
        <p style="opacity:0.85;font-size:0.85rem">Schedule a new waste collection now</p>
      </div>
      <div class="card" style="background:linear-gradient(135deg,var(--accent),var(--accent-dark));color:white;border:none;cursor:pointer" onclick="navigateTo('waste-guide')">
        <div style="font-size:2.5rem;margin-bottom:0.8rem">♻️</div>
        <h3 style="font-size:1.1rem;font-weight:700;color:white;margin-bottom:0.4rem">Waste Guide</h3>
        <p style="opacity:0.85;font-size:0.85rem">Learn how to segregate waste properly</p>
      </div>
    </div>

    <div class="table-wrap fade-in delay-3">
      <div class="table-header">
        <span class="table-title">Recent Requests</span>
        <button class="btn btn-sm btn-outline-green" onclick="navigateTo('my-requests')">View All</button>
      </div>
      ${recent.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📋</div><h3>No requests yet</h3><p>Schedule your first waste pickup!</p><br/><button class="btn btn-green" onclick="navigateTo('new-request')">+ New Request</button></div>`
        : `<table>
            <thead><tr><th>Request #</th><th>Waste Type</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${recent.map(r => `
                <tr>
                  <td><strong>${r.request_number}</strong></td>
                  <td>${r.waste_icon || '🗑️'} ${r.waste_type_name || 'General'}</td>
                  <td>${formatDate(r.preferred_date)}</td>
                  <td><span class="status-badge status-${r.status}">${formatStatus(r.status)}</span></td>
                  <td><button class="btn btn-sm btn-outline-green" onclick="viewRequestDetail(${r.id})">Details</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  `;
}

// ==================== MY REQUESTS ====================
async function renderMyRequests() {
  const data = await api('GET', '/requests');
  const requests = data.requests || [];
  document.getElementById('content-area').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem" class="fade-in">
      <h2 style="font-size:1.1rem;font-weight:700">All My Requests (${requests.length})</h2>
      <button class="btn btn-green" onclick="navigateTo('new-request')">+ Schedule Pickup</button>
    </div>
    <div class="table-wrap fade-in delay-1">
      ${requests.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📋</div><h3>No requests yet</h3><p>Start by scheduling a pickup!</p><br/><button class="btn btn-green" onclick="navigateTo('new-request')">+ New Request</button></div>`
        : `<table>
            <thead><tr><th>Request #</th><th>Waste Type</th><th>Address</th><th>Preferred Date</th><th>Time Slot</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${requests.map(r => `
                <tr>
                  <td><strong style="color:var(--primary)">${r.request_number}</strong></td>
                  <td>${r.waste_icon || '🗑️'} ${r.waste_type_name || 'General'}</td>
                  <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.pickup_address}</td>
                  <td>${formatDate(r.preferred_date)}</td>
                  <td><span style="text-transform:capitalize">${r.preferred_time_slot}</span></td>
                  <td><span class="status-badge status-${r.status}">${formatStatus(r.status)}</span></td>
                  <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
                    <button class="btn btn-sm btn-outline-green" onclick="viewRequestDetail(${r.id})">View</button>
                    ${['pending','confirmed'].includes(r.status) ? `<button class="btn btn-sm btn-danger" onclick="cancelRequest(${r.id},'${r.request_number}')">Cancel</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  `;
}

// ==================== NEW REQUEST ====================
async function renderNewRequest() {
  const wtData = await api('GET', '/waste-types');
  const wasteTypes = wtData.wasteTypes || [];
  const grouped = {};
  wasteTypes.forEach(wt => {
    if (!grouped[wt.category]) grouped[wt.category] = [];
    grouped[wt.category].push(wt);
  });
  const optionsHTML = Object.entries(grouped).map(([cat, items]) =>
    `<optgroup label="${capitalize(cat)}">${items.map(w => `<option value="${w.id}">${w.icon} ${w.name}</option>`).join('')}</optgroup>`
  ).join('');

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('content-area').innerHTML = `
    <div style="max-width:720px;margin:0 auto" class="fade-in">
      <div class="card">
        <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:0.5rem">🚛 Schedule a Waste Pickup</h2>
        <p style="color:var(--text-muted);margin-bottom:2rem;font-size:0.9rem">Fill in the details below and we'll arrange a convenient pickup for you.</p>
        <form onsubmit="submitNewRequest(event)">
          <div class="form-row">
            <div class="form-group">
              <label>Waste Type *</label>
              <select class="form-select" id="req-waste-type" required>
                <option value="">— Select Waste Type —</option>
                ${optionsHTML}
              </select>
            </div>
            <div class="form-group">
              <label>Priority</label>
              <select class="form-select" id="req-priority">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Pickup Address *</label>
            <input type="text" class="form-input" id="req-address" placeholder="Full pickup address" required value="${currentUser.address || ''}"/>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Preferred Date *</label>
              <input type="date" class="form-input" id="req-date" min="${today}" required/>
            </div>
            <div class="form-group">
              <label>Time Slot</label>
              <select class="form-select" id="req-time">
                <option value="morning">🌅 Morning (7AM–12PM)</option>
                <option value="afternoon">☀️ Afternoon (12PM–5PM)</option>
                <option value="evening">🌆 Evening (5PM–8PM)</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Estimated Quantity (kg)</label>
              <input type="number" class="form-input" id="req-qty" placeholder="e.g. 5" min="0.1" step="0.1"/>
            </div>
          </div>
          <div class="form-group">
            <label>Waste Description</label>
            <textarea class="form-textarea" id="req-desc" placeholder="Brief description of waste (optional)"></textarea>
          </div>
          <div class="form-group">
            <label>Additional Notes</label>
            <input type="text" class="form-input" id="req-notes" placeholder="Any special instructions for the driver"/>
          </div>
          <div style="display:flex;gap:1rem;margin-top:1rem">
            <button type="submit" class="btn btn-green btn-full" id="submit-req-btn">Submit Pickup Request 🚀</button>
            <button type="button" class="btn btn-outline-green" onclick="navigateTo('my-requests')" style="flex-shrink:0">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function submitNewRequest(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-req-btn');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  const data = await api('POST', '/requests', {
    waste_type_id: document.getElementById('req-waste-type').value,
    pickup_address: document.getElementById('req-address').value,
    preferred_date: document.getElementById('req-date').value,
    preferred_time_slot: document.getElementById('req-time').value,
    priority: document.getElementById('req-priority').value,
    quantity_kg: document.getElementById('req-qty').value || null,
    waste_description: document.getElementById('req-desc').value,
    notes: document.getElementById('req-notes').value
  });
  if (data.success) {
    showToast('success', 'Request Submitted!', `Request #${data.requestNumber} created successfully 🎉`);
    loadNotifications();
    navigateTo('my-requests');
  } else {
    btn.textContent = 'Submit Pickup Request 🚀'; btn.disabled = false;
    showToast('error', 'Error', data.message);
  }
}

async function cancelRequest(id, num) {
  if (!confirm(`Cancel request #${num}?`)) return;
  const data = await api('PUT', `/requests/${id}/cancel`);
  if (data.success) {
    showToast('warning', 'Request Cancelled', `Request #${num} has been cancelled.`);
    renderMyRequests();
  } else {
    showToast('error', 'Error', data.message);
  }
}

async function viewRequestDetail(id) {
  const data = await api('GET', `/requests/${id}`);
  if (!data.success) return;
  const r = data.request;
  const hist = data.history || [];

  const histHTML = hist.map(h => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-status">${formatStatus(h.new_status)}</div>
        <div class="timeline-time">${formatDateTime(h.created_at)} · ${h.notes || ''}</div>
      </div>
    </div>
  `).join('');

  document.getElementById('content-area').innerHTML = `
    <div style="max-width:800px;margin:0 auto" class="fade-in">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem">
        <button class="btn btn-outline-green btn-sm" onclick="navigateTo('my-requests')">← Back</button>
        <h2 style="font-size:1.2rem;font-weight:700">Request ${r.request_number}</h2>
        <span class="status-badge status-${r.status}">${formatStatus(r.status)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
        <div class="card">
          <h3 style="font-weight:700;margin-bottom:1rem">Pickup Details</h3>
          <div style="display:flex;flex-direction:column;gap:0.8rem;font-size:0.9rem">
            <div><strong>Waste Type:</strong> ${r.waste_icon || ''} ${r.waste_type_name || 'General'}</div>
            <div><strong>Category:</strong> <span style="text-transform:capitalize">${r.waste_category || '—'}</span></div>
            <div><strong>Address:</strong> ${r.pickup_address}</div>
            <div><strong>Preferred Date:</strong> ${formatDate(r.preferred_date)}</div>
            <div><strong>Time Slot:</strong> <span style="text-transform:capitalize">${r.preferred_time_slot}</span></div>
            <div><strong>Priority:</strong> <span style="text-transform:capitalize">${r.priority}</span></div>
            ${r.quantity_kg ? `<div><strong>Quantity:</strong> ${r.quantity_kg} kg</div>` : ''}
            ${r.waste_description ? `<div><strong>Description:</strong> ${r.waste_description}</div>` : ''}
            ${r.notes ? `<div><strong>Notes:</strong> ${r.notes}</div>` : ''}
          </div>
        </div>
        <div class="card">
          <h3 style="font-weight:700;margin-bottom:1rem">Assignment</h3>
          <div style="display:flex;flex-direction:column;gap:0.8rem;font-size:0.9rem">
            <div><strong>Vehicle:</strong> ${r.vehicle_number || 'Not yet assigned'}</div>
            <div><strong>Driver:</strong> ${r.driver_name || 'Not yet assigned'}</div>
            ${r.driver_phone ? `<div><strong>Driver Phone:</strong> ${r.driver_phone}</div>` : ''}
            ${r.estimated_pickup_time ? `<div><strong>ETA:</strong> ${formatDateTime(r.estimated_pickup_time)}</div>` : ''}
            ${r.actual_pickup_time ? `<div><strong>Completed At:</strong> ${formatDateTime(r.actual_pickup_time)}</div>` : ''}
            ${r.admin_notes ? `<div><strong>Admin Notes:</strong> ${r.admin_notes}</div>` : ''}
          </div>
          ${r.status === 'completed' && !r.rating ? `
          <hr style="margin:1rem 0"/>
          <p style="font-size:0.85rem;font-weight:600;margin-bottom:0.5rem">Rate this pickup:</p>
          <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem" id="star-rating">
            ${[1,2,3,4,5].map(s=>`<span onclick="setRating(${s})" style="font-size:1.5rem;cursor:pointer">⭐</span>`).join('')}
          </div>
          <input type="text" class="form-input" id="feedback-input" placeholder="Your feedback (optional)" style="margin-bottom:0.8rem"/>
          <button class="btn btn-green btn-sm" onclick="submitRating(${r.id})">Submit Rating</button>
          ` : r.rating ? `<hr style="margin:1rem 0"/><p>Your Rating: ${'⭐'.repeat(r.rating)}</p>${r.feedback ? `<p style="font-size:0.85rem;color:var(--text-muted)">${r.feedback}</p>` : ''}` : ''}
        </div>
      </div>
      <div class="card" style="margin-top:1.5rem">
        <h3 style="font-weight:700;margin-bottom:1rem">Status Timeline</h3>
        <div class="timeline">${histHTML || '<p style="color:var(--text-muted);font-size:0.9rem">No history yet.</p>'}</div>
      </div>
    </div>
  `;
}

let selectedRating = 0;
function setRating(n) {
  selectedRating = n;
  const stars = document.querySelectorAll('#star-rating span');
  stars.forEach((s,i) => { s.textContent = i < n ? '⭐' : '☆'; });
}

async function submitRating(requestId) {
  if (!selectedRating) return showToast('warning', 'Select Rating', 'Please select a star rating.');
  const feedback = document.getElementById('feedback-input').value;
  const data = await api('POST', `/requests/${requestId}/rate`, { rating: selectedRating, feedback });
  if (data.success) { showToast('success', 'Thank you!', 'Your feedback has been submitted.'); viewRequestDetail(requestId); }
}

// ==================== WASTE GUIDE ====================
async function renderWasteGuide() {
  const data = await api('GET', '/waste-types');
  const wasteTypes = data.wasteTypes || [];
  const grouped = {};
  wasteTypes.forEach(wt => {
    if (!grouped[wt.category]) grouped[wt.category] = [];
    grouped[wt.category].push(wt);
  });

  const catStyles = {
    biodegradable: { bg: 'linear-gradient(135deg,#E8F5E9,#C8E6C9)', border: '#A5D6A7', badge: 'badge-green', binLabel: 'GREEN BIN', binColor: '#2E7D32' },
    recyclable:    { bg: 'linear-gradient(135deg,#E3F2FD,#BBDEFB)', border: '#90CAF9', badge: 'badge-blue', binLabel: 'BLUE BIN', binColor: '#1565C0' },
    hazardous:     { bg: 'linear-gradient(135deg,#FFF3E0,#FFE0B2)', border: '#FFCC80', badge: 'badge-orange', binLabel: 'SPECIAL', binColor: '#E65100' },
    general:       { bg: 'linear-gradient(135deg,#FAFAFA,#F5F5F5)', border: '#E0E0E0', badge: 'badge-gray', binLabel: 'BLACK BIN', binColor: '#424242' },
  };

  const html = Object.entries(grouped).map(([cat, items]) => {
    const s = catStyles[cat] || catStyles.general;
    return `
      <div style="margin-bottom:2.5rem" class="fade-in">
        <h3 style="font-size:1.1rem;font-weight:700;text-transform:capitalize;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem">
          <span style="width:14px;height:14px;border-radius:50%;background:${s.binColor};display:inline-block"></span>
          ${cat} Waste – <span style="color:${s.binColor}">${s.binLabel}</span>
        </h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem">
          ${items.map(wt => `
            <div style="background:${s.bg};border:2px solid ${s.border};border-radius:var(--radius-lg);padding:1.2rem;transition:var(--transition)" onmouseover="this.style.transform='translateY(-6px)'" onmouseout="this.style.transform=''">
              <div style="font-size:2rem;margin-bottom:0.5rem">${wt.icon}</div>
              <h4 style="font-weight:700;margin-bottom:0.4rem">${wt.name}</h4>
              <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.6rem">${wt.description}</p>
              <details style="font-size:0.8rem">
                <summary style="cursor:pointer;font-weight:600;color:${s.binColor}">How to dispose?</summary>
                <p style="margin-top:0.4rem;color:var(--text-muted)">${wt.handling_instructions}</p>
              </details>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('content-area').innerHTML = `
    <div style="background:linear-gradient(135deg,var(--primary-dark),var(--primary));border-radius:var(--radius-lg);padding:2rem;color:white;margin-bottom:2rem" class="fade-in">
      <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:0.5rem">♻️ Waste Segregation Guide</h2>
      <p style="opacity:0.85">Learn how to sort and dispose of waste correctly. Proper segregation reduces landfill waste, conserves resources, and protects our environment.</p>
    </div>
    ${html}
  `;
}

// ==================== PROFILE ====================
async function renderProfile() {
  const data = await api('GET', '/auth/me');
  const user = data.user || currentUser;
  document.getElementById('content-area').innerHTML = `
    <div style="max-width:640px;margin:0 auto" class="fade-in">
      <div class="card" style="margin-bottom:1.5rem">
        <div style="display:flex;align-items:center;gap:1.5rem;margin-bottom:1.5rem">
          <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;color:white;font-size:1.8rem;font-weight:700;flex-shrink:0">
            ${user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style="font-size:1.3rem;font-weight:700">${user.name}</h2>
            <p style="color:var(--text-muted)">${user.email}</p>
            <span style="background:rgba(46,125,50,0.1);color:var(--primary);padding:0.2rem 0.8rem;border-radius:50px;font-size:0.8rem;font-weight:600;text-transform:capitalize">${user.role}</span>
          </div>
        </div>
        <form onsubmit="updateProfile(event)">
          <div class="form-row">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" class="form-input" id="prof-name" value="${user.name}" required/>
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input type="tel" class="form-input" id="prof-phone" value="${user.phone || ''}"/>
            </div>
          </div>
          <div class="form-group">
            <label>Address</label>
            <textarea class="form-textarea" id="prof-address" style="min-height:70px">${user.address || ''}</textarea>
          </div>
          <button type="submit" class="btn btn-green">Save Changes</button>
        </form>
      </div>
      <div class="card">
        <h3 style="font-weight:700;margin-bottom:1rem">Change Password</h3>
        <form onsubmit="changePassword(event)">
          <div class="form-group">
            <label>Current Password</label>
            <input type="password" class="form-input" id="pwd-current" required/>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>New Password</label>
              <input type="password" class="form-input" id="pwd-new" required minlength="6"/>
            </div>
            <div class="form-group">
              <label>Confirm Password</label>
              <input type="password" class="form-input" id="pwd-confirm" required/>
            </div>
          </div>
          <button type="submit" class="btn btn-outline-green">Update Password</button>
        </form>
      </div>
    </div>
  `;
}

async function updateProfile(e) {
  e.preventDefault();
  const data = await api('PUT', '/auth/profile', {
    name: document.getElementById('prof-name').value,
    phone: document.getElementById('prof-phone').value,
    address: document.getElementById('prof-address').value
  });
  if (data.success) {
    currentUser.name = document.getElementById('prof-name').value;
    updateSidebarUser();
    showToast('success', 'Profile Updated', 'Your profile has been saved.');
  } else {
    showToast('error', 'Error', data.message);
  }
}

async function changePassword(e) {
  e.preventDefault();
  const np = document.getElementById('pwd-new').value;
  const cp = document.getElementById('pwd-confirm').value;
  if (np !== cp) return showToast('error', 'Mismatch', 'New passwords do not match.');
  const data = await api('PUT', '/auth/change-password', {
    currentPassword: document.getElementById('pwd-current').value,
    newPassword: np
  });
  if (data.success) showToast('success', 'Password Changed', 'Your password has been updated.');
  else showToast('error', 'Error', data.message);
}

// ==================== ADMIN DASHBOARD ====================
async function renderAdminDashboard() {
  const data = await api('GET', '/admin/dashboard');
  if (!data.success) { document.getElementById('content-area').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load dashboard</h3></div>'; return; }
  const s = data.stats;

  document.getElementById('content-area').innerHTML = `
    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-icon green">📋</div><div><div class="stat-num">${s.totalRequests}</div><div class="stat-label">Total Requests</div></div></div>
      <div class="stat-card"><div class="stat-icon orange">⏳</div><div><div class="stat-num">${s.pendingRequests}</div><div class="stat-label">Pending</div></div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div><div class="stat-num">${s.completedRequests}</div><div class="stat-label">Completed</div></div></div>
      <div class="stat-card"><div class="stat-icon blue">👥</div><div><div class="stat-num">${s.totalUsers}</div><div class="stat-label">Total Users</div></div></div>
      <div class="stat-card"><div class="stat-icon purple">🚛</div><div><div class="stat-num">${s.availableVehicles}/${s.totalVehicles}</div><div class="stat-label">Vehicles Available</div></div></div>
      <div class="stat-card"><div class="stat-icon green">♻️</div><div><div class="stat-num">${parseFloat(s.totalWasteCollected||0).toFixed(1)}kg</div><div class="stat-label">Waste Collected</div></div></div>
    </div>

    <div class="table-wrap fade-in delay-2">
      <div class="table-header">
        <span class="table-title">Recent Requests</span>
        <button class="btn btn-sm btn-green" onclick="navigateTo('admin-requests')">View All</button>
      </div>
      <table>
        <thead><tr><th>Request #</th><th>User</th><th>Waste Type</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${(data.recentRequests||[]).map(r => `
            <tr>
              <td><strong style="color:var(--primary)">${r.request_number}</strong></td>
              <td>${r.user_name}</td>
              <td>${r.waste_icon||'🗑️'} ${r.waste_type_name||'General'}</td>
              <td>${formatDate(r.preferred_date)}</td>
              <td><span class="status-badge status-${r.status}">${formatStatus(r.status)}</span></td>
              <td><button class="btn btn-sm btn-outline-green" onclick="adminViewRequest(${r.id})">Manage</button></td>
            </tr>
          `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No requests yet</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ==================== ADMIN REQUESTS ====================
async function renderAdminRequests() {
  const data = await api('GET', '/admin/requests');
  const requests = data.requests || [];
  document.getElementById('content-area').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:1.5rem" class="fade-in">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        ${['all','pending','confirmed','assigned','in_progress','completed','cancelled'].map(s =>
          `<button class="btn btn-sm ${s==='all'?'btn-green':'btn-outline-green'}" onclick="filterAdminRequests('${s}')">${formatStatus(s)}</button>`
        ).join('')}
      </div>
    </div>
    <div class="table-wrap fade-in delay-1" id="admin-req-table">
      ${buildAdminRequestTable(requests)}
    </div>
  `;
}

async function filterAdminRequests(status) {
  const path = status === 'all' ? '/admin/requests' : `/admin/requests?status=${status}`;
  const data = await api('GET', path);
  document.getElementById('admin-req-table').innerHTML = buildAdminRequestTable(data.requests || []);
  document.querySelectorAll('#content-area .btn').forEach(b => {
    b.className = b.textContent.toLowerCase().includes(status) ? 'btn btn-sm btn-green' : 'btn btn-sm btn-outline-green';
  });
}

function buildAdminRequestTable(requests) {
  if (!requests.length) return '<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No requests found</h3></div>';
  return `<table>
    <thead><tr><th>Request #</th><th>User</th><th>Waste Type</th><th>Address</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>
      ${requests.map(r => `
        <tr>
          <td><strong style="color:var(--primary)">${r.request_number}</strong></td>
          <td>${r.user_name}<br/><span style="color:var(--text-muted);font-size:0.75rem">${r.user_phone||''}</span></td>
          <td>${r.waste_icon||'🗑️'} ${r.waste_type_name||'General'}</td>
          <td style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.pickup_address}</td>
          <td>${formatDate(r.preferred_date)}</td>
          <td><span class="status-badge status-${r.status}">${formatStatus(r.status)}</span></td>
          <td><button class="btn btn-sm btn-green" onclick="adminViewRequest(${r.id})">Manage</button></td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

async function adminViewRequest(id) {
  const [reqData, vData] = await Promise.all([
    api('GET', `/requests/${id}`),
    api('GET', '/admin/vehicles')
  ]);
  if (!reqData.success) return;
  const r = reqData.request;
  const vehicles = (vData.vehicles || []).filter(v => v.status === 'available' || v.id === r.assigned_vehicle_id);

  const statusOptions = ['pending','confirmed','assigned','in_progress','completed','cancelled'].map(s =>
    `<option value="${s}" ${r.status===s?'selected':''}>${formatStatus(s)}</option>`
  ).join('');
  const vehicleOptions = `<option value="">— Not Assigned —</option>` + vehicles.map(v =>
    `<option value="${v.id}" ${r.assigned_vehicle_id===v.id?'selected':''}>${v.vehicle_number} (${v.vehicle_type})</option>`
  ).join('');

  document.getElementById('content-area').innerHTML = `
    <div style="max-width:800px;margin:0 auto" class="fade-in">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem">
        <button class="btn btn-outline-green btn-sm" onclick="navigateTo('admin-requests')">← Back</button>
        <h2 style="font-size:1.2rem;font-weight:700">Manage: ${r.request_number}</h2>
        <span class="status-badge status-${r.status}">${formatStatus(r.status)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
        <div class="card">
          <h3 style="font-weight:700;margin-bottom:1rem">Request Info</h3>
          <div style="font-size:0.88rem;display:flex;flex-direction:column;gap:0.6rem">
            <div><strong>User:</strong> ${r.user_name} (${r.user_email})</div>
            <div><strong>Phone:</strong> ${r.user_phone||'—'}</div>
            <div><strong>Waste Type:</strong> ${r.waste_icon||''} ${r.waste_type_name||'General'}</div>
            <div><strong>Address:</strong> ${r.pickup_address}</div>
            <div><strong>Date:</strong> ${formatDate(r.preferred_date)} – <span style="text-transform:capitalize">${r.preferred_time_slot}</span></div>
            <div><strong>Priority:</strong> <span style="text-transform:capitalize">${r.priority}</span></div>
            ${r.quantity_kg ? `<div><strong>Quantity:</strong> ${r.quantity_kg} kg</div>` : ''}
            ${r.notes ? `<div><strong>Notes:</strong> ${r.notes}</div>` : ''}
          </div>
        </div>
        <div class="card">
          <h3 style="font-weight:700;margin-bottom:1rem">Update Status</h3>
          <form onsubmit="submitAdminUpdate(event,${id})">
            <div class="form-group">
              <label>Status</label>
              <select class="form-select" id="admin-status">${statusOptions}</select>
            </div>
            <div class="form-group">
              <label>Assign Vehicle</label>
              <select class="form-select" id="admin-vehicle">${vehicleOptions}</select>
            </div>
            <div class="form-group">
              <label>Admin Notes</label>
              <textarea class="form-textarea" id="admin-notes" style="min-height:70px" placeholder="Notes for user...">${r.admin_notes||''}</textarea>
            </div>
            <button type="submit" class="btn btn-green btn-full">Update Request</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

async function submitAdminUpdate(e, id) {
  e.preventDefault();
  const data = await api('PUT', `/admin/requests/${id}/status`, {
    status: document.getElementById('admin-status').value,
    assigned_vehicle_id: document.getElementById('admin-vehicle').value || null,
    admin_notes: document.getElementById('admin-notes').value
  });
  if (data.success) {
    showToast('success', 'Updated!', 'Request status updated successfully.');
    adminViewRequest(id);
    loadNotifications();
  } else {
    showToast('error', 'Error', data.message);
  }
}

// ==================== ADMIN USERS ====================
async function renderAdminUsers() {
  const data = await api('GET', '/admin/users');
  const users = data.users || [];
  document.getElementById('content-area').innerHTML = `
    <div class="table-wrap fade-in">
      <div class="table-header">
        <span class="table-title">All Users (${users.length})</span>
        <button class="btn btn-sm btn-green" onclick="showCreateUserModal()">+ Add User</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Requests</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><strong>${u.name}</strong></td>
              <td>${u.email}</td>
              <td><span style="background:rgba(46,125,50,0.1);color:var(--primary);padding:0.2rem 0.7rem;border-radius:50px;font-size:0.78rem;font-weight:600;text-transform:capitalize">${u.role}</span></td>
              <td>${u.phone||'—'}</td>
              <td>${u.total_requests}</td>
              <td>${formatDate(u.created_at)}</td>
              <td><span style="color:${u.is_active?'var(--primary)':'var(--error)'};">${u.is_active?'✅ Active':'❌ Inactive'}</span></td>
              <td><button class="btn btn-sm btn-outline-green" onclick="toggleUser(${u.id})">${u.is_active?'Deactivate':'Activate'}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function toggleUser(id) {
  const data = await api('PUT', `/admin/users/${id}/toggle`);
  if (data.success) { showToast('success', 'Updated', 'User status toggled.'); renderAdminUsers(); }
}

function showCreateUserModal() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay active" id="create-user-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Add New User</h3>
          <div class="modal-close" onclick="document.getElementById('create-user-modal').remove()">✕</div>
        </div>
        <form onsubmit="createUser(event)">
          <div class="form-group"><label>Name</label><input type="text" class="form-input" id="cu-name" required/></div>
          <div class="form-group"><label>Email</label><input type="email" class="form-input" id="cu-email" required/></div>
          <div class="form-group"><label>Password</label><input type="password" class="form-input" id="cu-pass" required minlength="6"/></div>
          <div class="form-group"><label>Role</label>
            <select class="form-select" id="cu-role">
              <option value="user">User</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="form-group"><label>Phone</label><input type="tel" class="form-input" id="cu-phone"/></div>
          <button type="submit" class="btn btn-green btn-full">Create User</button>
        </form>
      </div>
    </div>
  `);
}

async function createUser(e) {
  e.preventDefault();
  const data = await api('POST', '/admin/users', {
    name: document.getElementById('cu-name').value,
    email: document.getElementById('cu-email').value,
    password: document.getElementById('cu-pass').value,
    role: document.getElementById('cu-role').value,
    phone: document.getElementById('cu-phone').value
  });
  if (data.success) {
    document.getElementById('create-user-modal').remove();
    showToast('success', 'User Created', 'New user added successfully.');
    renderAdminUsers();
  } else {
    showToast('error', 'Error', data.message);
  }
}

// ==================== ADMIN VEHICLES ====================
async function renderAdminVehicles() {
  const data = await api('GET', '/admin/vehicles');
  const vehicles = data.vehicles || [];
  const statusColors = { available:'var(--primary)', on_route:'#1565C0', maintenance:'#F57C00', inactive:'#9E9E9E' };
  document.getElementById('content-area').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem" class="fade-in">
      ${vehicles.map(v => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
            <div style="font-size:2rem">🚛</div>
            <span style="padding:0.3rem 0.8rem;border-radius:50px;font-size:0.78rem;font-weight:600;background:rgba(0,0,0,0.06);color:${statusColors[v.status]||'#333'};text-transform:capitalize">${v.status}</span>
          </div>
          <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.3rem">${v.vehicle_number}</h3>
          <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:0.8rem">${v.vehicle_type} · ${v.capacity_kg} kg capacity</p>
          <p style="font-size:0.85rem"><strong>Driver:</strong> ${v.driver_name||'Not assigned'}</p>
          ${v.current_location ? `<p style="font-size:0.82rem;color:var(--text-muted)">📍 ${v.current_location}</p>` : ''}
          <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap">
            ${['available','on_route','maintenance'].map(s =>
              `<button class="btn btn-sm ${v.status===s?'btn-green':'btn-outline-green'}" onclick="updateVehicleStatus(${v.id},'${s}')">${capitalize(s)}</button>`
            ).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function updateVehicleStatus(id, status) {
  const loc = status === 'on_route' ? prompt('Enter current location:') : null;
  const data = await api('PUT', `/admin/vehicles/${id}/status`, { status, current_location: loc });
  if (data.success) { showToast('success', 'Updated', `Vehicle set to ${status}`); renderAdminVehicles(); }
}

// ==================== NOTIFICATIONS ====================
async function loadNotifications() {
  const data = await api('GET', '/notifications');
  if (!data.success) return;
  const notifs = data.notifications || [];
  const unread = data.unreadCount || 0;

  const badge = document.getElementById('notif-badge');
  if (unread > 0) { badge.style.display = 'flex'; badge.textContent = unread > 9 ? '9+' : unread; }
  else { badge.style.display = 'none'; }

  const list = document.getElementById('notif-list');
  if (!notifs.length) {
    list.innerHTML = '<div class="empty-state" style="padding:2rem"><div>🔕</div><p>No notifications yet</p></div>';
    return;
  }
  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.is_read?'':'unread'}" onclick="markRead(${n.id})">
      <div class="notif-item-title">${getNotifIcon(n.type)} ${n.title}</div>
      <div class="notif-item-msg">${n.message}</div>
      <div class="notif-item-time">${timeAgo(n.created_at)}</div>
    </div>
  `).join('');
}

function getNotifIcon(type) {
  return { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' }[type] || 'ℹ️';
}

async function markRead(id) {
  await api('PUT', `/notifications/${id}/read`);
  loadNotifications();
}

async function markAllRead() {
  await api('PUT', '/notifications/read-all');
  loadNotifications();
  toggleNotifications();
}

function toggleNotifications() {
  const drawer = document.getElementById('notif-drawer');
  drawer.classList.toggle('open');
}

document.addEventListener('click', e => {
  const drawer = document.getElementById('notif-drawer');
  const btn = document.getElementById('notif-btn');
  if (drawer && btn && !drawer.contains(e.target) && !btn.contains(e.target)) {
    drawer.classList.remove('open');
  }
});

// ==================== MODAL HELPERS ====================
function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}
function switchModal(from, to) {
  closeModal(from);
  openModal(to);
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

// ==================== TOAST ====================
function showToast(type, title, msg, duration = 4000) {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-icon">${icons[type]||'ℹ️'}</div>
    <div class="toast-content"><div class="toast-title">${title}</div>${msg?`<div class="toast-msg">${msg}</div>`:''}</div>
    <div class="toast-close" onclick="this.parentElement.remove()">✕</div>`;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ==================== CONTACT FORM ====================
function submitContact(e) {
  e.preventDefault();
  showToast('success', 'Message Sent!', 'Thank you! We\'ll get back to you within 24 hours.');
  e.target.reset();
}

// ==================== SCROLL REVEAL ====================
function initRevealAnimations() {
  const els = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) { el.classList.add('visible'); }
    else { observer.observe(el); }
  });
}

// ==================== NAVIGATION ====================
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const links = document.querySelectorAll('.nav-link');
  links.forEach(l => l.classList.remove('active'));
}
window.addEventListener('scroll', () => {
  const sections = ['home','about','services','segregation','contact'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top <= 100 && rect.bottom >= 100) {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const activeLink = document.querySelector(`.nav-link[onclick="scrollToSection('${id}')"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  });
});

function toggleMobileMenu() {
  document.getElementById('nav-links').style.display =
    document.getElementById('nav-links').style.display === 'flex' ? 'none' : 'flex';
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ==================== UTILS ====================
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function formatStatus(s) {
  if (!s || s === 'all') return s === 'all' ? 'All' : '—';
  return s.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase());
}
function capitalize(s) { return s ? s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) : ''; }
function timeAgo(d) {
  const diff = Math.floor((Date.now() - new Date(d)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// ==================== AI: SIDEBAR ITEMS ====================
const origBuildSidebar = buildSidebar;
function buildSidebar() {
  const isAdmin = currentUser.role === 'admin';
  const nav = document.getElementById('sidebar-nav');
  const userItems = [
    { icon: '📊', label: 'Dashboard', view: 'dashboard' },
    { icon: '📋', label: 'My Requests', view: 'my-requests' },
    { icon: '➕', label: 'New Pickup', view: 'new-request' },
    { icon: '🤖', label: 'AI Classifier', view: 'ai-classifier' },
    { icon: '💡', label: 'Smart Schedule', view: 'ai-recommend' },
    { icon: '🗑️', label: 'Waste Guide', view: 'waste-guide' },
    { icon: '👤', label: 'My Profile', view: 'profile' },
  ];
  const adminItems = [
    { icon: '📊', label: 'Dashboard', view: 'dashboard' },
    { icon: '📋', label: 'All Requests', view: 'admin-requests' },
    { icon: '👥', label: 'Users', view: 'admin-users' },
    { icon: '🚛', label: 'Vehicles', view: 'admin-vehicles' },
    { icon: '🤖', label: 'AI Classifier', view: 'ai-classifier' },
    { icon: '📈', label: 'AI Analytics', view: 'ai-analytics' },
    { icon: '🗑️', label: 'Waste Guide', view: 'waste-guide' },
    { icon: '👤', label: 'Profile', view: 'profile' },
  ];
  const items = isAdmin ? adminItems : userItems;
  nav.innerHTML = items.map(it =>
    `<div class="sidebar-item" id="nav-${it.view}" onclick="navigateTo('${it.view}')">
       <span class="item-icon">${it.icon}</span><span>${it.label}</span>
     </div>`
  ).join('');
}

