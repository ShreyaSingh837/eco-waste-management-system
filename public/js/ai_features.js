
// ==================== AI: WASTE CLASSIFIER ====================
const AI_API_BASE = window.ECOWASTE_API_BASE_URL || '/api';

async function renderAIClassifier() {
  document.getElementById('content-area').innerHTML = `
    <div style="max-width:860px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#7B1FA2,#AB47BC);border-radius:var(--radius-lg);padding:2rem;color:white;margin-bottom:1.5rem" class="fade-in">
        <div style="display:flex;align-items:center;gap:1.2rem">
          <div style="font-size:3rem">🤖</div>
          <div>
            <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:0.4rem">AI Waste Classifier</h2>
            <p style="opacity:0.9;font-size:0.9rem">Upload a photo and AI will instantly identify the waste type and give disposal instructions.</p>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem" class="fade-in delay-1">
        <div class="card">
          <h3 style="font-weight:700;margin-bottom:1rem;font-size:1rem">📸 Upload Waste Image</h3>
          <div class="drop-zone" id="drop-zone" ondragover="handleDragOver(event)" ondragleave="document.getElementById('drop-zone').classList.remove('drag-over')" ondrop="handleDrop(event)">
            <input type="file" id="waste-img-input" accept="image/*" onchange="previewWasteImage(event)"/>
            <div id="drop-content">
              <div class="drop-zone-icon">📷</div>
              <div class="drop-zone-text">Drop image here or click to browse</div>
              <div class="drop-zone-sub">JPG, PNG, WebP · Max 10MB</div>
            </div>
            <img id="img-preview" class="img-preview" style="display:none"/>
          </div>
          <button class="btn btn-full" id="classify-btn" onclick="classifyWaste()" style="margin-top:1rem;background:linear-gradient(135deg,#7B1FA2,#AB47BC);color:white;display:none">
            🔍 Classify with AI
          </button>
        </div>
        <div id="ai-result-panel">
          <div style="background:#f8f8f8;border-radius:var(--radius-lg);padding:2.5rem;text-align:center;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed #e0e0e0">
            <div style="font-size:3.5rem;margin-bottom:1rem">🔬</div>
            <h3 style="font-weight:600;color:var(--text-muted);margin-bottom:0.4rem">AI Result</h3>
            <p style="font-size:0.82rem;color:var(--text-light)">Upload an image to see the classification</p>
          </div>
        </div>
      </div>
      <div class="card fade-in delay-2" style="margin-top:1.5rem">
        <h3 style="font-weight:700;margin-bottom:1rem;font-size:1rem">💡 Quick Reference Guide</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem">
          ${[['🌿','Biodegradable','Green Bin','#2E7D32','#E8F5E9'],['♻️','Recyclable','Blue Bin','#1565C0','#E3F2FD'],['⚠️','Hazardous','Special Handling','#E65100','#FFF3E0'],['🗑️','General','Black Bin','#616161','#F5F5F5']]
            .map(([icon,label,bin,col,bg]) => `
              <div style="text-align:center;padding:1rem;background:${bg};border-radius:var(--radius);border:1.5px solid ${col}30">
                <div style="font-size:2rem;margin-bottom:0.4rem">${icon}</div>
                <div style="font-weight:700;font-size:0.82rem;color:${col}">${label}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${bin}</div>
              </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('waste-img-input').files = dt.files;
    showWasteImagePreview(file);
  }
}

function previewWasteImage(e) {
  const file = e.target.files[0];
  if (file) showWasteImagePreview(file);
}

