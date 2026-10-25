// TorBox stub for the replay (T-501): the API shapes from api.torbox.app, behaviour picked by the token.
//   node tb-stub.js      -> :9914/v1/api/...
//   tb-ok    the real flow: checkcached (cached = hash whose first hex digit is 0-7, with a file list)
//            -> createtorrent -> mylist (download_present) -> requestdl
//   tb-free  checkcached answers like tb-ok, createtorrent is refused with the free-plan text the live API sends
//            ("API feature not available on your plan. Please upgrade to a paid plan to access the API.")
const http = require('http');
const calls = {};
const FREE = 'API feature not available on your plan. Please upgrade to a paid plan to access the API.';
function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}
http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/calls') return send(res, 200, calls);
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
        const token = (req.headers.authorization || '').replace(/^Bearer /, '') || u.searchParams.get('token') || '';
        const p = u.pathname.replace(/^\/v1/, '');
        calls[token + ' ' + p] = (calls[token + ' ' + p] || 0) + 1;
        if (token !== 'tb-ok' && token !== 'tb-free') return send(res, 403, { success: false, detail: 'Your token is invalid or has expired. Please log in again or reset your token.' });
        if (p === '/api/torrents/checkcached') {
            const hashes = JSON.parse(body || '{}').hashes || [];
            return send(res, 200, { success: true, data: hashes.filter(h => /^[0-7]/.test(h)).map(h => ({
                hash: h, name: 'stub', files: [{ id: 0, name: 'stub/video.mkv', size: 2e9 }] })) });
        }
        if (p === '/api/torrents/createtorrent') {
            if (token === 'tb-free') return send(res, 403, { success: false, error: 'PLAN_RESTRICTED_FEATURE', detail: FREE, data: null });
            return send(res, 200, { success: true, data: { torrent_id: 7 } });
        }
        if (p === '/api/torrents/mylist') return send(res, 200, { success: true, data: { id: 7, name: 'stub', download_present: true, files: [{ id: 0, name: 'stub/video.mkv', size: 2e9 }] } });
        if (p === '/api/torrents/requestdl') return send(res, 200, { success: true, data: 'https://stub.download/tb-file.mkv' });
        send(res, 404, { success: false, detail: 'unknown' });
    });
}).listen(9914, () => console.log('TB stub on :9914'));
