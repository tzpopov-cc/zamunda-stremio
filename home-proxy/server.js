// Home proxy for the Zamunda BG addon.
//
// Why this exists: zamunda.life's Cloudflare gates on IP reputation. The Hetzner box and
// Cloudflare Workers are both datacenter egress and get a 403 challenge; a residential
// line gets a clean 200. This process runs at home, so the outbound call to .life leaves
// from the home IP. It is a drop-in replacement for the api-proxy.tzkppv.com Worker and
// speaks exactly the same contract, so switching is a one-line change in server-full.js.
//
//   run:    PROXY_API_KEY=... UPSTREAM=https://zamunda.life/api/torrents node server.js
//   expose: cloudflared tunnel --url http://localhost:7011     (or Tailscale)
//
const express = require('express');

const app = express();
const PORT = process.env.PORT || 7011;
const API_KEY = process.env.PROXY_API_KEY || '';
const UPSTREAM = process.env.UPSTREAM || 'https://zamunda.life/api/torrents';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 20000);

if (!API_KEY) {
    console.error('PROXY_API_KEY is not set — refusing to start rather than run open to the world.');
    process.exit(1);
}

app.get('/health', (req, res) => res.json({ ok: true, upstream: UPSTREAM }));

// Unauthenticated egress probe: reports whether THIS host can reach the upstream at all.
// The point of deploying this to a candidate host is to answer exactly that question, so
// the probe deliberately needs no key. It returns a status, never any data.
app.get('/probe', async (req, res) => {
    const started = Date.now();
    try {
        const r = await fetch(`${UPSTREAM}?q=matrix&limit=3`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        });
        const body = await r.text();
        let rows = null;
        try { const j = JSON.parse(body); if (Array.isArray(j)) rows = j.length; } catch (e) { /* not JSON */ }
        res.json({
            usable: r.status === 200 && rows !== null,
            status: r.status,
            rows,
            ms: Date.now() - started,
            hint: r.status === 200 && rows !== null
                ? 'This host can reach the upstream — usable as the proxy.'
                : 'Challenged or unreachable from this host. Try another provider.',
        });
    } catch (e) {
        res.json({ usable: false, error: e.message, ms: Date.now() - started });
    }
});

app.get('/', async (req, res) => {
    if (req.header('X-Api-Key') !== API_KEY) {
        return res.status(403).type('text/plain').send('Unauthorized');
    }

    const qs = new URLSearchParams();
    // Pass through only what the API understands; ignore anything else the caller sends.
    for (const k of ['q', 'limit', 'offset']) {
        if (req.query[k] !== undefined) qs.set(k, String(req.query[k]));
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const upstream = await fetch(`${UPSTREAM}?${qs.toString()}`, {
            signal: ctrl.signal,
            headers: {
                // An ordinary browser UA. The block is by IP, not by header — this is only
                // so the request looks like the normal client it is.
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
                            + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'bg-BG,bg;q=0.9,en;q=0.8',
            },
        });
        const body = await upstream.text();

        // Hand the addon a real status on failure. It keys its "source is down" notice off
        // this, and a 200 wrapping an error page would show users an empty list instead.
        if (!upstream.ok) {
            console.warn(`upstream ${upstream.status} for q=${qs.get('q') || ''}`);
            return res.status(upstream.status).type('text/plain')
                      .send(`upstream ${upstream.status}`);
        }
        res.status(200).type('application/json').send(body);
    } catch (e) {
        const down = e.name === 'AbortError' ? 504 : 502;
        console.warn(`upstream ${down}: ${e.message}`);
        res.status(down).type('text/plain').send(`upstream unreachable: ${e.message}`);
    } finally {
        clearTimeout(timer);
    }
});

// Defaults to loopback so a box at home is not exposed by accident. A PaaS router has to
// reach the process, so those deploys need HOST=0.0.0.0 — without it the platform health
// check fails and /probe is unreachable.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
    console.log(`egress proxy on http://${HOST}:${PORT} → ${UPSTREAM}`);
    if (HOST === '127.0.0.1') console.log('   loopback only — set HOST=0.0.0.0 when deploying to a PaaS');
});
