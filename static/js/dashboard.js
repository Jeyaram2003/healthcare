/* ============================================================
   MedInsight Pro – Dashboard JS
   ============================================================ */

// ── Globals ──────────────────────────────────────────────────
const CHART_COLORS = ['#4f8ef7','#3fb68b','#a78bfa','#fb923c','#f87171','#22d3ee','#f472b6','#818cf8','#fbbf24','#34d399'];
const charts = {};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
  showModule('overview', document.querySelector('.nav-item[data-module="overview"]'));
});

// ── Sidebar toggle ────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── Module routing ────────────────────────────────────────────
function showModule(name, el) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.getElementById('mod-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const labels = {overview:'Overview', patients:'Patient Analytics', revenue:'Revenue Analytics',
    diseases:'Disease Trends', doctors:'Doctor Analytics', resources:'Resource Utilization',
    satisfaction:'Patient Satisfaction', prediction:'Readmission AI', datatable:'Data Table'};
  document.getElementById('breadcrumbText').textContent = labels[name] || name;
  const loaders = {overview:loadOverview, patients:loadPatients, revenue:loadRevenue,
    diseases:loadDiseases, doctors:loadDoctors, resources:loadResources,
    satisfaction:loadSatisfaction, prediction:loadPrediction, datatable:() => loadDataTable(1)};
  if (loaders[name]) loaders[name]();
}

// ── Helpers ───────────────────────────────────────────────────
function showLoader() { document.getElementById('loadingOverlay').classList.add('active'); }
function hideLoader() { document.getElementById('loadingOverlay').classList.remove('active'); }

async function apiFetch(url) {
  const res = await fetch(url);
  return res.json();
}

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function makeChart(id, type, labels, datasets, opts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: '#8b949e', font: { family: 'Inter', size: 11 } } },
        tooltip: {
          backgroundColor: '#161b22',
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          borderColor: '#30363d',
          borderWidth: 1,
        }
      },
      scales: type !== 'pie' && type !== 'doughnut' ? {
        x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } }
      } : {},
      ...opts
    }
  });
}

