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

// 4. Save Simulation (Auth Optional for Statistics)
app.post('/api/simulation', async (c) => {
  const userId = c.req.header('X-User-ID'); // May be null
  const body = await c.req.json();

  const now = Date.now();
  const inputStr = JSON.stringify(body.inputData || {});
  const allocStr = JSON.stringify(body.allocationData || {});
  const metricsStr = JSON.stringify(body.metricsData || {});

  const res = await c.env.DB.prepare(`
        INSERT INTO simulations (user_id, input_data, allocation_data, metrics_data, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).bind(userId || null, inputStr, allocStr, metricsStr, now).run();

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
      small: {
        label: '小資族 (< 100萬)', count: 0,
        a: { cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
        b: { cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
        inf: { items: {}, prices: 0 }
      },
      middle: {
        label: '中產階級 (100-500萬)', count: 0,
        a: { cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
        b: { cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
        inf: { items: {}, prices: 0 }
      },
      large: {
        label: '富裕層 (> 500萬)', count: 0,
        a: { cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
        b: { cash: 0, etf: 0, re: 0, active: 0, ret: 0 },
        inf: { items: {}, prices: 0 }
      }
    };

    for (const row of results) {
      try {
        const input = JSON.parse(row.input_data);
        const allocRaw = JSON.parse(row.allocation_data);
        const metrics = JSON.parse(row.metrics_data);

        const initial = parseFloat(input.initial || 0);
        let g;
        if (initial < 1000000) g = groups.small;
        else if (initial <= 5000000) g = groups.middle;
        else g = groups.large;

        g.count++;

        // Panel A
        const allocA = allocRaw.panelA || {};
        g.a.cash += (allocA.cash || 0);
        g.a.etf += (allocA.etf || 0);
        g.a.re += (allocA.re || 0);
        g.a.active += (allocA.active || 0);
        g.a.ret += (metrics.rateA || 0);

        // Panel B
        const allocB = allocRaw.panelB || (allocRaw.cash ? allocRaw : {});
        g.b.cash += (allocB.cash || 0);
        g.b.etf += (allocB.etf || 0);
        g.b.re += (allocB.re || 0);
        g.b.active += (allocB.active || 0);
        g.b.ret += (metrics.rateB || 0);

        // Inflation
        const item = input.infItem || '其他';
        g.inf.items[item] = (g.inf.items[item] || 0) + 1;
        g.inf.prices += parseFloat(input.infPrice || 0);

      } catch (e) { /* skip malformed */ }
    }

    // Average them
    const finalGroups = Object.keys(groups).map(key => {
      const g = groups[key];
      if (g.count === 0) return { key, label: g.label, count: 0 };

      // Find top inflation item
      let topItem = '無數據';
      let maxCount = 0;
      for (const [name, count] of Object.entries(g.inf.items)) {
        if (count > maxCount) {
          maxCount = count;
          topItem = name;
        }
      }

      return {
        key: key,
        label: g.label,
        count: g.count,
        a: {
          cash: Math.round(g.a.cash / g.count),
          etf: Math.round(g.a.etf / g.count),
          re: Math.round(g.a.re / g.count),
          active: Math.round(g.a.active / g.count),
          avgRet: (g.a.ret / g.count).toFixed(1)
        },
        b: {
          cash: Math.round(g.b.cash / g.count),
          etf: Math.round(g.b.etf / g.count),
          re: Math.round(g.b.re / g.count),
          active: Math.round(g.b.active / g.count),
          avgRet: (g.b.ret / g.count).toFixed(1)
        },
        inf: {
          topItem: topItem,
          avgPrice: Math.round(g.inf.prices / g.count)
        }
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
