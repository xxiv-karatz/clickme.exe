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

  // ESC closes batch detail modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBatchDetailModal();
  });

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

// Store batch results for modal access
let batchResultsStore = [];

function renderBatchResults(results) {
  batchResultsStore = results;
  const ok = results.filter(r=>!r.error);
  document.getElementById('batchSummary').textContent = `${ok.length} of ${results.length} messages analyzed successfully`;
  const listEl = document.getElementById('batchList');
  listEl.innerHTML = results.map((r, i) => {
    if(r.error) return `<div class="batch-item"><span class="batch-msg" style="color:#ef4444">Error: ${r.error}</span></div>`;
    const scoreColor = r.exploitability_score >= 70 ? 'risk-high' : r.exploitability_score >= 40 ? 'risk-medium' : 'risk-low';
    return `<div class="batch-item">
      <span class="batch-msg">${r.original_message || '—'}</span>
      <span class="batch-cat">${formatCategory(r.attack_category)}</span>
      <span class="batch-score risk-badge ${scoreColor}">${r.exploitability_score}</span>
      <button class="btn-view-details" onclick="openBatchDetailModal(${i})">
        <i class="fas fa-magnifying-glass"></i> Details
      </button>
    </div>`;
  }).join('');
  document.getElementById('batchResults').style.display = 'block';
}

