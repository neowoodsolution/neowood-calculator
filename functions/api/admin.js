function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

const MODE_LABELS = {
  floor: '바닥 채움',
  wall: '벽면 계산',
  cutlist: '재단 수량',
  compare: '규격 비교',
  landing: '메인 화면',
};

const EVENT_LABELS = {
  page_view: '페이지 방문',
  analysis_start: '산출 분석 시작',
  calculate: '산출 완료',
  click_review_talk: '정밀검토 요청',
  click_consult: '일반 톡톡 상담',
  click_store: '스토어 클릭',
  click_phone: '전화 클릭',
  mark_purchase: '구매 전환 표시',
};

function cleanText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function kstDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getMeta(payload = {}) {
  const meta = payload && typeof payload.meta === 'object' ? payload.meta : {};
  return {
    result_id: cleanText(meta.result_id || payload.result_id, ''),
    estimator_version: cleanText(meta.estimator_version, 'legacy'),
    estimator_type: cleanText(meta.estimator_type, 'quick'),
    engine_name: cleanText(meta.engine_name, ''),
    analysis_run_number: num(meta.analysis_run_number),
  };
}

function parseSheetLabel(label) {
  const values = String(label || '').match(/\d[\d,]*/g) || [];
  const [w, h] = values.slice(0, 2).map((value) => Number(value.replace(/,/g, '')));
  return {
    w: Number.isFinite(w) ? w : 0,
    h: Number.isFinite(h) ? h : 0,
  };
}

function summarizeInput(mode, payload = {}) {
  const input = payload.input || {};
  if (mode === 'floor' || mode === 'wall') {
    return `${num(input.width).toLocaleString('ko-KR')} × ${num(input.height).toLocaleString('ko-KR')}mm · ${cleanText(input.sheet)}`;
  }
  if (mode === 'compare') {
    return `${num(input.width).toLocaleString('ko-KR')} × ${num(input.height).toLocaleString('ko-KR')}mm · ${cleanText(input.a)} / ${cleanText(input.b)}`;
  }
  if (mode === 'cutlist') {
    const pieces = Array.isArray(input.pieces) ? input.pieces : [];
    const totalQty = pieces.reduce((sum, piece) => sum + num(piece.qty), 0);
    return `${pieces.length}종 · 총 ${totalQty.toLocaleString('ko-KR')}개 · ${cleanText(input.sheet)}`;
  }
  return '-';
}

function summarizeResult(mode, payload = {}) {
  const result = payload.result || {};
  if (mode === 'compare') {
    return `A ${num(result.sheetsA).toLocaleString('ko-KR')}장 / B ${num(result.sheetsB).toLocaleString('ko-KR')}장`;
  }
  if (result.sheets != null) {
    return `${num(result.sheets).toLocaleString('ko-KR')}장`;
  }
  return '-';
}

function analyzeRisk(mode, payload = {}) {
  const input = payload.input || {};
  const flags = [];

  if (mode === 'floor' || mode === 'wall' || mode === 'compare') {
    const width = num(input.width);
    const height = num(input.height);
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    if (shortSide > 0 && longSide / shortSide >= 4) flags.push('장방형 공간');
    if (longSide >= 6000) flags.push('장척 구간');
  }

  if (mode === 'cutlist') {
    const pieces = Array.isArray(input.pieces) ? input.pieces : [];
    const unique = new Set(pieces.map((piece) => `${num(piece.w)}x${num(piece.h)}`));
    if (unique.size >= 3) flags.push('다규격 재단');
    if (pieces.some((piece) => {
      const shortSide = Math.min(num(piece.w), num(piece.h));
      const longSide = Math.max(num(piece.w), num(piece.h));
      return shortSide > 0 && longSide / shortSide >= 4;
    })) flags.push('길고 좁은 부재');

    const sheet = parseSheetLabel(input.sheet);
    const sheetLong = Math.max(sheet.w, sheet.h);
    if (sheetLong > 0 && pieces.some((piece) => Math.max(num(piece.w), num(piece.h)) > sheetLong)) {
      flags.push('원장 초과 부재');
    }
  }

  return [...new Set(flags)];
}

