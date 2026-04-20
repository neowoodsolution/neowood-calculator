function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return json({ error: 'Supabase 환경변수가 비어 있습니다.' }, 500);
    }

    const body = await request.json();
    const row = {
      anon_id: String(body.anon_id || '').slice(0, 120),
      session_id: body.session_id ? String(body.session_id).slice(0, 120) : null,
      event_type: String(body.event_type || ''),
      mode: body.mode ? String(body.mode).slice(0, 50) : null,
      payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
      user_agent: request.headers.get('user-agent') || null,
      referrer: body.referrer ? String(body.referrer).slice(0, 500) : null,
    };

    if (!row.anon_id || !row.event_type) {
      return json({ error: 'anon_id 또는 event_type이 없습니다.' }, 400);
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': SUPABASE_SECRET_KEY,
        'authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
        'prefer': 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const text = await res.text();
      return json({ error: 'Supabase 저장 실패', detail: text }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: '서버 오류', detail: String(e.message || e) }, 500);
  }
}