function openBatchDetailModal(idx) {
  const d = batchResultsStore[idx];
  if(!d || d.error) return;

  // Populate modal fields
  const rb = document.getElementById('modalRisk');
  rb.textContent = (d.risk_level || 'UNKNOWN').toUpperCase();
  rb.className = 'risk-badge risk-' + (d.risk_level || 'medium');

  document.getElementById('modalMsgPreview').textContent = d.original_message || '—';
  document.getElementById('modalCategory').textContent = formatCategory(d.attack_category);
  document.getElementById('modalConfidence').textContent = (d.confidence_score || 0) + '%';
  document.getElementById('modalScore').textContent = d.exploitability_score || 0;

  // Mini gauge
  drawModalGauge(d.exploitability_score || 0);

  document.getElementById('modalMitre').innerHTML = (d.mitre_attack_mapping || []).map(t =>
    `<span class="mitre-tag">${t}</span>`).join('') || '<span style="color:var(--muted)">None</span>';

  document.getElementById('modalTriggers').innerHTML = (d.psychological_triggers || []).map(t =>
    `<span class="trigger-tag t-${t}">${t.replace(/_/g,' ')}</span>`).join('') || '<span style="color:var(--muted)">None detected</span>';

  document.getElementById('modalIndicators').innerHTML = (d.technical_indicators || []).map(i =>
    `<li>${i.replace(/_/g,' ')}</li>`).join('') || '<li>No specific indicators</li>';

  document.getElementById('modalNarrative').textContent = d.narrative_summary || '';
  document.getElementById('modalUserDefense').textContent = d.defense_for_user || '';
  document.getElementById('modalITDefense').textContent = d.defense_for_it || '';

  document.getElementById('batchDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBatchDetailModal() {
  document.getElementById('batchDetailModal').classList.remove('open');
  document.body.style.overflow = '';
}

function drawModalGauge(score) {
  const canvas = document.getElementById('modalGaugeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 60, cy = 60, r = 50, lw = 10;
  ctx.clearRect(0, 0, 120, 120);
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
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

// ===== PDF HELPERS =====
function pdfBg(doc) {
  // Full dark background fill for current page
  doc.setFillColor(11, 15, 25);
  doc.rect(0, 0, 210, 297, 'F');
}

function pdfNewPage(doc) {
  doc.addPage();
  pdfBg(doc);
}

function pdfCheckPage(doc, y, needed) {
  if (y + needed > 280) {
    pdfNewPage(doc);
    return 20;
  }
  return y;
}

function pdfSectionLabel(doc, text, x, y) {
  doc.setFontSize(7.5);
  doc.setTextColor(59, 130, 246);
  doc.setFont(undefined, 'bold');
  doc.text(text.toUpperCase(), x, y);
  doc.setFont(undefined, 'normal');
  return y + 5;
}

function pdfHRule(doc, x, y, w) {
  doc.setFillColor(30, 42, 62);
  doc.rect(x, y, w, 0.4, 'F');
  return y + 5;
}

function pdfScoreBar(doc, score, x, y, w) {
  const color = score >= 75 ? [239,68,68] : score >= 50 ? [245,158,11] : [34,197,94];
  doc.setFillColor(25, 35, 52);
  doc.roundedRect(x, y, w, 4, 1, 1, 'F');
  const filled = Math.max(2, (score / 100) * w);
  doc.setFillColor(...color);
  doc.roundedRect(x, y, filled, 4, 1, 1, 'F');
  return y + 7;
}

// Render a mini gauge to an offscreen canvas and return base64
function renderGaugeToBase64(score, size = 100) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  // Dark bg
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, size, size);
  const cx = size/2, cy = size/2, r = size*0.42, lw = size*0.09;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  const color = score >= 75 ? '#ef4444' : score >= 50 ? '#f59e0b' : '#22c55e';
  const angle = Math.PI * 0.75 + (score/100) * Math.PI * 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, angle);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = `bold ${size*0.22}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(score), cx, cy);
  return c.toDataURL('image/png');
}

// Render a chart to base64 using a hidden canvas
function renderChartToBase64(type, labels, data, colors, width=300, height=160) {
  return new Promise(resolve => {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);
    const chart = new Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 0, borderRadius: type === 'bar' ? 4 : 0 }]
      },
      options: {
        animation: false,
        plugins: {
          legend: {
            display: type !== 'bar',
            labels: { color: '#94a3b8', font: { size: 10 }, padding: 8, boxWidth: 10 }
          }
        },
        scales: type === 'bar' ? {
          x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
        } : {},
        cutout: type === 'doughnut' ? '60%' : undefined,
        maintainAspectRatio: false
      }
    });
    // Small delay so chart renders
    setTimeout(() => {
      const img = c.toDataURL('image/png');
      chart.destroy();
      resolve(img);
    }, 80);
  });
}

async function generatePDF() {
  const analyses = allAnalyses.filter(a=>!a.error);
  if(analyses.length === 0) { showToast('No analyses to export yet', 'error'); return; }

  showToast('Building PDF report…', 'info');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = 210, ml = 18, mr = 18, usable = pw - ml - mr;

  // ── Page 1: Cover ────────────────────────────────────────────────────
  pdfBg(doc);

  // Accent header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 52, 'F');
  // Left accent stripe
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 5, 52, 'F');

  doc.setFontSize(26); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
  doc.text('clickme.exe', ml + 4, 22);
  doc.setFontSize(11); doc.setTextColor(148,163,184); doc.setFont(undefined,'normal');
  doc.text('Social Engineering Forensics Report', ml + 4, 31);
  doc.setFontSize(9); doc.setTextColor(71,85,105);
  doc.text('Generated: ' + new Date().toLocaleString(), ml + 4, 38);
  doc.text('CONFIDENTIAL — Defensive Use Only', ml + 4, 44);

  // Summary stats row
  let y = 66;
  const avgScore = Math.round(analyses.reduce((s,a)=>s+(a.exploitability_score||0),0)/analyses.length);
  const highRisk = analyses.filter(a=>a.risk_level==='high'||a.risk_level==='critical').length;
  const trigMap = {};
  analyses.forEach(a=>(a.psychological_triggers||[]).forEach(t=>trigMap[t]=(trigMap[t]||0)+1));
  const topTrig = Object.entries(trigMap).sort((a,b)=>b[1]-a[1])[0];

  const statBoxes = [
    { label: 'Total Analysed', value: String(analyses.length), color: [59,130,246] },
    { label: 'Avg Exploit Score', value: avgScore + '/100', color: avgScore>=70?[239,68,68]:avgScore>=45?[245,158,11]:[34,197,94] },
    { label: 'High/Critical', value: String(highRisk), color: [239,68,68] },
    { label: 'Top Trigger', value: topTrig ? topTrig[0].replace(/_/g,' ') : '—', color: [139,92,246] }
  ];
  const boxW = (usable - 9) / 4;
  statBoxes.forEach((sb, i) => {
    const bx = ml + i * (boxW + 3);
    doc.setFillColor(17, 25, 40);
    doc.roundedRect(bx, y, boxW, 20, 2, 2, 'F');
    doc.setFillColor(...sb.color);
    doc.roundedRect(bx, y, boxW, 1.5, 0, 0, 'F');
    doc.setFontSize(14); doc.setTextColor(...sb.color); doc.setFont(undefined,'bold');
    doc.text(sb.value, bx + boxW/2, y + 11, { align: 'center' });
    doc.setFontSize(7); doc.setTextColor(100,116,139); doc.setFont(undefined,'normal');
    doc.text(sb.label.toUpperCase(), bx + boxW/2, y + 17, { align: 'center' });
  });
  y += 28;

  // ── Charts section ──────────────────────────────────────────────────
  y = pdfCheckPage(doc, y, 10);
  doc.setFontSize(9); doc.setTextColor(59,130,246); doc.setFont(undefined,'bold');
  doc.text('SESSION ANALYTICS', ml, y); doc.setFont(undefined,'normal');
  y += 2;
  doc.setFillColor(59,130,246); doc.rect(ml, y, usable, 0.4, 'F');
  y += 6;

  // Build charts in parallel
  const trigSorted = Object.entries(trigMap).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const catMap = {};
  analyses.forEach(a=>{ const c=a.attack_category||'unknown'; catMap[c]=(catMap[c]||0)+1; });
  const catSorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const riskMap = {low:0,medium:0,high:0,critical:0};
  analyses.forEach(a=>{ const r=a.risk_level||'medium'; riskMap[r]=(riskMap[r]||0)+1; });
  const riskData = Object.entries(riskMap).filter(([,v])=>v>0);

  const palette = ['#3b82f6','#8b5cf6','#ef4444','#f59e0b','#22c55e','#06b6d4','#ec4899'];
  const riskColors2 = {low:'#22c55e',medium:'#f59e0b',high:'#ef4444',critical:'#dc2626'};

  const [trigChart, catChart, riskChart] = await Promise.all([
    renderChartToBase64('bar', trigSorted.map(([t])=>t.replace(/_/g,' ')), trigSorted.map(([,v])=>v), palette.slice(0,trigSorted.length), 340, 155),
    renderChartToBase64('doughnut', catSorted.map(([c])=>formatCategory(c)), catSorted.map(([,v])=>v), palette.slice(0,catSorted.length), 220, 155),
    renderChartToBase64('pie', riskData.map(([k])=>k), riskData.map(([,v])=>v), riskData.map(([k])=>riskColors2[k]||'#64748b'), 190, 155)
  ]);

  // Place charts: triggers bar (wider), cats doughnut, risk pie
  const chartH = 42; // mm height
  y = pdfCheckPage(doc, y, chartH + 16);

  // Triggers bar - left 60%
  const trigW = usable * 0.56;
  doc.setFillColor(15, 22, 38);
  doc.roundedRect(ml, y, trigW, chartH + 8, 2, 2, 'F');
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('PSYCHOLOGICAL TRIGGERS', ml + 3, y + 5);
  doc.addImage(trigChart, 'PNG', ml + 2, y + 7, trigW - 4, chartH);

  // Categories doughnut - right top
  const catX = ml + trigW + 4;
  const smallW = usable - trigW - 4;
  doc.setFillColor(15, 22, 38);
  doc.roundedRect(catX, y, smallW, chartH + 8, 2, 2, 'F');
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('ATTACK CATEGORIES', catX + 3, y + 5);
  doc.addImage(catChart, 'PNG', catX + 1, y + 7, smallW - 2, chartH);
  y += chartH + 12;

  // Risk pie - small, beneath right column
  y = pdfCheckPage(doc, y, 36);
  const riskChartW = smallW;
  doc.setFillColor(15, 22, 38);
  doc.roundedRect(catX, y, riskChartW, 34, 2, 2, 'F');
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('RISK DISTRIBUTION', catX + 3, y + 5);
  doc.addImage(riskChart, 'PNG', catX + 1, y + 7, riskChartW - 2, 26);

  // Score distribution bar chart beside risk pie
  const scoreChartW = trigW;
  doc.setFillColor(15, 22, 38);
  doc.roundedRect(ml, y, scoreChartW, 34, 2, 2, 'F');
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('INDIVIDUAL EXPLOITABILITY SCORES', ml + 3, y + 5);
  let sy = y + 10;
  const scoreBarW = scoreChartW - 8;
  analyses.slice(0, 8).forEach((a, i) => {
    const label = `#${i+1} ${formatCategory(a.attack_category)}`.slice(0, 28);
    doc.setFontSize(6.5); doc.setTextColor(148,163,184);
    doc.text(label, ml + 4, sy);
    sy = pdfScoreBar(doc, a.exploitability_score||0, ml + 4, sy + 1, scoreBarW);
    sy += 0.5;
  });

  y += 40;

  // ── Individual Analysis Pages ─────────────────────────────────────
  analyses.forEach((a, idx) => {
    pdfNewPage(doc);
    let y = 0;

    // Analysis header band
    const riskColorMap = {low:[34,197,94],medium:[245,158,11],high:[239,68,68],critical:[220,38,38]};
    const rc = riskColorMap[a.risk_level] || [100,116,139];
    doc.setFillColor(15, 22, 38);
    doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(...rc);
    doc.rect(0, 0, 5, 42, 'F');

    doc.setFontSize(8); doc.setTextColor(...rc); doc.setFont(undefined,'bold');
    doc.text(`ANALYSIS ${idx + 1} OF ${analyses.length}`, ml + 4, 10);
    doc.setFontSize(14); doc.setTextColor(255,255,255);
    doc.text(formatCategory(a.attack_category), ml + 4, 20);
    doc.setFontSize(8); doc.setTextColor(148,163,184); doc.setFont(undefined,'normal');
    doc.text(`Risk: ${(a.risk_level||'').toUpperCase()}   Exploitability: ${a.exploitability_score}/100   Confidence: ${a.confidence_score}%`, ml + 4, 28);
    if (a.original_message) {
      const msgPreview = doc.splitTextToSize('"' + a.original_message + '"', usable - 30);
      doc.setFontSize(7.5); doc.setTextColor(71,85,105); doc.setFont(undefined,'italic');
      doc.text(msgPreview.slice(0,2), ml + 4, 36);
      doc.setFont(undefined,'normal');
    }

    // Gauge image top right
    const gaugeImg = renderGaugeToBase64(a.exploitability_score||0, 120);
    doc.addImage(gaugeImg, 'PNG', 210 - mr - 22, 6, 22, 22);

    y = 50;

    // MITRE tags inline
    if ((a.mitre_attack_mapping||[]).length) {
      doc.setFontSize(7); doc.setTextColor(100,116,139);
      doc.text('MITRE ATT&CK:', ml, y);
      let mx = ml + 24;
      (a.mitre_attack_mapping||[]).forEach(t => {
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(mx - 1, y - 4, t.length * 1.8 + 4, 6, 1, 1, 'F');
        doc.setTextColor(99,179,237); doc.setFontSize(7);
        doc.text(t, mx + 1, y);
        mx += t.length * 1.8 + 7;
      });
      y += 8;
    }

    // Triggers
    y = pdfCheckPage(doc, y, 16);
    y = pdfSectionLabel(doc, 'Psychological Triggers', ml, y);
    let tx = ml;
    const trow = y;
    (a.psychological_triggers||[]).forEach(t => {
      const tw = t.length * 1.9 + 8;
      if (tx + tw > pw - mr) { y += 8; tx = ml; }
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(tx, y - 4.5, tw, 6.5, 1.5, 1.5, 'F');
      doc.setFillColor(59,130,246);
      doc.roundedRect(tx, y - 4.5, 1.5, 6.5, 0, 0, 'F');
      doc.setFontSize(7.5); doc.setTextColor(148,163,184);
      doc.text(t.replace(/_/g,' '), tx + 3, y);
      tx += tw + 3;
    });
    y += 10;

    // Technical indicators
    y = pdfCheckPage(doc, y, 20);
    y = pdfSectionLabel(doc, 'Technical Indicators', ml, y);
    (a.technical_indicators||[]).forEach(ind => {
      y = pdfCheckPage(doc, y, 8);
      doc.setFillColor(20, 30, 48);
      doc.rect(ml, y - 3.5, usable, 5.5, 'F');
      doc.setFillColor(239, 68, 68);
      doc.rect(ml, y - 3.5, 2, 5.5, 'F');
      doc.setFontSize(8); doc.setTextColor(203, 213, 225);
      doc.text(ind.replace(/_/g,' '), ml + 5, y);
      y += 7;
    });
    y += 3;

    // Narrative
    y = pdfCheckPage(doc, y, 24);
    y = pdfSectionLabel(doc, 'Attack Narrative', ml, y);
    doc.setFillColor(14, 20, 34);
    const narLines = doc.splitTextToSize(a.narrative_summary||'', usable - 6);
    doc.roundedRect(ml, y - 3, usable, narLines.length * 5 + 6, 2, 2, 'F');
    doc.setFillColor(99, 102, 241);
    doc.roundedRect(ml, y - 3, 2, narLines.length * 5 + 6, 1, 1, 'F');
    doc.setFontSize(8.5); doc.setTextColor(203, 213, 225);
    doc.text(narLines, ml + 5, y);
    y += narLines.length * 5 + 8;

    // Defense grid (two columns)
    y = pdfCheckPage(doc, y, 36);
    const halfW = (usable - 4) / 2;

    // User defense
    y = pdfSectionLabel(doc, 'User Defense', ml, y);
    const udLines = doc.splitTextToSize(a.defense_for_user||'', halfW - 8);
    const udH = udLines.length * 4.8 + 10;
    doc.setFillColor(14, 20, 34);
    doc.roundedRect(ml, y - 3, halfW, udH, 2, 2, 'F');
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(ml, y - 3, 2, udH, 1, 1, 'F');
    doc.setFontSize(8); doc.setTextColor(167, 243, 208);
    doc.text('For End Users', ml + 5, y + 1);
    doc.setTextColor(148, 163, 184);
    doc.text(udLines, ml + 5, y + 7);

    // IT defense (same row)
    const itX = ml + halfW + 4;
    y = pdfSectionLabel(doc, 'IT / SOC Defense', itX, y - 5) - 0;
    const itLines = doc.splitTextToSize(a.defense_for_it||'', halfW - 8);
    const itH = Math.max(udH, itLines.length * 4.8 + 10);
    doc.setFillColor(14, 20, 34);
    doc.roundedRect(itX, y - 3, halfW, itH, 2, 2, 'F');
    doc.setFillColor(139, 92, 246);
    doc.roundedRect(itX, y - 3, 2, itH, 1, 1, 'F');
    doc.setFontSize(8); doc.setTextColor(196, 181, 253);
    doc.text('For Security Teams', itX + 5, y + 1);
    doc.setTextColor(148, 163, 184);
    doc.text(itLines, itX + 5, y + 7);

    y += Math.max(udH, itH) + 5;

    // Footer line
    doc.setFillColor(22, 32, 52);
    doc.rect(0, 284, 210, 13, 'F');
    doc.setFontSize(7); doc.setTextColor(51,65,85);
    doc.text('clickme.exe — Defensive use only · No data stored · https://clickme-exe.onrender.com', ml, 290);
    doc.text(`Page ${idx + 2}`, 210 - mr, 290, { align: 'right' });
  });

  // Cover page footer
  doc.setPage(1);
  doc.setFillColor(22, 32, 52);
  doc.rect(0, 284, 210, 13, 'F');
  doc.setFontSize(7); doc.setTextColor(51,65,85);
  doc.text('clickme.exe — Defensive use only · No data stored · https://clickme-exe.onrender.com', ml, 290);
  doc.text('Page 1', 210 - mr, 290, { align: 'right' });

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