function deviceType(userAgent = '') {
  const ua = String(userAgent).toLowerCase();
  if (/ipad|tablet/.test(ua)) return '태블릿';
  if (/mobile|iphone|android/.test(ua)) return '모바일';
  return 'PC';
}

function referrerSource(referrer = '') {
  if (!referrer) return '직접 방문';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (host.includes('naver')) return '네이버';
    if (host.includes('instagram')) return '인스타그램';
    if (host.includes('google')) return '구글';
    return host || '기타';
  } catch {
    return '기타';
  }
}

function increment(obj, key, amount = 1) {
  const safeKey = cleanText(key, '미지정');
  obj[safeKey] = (obj[safeKey] || 0) + amount;
}

function makeUser(anonId) {
  return {
    anon_id: anonId,
    sessions: new Set(),
    active_dates: new Set(),
    modes: {},
    result_ids: new Set(),
    versions: {},
    review_items: {},
    first_active: '',
    last_active: '',
    total_events: 0,
    page_views: 0,
    analysis_starts: 0,
    calculations: 0,
    precision_reviews: 0,
    general_consults: 0,
    store_clicks: 0,
    phone_clicks: 0,
    purchases: 0,
    complex_calculations: 0,
    last_calculation: null,
    device: '-',
    source: '-',
  };
}

function finalizeUser(user) {
  const activeDays = user.active_dates.size;
  const sessions = user.sessions.size;
  const consultationCount = user.precision_reviews + user.general_consults;
  const converted = consultationCount > 0 || user.purchases > 0;
  const repeatUser = activeDays >= 2 || sessions >= 2 || user.calculations >= 3;

  let score = 0;
  score += Math.min(user.calculations * 2, 24);
  score += Math.min(Math.max(activeDays - 1, 0) * 3, 12);
  score += Math.min(Math.max(sessions - 1, 0) * 2, 8);
  score += Math.min(user.store_clicks * 3, 9);
  score += Math.min(user.complex_calculations * 2, 8);
  if (user.modes.cutlist) score += 3;
  if (user.modes.compare) score += 1;

  let interestGrade = '일반';
  let interestKind = 'soft';
  if (score >= 20) {
    interestGrade = '매우 높음';
    interestKind = 'danger';
  } else if (score >= 12) {
    interestGrade = '높음';
    interestKind = 'warn';
  } else if (score >= 6) {
    interestGrade = '관심';
    interestKind = 'info';
  }

  const highIntentNoConversion = !converted && (score >= 12 || user.calculations >= 5);
  let statusLabel = '일반 이용';
  let statusKind = 'soft';
  if (user.purchases > 0) {
    statusLabel = '구매 전환 표시';
    statusKind = 'success';
  } else if (user.precision_reviews > 0) {
    statusLabel = '정밀검토 요청 완료';
    statusKind = 'success';
  } else if (user.general_consults > 0) {
    statusLabel = '일반 상담 연결';
    statusKind = 'info';
  } else if (highIntentNoConversion) {
    statusLabel = '정밀검토 잠재고객';
    statusKind = 'danger';
  } else if (user.store_clicks > 0) {
    statusLabel = '스토어 확인·미상담';
    statusKind = 'warn';
  } else if (repeatUser) {
    statusLabel = '반복 이용·미전환';
    statusKind = 'warn';
  }

  const topMode = Object.entries(user.modes).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const modeBreakdown = Object.fromEntries(
    Object.entries(user.modes)
      .sort((a, b) => b[1] - a[1])
      .map(([mode, count]) => [MODE_LABELS[mode] || mode, count])
  );

  return {
    anon_id: user.anon_id,
    active_days: activeDays,
    sessions,
    total_events: user.total_events,
    page_views: user.page_views,
    analysis_starts: user.analysis_starts,
    calculations: user.calculations,
    precision_reviews: user.precision_reviews,
    general_consults: user.general_consults,
    consultations: consultationCount,
    store_clicks: user.store_clicks,
    phone_clicks: user.phone_clicks,
    purchases: user.purchases,
    complex_calculations: user.complex_calculations,
    first_active: user.first_active,
    last_active: user.last_active,
    top_mode: topMode,
    top_mode_label: MODE_LABELS[topMode] || '-',
    mode_breakdown: modeBreakdown,
    result_ids: Array.from(user.result_ids),
    versions: user.versions,
    review_items: user.review_items,
    last_calculation: user.last_calculation,
    repeat_user: repeatUser,
    converted,
    high_intent_no_conversion: highIntentNoConversion,
    interest_score: score,
    interest_grade: interestGrade,
    interest_kind: interestKind,
    status_label: statusLabel,
    status_kind: statusKind,
    device: user.device,
    source: user.source,
  };
}

