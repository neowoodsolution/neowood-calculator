
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function buildSummary(rows) {
  const users = new Set();
  const eventSummary = {};
  const modeSummary = {};
  let calculations = 0;
  let consults = 0;
  let purchases = 0;
  const userMap = new Map();

  rows.forEach((r) => {
    users.add(r.anon_id);
    eventSummary[r.event_type] = (eventSummary[r.event_type] || 0) + 1;
    if (r.mode) modeSummary[r.mode] = (modeSummary[r.mode] || 0) + 1;
    if (r.event_type === 'calculate') calculations += 1;
    if (r.event_type === 'click_consult') consults += 1;
    if (r.event_type === 'mark_purchase') purchases += 1;

    const key = r.anon_id || 'unknown';
    if (!userMap.has(key)) {
      userMap.set(key, {
        anon_id: key,
        total_events: 0,
        calculations: 0,
        consults: 0,
        purchases: 0,
        store_clicks: 0,
        phone_clicks: 0,
        page_views: 0,
        active_dates: new Set(),
        last_active: r.created_at,
        modes: {},
      });
    }

    const u = userMap.get(key);
    u.total_events += 1;
    if (r.mode) u.modes[r.mode] = (u.modes[r.mode] || 0) + 1;
    if (r.event_type === 'calculate') u.calculations += 1;
    if (r.event_type === 'click_consult') u.consults += 1;
    if (r.event_type === 'mark_purchase') u.purchases += 1;
    if (r.event_type === 'click_store') u.store_clicks += 1;
    if (r.event_type === 'click_phone') u.phone_clicks += 1;
    if (r.event_type === 'page_view') u.page_views += 1;
    if (r.created_at) {
      u.active_dates.add(String(r.created_at).slice(0,10));
      if (!u.last_active || r.created_at > u.last_active) u.last_active = r.created_at;
    }
  });

  const usersArr = Array.from(userMap.values()).map((u) => {
    const topMode = Object.entries(u.modes).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-';
    const activeDays = u.active_dates.size;
    const repeatVisitor = activeDays >= 2 || u.calculations >= 3 || u.page_views >= 2;
    const noConversion = u.consults === 0 && u.purchases === 0;
    const storeOnlyNoConsult = u.store_clicks > 0 && u.consults === 0 && u.purchases === 0;
    let status_label = '반복 방문 + 미전환';
    let status_kind = 'warn';
    if (storeOnlyNoConsult) {
      status_label = '스토어 클릭 후 미상담';
      status_kind = 'info';
    } else if (u.calculations >= 5 && noConversion) {
      status_label = '반복 계산형 미전환';
      status_kind = 'warn';
    }
    return {
      anon_id: u.anon_id,
      calculations: u.calculations,
      consults: u.consults,
      purchases: u.purchases,
      store_clicks: u.store_clicks,
      page_views: u.page_views,
      active_days: activeDays,
      last_active: u.last_active,
      top_mode: topMode,
      repeatVisitor,
      noConversion,
      storeOnlyNoConsult,
      status_label,
      status_kind,
    };
  });

  const repeatVisitors = usersArr.filter((u) => u.repeatVisitor);
  const repeatNoConversionUsers = repeatVisitors
    .filter((u) => u.noConversion)
    .sort((a,b) => (b.active_days - a.active_days) || (b.calculations - a.calculations) || (String(b.last_active).localeCompare(String(a.last_active))))
    .slice(0, 50)
    .map((u) => ({
      anon_id: u.anon_id,
      active_days: u.active_days,
      calculations: u.calculations,
      store_clicks: u.store_clicks,
      last_active: u.last_active,
      top_mode: u.top_mode,
      status_label: u.status_label,
      status_kind: u.status_kind,
    }));

  const insightSummary = {
    '반복 방문 사용자': repeatVisitors.length,
    '반복 방문 + 미전환': repeatVisitors.filter((u) => u.noConversion).length,
    '반복 계산형 미전환': repeatVisitors.filter((u) => u.noConversion && u.calculations >= 5).length,
    '스토어 클릭 후 미상담': usersArr.filter((u) => u.storeOnlyNoConsult).length,
  };

  const storeOnlySummary = Object.fromEntries(
    usersArr
      .filter((u) => u.storeOnlyNoConsult)
      .sort((a,b) => b.store_clicks - a.store_clicks || b.calculations - a.calculations)
      .slice(0, 6)
      .map((u) => [u.anon_id, `${u.store_clicks}회 클릭 / 계산 ${u.calculations}회`])
  );

  const recentCalcs = rows
    .filter((r) => r.event_type === 'calculate')
    .slice(0, 30)
    .map((r) => ({
      created_at: r.created_at,
      anon_id: r.anon_id,
      mode: r.mode || '-',
      summary: summarizePayload(r.payload),
      result: summarizeResult(r.payload),
    }));

  const recentEvents = rows.slice(0, 50).map((r) => ({
    created_at: r.created_at,
    anon_id: r.anon_id,
    event_type: r.event_type,
    mode: r.mode || '-',
    payload: r.payload || {},
  }));

  return {
    kpis: {
      users: users.size,
      calculations,
      consults,
      purchases,
      repeatVisitors: repeatVisitors.length,
      repeatNoConversion: repeatVisitors.filter((u) => u.noConversion).length,
    },
    eventSummary,
    modeSummary,
    insightSummary,
    storeOnlySummary,
    repeatNoConversionUsers,
    recentCalcs,
    recentEvents,
  };
}

function summarizePayload(payload = {}) {
  const input = payload.input || {};
  if (input.width && input.height) return `${input.width}×${input.height}`;
  if (Array.isArray(input.pieces)) return `${input.pieces.length}종 재단 입력`;
  return '-';
}

function summarizeResult(payload = {}) {
  const result = payload.result || {};
  if (result.sheets) return `${result.sheets} 장`;
  if (result.sheetsA || result.sheetsB) return `A:${result.sheetsA || '-'} / B:${result.sheetsB || '-'}`;
  return '-';
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const token = request.headers.get('x-admin-token') || new URL(request.url).searchParams.get('token');
    if (!env.ADMIN_DASHBOARD_TOKEN || token !== env.ADMIN_DASHBOARD_TOKEN) {
      return json({ error: '관리자 토큰이 올바르지 않습니다.' }, 401);
    }

    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return json({ error: 'Supabase 환경변수가 비어 있습니다.' }, 500);
    }

    const days = Number(new URL(request.url).searchParams.get('days') || '7');
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const url = `${SUPABASE_URL}/rest/v1/app_events?select=created_at,anon_id,event_type,mode,payload&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1000`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return json({ error: 'Supabase 조회 실패', detail: text }, 500);
    }

    const rows = await res.json();
    return json(buildSummary(rows));
  } catch (e) {
    return json({ error: '서버 오류', detail: String(e.message || e) }, 500);
  }
}
