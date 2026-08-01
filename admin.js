const $ = (selector, root = document) => root.querySelector(selector);

let dashboardData = null;
let currentSearch = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function fmt(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value) || 0);
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatKst(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function setState(kind, text) {
  const element = $('#loadState');
  element.className = 'state-badge';
  if (kind) element.classList.add(kind);
  element.textContent = text;
}

function statusChip(label, kind = 'soft') {
  return `<span class="status-chip ${esc(kind)}">${esc(label)}</span>`;
}

function interestChip(user) {
  return `<span class="interest-chip ${esc(user.interest_kind || 'soft')}">${esc(user.interest_grade || '일반')} · ${fmt(user.interest_score)}점</span>`;
}

function riskHtml(risks = []) {
  if (!risks.length) return '<span class="cell-sub">없음</span>';
  return `<div class="risk-list">${risks.map((risk) => `<span class="risk-chip">${esc(risk)}</span>`).join('')}</div>`;
}

function userButton(anonId) {
  return `<button class="user-link" type="button" data-anon-id="${esc(anonId)}">${esc(anonId)}</button>`;
}

function renderMetricList(selector, data, emptyText = '데이터가 없습니다.') {
  const element = $(selector);
  const entries = Object.entries(data || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (!entries.length) {
    element.className = 'metric-list empty-state';
    element.textContent = emptyText;
    return;
  }
  element.className = 'metric-list';
  element.innerHTML = entries.map(([label, value]) => `
    <div class="metric-row">
      <span class="metric-label" title="${esc(label)}">${esc(label)}</span>
      <strong class="metric-value">${fmt(value)}</strong>
    </div>
  `).join('');
}

function renderKpis(data) {
  const kpis = data.kpis || {};
  $('#kpiUsers').textContent = fmt(kpis.users);
  $('#kpiSessions').textContent = fmt(kpis.sessions);
  $('#kpiCalculationUsers').textContent = fmt(kpis.calculation_users);
  $('#kpiCalculations').textContent = fmt(kpis.calculations);
  $('#kpiPrecisionReviews').textContent = fmt(kpis.precision_review_clicks);
  $('#kpiStoreClicks').textContent = fmt(kpis.store_clicks);
  $('#kpiComplexCalculations').textContent = fmt(kpis.complex_calculations);
  $('#kpiHighIntent').textContent = fmt(kpis.high_intent_no_conversion);
  $('#kpiAnalysisCompletion').textContent = `완료율 ${pct(kpis.analysis_completion_rate)}`;
  $('#kpiReviewRate').textContent = `계산 사용자 전환율 ${pct(kpis.review_conversion_rate)}`;
  $('#kpiStoreUsers').textContent = `사용자 ${fmt(kpis.store_users)}명`;
}

function renderFunnel(items = []) {
  const element = $('#funnelChart');
  if (!items.length) {
    element.className = 'funnel-list empty-state';
    element.textContent = '퍼널 데이터가 없습니다.';
    return;
  }
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  element.className = 'funnel-list';
  element.innerHTML = items.map((item) => {
    const width = Math.max(((Number(item.value) || 0) / max) * 100, item.value ? 4 : 0);
    return `
      <div class="funnel-row">
        <span class="funnel-label">${esc(item.label)}</span>
        <div class="funnel-track" aria-hidden="true"><div class="funnel-fill" style="width:${width.toFixed(1)}%"></div></div>
        <strong class="funnel-value">${fmt(item.value)}</strong>
      </div>
    `;
  }).join('');
}

function renderInsights(messages = []) {
  const element = $('#insightMessages');
  if (!messages.length) {
    element.className = 'insight-list empty-state';
    element.textContent = '인사이트 데이터가 없습니다.';
    return;
  }
  element.className = 'insight-list';
  element.innerHTML = messages.map((message) => `<div class="insight-item">${esc(message)}</div>`).join('');
}

function queryMatches(...values) {
  if (!currentSearch) return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(currentSearch));
}

function filteredHighIntent() {
  return (dashboardData?.high_intent_users || []).filter((user) => queryMatches(
    user.anon_id,
    user.status_label,
    user.top_mode_label,
    user.last_calculation?.result_id,
    user.last_calculation?.input_summary,
    ...(user.result_ids || [])
  ));
}

function filteredUsers() {
  return (dashboardData?.user_profiles || []).filter((user) => queryMatches(
    user.anon_id,
    user.status_label,
    user.interest_grade,
    user.top_mode_label,
    user.last_calculation?.result_id,
    ...(user.result_ids || [])
  ));
}

function filteredCalcs() {
  return (dashboardData?.recent_calculations || []).filter((calc) => queryMatches(
    calc.anon_id,
    calc.result_id,
    calc.mode_label,
    calc.input_summary,
    calc.result_summary,
    calc.estimator_version,
    ...(calc.risks || [])
  ));
}

function filteredConversions() {
  return (dashboardData?.conversion_events || []).filter((event) => queryMatches(
    event.anon_id,
    event.result_id,
    event.event_label,
    event.mode_label,
    event.detail
  ));
}

function renderHighIntent() {
  const body = $('#highIntentBody');
  const rows = filteredHighIntent();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty-row">조건에 맞는 고관심 미전환 사용자가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = rows.slice(0, 100).map((user) => `
    <tr>
      <td>${userButton(user.anon_id)}</td>
      <td>${interestChip(user)}</td>
      <td><span class="cell-main">${fmt(user.active_days)}일 / ${fmt(user.sessions)}회</span><span class="cell-sub">페이지뷰 ${fmt(user.page_views)}회</span></td>
      <td><span class="cell-main">${fmt(user.calculations)}회</span><span class="cell-sub">주의 조건 ${fmt(user.complex_calculations)}회</span></td>
      <td><span class="cell-main">${esc(user.top_mode_label)}</span><span class="cell-sub">${esc(Object.entries(user.mode_breakdown || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '-')}</span></td>
      <td><span class="cell-main">${esc(user.last_calculation?.input_summary || '-')}</span><span class="cell-sub">${esc(user.last_calculation?.result_id || '-')} · ${esc(user.last_calculation?.result_summary || '-')}</span></td>
      <td>${fmt(user.store_clicks)}회</td>
      <td>${esc(formatKst(user.last_active))}</td>
      <td>${statusChip(user.status_label, user.status_kind)}</td>
    </tr>
  `).join('');
}

function renderUsers() {
  const body = $('#userProfilesBody');
  const rows = filteredUsers();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty-row">검색 조건에 맞는 사용자가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = rows.slice(0, 300).map((user) => `
    <tr>
      <td>${userButton(user.anon_id)}<span class="cell-sub">${esc(user.device)} · ${esc(user.source)}</span></td>
      <td>${fmt(user.active_days)}일</td>
      <td>${fmt(user.sessions)}회</td>
      <td>${fmt(user.calculations)}회</td>
      <td>${fmt(user.precision_reviews)}회</td>
      <td>${fmt(user.store_clicks)}회</td>
      <td>${fmt(user.phone_clicks)}회</td>
      <td>${interestChip(user)}</td>
      <td>${esc(formatKst(user.last_active))}</td>
      <td>${statusChip(user.status_label, user.status_kind)}</td>
    </tr>
  `).join('');
}

function renderCalcs() {
  const body = $('#recentCalcsBody');
  const rows = filteredCalcs();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-row">검색 조건에 맞는 계산 내역이 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = rows.slice(0, 150).map((calc) => `
    <tr>
      <td>${esc(formatKst(calc.created_at))}</td>
      <td><span class="small-code">${esc(calc.result_id)}</span></td>
      <td>${userButton(calc.anon_id)}</td>
      <td>${esc(calc.mode_label)}</td>
      <td>${esc(calc.input_summary)}</td>
      <td><strong>${esc(calc.result_summary)}</strong></td>
      <td>${riskHtml(calc.risks)}</td>
      <td>${esc(calc.estimator_version)}</td>
    </tr>
  `).join('');
}

function renderConversions() {
  const body = $('#conversionEventsBody');
  const rows = filteredConversions();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-row">검색 조건에 맞는 전환 이벤트가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = rows.slice(0, 150).map((event) => `
    <tr>
      <td>${esc(formatKst(event.created_at))}</td>
      <td>${userButton(event.anon_id)}</td>
      <td><strong>${esc(event.event_label)}</strong></td>
      <td>${esc(event.mode_label)}</td>
      <td><span class="small-code">${esc(event.result_id)}</span></td>
      <td>${esc(event.detail)}</td>
    </tr>
  `).join('');
}

function renderEvents() {
  const body = $('#recentEventsBody');
  const rows = (dashboardData?.recent_events || []).filter((event) => queryMatches(
    event.anon_id,
    event.result_id,
    event.event_label,
    event.mode_label,
    JSON.stringify(event.payload || {})
  ));
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-row">검색 조건에 맞는 이벤트가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = rows.slice(0, 150).map((event) => `
    <tr>
      <td>${esc(formatKst(event.created_at))}</td>
      <td>${userButton(event.anon_id)}</td>
      <td>${esc(event.event_label)}</td>
      <td>${esc(event.mode_label)}</td>
      <td><span class="small-code">${esc(event.result_id)}</span></td>
      <td><div class="code-block">${esc(JSON.stringify(event.payload || {}, null, 2))}</div></td>
    </tr>
  `).join('');
}

function renderSearchableTables() {
  renderHighIntent();
  renderUsers();
  renderCalcs();
  renderConversions();
  renderEvents();
}

function renderDashboard(data) {
  dashboardData = data;
  renderKpis(data);
  renderFunnel(data.funnel);
  renderInsights(data.insight_messages);
  renderMetricList('#modeSummary', data.mode_summary);
  renderMetricList('#reviewItemSummary', data.review_item_summary, '아직 정밀검토 요청이 없습니다.');
  renderMetricList('#riskSummary', data.risk_summary, '주의 조건 계산이 없습니다.');
  renderMetricList('#versionSummary', data.version_summary);
  renderMetricList('#deviceSummary', data.device_summary);
  renderMetricList('#sourceSummary', data.source_summary);
  renderMetricList('#eventSummary', data.event_summary);
  renderSearchableTables();

  const generated = formatKst(data.generated_at);
  $('#dataFreshness').textContent = `갱신 ${generated} · 조회 이벤트 ${fmt(data.row_count)}건`;
}

async function loadDashboard() {
  const token = $('#adminToken').value.trim();
  const days = $('#daysSelect').value;
  if (!token) {
    alert('관리자 토큰을 입력해 주세요.');
    $('#adminToken').focus();
    return;
  }

  sessionStorage.setItem('nw_admin_token', token);
  setState('loading', '불러오는 중');
  $('#loadAdminBtn').disabled = true;

  try {
    const response = await fetch(`/api/admin?days=${encodeURIComponent(days)}`, {
      headers: { 'x-admin-token': token },
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.detail || '대시보드 로드 실패');
    renderDashboard(data);
    setState('done', '업데이트 완료');
  } catch (error) {
    setState('error', '불러오기 실패');
    alert(error.message || '대시보드 로드 실패');
  } finally {
    $('#loadAdminBtn').disabled = false;
  }
}

function modalOpen() {
  $('#userDetailModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function modalClose() {
  $('#userDetailModal').hidden = true;
  document.body.style.overflow = '';
}

function renderDetailProfile(profile) {
  const element = $('#detailProfile');
  if (!profile) {
    element.className = 'detail-profile empty-state';
    element.textContent = '사용자 요약을 찾지 못했습니다.';
    return;
  }
  element.className = 'detail-profile';
  const stats = [
    ['활성일', `${fmt(profile.active_days)}일`],
    ['세션', `${fmt(profile.sessions)}회`],
    ['계산', `${fmt(profile.calculations)}회`],
    ['정밀검토', `${fmt(profile.precision_reviews)}회`],
    ['스토어', `${fmt(profile.store_clicks)}회`],
    ['전화', `${fmt(profile.phone_clicks)}회`],
    ['주의 계산', `${fmt(profile.complex_calculations)}회`],
    ['관심도', `${esc(profile.interest_grade)} · ${fmt(profile.interest_score)}점`],
  ];
  element.innerHTML = stats.map(([label, value]) => `
    <div class="detail-stat"><span>${esc(label)}</span><strong>${value}</strong></div>
  `).join('');
}

function renderDetailCalculations(calculations = []) {
  const element = $('#detailCalculations');
  if (!calculations.length) {
    element.className = 'detail-list empty-state';
    element.textContent = '계산 데이터가 없습니다.';
    return;
  }
  element.className = 'detail-list';
  element.innerHTML = calculations.slice(0, 50).map((calc) => `
    <div class="detail-calc">
      <div class="detail-calc-head">
        <strong>${esc(calc.mode_label)} · ${esc(calc.result_summary)}</strong>
        <span class="small-code">${esc(calc.result_id)}</span>
      </div>
      <div class="detail-calc-body">
        <span>${esc(calc.input_summary)}</span>
        <span>${esc(formatKst(calc.created_at))}</span>
      </div>
      ${calc.risks?.length ? `<div class="risk-list" style="margin-top:8px">${calc.risks.map((risk) => `<span class="risk-chip">${esc(risk)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

function renderDetailTimeline(timeline = []) {
  const element = $('#detailTimeline');
  if (!timeline.length) {
    element.className = 'timeline empty-state';
    element.textContent = '활동 데이터가 없습니다.';
    return;
  }
  element.className = 'timeline';
  element.innerHTML = timeline.slice(0, 100).map((event) => `
    <div class="timeline-item">
      <div class="timeline-head"><span>${esc(event.event_label)}</span><time>${esc(formatKst(event.created_at))}</time></div>
      <div class="timeline-sub">${esc(event.mode_label)}${event.result_id && event.result_id !== '-' ? ` · ${esc(event.result_id)}` : ''}</div>
    </div>
  `).join('');
}

async function openUserDetail(anonId) {
  const token = $('#adminToken').value.trim();
  const days = $('#daysSelect').value;
  if (!token) return;

  modalOpen();
  $('#detailModalTitle').textContent = '사용자 상세 흐름';
  $('#detailModalSubtitle').textContent = `${anonId} · 데이터를 불러오는 중입니다.`;
  $('#detailProfile').className = 'detail-profile empty-state';
  $('#detailProfile').textContent = '사용자 요약을 불러오는 중입니다.';
  $('#detailCalculations').className = 'detail-list empty-state';
  $('#detailCalculations').textContent = '계산 데이터를 불러오는 중입니다.';
  $('#detailTimeline').className = 'timeline empty-state';
  $('#detailTimeline').textContent = '활동 흐름을 불러오는 중입니다.';

  try {
    const response = await fetch(`/api/admin?days=${encodeURIComponent(days)}&anon_id=${encodeURIComponent(anonId)}`, {
      headers: { 'x-admin-token': token },
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.detail || '상세 데이터 로드 실패');
    $('#detailModalSubtitle').textContent = `${anonId} · 최근 ${days}일 활동`;
    renderDetailProfile(data.profile);
    renderDetailCalculations(data.calculations);
    renderDetailTimeline(data.timeline);
  } catch (error) {
    $('#detailProfile').textContent = error.message || '상세 데이터를 불러오지 못했습니다.';
    $('#detailCalculations').textContent = '';
    $('#detailTimeline').textContent = '';
  }
}

function csvCell(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function downloadCsv(filename, headers, rows) {
  if (!rows.length) {
    alert('내보낼 데이터가 없습니다.');
    return;
  }
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportHighIntent() {
  const rows = filteredHighIntent();
  downloadCsv('neowood_high_intent_users.csv',
    ['익명 ID', '관심도', '점수', '활성일', '세션', '계산', '주요 모드', '최근 결과번호', '스토어 클릭', '마지막 활동', '상태'],
    rows.map((user) => [
      user.anon_id,
      user.interest_grade,
      user.interest_score,
      user.active_days,
      user.sessions,
      user.calculations,
      user.top_mode_label,
      user.last_calculation?.result_id || '',
      user.store_clicks,
      formatKst(user.last_active),
      user.status_label,
    ])
  );
}

function exportUsers() {
  const rows = filteredUsers();
  downloadCsv('neowood_user_profiles.csv',
    ['익명 ID', '활성일', '세션', '계산', '정밀검토', '일반상담', '스토어', '전화', '관심도', '점수', '기기', '유입경로', '마지막 활동', '상태'],
    rows.map((user) => [
      user.anon_id,
      user.active_days,
      user.sessions,
      user.calculations,
      user.precision_reviews,
      user.general_consults,
      user.store_clicks,
      user.phone_clicks,
      user.interest_grade,
      user.interest_score,
      user.device,
      user.source,
      formatKst(user.last_active),
      user.status_label,
    ])
  );
}

function exportCalcs() {
  const rows = filteredCalcs();
  downloadCsv('neowood_recent_calculations.csv',
    ['시간', '결과번호', '익명 ID', '모드', '입력 조건', '결과', '주의 조건', '버전'],
    rows.map((calc) => [
      formatKst(calc.created_at),
      calc.result_id,
      calc.anon_id,
      calc.mode_label,
      calc.input_summary,
      calc.result_summary,
      (calc.risks || []).join(' / '),
      calc.estimator_version,
    ])
  );
}

function bindEvents() {
  $('#loadAdminBtn').addEventListener('click', loadDashboard);
  $('#refreshAdminBtn').addEventListener('click', loadDashboard);
  $('#adminToken').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadDashboard();
  });
  $('#dashboardSearch').addEventListener('input', (event) => {
    currentSearch = event.target.value.trim().toLowerCase();
    if (dashboardData) renderSearchableTables();
  });
  $('#exportHighIntentBtn').addEventListener('click', exportHighIntent);
  $('#exportUsersBtn').addEventListener('click', exportUsers);
  $('#exportCalcsBtn').addEventListener('click', exportCalcs);
  $('#closeDetailModal').addEventListener('click', modalClose);
  $('#userDetailModal').addEventListener('click', (event) => {
    if (event.target.id === 'userDetailModal') modalClose();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#userDetailModal').hidden) modalClose();
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-anon-id]');
    if (button) openUserDetail(button.dataset.anonId);
  });
}

function init() {
  const savedToken = sessionStorage.getItem('nw_admin_token');
  if (savedToken) $('#adminToken').value = savedToken;
  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);