function buildDashboard(rows) {
  const userMap = new Map();
  const globalSessions = new Set();
  const eventSummary = {};
  const modeSummary = {};
  const versionSummary = {};
  const reviewItemSummary = {};
  const deviceSummary = {};
  const sourceSummary = {};
  const riskSummary = {};
  const recentCalcs = [];
  const conversionEvents = [];
  const recentEvents = [];

  let analysisStarts = 0;
  let calculations = 0;
  let precisionReviewClicks = 0;
  let generalConsultClicks = 0;
  let storeClicks = 0;
  let phoneClicks = 0;
  let purchases = 0;
  let complexCalculations = 0;

  rows.forEach((row) => {
    const anonId = cleanText(row.anon_id, 'unknown');
    if (!userMap.has(anonId)) userMap.set(anonId, makeUser(anonId));
    const user = userMap.get(anonId);
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const meta = getMeta(payload);
    const eventType = cleanText(row.event_type, 'unknown');
    const mode = cleanText(row.mode, '');
    const createdAt = cleanText(row.created_at, '');

    user.total_events += 1;
    user.device = user.device === '-' ? deviceType(row.user_agent) : user.device;
    user.source = user.source === '-' ? referrerSource(row.referrer) : user.source;
    if (row.session_id) {
      user.sessions.add(String(row.session_id));
      globalSessions.add(String(row.session_id));
    }
    if (createdAt) {
      user.active_dates.add(kstDateKey(createdAt));
      if (!user.first_active || createdAt < user.first_active) user.first_active = createdAt;
      if (!user.last_active || createdAt > user.last_active) user.last_active = createdAt;
    }

    increment(eventSummary, EVENT_LABELS[eventType] || eventType);
    increment(deviceSummary, deviceType(row.user_agent));
    increment(sourceSummary, referrerSource(row.referrer));

    if (eventType === 'page_view') user.page_views += 1;
    if (eventType === 'analysis_start') {
      user.analysis_starts += 1;
      analysisStarts += 1;
    }
    if (eventType === 'calculate') {
      user.calculations += 1;
      calculations += 1;
      increment(user.modes, mode || 'unknown');
      increment(modeSummary, MODE_LABELS[mode] || mode || '미지정');
      increment(user.versions, meta.estimator_version);
      increment(versionSummary, meta.estimator_version);
      if (meta.result_id) user.result_ids.add(meta.result_id);

      const risks = analyzeRisk(mode, payload);
      if (risks.length) {
        user.complex_calculations += 1;
        complexCalculations += 1;
        risks.forEach((risk) => increment(riskSummary, risk));
      }

      const calc = {
        created_at: createdAt,
        anon_id: anonId,
        session_id: row.session_id || '',
        mode,
        mode_label: MODE_LABELS[mode] || mode || '-',
        input_summary: summarizeInput(mode, payload),
        result_summary: summarizeResult(mode, payload),
        result_id: meta.result_id || '-',
        estimator_version: meta.estimator_version,
        risks,
        payload,
      };
      recentCalcs.push(calc);
      if (!user.last_calculation || createdAt > user.last_calculation.created_at) user.last_calculation = calc;
    }
    if (eventType === 'click_review_talk') {
      user.precision_reviews += 1;
      precisionReviewClicks += 1;
      const selected = Array.isArray(payload.review_items) ? payload.review_items : [];
      selected.forEach((item) => {
        increment(user.review_items, item);
        increment(reviewItemSummary, item);
      });
    }
    if (eventType === 'click_consult') {
      user.general_consults += 1;
      generalConsultClicks += 1;
    }
    if (eventType === 'click_store') {
      user.store_clicks += 1;
      storeClicks += 1;
    }
    if (eventType === 'click_phone') {
      user.phone_clicks += 1;
      phoneClicks += 1;
    }
    if (eventType === 'mark_purchase') {
      user.purchases += 1;
      purchases += 1;
    }

    if (['click_review_talk', 'click_consult', 'click_store', 'click_phone', 'mark_purchase'].includes(eventType)) {
      conversionEvents.push({
        created_at: createdAt,
        anon_id: anonId,
        event_type: eventType,
        event_label: EVENT_LABELS[eventType] || eventType,
        mode,
        mode_label: MODE_LABELS[mode] || mode || '-',
        result_id: meta.result_id || '-',
        detail: eventType === 'click_review_talk'
          ? (Array.isArray(payload.review_items) ? payload.review_items.join(', ') : '정밀검토 요청')
          : cleanText(payload.target, '-'),
      });
    }

    if (recentEvents.length < 150) {
      recentEvents.push({
        created_at: createdAt,
        anon_id: anonId,
        event_type: eventType,
        event_label: EVENT_LABELS[eventType] || eventType,
        mode,
        mode_label: MODE_LABELS[mode] || mode || '-',
        result_id: meta.result_id || '-',
        payload,
      });
    }
  });

  const users = Array.from(userMap.values()).map(finalizeUser);
  const calculationUsers = users.filter((user) => user.calculations > 0);
  const repeatCalculationUsers = users.filter((user) => user.calculations >= 2);
  const precisionReviewUsers = users.filter((user) => user.precision_reviews > 0);
  const consultationUsers = users.filter((user) => user.consultations > 0);
  const storeUsers = users.filter((user) => user.store_clicks > 0);
  const purchaseUsers = users.filter((user) => user.purchases > 0);
  const highIntentUsers = users
    .filter((user) => user.high_intent_no_conversion)
    .sort((a, b) => b.interest_score - a.interest_score || b.calculations - a.calculations || String(b.last_active).localeCompare(String(a.last_active)))
    .slice(0, 100);

  const userProfiles = users
    .sort((a, b) => b.interest_score - a.interest_score || String(b.last_active).localeCompare(String(a.last_active)))
    .slice(0, 500);

  recentCalcs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  conversionEvents.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const reviewConversionRate = calculationUsers.length
    ? precisionReviewUsers.length / calculationUsers.length
    : 0;
  const consultationConversionRate = calculationUsers.length
    ? consultationUsers.length / calculationUsers.length
    : 0;
  const analysisCompletionRate = analysisStarts
    ? Math.min(calculations / analysisStarts, 1)
    : null;

  const topMode = Object.entries(modeSummary).sort((a, b) => b[1] - a[1])[0];
  const insightMessages = [
    highIntentUsers.length
      ? `정밀검토 가능성이 높은 미전환 사용자가 ${highIntentUsers.length}명 있습니다.`
      : '현재 고관심 미전환 사용자는 없습니다.',
    topMode
      ? `가장 많이 사용된 계산은 ${topMode[0]}이며 ${topMode[1]}회 실행되었습니다.`
      : '아직 계산 데이터가 충분하지 않습니다.',
    complexCalculations
      ? `실제 배치 검토가 필요한 주의 계산이 ${complexCalculations}건 감지되었습니다.`
      : '주의 조건으로 분류된 계산이 없습니다.',
    `계산 사용자 중 정밀검토 요청 전환율은 ${(reviewConversionRate * 100).toFixed(1)}%입니다.`,
  ];

  return {
    generated_at: new Date().toISOString(),
    row_count: rows.length,
    kpis: {
      users: users.length,
      sessions: globalSessions.size,
      calculation_users: calculationUsers.length,
      calculations,
      analysis_starts: analysisStarts,
      precision_review_clicks: precisionReviewClicks,
      precision_review_users: precisionReviewUsers.length,
      general_consult_clicks: generalConsultClicks,
      consultation_users: consultationUsers.length,
      store_clicks: storeClicks,
      store_users: storeUsers.length,
      phone_clicks: phoneClicks,
      purchases,
      high_intent_no_conversion: highIntentUsers.length,
      complex_calculations: complexCalculations,
      review_conversion_rate: reviewConversionRate,
      consultation_conversion_rate: consultationConversionRate,
      analysis_completion_rate: analysisCompletionRate,
    },
    funnel: [
      { key: 'visitors', label: '방문 사용자', value: users.length },
      { key: 'calculators', label: '계산 사용자', value: calculationUsers.length },
      { key: 'repeat', label: '2회 이상 계산', value: repeatCalculationUsers.length },
      { key: 'review', label: '정밀검토 요청', value: precisionReviewUsers.length },
      { key: 'store', label: '스토어 확인', value: storeUsers.length },
      { key: 'purchase', label: '구매 표시', value: purchaseUsers.length },
    ],
    event_summary: eventSummary,
    mode_summary: modeSummary,
    version_summary: versionSummary,
    review_item_summary: reviewItemSummary,
    risk_summary: riskSummary,
    device_summary: deviceSummary,
    source_summary: sourceSummary,
    insight_messages: insightMessages,
    high_intent_users: highIntentUsers,
    user_profiles: userProfiles,
    recent_calculations: recentCalcs.slice(0, 150),
    conversion_events: conversionEvents.slice(0, 150),
    recent_events: recentEvents,
  };
}