function tableHTML(columns, rows) {
  if (!rows || !rows.length) return '<p style="color:#8b949e;padding:16px">No data available.</p>';
  const head = columns.map(c => `<th>${c}</th>`).join('');
  const body = rows.map(r => '<tr>' + columns.map(c => `<td>${r[c] ?? '—'}</td>`).join('') + '</tr>').join('');
  return `<div style="overflow-x:auto"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function kpiCard(label, value, icon, cls) {
  return `<div class="kpi-card ${cls}"><div class="kpi-label"><i class="${icon}"></i>${label}</div><div class="kpi-value">${value ?? '—'}</div></div>`;
}

// ── File upload ───────────────────────────────────────────────
async function handleUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('uploadStatus');
  const label  = document.getElementById('uploadLabel');
  status.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      status.textContent = `✓ ${data.filename} (${data.rows} rows)`;
      status.style.color = '#3fb68b';
      label.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Change File';
      Object.keys(charts).forEach(k => destroyChart(k));
      showModule('overview', document.querySelector('.nav-item[data-module="overview"]'));
    } else {
      status.textContent = '✗ ' + data.error;
      status.style.color = '#f87171';
    }
  } catch(e) {
    status.textContent = '✗ Upload failed';
    status.style.color = '#f87171';
  }
  input.value = '';
}

// ── Overview ──────────────────────────────────────────────────
async function loadOverview() {
  showLoader();
  try {
    const d = await apiFetch('/api/overview');
    const kpis = document.getElementById('overviewKPIs');
    kpis.innerHTML =
      kpiCard('Total Patients', d.total_patients?.toLocaleString(), 'fa-solid fa-users', 'blue') +
      kpiCard('Readmission Rate', d.readmission_rate != null ? d.readmission_rate + '%' : 'N/A', 'fa-solid fa-rotate-right', 'red') +
      kpiCard('Bed Occupancy', d.bed_occupancy != null ? d.bed_occupancy + '%' : 'N/A', 'fa-solid fa-bed', 'orange') +
      kpiCard('Avg Treatment Cost', d.avg_cost != null ? '$' + d.avg_cost.toLocaleString() : 'N/A', 'fa-solid fa-dollar-sign', 'purple') +
      (d.avg_satisfaction != null ? kpiCard('Avg Satisfaction', d.avg_satisfaction + ' / 5', 'fa-solid fa-star', 'teal') : '');

    // Dept chart
    if (d.dept_dist) {
      const labels = Object.keys(d.dept_dist), vals = Object.values(d.dept_dist);
      makeChart('deptChart', 'bar', labels, [{ label:'Patients', data:vals, backgroundColor: CHART_COLORS, borderRadius:4 }]);
    }
    // Disease chart
    if (d.disease_dist) {
      const labels = Object.keys(d.disease_dist), vals = Object.values(d.disease_dist);
      makeChart('diseaseChart', 'doughnut', labels, [{ data:vals, backgroundColor: CHART_COLORS }]);
    }
    // Gender chart
    if (d.gender_dist) {
      const labels = Object.keys(d.gender_dist), vals = Object.values(d.gender_dist);
      makeChart('genderChart', 'pie', labels, [{ data:vals, backgroundColor:['#4f8ef7','#f472b6'] }]);
    }
    // Monthly chart
    if (d.monthly_admissions && d.monthly_admissions.length) {
      const labels = d.monthly_admissions.map(r => r._month || r.month || Object.values(r)[0]);
      const vals   = d.monthly_admissions.map(r => r.count || Object.values(r)[1]);
      makeChart('monthlyChart', 'line', labels, [{
        label:'Admissions', data:vals, borderColor:'#4f8ef7', backgroundColor:'rgba(79,142,247,.12)',
        fill:true, tension:.4, pointRadius:3
      }]);
    }
    // Preview table
    if (d.preview && d.columns) {
      document.getElementById('previewTable').innerHTML = tableHTML(d.columns.slice(0,8), d.preview);
    }
  } finally { hideLoader(); }
}

// ── Patients ──────────────────────────────────────────────────
async function loadPatients() {
  showLoader();
  try {
    const d = await apiFetch('/api/patients');
    if (d.age_dist) {
      const labels = Object.keys(d.age_dist), vals = Object.values(d.age_dist);
      makeChart('ageChart', 'bar', labels, [{ label:'Patients', data:vals, backgroundColor:'#4f8ef7', borderRadius:4 }]);
    }
    if (d.gender_dist) {
      makeChart('genderChart2', 'pie', Object.keys(d.gender_dist), [{ data:Object.values(d.gender_dist), backgroundColor:['#4f8ef7','#f472b6'] }]);
    }
    if (d.age_by_dept) {
      const labels = Object.keys(d.age_by_dept), vals = Object.values(d.age_by_dept);
      makeChart('ageByDeptChart', 'bar', labels, [{ label:'Avg Age', data:vals, backgroundColor:CHART_COLORS, borderRadius:4 }]);
    }
    if (d.prev_admissions) {
      const labels = Object.keys(d.prev_admissions).map(k=>'Prev '+k), vals = Object.values(d.prev_admissions);
      makeChart('prevAdmChart', 'bar', labels, [{ label:'Patients', data:vals, backgroundColor:'#a78bfa', borderRadius:4 }]);
    }
  } finally { hideLoader(); }
}

// ── Revenue ───────────────────────────────────────────────────
async function loadRevenue() {
  showLoader();
  try {
    const d = await apiFetch('/api/revenue');
    const kpis = document.getElementById('revenueKPIs');
    kpis.innerHTML =
      kpiCard('Total Revenue', d.total_revenue != null ? '$' + d.total_revenue.toLocaleString() : 'N/A', 'fa-solid fa-chart-line', 'green') +
      kpiCard('Avg Cost', d.avg_cost != null ? '$' + d.avg_cost.toLocaleString() : 'N/A', 'fa-solid fa-dollar-sign', 'blue') +
      kpiCard('Max Cost', d.max_cost != null ? '$' + d.max_cost.toLocaleString() : 'N/A', 'fa-solid fa-arrow-trend-up', 'red') +
      kpiCard('Min Cost', d.min_cost != null ? '$' + d.min_cost.toLocaleString() : 'N/A', 'fa-solid fa-arrow-trend-down', 'teal');

    if (d.cost_by_dept) {
      const labels = Object.keys(d.cost_by_dept), vals = Object.values(d.cost_by_dept);
      makeChart('revDeptChart', 'bar', labels, [{ label:'Revenue ($)', data:vals, backgroundColor:CHART_COLORS, borderRadius:4 }]);
    }
    if (d.cost_by_disease) {
      const labels = Object.keys(d.cost_by_disease), vals = Object.values(d.cost_by_disease);
      makeChart('costDiseaseChart', 'bar', labels, [{ label:'Avg Cost ($)', data:vals, backgroundColor:'#a78bfa', borderRadius:4 }]);
    }
    if (d.insurance_dist) {
      makeChart('insuranceChart', 'pie', Object.keys(d.insurance_dist), [{ data:Object.values(d.insurance_dist), backgroundColor:CHART_COLORS }]);
    }
    if (d.cost_trend && d.cost_trend.length) {
      const labels = d.cost_trend.map(r=>r.month), vals = d.cost_trend.map(r=>r.cost);
      makeChart('costTrendChart', 'line', labels, [{
        label:'Monthly Cost ($)', data:vals, borderColor:'#3fb68b', backgroundColor:'rgba(63,182,139,.1)',
        fill:true, tension:.4, pointRadius:3
      }]);
    }
  } finally { hideLoader(); }
}

// ── Diseases ──────────────────────────────────────────────────
async function loadDiseases() {
  showLoader();
  try {
    const d = await apiFetch('/api/diseases');
    if (d.disease_freq) {
      const labels = Object.keys(d.disease_freq), vals = Object.values(d.disease_freq);
      makeChart('disFreqChart', 'bar', labels, [{ label:'Cases', data:vals, backgroundColor:CHART_COLORS, borderRadius:4 }]);
    }
    if (d.disease_age) {
      const labels = Object.keys(d.disease_age), vals = Object.values(d.disease_age);
      makeChart('disAgeChart', 'bar', labels, [{ label:'Avg Age', data:vals, backgroundColor:'#fb923c', borderRadius:4 }]);
    }
    if (d.disease_trend && d.disease_trend.length) {
      // group by disease
      const months = [...new Set(d.disease_trend.map(r => r._month || r.month || Object.values(r)[0]))].sort();
      const diseases = [...new Set(d.disease_trend.map(r => r.Disease || r.diagnosis || r.disease || Object.values(r)[1]))];
      const datasets = diseases.map((dis, i) => {
        const data = months.map(m => {
          const row = d.disease_trend.find(r => {
            const mo = r._month || r.month || Object.values(r)[0];
            const di = r.Disease || r.diagnosis || r.disease || Object.values(r)[1];
            return mo === m && di === dis;
          });
          return row ? row.cases : 0;
        });
        return { label:dis, data, borderColor:CHART_COLORS[i % CHART_COLORS.length], backgroundColor:'transparent', tension:.4, pointRadius:2 };
      });
      makeChart('disTrendChart', 'line', months, datasets);
    }
  } finally { hideLoader(); }
}

// ── Doctors ───────────────────────────────────────────────────
async function loadDoctors() {
  showLoader();
  try {
    const d = await apiFetch('/api/doctors');
    if (d.error) {
      document.getElementById('doctorWarning').style.display = 'flex';
      return;
    }
    document.getElementById('doctorWarning').style.display = 'none';
    if (d.patients_per_doctor) {
      const labels = Object.keys(d.patients_per_doctor), vals = Object.values(d.patients_per_doctor);
      makeChart('docPatChart', 'bar', labels, [{ label:'Patients', data:vals, backgroundColor:CHART_COLORS, borderRadius:4 }]);
    }
    if (d.sat_by_doctor) {
      const labels = Object.keys(d.sat_by_doctor), vals = Object.values(d.sat_by_doctor);
      makeChart('docSatChart', 'bar', labels, [{ label:'Avg Satisfaction', data:vals, backgroundColor:'#fbbf24', borderRadius:4 }]);
    }
    if (d.los_by_doctor) {
      const labels = Object.keys(d.los_by_doctor), vals = Object.values(d.los_by_doctor);
      makeChart('docLosChart', 'bar', labels, [{ label:'Avg Length of Stay (days)', data:vals, backgroundColor:'#22d3ee', borderRadius:4 }]);
    }
    if (d.cost_by_doctor) {
      const labels = Object.keys(d.cost_by_doctor), vals = Object.values(d.cost_by_doctor);
      makeChart('docCostChart', 'bar', labels, [{ label:'Avg Cost ($)', data:vals, backgroundColor:'#3fb68b', borderRadius:4 }]);
    }
  } finally { hideLoader(); }
}

// ── Resources ─────────────────────────────────────────────────
async function loadResources() {
  showLoader();
  try {
    const d = await apiFetch('/api/resources');
    if (d.bed_status) {
      makeChart('bedChart', 'doughnut', Object.keys(d.bed_status), [{
        data:Object.values(d.bed_status), backgroundColor:['#f87171','#3fb68b']
      }]);
    }
    if (d.occupied_by_dept && Object.keys(d.occupied_by_dept).length) {
      const labels = Object.keys(d.occupied_by_dept), vals = Object.values(d.occupied_by_dept);
      makeChart('occDeptChart', 'bar', labels, [{ label:'Occupied Beds', data:vals, backgroundColor:'#f87171', borderRadius:4 }]);
    }
    if (d.los_by_dept) {
      const labels = Object.keys(d.los_by_dept), vals = Object.values(d.los_by_dept);
      makeChart('losDeptChart', 'bar', labels, [{ label:'Avg Length of Stay (days)', data:vals, backgroundColor:CHART_COLORS, borderRadius:4 }]);
    }
  } finally { hideLoader(); }
}

// ── Satisfaction ──────────────────────────────────────────────
async function loadSatisfaction() {
  showLoader();
  try {
    const d = await apiFetch('/api/satisfaction');
    if (d.error) { hideLoader(); return; }
    if (d.score_dist) {
      const labels = Object.keys(d.score_dist).map(k => 'Score ' + k), vals = Object.values(d.score_dist);
      makeChart('satDistChart', 'bar', labels, [{ label:'Patients', data:vals, backgroundColor:CHART_COLORS, borderRadius:4 }]);
    }
    if (d.sat_by_dept) {
      const labels = Object.keys(d.sat_by_dept), vals = Object.values(d.sat_by_dept);
      makeChart('satDeptChart', 'bar', labels, [{ label:'Avg Satisfaction Score', data:vals, backgroundColor:'#fbbf24', borderRadius:4 }]);
    }
    if (d.sat_trend && d.sat_trend.length) {
      const labels = d.sat_trend.map(r => r.month), vals = d.sat_trend.map(r => r.score);
      makeChart('satTrendChart', 'line', labels, [{
        label:'Avg Satisfaction', data:vals, borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,.1)',
        fill:true, tension:.4, pointRadius:3
      }]);
    }
  } finally { hideLoader(); }
}

// ── Prediction ────────────────────────────────────────────────
async function loadPrediction() {
  showLoader();
  try {
    const d = await fetch('/api/predict_readmission', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'
    }).then(r => r.json());

    if (d.accuracy) document.getElementById('accValue').textContent = d.accuracy + '%';
    if (d.feature_importance) {
      const labels = d.feature_importance.map(f => f.feature);
      const vals   = d.feature_importance.map(f => parseFloat(f.importance.toFixed(3)));
      makeChart('featImpChart', 'bar', labels, [{
        label:'Importance', data:vals, backgroundColor:CHART_COLORS, borderRadius:4
      }]);
    }
    if (d.diagnoses && d.diagnoses.length) {
      const sel = document.getElementById('pred_diag');
      sel.innerHTML = d.diagnoses.map(di => `<option value="${di}">${di}</option>`).join('');
    } else {
      document.getElementById('diagField').style.display = 'none';
    }
  } finally { hideLoader(); }
}

async function runPrediction() {
  const btn = document.querySelector('.btn-predict');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Predicting…';
  btn.disabled = true;
  const body = {
    predict: true,
    age:  parseInt(document.getElementById('pred_age').value),
    los:  parseInt(document.getElementById('pred_los').value),
    prev: parseInt(document.getElementById('pred_prev').value),
    diagnosis: document.getElementById('pred_diag').value
  };
  const d = await fetch('/api/predict_readmission', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  }).then(r => r.json());

  const res = document.getElementById('predictResult');
  res.style.display = 'block';
  

if (d.prediction === 'High Risk') {

    res.className = 'predict-result yes';

    res.innerHTML = `
    ⚠️ HIGH RISK – Patient likely to be readmitted within 30 days
    <br><small style="font-weight:400;opacity:.8">
    Confidence: ${d.confidence}%
    </small>
    `;

}
else if (d.prediction === 'Medium Risk') {

    res.className = 'predict-result warning';

    res.innerHTML = `
    ⚠️ MEDIUM RISK – Patient may require follow-up monitoring
    <br><small style="font-weight:400;opacity:.8">
    Confidence: ${d.confidence}%
    </small>
    `;

}
else {

    res.className = 'predict-result no';

    res.innerHTML = `
    ✅ LOW RISK – Patient unlikely to be readmitted within 30 days
    <br><small style="font-weight:400;opacity:.8">
    Confidence: ${d.confidence}%
    </small>
    `;

}
  btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Run Prediction';
  btn.disabled = false;
}

// ── Data Table ────────────────────────────────────────────────
async function loadDataTable(page) {
  showLoader();
  try {
    const d = await apiFetch('/api/data_table?page=' + page);
    const container = document.getElementById('tableContainer');
    container.innerHTML = tableHTML(d.columns, d.data);

    const pg = document.getElementById('pagination');
    pg.innerHTML = '';
    if (d.pages > 1) {
      const maxPages = Math.min(d.pages, 10);
      if (page > 1) pg.innerHTML += `<button class="page-btn" onclick="loadDataTable(${page-1})">‹ Prev</button>`;
      for (let i = 1; i <= maxPages; i++) {
        pg.innerHTML += `<button class="page-btn ${i===page?'active':''}" onclick="loadDataTable(${i})">${i}</button>`;
      }
      if (page < d.pages) pg.innerHTML += `<button class="page-btn" onclick="loadDataTable(${page+1})">Next ›</button>`;
      pg.innerHTML += `<span style="font-size:.78rem;color:#8b949e;margin-left:8px">Total: ${d.total} records</span>`;
    }
  } finally { hideLoader(); }
}
