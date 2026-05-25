// State
let sessionId = null;
let allAnalyses = [];
let charts = {};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await initSession();
  await loadExamples();
  setupEventListeners();
  updateExportCount();
});

async function initSession() {
  try {
    const r = await fetch('/api/session-init');
    const d = await r.json();
    sessionId = d.session_id;
    document.getElementById('sessionDisplay').textContent = sessionId.slice(0, 8) + '…' + sessionId.slice(-4);
  } catch(e) {
    showToast('Failed to initialize session', 'error');
  }
}

// ===== NAVIGATION =====
function setupEventListeners() {
  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
      // mobile close
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('overlay').classList.remove('show');
    });
  });

  // Hamburger
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
  });
  document.getElementById('overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
  });

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Char count
  document.getElementById('msgInput').addEventListener('input', function() {
    const len = this.value.length;
    document.getElementById('charCount').textContent = `${len.toLocaleString()} / 10,000`;
    if(len > 9000) document.getElementById('charCount').style.color = '#ef4444';
    else document.getElementById('charCount').style.color = '';
  });

  // Drag and drop CSV
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if(file) processCsvFile(file);
  });
}

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const viewEl = document.getElementById('view-' + name);
  if(viewEl) viewEl.classList.add('active');
  const navEl = document.querySelector(`[data-view="${name}"]`);
  if(navEl) navEl.classList.add('active');

  const titles = {
    dashboard: 'Dashboard', analysis: 'Single Analysis', batch: 'Batch Upload',
    analytics: 'Analytics', examples: 'Example Library', export: 'Export Report'
  };
  document.getElementById('topbarTitle').textContent = titles[name] || name;

  if(name === 'dashboard') refreshDashboard();
  if(name === 'analytics') refreshAnalytics();
  if(name === 'export') updateExportCount();
}

function toggleTheme() {
  const body = document.body;
  const isLight = body.classList.toggle('light');
  document.getElementById('themeIcon').className = isLight ? 'fas fa-sun' : 'fas fa-moon';
  document.getElementById('themeLabel').textContent = isLight ? 'Light mode' : 'Dark mode';
  // Redraw charts
  Object.values(charts).forEach(c => { if(c) c.destroy(); });
  charts = {};
  if(document.getElementById('view-dashboard').classList.contains('active')) refreshDashboard();
}

// ===== ANALYSIS =====
async function runAnalysis() {
  const msg = document.getElementById('msgInput').value.trim();
  if(!msg) { showToast('Please paste a message to analyze', 'error'); return; }
  if(msg.length > 10000) { showToast('Message too long (max 10,000 characters)', 'error'); return; }

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  document.getElementById('reportCard').style.display = 'none';
  document.getElementById('loadingCard').style.display = 'block';

  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ message_text: msg, session_id: sessionId })
    });
    const data = await r.json();

    document.getElementById('loadingCard').style.display = 'none';

    if(data.error) {
      showToast('Analysis failed: ' + data.error, 'error');
    } else {
      allAnalyses.push(data);
      renderReport(data);
      document.getElementById('reportCard').style.display = 'block';
      showToast('Analysis complete', 'success');
    }
  } catch(e) {
    document.getElementById('loadingCard').style.display = 'none';
    showToast('Network error. Please try again.', 'error');
  }
  btn.disabled = false;
}

