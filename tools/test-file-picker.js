// Old vs new episode file choice on real torrent file lists (data/torrent-files.jsonl format).
//   node test-file-picker.js <torrent-files.jsonl>
const fs = require('fs');
const f = require('./extract')(['seasonIn', 'fileSeason', 'namesEpisode', 'namesBareEpisode', 'stripExt', 'mediaOf',
    'biggest', 'explicitEpisodes', 'pickEpisodeFile', 'pickMovieFile', 'nameTokens', 'normalizeTitle', 'torrentYears', 'torrentTitlePrefix'],
    ['MEDIA_EXT', 'SIDE_FILE', 'TITLE_STOPWORDS', 'QUALITY_TOKEN']);

// v2.6.6 P2P rule: S01E05 in the file name, biggest hit
function oldPick(files, S, E) {
    const re = new RegExp(`S${String(S).padStart(2, '0')}E${String(E).padStart(2, '0')}(?!\\d)`, 'i');
    const hits = files.filter(x => re.test(x.name.split('/').pop()));
    return hits.length ? hits.reduce((a, b) => (b.size > a.size ? b : a)) : null;
}
const lists = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    .map(r => ({ h: r.h, files: r.m.map(([idx, name, size]) => ({ idx, name, size })) }))
    .filter(r => r.files.length > 1);
let agree = 0, disagree = [], oldOnly = [], newOnly = [], conflicts = [];
for (const { h, files } of lists) {
    const asked = new Set();
    for (const x of files) {
        const m = x.name.split('/').pop().match(/S(\d{1,2})E(\d{1,3})(?!\d)/i);
        if (m) asked.add(`${+m[1]}:${+m[2]}`);
    }
    // also ask E1..E30 of every season the files name (and season 1) to see what the new rules add
    const seasons = new Set([1, ...files.map(x => f.fileSeason(x.name)).filter(n => n !== null)]);
    for (const S of seasons) for (let E = 1; E <= 30; E++) asked.add(`${S}:${E}`);
    const chosenBy = new Map();
    for (const k of asked) {
        const [S, E] = k.split(':').map(Number);
        const o = oldPick(files, S, E), n = f.pickEpisodeFile(files, S, E, []);
        if (o && n) { if (o.idx === n.idx) agree++; else disagree.push({ h, S, E, old: o.name, new: n.name }); }
        else if (o && !n) oldOnly.push({ h, S, E, old: o.name });
        else if (!o && n) newOnly.push({ h, S, E, new: n.name });
        if (n) {
            if (chosenBy.has(n.idx)) conflicts.push({ h, a: chosenBy.get(n.idx), b: `S${S}E${E}`, file: n.name });
            else chosenBy.set(n.idx, `S${S}E${E}`);
        }
    }
}
console.log(`packs with 2+ media files: ${lists.length}`);
console.log(`old and new pick the same file: ${agree}`);
console.log(`DIFFERENT file: ${disagree.length}`); disagree.slice(0, 15).forEach(d => console.log('   ', `S${d.S}E${d.E}`, '| old:', d.old.slice(-60), '| new:', d.new.slice(-60)));
console.log(`old found, new not: ${oldOnly.length}`); oldOnly.slice(0, 15).forEach(d => console.log('   ', `S${d.S}E${d.E}`, d.old.slice(-80)));
console.log(`one file chosen for two episodes: ${conflicts.length}`); conflicts.slice(0, 25).forEach(d => console.log('   ', d.a, '&', d.b, '->', d.file.slice(-80)));
const byPack = new Map(); newOnly.forEach(d => { if (!byPack.has(d.h)) byPack.set(d.h, []); byPack.get(d.h).push(d); });
console.log(`new finds where old found nothing: ${newOnly.length} episodes in ${byPack.size} packs; samples:`);
[...byPack.values()].sort(() => 0).filter((_, i) => i % Math.max(1, Math.floor(byPack.size / 40)) === 0).slice(0, 40)
    .forEach(v => console.log('   ', v.slice(0, 2).map(d => `S${d.S}E${d.E} -> ${d.new.slice(-55)}`).join('   ||   ')));
