#!/usr/bin/env node
//
// Pre-warm the local torrent index.
//
// zamunda.life serves a FROZEN archive — zamunda.rip, zelka.org and arenabg.com are all
// gone, so no new releases arrive. That makes the index finishable: once the titles people
// actually open are covered, coverage is essentially done. Waiting for organic traffic gets
// there eventually; this gets there deliberately.
//
// It does NOT crawl .life. It asks Cinemeta which titles are popular, then makes ordinary
// searches through our own addon — exactly the requests a user opening that title would
// make, just earlier and slower. Volume is a few hundred a day at one every 8 seconds.
//
//   node prewarm.js                 # one pass, honouring the daily cap
//   PREWARM_CAP=50 node prewarm.js  # shorter pass
//   PREWARM_DRY=1 node prewarm.js   # build the queue, request nothing
//
const fs = require('fs');

const BASE      = process.env.PREWARM_BASE   || 'https://zamunda-stremio.tzkppv.com';
const CONFIG    = process.env.PREWARM_CONFIG || 'debrid=none|lang=bg';
const DELAY_MS  = Number(process.env.PREWARM_DELAY_MS || 8000);
const CAP       = Number(process.env.PREWARM_CAP || 300);
const TIMEOUT   = Number(process.env.PREWARM_TIMEOUT_MS || 60000);
const DRY       = !!process.env.PREWARM_DRY;
const DONE_FILE = process.env.PREWARM_DONE
    || '/opt/personal/sites/zamunda-stremio/data/prewarm-done.json';

// Cinemeta's own catalogs — the metadata service the addon already depends on.
const CATALOGS = [
    { type: 'movie',  id: 'top' },
    { type: 'series', id: 'top' },
    { type: 'movie',  id: 'imdbRating' },
    { type: 'series', id: 'imdbRating' },
    { type: 'movie',  id: 'year' },
    { type: 'series', id: 'year' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadDone() {
    try {
        const d = JSON.parse(fs.readFileSync(DONE_FILE, 'utf8'));
        return new Set(Array.isArray(d) ? d : d.done || []);
    } catch (e) {
        return new Set();
    }
}

function saveDone(done) {
    try {
        fs.mkdirSync(require('path').dirname(DONE_FILE), { recursive: true });
        fs.writeFileSync(`${DONE_FILE}.tmp`, JSON.stringify([...done]));
        fs.renameSync(`${DONE_FILE}.tmp`, DONE_FILE);   // atomic, as elsewhere in this project
    } catch (e) {
        console.error('  ! could not save progress:', e.message);
    }
}

async function fetchCatalog(type, id) {
    const url = `https://v3-cinemeta.strem.io/catalog/${type}/${id}.json`;
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const j = await r.json();
        return (j.metas || [])
            .map(m => ({ type, id: m.imdb_id || m.id, name: m.name }))
            .filter(x => x.id && x.id.startsWith('tt'));
    } catch (e) {
        console.error(`  ! catalog ${type}/${id}: ${e.message}`);
        return [];
    }
}

(async () => {
    const done = loadDone();
    console.log(`prewarm → ${BASE}`);
    console.log(`  already covered: ${done.size} titles`);

    // Build the queue
    const seen = new Set();
    const queue = [];
    for (const c of CATALOGS) {
        for (const item of await fetchCatalog(c.type, c.id)) {
            // A series is warmed via S01E01: the addon runs several searches for it
            // (title, title+S01, title+S01E01), so one request fills several index entries.
            const key = `${item.type}:${item.id}`;
            if (seen.has(key) || done.has(key)) continue;
            seen.add(key);
            queue.push(item);
        }
    }
    console.log(`  queue: ${queue.length} new titles (cap ${CAP} this pass)`);
    if (DRY) {
        queue.slice(0, 10).forEach(q => console.log(`    ${q.type} ${q.id}  ${q.name || ''}`));
        return;
    }
    if (!queue.length) return console.log('  nothing to do — coverage is current');

    let ok = 0, empty = 0, failed = 0, consecutiveFailures = 0;
    const started = Date.now();

    const finish = () => {
        saveDone(done);
        const mins = ((Date.now() - started) / 60000).toFixed(1);
        console.log(`\ndone in ${mins} min — ${ok} warmed, ${empty} with no results, ${failed} failed`);
        console.log(`  coverage now: ${done.size} titles`);
    };
    process.on('SIGINT', () => { finish(); process.exit(0); });

    for (const item of queue.slice(0, CAP)) {
        const sid = item.type === 'series' ? `${item.id}:1:1` : item.id;
        const url = `${BASE}/${CONFIG}/stream/${item.type}/${encodeURIComponent(sid)}.json`;
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
            if (!r.ok) throw new Error(`http ${r.status}`);
            const j = await r.json();
            const streams = (j.streams || []);
            // A lone "⚠️" row means the upstream could not answer — that is a failure to
            // retry later, not a title that genuinely has nothing.
            const isNotice = streams.length === 1 && /⚠️/.test(streams[0].name || '');
            if (isNotice) {
                failed++; consecutiveFailures++;
                console.log(`  ! ${sid} ${item.name || ''} — upstream unavailable`);
            } else {
                done.add(`${item.type}:${item.id}`);
                consecutiveFailures = 0;
                if (streams.length) { ok++; console.log(`  ✓ ${sid} ${(item.name || '').slice(0, 40)} — ${streams.length} streams`); }
                else { empty++; console.log(`  · ${sid} ${(item.name || '').slice(0, 40)} — no results`); }
            }
        } catch (e) {
            failed++; consecutiveFailures++;
            console.log(`  ! ${sid} — ${e.message}`);
        }

        // Back off hard rather than hammer a source that is clearly unwell.
        if (consecutiveFailures >= 5) {
            console.error('\n  stopping: 5 consecutive failures — the upstream looks down');
            break;
        }
        if ((ok + empty) % 25 === 0) saveDone(done);
        await sleep(DELAY_MS);
    }

    finish();
})();