function renderReport(d) {
  // Risk badge
  const rb = document.getElementById('reportRisk');
  rb.textContent = (d.risk_level || 'UNKNOWN').toUpperCase();
  rb.className = 'risk-badge risk-' + (d.risk_level || 'medium');

  // Timestamp
  document.getElementById('reportMeta').textContent = 'Generated ' + new Date().toLocaleTimeString();

  // Gauge
  drawGauge(d.exploitability_score || 0);
  document.getElementById('gaugeNum').textContent = d.exploitability_score || 0;

  // Category
  document.getElementById('reportCategory').textContent = formatCategory(d.attack_category);

  // Confidence
  document.getElementById('reportConfidence').textContent = (d.confidence_score || 0) + '%';

  // MITRE
  const mitreEl = document.getElementById('reportMitre');
  mitreEl.innerHTML = (d.mitre_attack_mapping || []).map(t =>
    `<span class="mitre-tag">${t}</span>`
  ).join('');

  // Triggers
  const triggersEl = document.getElementById('reportTriggers');
  triggersEl.innerHTML = (d.psychological_triggers || []).map(t =>
    `<span class="trigger-tag t-${t}">${t.replace(/_/g,' ')}</span>`
  ).join('');

  // Indicators
  const indEl = document.getElementById('reportIndicators');
  indEl.innerHTML = (d.technical_indicators || []).map(i =>
    `<li>${i.replace(/_/g,' ')}</li>`
  ).join('') || '<li>No specific indicators detected</li>';

  // Narrative
  document.getElementById('reportNarrative').textContent = d.narrative_summary || '';

  // Defense
  document.getElementById('reportUserDefense').textContent = d.defense_for_user || '';
  document.getElementById('reportITDefense').textContent = d.defense_for_it || '';

  // Open first collapsible
  document.querySelectorAll('.collapsible-label').forEach((lbl, i) => {
    if(i === 0) {
      lbl.classList.add('open');
      lbl.nextElementSibling.classList.add('open');
    } else {
      lbl.classList.remove('open');
      lbl.nextElementSibling.classList.remove('open');
    }
  });
}

function toggleBlock(lbl) {
  lbl.classList.toggle('open');
  lbl.nextElementSibling.classList.toggle('open');
}

