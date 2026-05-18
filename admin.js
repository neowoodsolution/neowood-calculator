
const $ = (sel) => document.querySelector(sel);

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function setState(kind, text){
  const el = $('#loadState');
  el.className = 'state-badge';
  if(kind) el.classList.add(kind);
  el.textContent = text;
}
function renderSummary(containerId, obj, suffix='건'){
  const el = $(containerId);
  const entries = Object.entries(obj || {});
  if(!entries.length){
    el.className = 'summary-grid empty-state';
    el.innerHTML = '데이터가 없습니다.';
    return;
  }
  el.className = 'summary-grid';
  el.innerHTML = entries.map(([k,v]) => `
    <div class="summary-item">
      <strong>${esc(k || '미지정')}</strong>
      <span>${esc(v)}${suffix}</span>
    </div>
  `).join('');
}
function statusChip(text, kind='soft'){
  return `<span class="status-chip ${kind}">${esc(text)}</span>`;
}
function renderRecentCalcs(rows){
  const body = $('#recentCalcsBody');
  if(!rows?.length){
    body.innerHTML = `<tr><td colspan="5" class="empty-row">계산 로그가 없습니다.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.created_at)}</td>
      <td><span class="small-code">${esc(r.anon_id)}</span></td>
      <td>${esc(r.mode || '-')}</td>
      <td>${esc(r.summary || '-')}</td>
      <td>${esc(r.result || '-')}</td>
    </tr>
  `).join('');
}
function renderRecentEvents(rows){
  const body = $('#recentEventsBody');
  if(!rows?.length){
    body.innerHTML = `<tr><td colspan="5" class="empty-row">이벤트 로그가 없습니다.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.created_at)}</td>
      <td><span class="small-code">${esc(r.anon_id)}</span></td>
      <td>${esc(r.event_type)}</td>
      <td>${esc(r.mode || '-')}</td>
      <td><div class="code-block">${esc(JSON.stringify(r.payload ?? {}, null, 2))}</div></td>
    </tr>
  `).join('');
}
function renderRepeatNoConversion(rows){
  const body = $('#repeatNoConversionBody');
  if(!rows?.length){
    body.innerHTML = `<tr><td colspan="7" class="empty-row">반복 방문 + 미전환 데이터가 없습니다.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => `
    <tr>
      <td><span class="small-code">${esc(r.anon_id)}</span></td>
      <td>${esc(r.active_days)}일</td>
      <td>${esc(r.calculations)}회</td>
      <td>${esc(r.store_clicks)}회</td>
      <td>${esc(r.last_active)}</td>
      <td>${esc(r.top_mode || '-')}</td>
      <td>${statusChip(r.status_label || '반복 방문 + 미전환', r.status_kind || 'warn')}</td>
    </tr>
  `).join('');
}
async function loadDashboard(){
  const token = $('#adminToken').value.trim();
  const days = $('#daysSelect').value;
  if(!token){
    alert('관리자 토큰을 입력해 주세요.');
    return;
  }
  sessionStorage.setItem('nw_admin_token', token);
  setState('loading', '불러오는 중');
  try{
    const res = await fetch(`/api/admin?days=${encodeURIComponent(days)}`, {
      headers: {'x-admin-token': token}
    });
    const data = await res.json();
    if(!res.ok){
      throw new Error(data.error || '대시보드 로드 실패');
    }
    $('#kpiUsers').textContent = data.kpis?.users ?? '-';
    $('#kpiCalculations').textContent = data.kpis?.calculations ?? '-';
    $('#kpiConsults').textContent = data.kpis?.consults ?? '-';
    $('#kpiPurchases').textContent = data.kpis?.purchases ?? '-';
    $('#kpiRepeatVisitors').textContent = data.kpis?.repeatVisitors ?? '-';
    $('#kpiRepeatNoConversion').textContent = data.kpis?.repeatNoConversion ?? '-';
    renderSummary('#eventSummary', data.eventSummary, '건');
    renderSummary('#modeSummary', data.modeSummary, '건');
    renderSummary('#insightSummary', data.insightSummary, '개');
    renderSummary('#storeOnlySummary', data.storeOnlySummary, '명');
    renderRepeatNoConversion(data.repeatNoConversionUsers);
    renderRecentCalcs(data.recentCalcs);
    renderRecentEvents(data.recentEvents);
    setState('done', '업데이트 완료');
  }catch(err){
    setState('error', '불러오기 실패');
    alert(err.message || '대시보드 로드 실패');
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('nw_admin_token');
  if(saved) $('#adminToken').value = saved;
  $('#loadAdminBtn').addEventListener('click', loadDashboard);
  $('#refreshAdminBtn').addEventListener('click', loadDashboard);
});