function showWasteImagePreview(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('img-preview');
    const dropContent = document.getElementById('drop-content');
    if (preview) { preview.src = ev.target.result; preview.style.display = 'block'; }
    if (dropContent) dropContent.style.display = 'none';
    const btn = document.getElementById('classify-btn');
    if (btn) btn.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

async function classifyWaste() {
  const fileInput = document.getElementById('waste-img-input');
  if (!fileInput || !fileInput.files.length) return showToast('warning', 'No Image', 'Please select an image first.');
  const btn = document.getElementById('classify-btn');
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;border-color:rgba(255,255,255,0.3);border-top-color:white;display:inline-block;border-radius:50%;animation:spin 0.9s linear infinite"></div>&nbsp; Analyzing…';
  btn.disabled = true;

  const formData = new FormData();
  formData.append('image', fileInput.files[0]);
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${AI_API_BASE}/ai/classify-waste`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (data.success) renderClassifyResult(data);
    else showToast('error', 'Classification Failed', data.message || 'Please try again.');
  } catch(e) {
    showToast('error', 'Connection Error', 'Could not reach AI service.');
  }
  btn.innerHTML = '🔍 Classify Again';
  btn.disabled = false;
}

function renderClassifyResult(data) {
  const r = data.result;
  const catEmoji = { biodegradable:'🌿', recyclable:'♻️', hazardous:'⚠️', general:'🗑️' };
  const catColors = { biodegradable:'#2E7D32', recyclable:'#1565C0', hazardous:'#E65100', general:'#616161' };
  const icon = catEmoji[r.category] || '🗑️';
  const col = catColors[r.category] || '#616161';

  document.getElementById('ai-result-panel').innerHTML = `
    <div class="ai-result ${r.category}" style="height:100%">
      <div class="ai-result-header">
        <div style="font-size:2.5rem">${icon}</div>
        <div>
          <div style="font-size:1.1rem;font-weight:700">${r.waste_name}</div>
          <div style="font-size:0.78rem;text-transform:capitalize;opacity:0.7;font-weight:600">${r.category} · ${r.bin_color}</div>
          ${data.ai_powered ? '<span style="display:inline-flex;align-items:center;gap:0.3rem;background:linear-gradient(135deg,#7B1FA2,#AB47BC);color:white;padding:0.15rem 0.6rem;border-radius:50px;font-size:0.7rem;font-weight:700;margin-top:0.3rem">✨ Gemini AI</span>' : '<span style="display:inline-flex;background:#f0f0f0;color:#666;padding:0.15rem 0.6rem;border-radius:50px;font-size:0.7rem;margin-top:0.3rem">📊 Rule-based</span>'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:1rem">
        <span style="font-size:0.82rem;font-weight:600;white-space:nowrap">Confidence: ${r.confidence}%</span>
        <div style="flex:1;height:8px;background:rgba(0,0,0,0.1);border-radius:4px;overflow:hidden">
          <div id="conf-fill" style="height:100%;width:0%;background:${col};border-radius:4px;transition:width 1s ease"></div>
        </div>
      </div>
      <div style="font-size:0.85rem;margin-bottom:1rem;line-height:1.6"><strong>📍 Disposal:</strong> ${r.disposal_instructions}</div>
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:0.5rem">💡 Eco Tips:</div>
      ${(r.eco_tips || []).map(t => `<div style="display:flex;gap:0.5rem;font-size:0.82rem;margin-bottom:0.4rem;line-height:1.5">✅ <span>${t}</span></div>`).join('')}
      <button class="btn btn-sm btn-green" style="margin-top:1rem;width:100%" onclick="navigateTo('new-request')">+ Schedule Pickup Now</button>
    </div>`;
  setTimeout(() => {
    const fill = document.getElementById('conf-fill');
    if (fill) fill.style.width = r.confidence + '%';
  }, 100);
}

// ==================== AI: SMART RECOMMENDATIONS ====================
async function renderAIRecommend() {
  const data = await api('GET', '/ai/recommendations');
  if (!data.success) {
    document.getElementById('content-area').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load recommendations</h3><p>Please try again later.</p></div>';
    return;
  }
  const recs = data.recommendations || [];
  document.getElementById('content-area').innerHTML = `
    <div style="max-width:700px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1B5E20,#2E7D32);border-radius:var(--radius-lg);padding:2rem;color:white;margin-bottom:1.5rem" class="fade-in">
        <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:0.5rem">💡 Smart Pickup Recommendations</h2>
        <p style="opacity:0.9;font-size:0.88rem">AI analyzed your history and local demand patterns to suggest the best pickup times for you.</p>
        <div style="display:flex;gap:2.5rem;margin-top:1.2rem;flex-wrap:wrap">
          <div><div style="font-size:1.6rem;font-weight:800">${data.total_requests}</div><div style="font-size:0.78rem;opacity:0.8">Your Total Requests</div></div>
          <div><div style="font-size:1.6rem;font-weight:800;text-transform:capitalize">${data.preferred_slot || 'morning'}</div><div style="font-size:0.78rem;opacity:0.8">Preferred Time Slot</div></div>
          <div><div style="font-size:1.6rem;font-weight:800">${data.available_vehicles}</div><div style="font-size:0.78rem;opacity:0.8">Vehicles Available Now</div></div>
        </div>
      </div>

      <div style="background:linear-gradient(135deg,#F3E5F5,#EDE7F6);border:1px solid #CE93D8;border-radius:var(--radius);padding:1rem 1.2rem;font-size:0.88rem;color:#4A148C;display:flex;align-items:center;gap:0.8rem;margin-bottom:1.5rem" class="fade-in delay-1">
        🤖 <span>${data.eco_insight}</span>
      </div>

      <h3 style="font-weight:700;margin-bottom:1rem;font-size:1rem" class="fade-in delay-1">📅 Recommended Pickup Dates</h3>
      ${recs.map((r, i) => `
        <div class="rec-card fade-in delay-${i+2}">
          <div class="rec-score">${r.score}%</div>
          <div style="flex:1">
            <h4 style="font-size:0.95rem;font-weight:700;margin-bottom:0.3rem">${r.day} · ${formatDate(r.date)}</h4>
            <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.5">⏰ ${capitalize(r.time_slot)} slot &nbsp;·&nbsp; ${r.reason}</p>
          </div>
          <button class="btn btn-sm btn-green" onclick="bookRecommended('${r.date}','${r.time_slot}')">Book This</button>
        </div>`).join('')}
    </div>`;
}

function bookRecommended(date, slot) {
  navigateTo('new-request');
  setTimeout(() => {
    const d = document.getElementById('req-date');
    const t = document.getElementById('req-time');
    if (d) d.value = date;
    if (t) t.value = slot;
    showToast('success', 'Date Pre-filled!', 'AI recommendation applied. Fill in the remaining details.');
  }, 700);
}

// ==================== AI: ANALYTICS (Admin) ====================
async function renderAIAnalytics() {
  const data = await api('GET', '/ai/analytics');
  if (!data.success) {
    document.getElementById('content-area').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load analytics</h3></div>';
    return;
  }
  const catColors = { biodegradable:'#2E7D32', recyclable:'#1565C0', hazardous:'#E65100', general:'#616161' };
  const statusColors = { pending:'#F57F17', confirmed:'#1565C0', assigned:'#4527A0', in_progress:'#006064', completed:'#1B5E20', cancelled:'#B71C1C' };
  const statusTotal = (data.status_stats || []).reduce((s,c) => s + c.count, 0) || 1;
  const catTotal = (data.category_stats || []).reduce((s,c) => s + (c.requests || 0), 0) || 1;

  document.getElementById('content-area').innerHTML = `
    <div style="background:linear-gradient(135deg,#F3E5F5,#EDE7F6);border:1px solid #CE93D8;border-radius:var(--radius);padding:1rem 1.2rem;font-size:0.88rem;color:#4A148C;display:flex;align-items:center;gap:0.8rem;margin-bottom:1.5rem" class="fade-in">
      🤖 <span>${data.ai_insight}</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem">
      <div class="card fade-in delay-1">
        <h3 style="font-weight:700;margin-bottom:1.2rem;font-size:1rem">♻️ Waste by Category</h3>
        ${(data.category_stats || []).length > 0
          ? (data.category_stats || []).map(c => `
            <div style="margin-bottom:0.9rem">
              <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.3rem">
                <span style="text-transform:capitalize;font-weight:600">${c.category}</span>
                <span style="color:var(--text-muted)">${c.requests} requests</span>
              </div>
              <div style="height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden">
                <div class="progress-fill" data-w="${Math.round((c.requests||0)/catTotal*100)}" style="width:0%;height:100%;border-radius:5px;background:${catColors[c.category]||'#666'};transition:width 1.2s ease"></div>
              </div>
            </div>`).join('')
          : '<p style="color:var(--text-muted);font-size:0.88rem">No data yet — submit pickup requests to see breakdown.</p>'}
      </div>
      <div class="card fade-in delay-2">
        <h3 style="font-weight:700;margin-bottom:1.2rem;font-size:1rem">📊 Request Status Distribution</h3>
        ${(data.status_stats || []).length > 0
          ? (data.status_stats || []).map(s => `
            <div style="margin-bottom:0.9rem">
              <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.3rem">
                <span style="font-weight:600">${formatStatus(s.status)}</span>
                <span style="color:var(--text-muted)">${s.count} (${Math.round(s.count/statusTotal*100)}%)</span>
              </div>
              <div style="height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden">
                <div class="progress-fill" data-w="${Math.round(s.count/statusTotal*100)}" style="width:0%;height:100%;border-radius:5px;background:${statusColors[s.status]||'#999'};transition:width 1.2s ease"></div>
              </div>
            </div>`).join('')
          : '<p style="color:var(--text-muted);font-size:0.88rem">No requests yet.</p>'}
      </div>
    </div>

    <div class="card fade-in delay-3" style="margin-bottom:1.5rem">
      <h3 style="font-weight:700;margin-bottom:1.2rem;font-size:1rem">🔮 7-Day AI Demand Forecast</h3>
      <div style="display:flex;align-items:flex-end;gap:8px;height:130px;padding-bottom:0.5rem">
        ${(data.forecast || []).map(f => {
          const maxF = Math.max(...(data.forecast || []).map(x=>x.predicted_requests), 1);
          const h = Math.max(8, Math.round((f.predicted_requests / maxF) * 100));
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0.3rem">
            <span style="font-size:0.7rem;color:var(--text-muted);font-weight:600">${f.predicted_requests}</span>
            <div style="width:100%;height:${h}%;background:linear-gradient(180deg,var(--primary),var(--secondary));border-radius:6px 6px 0 0;transition:height 1s ease;min-height:6px" title="${f.date}"></div>
            <span style="font-size:0.7rem;color:var(--text-muted);font-weight:600">${f.day}</span>
          </div>`;
        }).join('')}
      </div>
      <p style="font-size:0.75rem;color:var(--text-light);text-align:center;margin-top:0.5rem">Predicted daily request count based on historical patterns</p>
    </div>

    <div class="card fade-in delay-4">
      <h3 style="font-weight:700;margin-bottom:1.2rem;font-size:1rem">⏰ Pickup Time Slot Popularity</h3>
      ${(data.slot_stats || []).length > 0 ? `
        <div style="display:flex;gap:1rem;flex-wrap:wrap">
          ${(() => {
            const slotTotal = (data.slot_stats||[]).reduce((a,b)=>a+b.count,0)||1;
            const icons = {morning:'🌅',afternoon:'☀️',evening:'🌆'};
            return (data.slot_stats||[]).map(s => `
              <div style="flex:1;min-width:100px;background:#f9f9f9;border-radius:var(--radius);padding:1.2rem;text-align:center;border:1px solid var(--border)">
                <div style="font-size:1.8rem;margin-bottom:0.4rem">${icons[s.preferred_time_slot]||'⏰'}</div>
                <div style="font-weight:700;font-size:0.9rem;text-transform:capitalize">${s.preferred_time_slot}</div>
                <div style="font-size:1.4rem;font-weight:800;color:var(--primary);margin:0.2rem 0">${Math.round(s.count/slotTotal*100)}%</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${s.count} pickups</div>
              </div>`).join('');
          })()}
        </div>` : '<p style="color:var(--text-muted);font-size:0.88rem">No pickup data yet — schedule pickups to see slot trends.</p>'}
    </div>`;

  setTimeout(() => {
    document.querySelectorAll('.progress-fill[data-w]').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
  }, 200);
}

// ==================== AI: CHATBOT ====================
function initChatbot() {
  const msgs = document.getElementById('chat-messages');
  if (!msgs || msgs.children.length > 0) return;
  appendBotMsg("Hi there! 👋 I'm **EcoBot**, your AI waste management assistant!\n\nI can help with:\n♻️ Waste disposal methods\n📅 Scheduling & tracking pickups\n🌍 Eco-friendly tips\n🤖 Using the AI waste classifier\n\nWhat would you like to know?");
}

function toggleChat() {
  const win = document.getElementById('chat-window');
  if (!win) return;
  win.classList.toggle('open');
  if (win.classList.contains('open')) {
    const inp = document.getElementById('chat-input');
    if (inp) setTimeout(() => inp.focus(), 200);
  }
}

function appendBotMsg(text) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
  div.innerHTML = `<div class="chat-bubble">${html}</div><div class="chat-time">${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendUserMsg(text) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg user';
  div.innerHTML = `<div class="chat-bubble">${text}</div><div class="chat-time">${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTypingIndicator() {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.id = 'chat-typing-indicator';
  div.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function sendSuggestion(el) {
  // Strip leading emoji + space from suggestion text
  const msg = el.textContent.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}️\s]+/u, '').trim() || el.textContent.trim();
  document.getElementById('chat-input').value = msg;
  const sugg = document.getElementById('chat-suggestions');
  if (sugg) sugg.style.display = 'none';
  sendChat();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendUserMsg(msg);
  const sugg = document.getElementById('chat-suggestions');
  if (sugg) sugg.style.display = 'none';
  const typing = showTypingIndicator();
  try {
    const data = await api('POST', '/ai/chat', { message: msg });
    if (typing) typing.remove();
    appendBotMsg(data.success ? data.response : "Sorry, I'm having trouble responding right now. Please try again! 🙏");
  } catch {
    if (typing) typing.remove();
    appendBotMsg("Connection error. Please check your internet and try again.");
  }
}

// ==================== HELPER ====================
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
