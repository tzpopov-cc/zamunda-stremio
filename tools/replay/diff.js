// Compare OLD and NEW answers from drive.js.   node diff.js out/final
const fs = require('fs');
const dir = process.argv[2];
const load = f => new Map(fs.readFileSync(`${dir}/${f}.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(r => [`${r.type} ${r.id}`, r]));
const O = load('old'), N = load('new');
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
let same = 0; const lost = [], gained = [], idx = [], info = [], errs = [];
for (const [k, o] of O) {
    const n = N.get(k); if (!n) continue;
    if (o.error || n.error) errs.push(`${k} old:${o.error || 'ok'} new:${n.error || 'ok'}`);
    // A row is a torrent (by infoHash) or a debrid link (by release name — the link itself differs per run);
    // an info row is a notice (url to notice-*.mp4) or a stream with nothing to play.
    const isInfo = s => !s.infoHash && (!s.url || /\/notice-[a-z]+\.mp4$/.test(s.url));
    const rows = r => new Map(r.streams.filter(s => !isInfo(s)).map(s => [s.infoHash || `debrid:${s.title}`, s]));
    const ro = rows(o), rn = rows(n);
    const infoOf = r => r.streams.filter(isInfo).map(s => s.name.split(' | ')[0]).join(', ');
    let changed = false;
    for (const [h, s] of ro) if (!rn.has(h)) { lost.push(`${k}  ${s.title}`); changed = true; }
    for (const [h, s] of rn) if (!ro.has(h)) { gained.push(`${k}  ${s.title}`); changed = true; }
    for (const [h, s] of rn) if (ro.has(h) && ro.get(h).fileIdx !== s.fileIdx) { idx.push(`${k}  ${s.title.slice(0, 70)}  fileIdx ${ro.get(h).fileIdx} -> ${s.fileIdx}`); changed = true; }
    if (infoOf(o) !== infoOf(n)) { info.push(`${k}  [${infoOf(o)}] -> [${infoOf(n)}]`); changed = true; }
    if (!changed) same++;
}
console.log(`ids: ${O.size} | identical: ${same} | errors: ${errs.length}`);
console.log(`median ms  old ${med([...O.values()].map(r => r.ms))}  new ${med([...N.values()].map(r => r.ms))}`);
const show = (label, a) => { console.log(`\n${label}: ${a.length}`); a.forEach(x => console.log('   ' + x)); };
show('LOST rows (old had, new not)', lost);
show('GAINED rows (new has, old not)', gained);
show('fileIdx changed', idx);
show('info rows changed', info);
show('errors', errs);
