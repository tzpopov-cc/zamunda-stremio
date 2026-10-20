// Replay stubs: the archive and itorrents, answered from a disk cache so the old and the new version
// see byte-identical data. A miss is fetched live once (this Mac reaches zamunda.life directly).
//   node stubs.js        -> :9911 archive search + /stats, :9912 itorrents
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const CACHE = path.join(__dirname, 'cache');
fs.mkdirSync(path.join(CACHE, 'life'), { recursive: true });
fs.mkdirSync(path.join(CACHE, 'torrents'), { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const inflight = new Map();
const once = (key, fn) => { if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key))); return inflight.get(key); };

http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
        if (u.pathname === '/stats') {
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end('{"total":448023,"zamunda":396421,"arena":42989,"zelka":8613}');
        }
        const q = u.searchParams.get('q') || '', limit = u.searchParams.get('limit') || '50';
        // A later page (B-027) has its own file; the first page keeps the key it always had.
        const offset = u.searchParams.get('offset') || '';
        const file = path.join(CACHE, 'life', crypto.createHash('sha1').update(`${q}|${limit}${offset && offset !== '0' ? `|${offset}` : ''}`).digest('hex') + '.json');
        const body = await once(file, async () => {
            if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
            const params = offset && offset !== '0' ? { q, limit, offset } : { q, limit };
            const r = await axios.get('https://zamunda.life/api/torrents', { params, headers: { 'User-Agent': UA }, timeout: 20000, responseType: 'text', transformResponse: x => x });
            fs.writeFileSync(file, r.data);
            return r.data;
        });
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(body);
    } catch (e) {
        res.writeHead(e.response ? e.response.status : 502); res.end('stub: ' + e.message);
    }
}).listen(9911, '127.0.0.1');

http.createServer(async (req, res) => {
    const m = req.url.match(/\/torrent\/([a-f0-9]{40})\.torrent/i);
    if (!m) { res.writeHead(404); return res.end(); }
    const h = m[1].toLowerCase(), file = path.join(CACHE, 'torrents', h + '.torrent'), miss = file + '.404';
    try {
        const buf = await once(h, async () => {
            if (fs.existsSync(file)) return fs.readFileSync(file);
            if (fs.existsSync(miss)) return null;
            try {
                const r = await axios.get(`https://itorrents.org/torrent/${h}.torrent`, { responseType: 'arraybuffer', timeout: 15000, maxRedirects: 5, headers: { 'User-Agent': UA } });
                fs.writeFileSync(file, Buffer.from(r.data)); return Buffer.from(r.data);
            } catch (e) { fs.writeFileSync(miss, String(e.response ? e.response.status : e.message)); return null; }
        });
        if (!buf) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': 'application/x-bittorrent' }); res.end(buf);
    } catch (e) { res.writeHead(502); res.end(); }
}).listen(9912, '127.0.0.1');
console.log('stubs on :9911 (archive) and :9912 (itorrents)');