function drawGauge(score) {
  const canvas = document.getElementById('gaugeCanvas');
  const ctx = canvas.getContext('2d');
  const cx = 60, cy = 60, r = 50, lw = 10;
  ctx.clearRect(0, 0, 120, 120);

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Fill
  const pct = score / 100;
  const color = score >= 75 ? '#ef4444' : score >= 50 ? '#f59e0b' : '#22c55e';
  const angle = Math.PI * 0.75 + pct * Math.PI * 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function formatCategory(cat) {
  if(!cat) return '—';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ===== DASHBOARD =====
function refreshDashboard() {
  const analyses = allAnalyses.filter(a => !a.error);
  const empty = document.getElementById('dashboard-empty');

  if(analyses.length === 0) {
    empty.style.display = 'block';
    document.querySelector('.stats-row').style.opacity = '0.3';
    document.querySelector('.charts-grid').style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  document.querySelector('.stats-row').style.opacity = '1';
  document.querySelector('.charts-grid').style.display = 'grid';

  // Stats
  document.getElementById('stat-total').textContent = analyses.length;
  const avgScore = Math.round(analyses.reduce((s, a) => s + (a.exploitability_score || 0), 0) / analyses.length);
  document.getElementById('stat-avg').textContent = avgScore;

  const triggerCounts = {};
  analyses.forEach(a => (a.psychological_triggers || []).forEach(t => triggerCounts[t] = (triggerCounts[t]||0)+1));
  const topTrigger = Object.entries(triggerCounts).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('stat-trigger').textContent = topTrigger ? topTrigger[0].replace(/_/g,' ') : '—';

  const isDark = !document.body.classList.contains('light');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  // Triggers chart
  const trigSorted = Object.entries(triggerCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(charts.triggers) charts.triggers.destroy();
  const tCtx = document.getElementById('triggersChart').getContext('2d');
  charts.triggers = new Chart(tCtx, {
    type: 'bar',
    data: {
      labels: trigSorted.map(([t]) => t.replace(/_/g,' ')),
      datasets: [{ data: trigSorted.map(([,v]) => v), backgroundColor: ['#ef4444','#f59e0b','#3b82f6','#8b5cf6','#22c55e','#06b6d4'], borderRadius: 4 }]
    },
    options: { plugins:{legend:{display:false}}, scales:{x:{ticks:{color:textColor,font:{size:10}},grid:{color:gridColor}},y:{ticks:{color:textColor,font:{size:10}},grid:{color:gridColor}}}, maintainAspectRatio:false }
  });

  // Categories doughnut
  const catCounts = {};
  analyses.forEach(a => { const c = a.attack_category||'unknown'; catCounts[c]=(catCounts[c]||0)+1; });
  const catSorted = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(charts.cats) charts.cats.destroy();
  const cCtx = document.getElementById('categoriesChart').getContext('2d');
  charts.cats = new Chart(cCtx, {
    type: 'doughnut',
    data: {
      labels: catSorted.map(([c]) => formatCategory(c)),
      datasets: [{ data: catSorted.map(([,v]) => v), backgroundColor: ['#3b82f6','#8b5cf6','#ef4444','#f59e0b','#22c55e','#06b6d4'], borderWidth: 0 }]
    },
    options: { plugins:{legend:{position:'bottom',labels:{color:textColor,font:{size:10},padding:8,boxWidth:10}}}, cutout:'65%', maintainAspectRatio:false }
  });

  // Risk pie
  const riskMap = {low:0,medium:0,high:0,critical:0};
  analyses.forEach(a => { const r=a.risk_level||'medium'; riskMap[r]=(riskMap[r]||0)+1; });
  const riskData = Object.entries(riskMap).filter(([,v])=>v>0);
  const riskColors = {low:'#22c55e',medium:'#f59e0b',high:'#ef4444',critical:'#dc2626'};
  if(charts.risk) charts.risk.destroy();
  const rCtx = document.getElementById('riskChart').getContext('2d');
  charts.risk = new Chart(rCtx, {
    type: 'pie',
    data: {
      labels: riskData.map(([k]) => k),
      datasets: [{ data: riskData.map(([,v]) => v), backgroundColor: riskData.map(([k]) => riskColors[k]||'#64748b'), borderWidth: 0 }]
    },
    options: { plugins:{legend:{position:'bottom',labels:{color:textColor,font:{size:10},padding:8,boxWidth:10}}}, maintainAspectRatio:false }
  });
}

// ===== ANALYTICS =====
function refreshAnalytics() {
  const analyses = allAnalyses.filter(a => !a.error);
  const empty = document.getElementById('analytics-empty');
  const grid = document.querySelector('.analytics-grid');

  if(analyses.length === 0) {
    empty.style.display = 'block';
    grid.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = 'grid';

  document.getElementById('an-total').textContent = analyses.length;
  const avg = Math.round(analyses.reduce((s,a) => s + (a.exploitability_score||0), 0) / analyses.length);
  document.getElementById('an-avg').textContent = avg;

  const trigCounts = {};
  analyses.forEach(a => (a.psychological_triggers||[]).forEach(t => trigCounts[t]=(trigCounts[t]||0)+1));
  const trigSorted = Object.entries(trigCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxCount = trigSorted[0] ? trigSorted[0][1] : 1;
  document.getElementById('triggerBreakdown').innerHTML = trigSorted.map(([t,c]) =>
    `<div class="tb-row"><span class="tb-name">${t.replace(/_/g,' ')}</span><div class="tb-track"><div class="tb-fill" style="width:${Math.round(c/maxCount*100)}%"></div></div><span class="tb-count">${c}</span></div>`
  ).join('') || '<p style="color:var(--muted);font-size:13px">No data</p>';

  const catCounts = {};
  analyses.forEach(a => { const c=a.attack_category||'unknown'; catCounts[c]=(catCounts[c]||0)+1; });
  document.getElementById('catBreakdown').innerHTML = Object.entries(catCounts).map(([c,n]) =>
    `<span class="cat-chip">${formatCategory(c)} <span>${n}</span></span>`
  ).join('');
}

// ===== BATCH UPLOAD =====
function handleCsvUpload(input) {
  if(input.files[0]) processCsvFile(input.files[0]);
}

async function processCsvFile(file) {
  if(!file.name.endsWith('.csv')) { showToast('Please upload a CSV file', 'error'); return; }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('session_id', sessionId);

  document.getElementById('batchResults').style.display = 'none';
  document.getElementById('batchLoading').style.display = 'block';
  document.getElementById('batchLoadingText').textContent = 'Uploading and processing…';

  try {
    const r = await fetch('/api/batch-analyze', { method: 'POST', body: formData });
    const data = await r.json();

    document.getElementById('batchLoading').style.display = 'none';

    if(data.error) {
      showToast('Batch error: ' + data.error, 'error');
      return;
    }

    data.results.forEach(res => { if(!res.error) allAnalyses.push(res); });
    renderBatchResults(data.results);
    showToast(`${data.results.filter(r=>!r.error).length} messages analyzed`, 'success');
  } catch(e) {
    document.getElementById('batchLoading').style.display = 'none';
    showToast('Network error during batch upload', 'error');
  }
}

function renderBatchResults(results) {
  const ok = results.filter(r=>!r.error);
  document.getElementById('batchSummary').textContent = `${ok.length} of ${results.length} messages analyzed successfully`;
  const listEl = document.getElementById('batchList');
  listEl.innerHTML = results.map(r => {
    if(r.error) return `<div class="batch-item"><span class="batch-msg" style="color:#ef4444">Error: ${r.error}</span></div>`;
    const scoreColor = r.exploitability_score >= 70 ? 'risk-high' : r.exploitability_score >= 40 ? 'risk-medium' : 'risk-low';
    return `<div class="batch-item">
      <span class="batch-msg">${r.original_message || '—'}</span>
      <span class="batch-cat">${formatCategory(r.attack_category)}</span>
      <span class="batch-score risk-badge ${scoreColor}">${r.exploitability_score}</span>
    </div>`;
  }).join('');
  document.getElementById('batchResults').style.display = 'block';
}

// ===== EXAMPLES =====
async function loadExamples() {
  try {
    const r = await fetch('/api/examples');
    const examples = await r.json();
    const grid = document.getElementById('examplesGrid');
    grid.innerHTML = examples.map(ex => `
      <div class="example-card">
        <div class="ex-cat">${ex.category}</div>
        <div class="ex-title">${ex.title}</div>
        <div class="ex-preview">${ex.message}</div>
        <button class="ex-btn" onclick="loadExample(${JSON.stringify(ex.message).replace(/"/g,'&quot;')})">
          <i class="fas fa-microscope"></i> Load &amp; Analyze
        </button>
      </div>
    `).join('');
  } catch(e) {
    console.error('Failed to load examples', e);
  }
}

function loadExample(msg) {
  document.getElementById('msgInput').value = msg;
  document.getElementById('charCount').textContent = msg.length + ' / 10,000';
  switchView('analysis');
  showToast('Example loaded — click Analyze Threat', 'info');
  document.getElementById('reportCard').style.display = 'none';
}

// ===== EXPORT PDF =====
function updateExportCount() {
  const n = allAnalyses.filter(a=>!a.error).length;
  document.getElementById('exportCount').textContent = n + ' ' + (n === 1 ? 'analysis' : 'analyses');
}

function generatePDF() {
  const analyses = allAnalyses.filter(a=>!a.error);
  if(analyses.length === 0) { showToast('No analyses to export yet', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = 210, ml = 20, mr = 20, usable = pw - ml - mr;
  let y = 20;

  const addText = (text, size, color, x, wrap) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    if(wrap) {
      const lines = doc.splitTextToSize(String(text), wrap);
      doc.text(lines, x, y);
      y += lines.length * (size * 0.4) + 2;
    } else {
      doc.text(String(text), x, y);
    }
  };

  const checkPage = (needed) => {
    if(y + needed > 275) { doc.addPage(); y = 20; }
  };

  // Header
  doc.setFillColor(14, 17, 23);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 210, 36, 'F');
  doc.setFontSize(18); doc.setTextColor(255,255,255);
  doc.text('clickme.exe', ml, 16);
  doc.setFontSize(10); doc.setTextColor(180,200,230);
  doc.text('Social Engineering Forensics Report', ml, 24);
  doc.text('Generated: ' + new Date().toLocaleString(), ml, 31);
  y = 48;

  // Summary
  const avgScore = Math.round(analyses.reduce((s,a)=>s+(a.exploitability_score||0),0)/analyses.length);
  doc.setFontSize(12); doc.setTextColor(59,130,246);
  doc.text('SESSION SUMMARY', ml, y); y += 8;
  doc.setFontSize(10); doc.setTextColor(200,210,220);
  doc.text(`Total analyses: ${analyses.length}`, ml, y); y += 6;
  doc.text(`Average exploitability score: ${avgScore}/100`, ml, y); y += 6;
  const highRisk = analyses.filter(a=>a.risk_level==='high'||a.risk_level==='critical').length;
  doc.text(`High/critical risk messages: ${highRisk}`, ml, y); y += 14;

  // Each analysis
  analyses.forEach((a, i) => {
    checkPage(50);
    doc.setFillColor(20, 28, 40);
    doc.roundedRect(ml-2, y-4, usable+4, 8, 2, 2, 'F');
    doc.setFontSize(11); doc.setTextColor(59,130,246);
    doc.text(`Analysis ${i+1}: ${formatCategory(a.attack_category)}`, ml, y+2); y += 10;

    const riskColors = {low:[34,197,94],medium:[245,158,11],high:[239,68,68],critical:[220,38,38]};
    const rc = riskColors[a.risk_level]||[100,100,100];
    doc.setFontSize(10); doc.setTextColor(...rc);
    doc.text(`Risk: ${(a.risk_level||'').toUpperCase()}  |  Score: ${a.exploitability_score}/100  |  Confidence: ${a.confidence_score}%`, ml, y); y += 8;

    if(a.psychological_triggers?.length) {
      doc.setTextColor(150,163,180);
      doc.text('Triggers: ' + a.psychological_triggers.join(', '), ml, y, {maxWidth: usable}); y += 7;
    }
    if(a.mitre_attack_mapping?.length) {
      doc.text('MITRE: ' + a.mitre_attack_mapping.join(', '), ml, y); y += 7;
    }

    checkPage(20);
    doc.setTextColor(180,190,200);
    const narLines = doc.splitTextToSize(a.narrative_summary||'', usable);
    doc.text(narLines, ml, y); y += narLines.length * 5 + 6;

    checkPage(20);
    doc.setTextColor(100,130,180);
    doc.text('User defense:', ml, y); y += 5;
    doc.setTextColor(160,175,190);
    const udLines = doc.splitTextToSize(a.defense_for_user||'', usable);
    doc.text(udLines, ml, y); y += udLines.length * 5 + 4;

    doc.setTextColor(139,92,246);
    doc.text('IT/SOC defense:', ml, y); y += 5;
    doc.setTextColor(160,175,190);
    const itLines = doc.splitTextToSize(a.defense_for_it||'', usable);
    doc.text(itLines, ml, y); y += itLines.length * 5 + 10;

    doc.setFillColor(30,40,55);
    doc.rect(ml, y, usable, 0.5, 'F');
    y += 8;
  });

  // Footer
  doc.setFontSize(8); doc.setTextColor(80,100,120);
  doc.text('clickme.exe — Defensive use only. No data was stored.', ml, 285);

  doc.save(`clickme-exe-report-${Date.now()}.pdf`);
  showToast('PDF report downloaded', 'success');
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
  const icons = { error: 'fa-circle-exclamation', success: 'fa-circle-check', info: 'fa-circle-info' };
  const colors = { error: '#ef4444', success: '#22c55e', info: '#3b82f6' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type]}" style="color:${colors[type]}"></i> ${msg}`;
  document.getElementById('toasts').appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateX(20px)'; toast.style.transition='all 0.3s'; setTimeout(()=>toast.remove(), 300); }, 3500);
}