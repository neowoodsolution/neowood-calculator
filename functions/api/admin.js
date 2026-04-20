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

  rows.forEach((r) => {
    users.add(r.anon_id);
    eventSummary[r.event_type] = (eventSummary[r.event_type] || 0) + 1;
    if (r.mode) modeSummary[r.mode] = (modeSummary[r.mode] || 0) + 1;
    if (r.event_type === 'calculate') calculations += 1;
    if (r.event_type === 'click_consult') consults += 1;
    if (r.event_type === 'mark_purchase') purchases += 1;
  });

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
    },
    eventSummary,
    modeSummary,
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
