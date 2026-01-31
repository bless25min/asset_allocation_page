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
      return c.json({ totalCount: 0, groups: [] });
    }

    // --- Business Logic Constants (Mirrors config.js) ---
    const RATES = {
      CASH_RETURN: 1.5,
      ETF_RETURN: 8.0,
      REAL_ESTATE_RETURN: 5.5,
      ACTIVE_RETURN_AVG: 15.0,
      ACTIVE_RETURN_PENALTY: -50.0
    };

    // Helper: Calculate Weighted Return for an Allocation State
    function calcWeightedReturn(state) {
      let activeReturn = (state.active > 20) ? RATES.ACTIVE_RETURN_PENALTY : RATES.ACTIVE_RETURN_AVG;
      if (state.active < 5) activeReturn = 0; // Ineffective zone

      return (
        (state.cash * RATES.CASH_RETURN) +
        (state.etf * RATES.ETF_RETURN) +
        (state.re * RATES.REAL_ESTATE_RETURN) +
        (state.active * activeReturn)
      ) / 100;
    }

    // Helper: Calculate Inflation CAGR
    function calcInflation(oldPrice, nowPrice) {
      if (!oldPrice || !nowPrice || oldPrice <= 0) return 0;
      // Assume 10 years as per UI default
      return (Math.pow(nowPrice / oldPrice, 1 / 10) - 1) * 100;
    }

    const groups = {
      small: {
        label: '小資族 (< 300萬)', count: 0,
        a: { cash: 0, etf: 0, re: 0, active: 0, count: 0 },
        b: { cash: 0, etf: 0, re: 0, active: 0, count: 0 },
        inf: { items: [], count: 0 }
      },
      middle: {
        label: '中產階級 (300-3000萬)', count: 0,
        a: { cash: 0, etf: 0, re: 0, active: 0, count: 0 },
        b: { cash: 0, etf: 0, re: 0, active: 0, count: 0 },
        inf: { items: [], count: 0 }
      },
      large: {
        label: '富裕層 (> 3000萬)', count: 0,
        a: { cash: 0, etf: 0, re: 0, active: 0, count: 0 },
        b: { cash: 0, etf: 0, re: 0, active: 0, count: 0 },
        inf: { items: [], count: 0 }
      }
    };

    for (const row of results) {
      try {
        const input = JSON.parse(row.input_data);
        const allocRaw = JSON.parse(row.allocation_data);
        const metrics = JSON.parse(row.metrics_data);

        const initial = parseFloat(input.initial || 0);
        let g;
        if (initial < 3000000) g = groups.small;
        else if (initial < 30000000) g = groups.middle;
        else g = groups.large;

        g.count++;

        // Panel A (Only if valid & changed from default)
        const allocA = allocRaw.panelA;
        const isDefaultA = allocA && allocA.cash === 100 && (allocA.etf === 0 && allocA.re === 0 && allocA.active === 0);
        if (allocA && !isDefaultA && (allocA.cash + allocA.etf + allocA.re + allocA.active > 0)) {
          g.a.count++;
          g.a.cash += (allocA.cash || 0);
          g.a.etf += (allocA.etf || 0);
          g.a.re += (allocA.re || 0);
          g.a.active += (allocA.active || 0);
        }

        // Panel B (Only if valid & changed from default)
        const allocB = allocRaw.panelB || (allocRaw.cash ? allocRaw : null);
        const isDefaultB = allocB && allocB.cash === 100 && (allocB.etf === 0 && allocB.re === 0 && allocB.active === 0);
        if (allocB && !isDefaultB && (allocB.cash + allocB.etf + allocB.re + allocB.active > 0)) {
          g.b.count++;
          g.b.cash += (allocB.cash || 0);
          g.b.etf += (allocB.etf || 0);
          g.b.re += (allocB.re || 0);
          g.b.active += (allocB.active || 0);
        }

        // Inflation (Only if valid & positive)
        const infNow = parseFloat(metrics.infPriceNow || metrics.infPrice || 0);
        const infOld = parseFloat(metrics.infPriceOld || 0);
        const itemName = (metrics.infItem || "").trim();

        if (itemName && infNow > 0 && infOld > 0) {
          g.inf.count++;
          // Recalculate rate to fix backend/frontend mismatch or default values
          const realRate = calcInflation(infOld, infNow);
          g.inf.items.push({
            name: itemName,
            old: infOld,
            now: infNow,
            rate: realRate.toFixed(2)
          });
        }

      } catch (e) { /* skip malformed */ }
    }

    // Average them & Calculate Return of Average Allocation
    const finalGroups = Object.keys(groups).map(key => {
      const g = groups[key];
      if (g.count === 0) return { key, label: g.label, count: 0 };

      // Get last 20 inflation items (or random)
      const feed = g.inf.items.slice(-20).reverse();

      // Avg Allocation A
      const avgA = {
        cash: g.a.count ? Math.round(g.a.cash / g.a.count) : 0,
        etf: g.a.count ? Math.round(g.a.etf / g.a.count) : 0,
        re: g.a.count ? Math.round(g.a.re / g.a.count) : 0,
        active: g.a.count ? Math.round(g.a.active / g.a.count) : 0,
      };

      // Avg Allocation B
      const avgB = {
        cash: g.b.count ? Math.round(g.b.cash / g.b.count) : 0,
        etf: g.b.count ? Math.round(g.b.etf / g.b.count) : 0,
        re: g.b.count ? Math.round(g.b.re / g.b.count) : 0,
        active: g.b.count ? Math.round(g.b.active / g.b.count) : 0,
      };

      return {
        key: key,
        label: g.label,
        count: g.count,
        a: {
          ...avgA,
          avgRet: g.a.count ? calcWeightedReturn(avgA).toFixed(1) : "0.0"
        },
        b: {
          ...avgB,
          avgRet: g.b.count ? calcWeightedReturn(avgB).toFixed(1) : "0.0"
        },
        inf: {
          feed: feed,
          count: g.inf.count
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