async function fetchRows(env, since, anonId = '') {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('Supabase 환경변수가 비어 있습니다.');
  }

  const pageSize = 1000;
  const maxRows = 10000;
  const rows = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const params = new URLSearchParams();
    params.set('select', 'created_at,anon_id,session_id,event_type,mode,payload,user_agent,referrer');
    params.set('created_at', `gte.${since}`);
    if (anonId) params.set('anon_id', `eq.${anonId}`);
    params.set('order', 'created_at.desc');
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));

    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_events?${params.toString()}`, {
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase 조회 실패: ${detail}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const requestUrl = new URL(request.url);
    const token = request.headers.get('x-admin-token') || requestUrl.searchParams.get('token');

    if (!env.ADMIN_DASHBOARD_TOKEN || token !== env.ADMIN_DASHBOARD_TOKEN) {
      return json({ error: '관리자 토큰이 올바르지 않습니다.' }, 401);
    }

    const requestedDays = Number(requestUrl.searchParams.get('days') || '7');
    const days = [1, 3, 5, 7, 30, 90].includes(requestedDays) ? requestedDays : 7;
    const anonId = String(requestUrl.searchParams.get('anon_id') || '').slice(0, 120);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = await fetchRows(env, since, anonId);
    const dashboard = buildDashboard(rows);

    if (anonId) {
      return json({
        generated_at: dashboard.generated_at,
        profile: dashboard.user_profiles.find((user) => user.anon_id === anonId) || null,
        calculations: dashboard.recent_calculations,
        conversions: dashboard.conversion_events,
        timeline: dashboard.recent_events,
      });
    }

    return json(dashboard);
  } catch (error) {
    return json({
      error: '관리자 대시보드 서버 오류',
      detail: String(error?.message || error),
    }, 500);
  }
}
