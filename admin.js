const $ = (sel) => document.querySelector(sel);
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
async function loadDashboard(){
  const token = $('#adminToken').value.trim();
  const days = $('#daysSelect').value;
  sessionStorage.setItem('nw_admin_token', token);
  const res = await fetch(`/api/admin?days=${encodeURIComponent(days)}`, { headers: {'x-admin-token': token }});
  const data = await res.json();
  if(!res.ok){ alert(data.error || '대시보드 로드 실패'); return; }
  $('#kpiUsers').textContent = data.kpis.users;
  $('#kpiCalculations').textContent = data.kpis.calculations;
  $('#kpiConsults').textContent = data.kpis.consults;
  $('#kpiPurchases').textContent = data.kpis.purchases;
  $('#eventSummary').innerHTML = Object.entries(data.eventSummary).map(([k,v])=>`<div class="list-item"><strong>${esc(k)}</strong><br><span class="small">${v}건</span></div>`).join('') || '<div class="small">데이터가 없습니다.</div>';
  $('#modeSummary').innerHTML = Object.entries(data.modeSummary).map(([k,v])=>`<div class="list-item"><strong>${esc(k || '미지정')}</strong><br><span class="small">${v}건</span></div>`).join('') || '<div class="small">데이터가 없습니다.</div>';
  $('#recentCalcsBody').innerHTML = data.recentCalcs.map(r=>`<tr><td>${esc(r.created_at)}</td><td>${esc(r.anon_id)}</td><td>${esc(r.mode)}</td><td>${esc(r.summary)}</td><td>${esc(r.result)}</td></tr>`).join('') || `<tr><td colspan="5" class="small">계산 로그가 없습니다.</td></tr>`;
  $('#recentEventsBody').innerHTML = data.recentEvents.map(r=>`<tr><td>${esc(r.created_at)}</td><td>${esc(r.anon_id)}</td><td>${esc(r.event_type)}</td><td>${esc(r.mode)}</td><td><span class="small">${esc(JSON.stringify(r.payload))}</span></td></tr>`).join('') || `<tr><td colspan="5" class="small">이벤트 로그가 없습니다.</td></tr>`;
}
function init(){ $('#adminToken').value = sessionStorage.getItem('nw_admin_token') || ''; $('#loadAdminBtn').onclick=loadDashboard; $('#refreshAdminBtn').onclick=loadDashboard; }
document.addEventListener('DOMContentLoaded', init);
