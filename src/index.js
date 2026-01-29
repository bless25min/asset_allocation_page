import { Hono } from 'hono';

const app = new Hono();

// --- Auth Utilities (LIFF) ---
async function verifyLineToken(idToken, channelId) {
  const params = new URLSearchParams();
  params.append('id_token', idToken);
  params.append('client_id', channelId);

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    // Be lenient with error handling for now or throw
    throw new Error('LINE Verify Failed: ' + text);
  }
  return await res.json();
}

// --- Middleware ---
const authCheck = async (c, next) => {
  const userId = c.req.header('X-User-ID');
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('userId', userId);
  await next();
};


// --- Routes ---

// 1. LIFF Verify & Login (Replaces old callback)
app.post('/api/auth/verify', async (c) => {
  try {
    const { idToken } = await c.req.json();
    const { LINE_CHANNEL_ID } = c.env;

    if (!idToken) return c.json({ error: 'No token provided' }, 400);

    // A. Verify ID Token with LINE
    const payload = await verifyLineToken(idToken, LINE_CHANNEL_ID);

    // B. Upsert User to D1
    const now = Date.now();
    await c.env.DB.prepare(`
      INSERT INTO users (id, display_name, picture_url, created_at, last_login)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        picture_url = excluded.picture_url,
        last_login = excluded.last_login
    `).bind(payload.sub, payload.name, payload.picture, now, now).run();

    // C. Return Session Info
    return c.json({
      success: true,
      user: {
        id: payload.sub,
        name: payload.name,
        picture: payload.picture
      }
    });

  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// 3. Get Me (Requires Header)
app.get('/api/user/me', authCheck, async (c) => {
  const userId = c.var.userId;
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return c.json(user);
});

// 4. Save Simulation
app.post('/api/simulation', authCheck, async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json();
  // body: { inputData, allocationData, metricsData }

  const now = Date.now();

  // Convert objects to JSON strings
  const inputStr = JSON.stringify(body.inputData || {});
  const allocStr = JSON.stringify(body.allocationData || {});
  const metricsStr = JSON.stringify(body.metricsData || {});

  const res = await c.env.DB.prepare(`
        INSERT INTO simulations (user_id, input_data, allocation_data, metrics_data, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).bind(userId, inputStr, allocStr, metricsStr, now).run();

  if (res.success) {
    return c.json({ success: true, id: res.meta.last_row_id });
  } else {
    return c.json({ success: false, error: 'DB Error' }, 500);
  }
});

// 5. Public Statistics
app.get('/api/stats', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
            SELECT input_data, allocation_data, metrics_data FROM simulations 
            ORDER BY created_at DESC LIMIT 200
        `).all();

    if (!results || results.length === 0) {
      return c.json({ count: 0 });
    }

    const groups = {
      small: { label: '小資族 (< 100萬)', count: 0, cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
      middle: { label: '中產階級 (100-500萬)', count: 0, cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
      small: { label: '小資族 (< 100萬)', count: 0, totalCash: 0, totalEtf: 0, totalRe: 0, totalActive: 0, totalReturn: 0 },
      middle: { label: '中產階級 (100-500萬)', count: 0, totalCash: 0, totalEtf: 0, totalRe: 0, totalActive: 0, totalReturn: 0 },
      large: { label: '富裕層 (> 500萬)', count: 0, totalCash: 0, totalEtf: 0, totalRe: 0, totalActive: 0, totalReturn: 0 }
    };

    for (const row of results) {
      try {
        const input = JSON.parse(row.input_data);
        const allocRaw = JSON.parse(row.allocation_data);

        // Handle new nested structure { panelA, panelB } or legacy flat structure
        const alloc = allocRaw.panelB ? allocRaw.panelB : allocRaw;

        const initial = parseFloat(input.initial || 0);
        let g;
        if (initial < 1000000) g = groups.small;
        else if (initial <= 5000000) g = groups.middle;
        else g = groups.large;

        g.count++;
        g.totalCash += (alloc.cash || 0);
        g.totalEtf += (alloc.etf || 0);
        g.totalRe += (alloc.re || 0);
        g.totalActive += (alloc.active || 0);

        const metrics = JSON.parse(row.metrics_data);
        g.totalReturn += (metrics.rateB || 0);
      } catch (e) { /* skip malformed */ }
    }

    // Average them
    const finalGroups = Object.values(groups).map(g => {
      if (g.count === 0) return { ...g, avgReturn: 0 };
      return {
        label: g.label,
        count: g.count,
        cash: Math.round(g.totalCash / g.count),
        etf: Math.round(g.totalEtf / g.count),
        re: Math.round(g.totalRe / g.count),
        active: Math.round(g.totalActive / g.count),
        avgReturn: (g.totalReturn / g.count).toFixed(1)
      };
    });

    return c.json({
      totalCount: results.length,
      groups: finalGroups
    });

  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Default Route for Static Assets ---
app.get('*', async (c) => {
  return await c.env.ASSETS.fetch(c.req.raw);
});

export default app;
