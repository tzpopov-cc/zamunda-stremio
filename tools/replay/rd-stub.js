// Real-Debrid stub for the replay (T-102): the RD API shapes from api.real-debrid.com, behaviour picked by
// the token, so the refusal paths can be tested without an RD account.
//   node rd-stub.js      -> :9913/rest/1.0/...      GET /calls -> addMagnet calls per token
//   stub-bad  401 bad_token (8)          stub-free 403 permission_denied (9)
//   stub-busy 429 too_many_requests (34) stub-infr 503 infringing_file (35) on addMagnet — one torrent, not the account
//   stub-ok   the real flow: addMagnet -> info -> selectFiles -> downloaded -> unrestrict; "cached" = a hash
//             whose first hex digit is 0–7, anything else stays in magnet_conversion
const http = require('http');

const REFUSE = {
    'stub-bad': [401, 'bad_token', 8],
    'stub-free': [403, 'permission_denied', 9],
    'stub-busy': [429, 'too_many_requests', 34],
};
const calls = {};
const torrents = new Map();   // id -> { hash, name, selected }
let seq = 0;

function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
}

http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/calls') return send(res, 200, calls);
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
        const token = (req.headers.authorization || '').replace(/^Bearer /, '');
        const p = u.pathname.replace(/^\/rest\/1\.0/, '');
        if (p === '/torrents/addMagnet') calls[token] = (calls[token] || 0) + 1;
        if (REFUSE[token]) { const [s, error, error_code] = REFUSE[token]; return send(res, s, { error, error_code }); }
        if (token !== 'stub-ok' && token !== 'stub-infr') return send(res, 401, { error: 'bad_token', error_code: 8 });

        if (p === '/torrents/addMagnet') {
            if (token === 'stub-infr') return send(res, 503, { error: 'infringing_file', error_code: 35 });
            const magnet = new URLSearchParams(body).get('magnet') || '';
            const hash = ((magnet.match(/btih:([a-z0-9]+)/i) || [])[1] || '').toLowerCase();
            const name = decodeURIComponent(((magnet.match(/[?&]dn=([^&]+)/) || [])[1] || 'file').replace(/\+/g, ' '));
            const id = 'T' + (++seq);
            torrents.set(id, { hash, name, selected: false });
            return send(res, 201, { id, uri: `https://real-debrid.com/torrent/info/${id}` });
        }
        let m;
        if ((m = p.match(/^\/torrents\/info\/(\w+)$/))) {
            const t = torrents.get(m[1]);
            if (!t) return send(res, 404, { error: 'unknown_ressource', error_code: 7 });
            const cached = /^[0-7]/.test(t.hash);
            if (!cached) return send(res, 200, { id: m[1], hash: t.hash, status: 'magnet_conversion', files: [], links: [] });
            const files = [{ id: 1, path: `/${t.name}.mkv`, bytes: 2e9, selected: t.selected ? 1 : 0 }];
            return send(res, 200, t.selected
                ? { id: m[1], hash: t.hash, status: 'downloaded', files, links: [`https://real-debrid.com/d/${m[1]}`] }
                : { id: m[1], hash: t.hash, status: 'waiting_files_selection', files, links: [] });
        }
        if ((m = p.match(/^\/torrents\/selectFiles\/(\w+)$/))) {
            const t = torrents.get(m[1]);
            if (t) t.selected = true;
            return send(res, 204);
        }
        if ((m = p.match(/^\/torrents\/delete\/(\w+)$/))) { torrents.delete(m[1]); return send(res, 204); }
        if (p === '/unrestrict/link') {
            const link = new URLSearchParams(body).get('link') || '';
            return send(res, 200, { download: `https://stub.download/${link.split('/').pop()}` });
        }
        send(res, 404, { error: 'unknown_method', error_code: 3 });
    });
}).listen(9913, () => console.log('RD stub on :9913'));
