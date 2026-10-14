// Ask OLD (:7101) and NEW (:7102) for every id in ids.txt and keep what each answered.
//   node drive.js ids.txt out/   [config, default "lang=bg"]
// ids.txt: one "movie tt0133093" or "series tt0903747:5:14" per line (# comments allowed).
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const [, , idsFile, outDir, cfg = 'lang=bg'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const ids = fs.readFileSync(idsFile, 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean).map(l => l.split(/\s+/));
const brief = s => ({ name: (s.name || '').replace(/\n/g, ' | '), title: (s.title || '').split('\n')[0], infoHash: s.infoHash || null, fileIdx: s.fileIdx ?? null, url: s.url ? s.url.replace(/^https?:\/\/[^/]+/, '') : null });
async function ask(port, type, id) {
    const t = Date.now();
    try {
        const r = await axios.get(`http://127.0.0.1:${port}/${encodeURIComponent(cfg)}/stream/${type}/${id}.json`, { timeout: 90000 });
        return { ms: Date.now() - t, streams: (r.data.streams || []).map(brief) };
    } catch (e) { return { ms: Date.now() - t, error: e.message, streams: [] }; }
}
(async () => {
    for (const side of ['old', 'new']) {
        const port = side === 'old' ? 7101 : 7102;
        const out = fs.createWriteStream(path.join(outDir, side + '.jsonl'));
        let i = 0;
        const queue = [...ids];
        await Promise.all(Array.from({ length: 3 }, async () => {
            while (queue.length) {
                const [type, id] = queue.shift();
                const r = await ask(port, type, id);
                out.write(JSON.stringify({ type, id, ...r }) + '\n');
                if (++i % 50 === 0) console.log(side, i, '/', ids.length);
            }
        }));
        out.end();
    }
    console.log('done');
})();
