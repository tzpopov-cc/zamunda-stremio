const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 7000;
const DASHBOARD_KEY = process.env.DASHBOARD_KEY || '';   // set in server .env — no default, never in repo
const PROXY_API_KEY = process.env.PROXY_API_KEY || '';   // set in server .env — no default, never in repo

// =====================================================
// CONFIG
// =====================================================
const ZAMUNDA_API = 'https://api-proxy.tzkppv.com';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';
const RD_API = 'https://api.real-debrid.com/rest/1.0';
const TB_API = 'https://api.torbox.app/v1';

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(key) {
    const c = cache.get(key);
    if (c && Date.now() - c.time < CACHE_TTL) return c.data;
    if (c) cache.delete(key);
    return null;
}
function setCached(key, data) {
    cache.set(key, { data, time: Date.now() });
}
// =====================================================
// STATS — local JSON store (moved off Upstash Redis after the free 500K-command
// quota was exhausted). Persisted to a bind-mounted file so counters/users/logs
// survive container restarts and redeploys. Tiny dataset, single instance.
// =====================================================
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

const store = {
    counters: { configPage: 0, installs: 0, streams: 0 },
    daily: {},                  // { 'YYYY-MM-DD': { streams, pageViews } }
    users: new Set(),
    migratedUsers: new Set(),
    newUsers: new Set(),
    preMigrationUsers: new Set(),
    dailyStats: {},             // { 'YYYY-MM-DD': '<json snapshot string>' }
    logs: [],                   // newest-first, capped at 500
};

function loadStore() {
    try {
        const d = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        Object.assign(store.counters, d.counters || {});
        store.daily = d.daily || {};
        store.users = new Set(d.users || []);
        store.migratedUsers = new Set(d.migratedUsers || []);
        store.newUsers = new Set(d.newUsers || []);
        store.preMigrationUsers = new Set(d.preMigrationUsers || []);
        store.dailyStats = d.dailyStats || {};
        store.logs = Array.isArray(d.logs) ? d.logs : [];
        console.log(`💾 Stats loaded: ${store.users.size} users, ${store.counters.streams} streams, ${store.logs.length} logs`);
    } catch (e) {
        console.log(`💾 No stats file at ${STATS_FILE} (${e.code || e.message}) — starting fresh`);
    }
}

let dirty = false;
function markDirty() { dirty = true; }
function persist() {
    if (!dirty) return;
    dirty = false;
    const data = JSON.stringify({
        counters: store.counters,
        daily: store.daily,
        users: [...store.users],
        migratedUsers: [...store.migratedUsers],
        newUsers: [...store.newUsers],
        preMigrationUsers: [...store.preMigrationUsers],
        dailyStats: store.dailyStats,
        logs: store.logs,
    });
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(`${STATS_FILE}.tmp`, data);
        fs.renameSync(`${STATS_FILE}.tmp`, STATS_FILE);   // atomic replace
    } catch (e) {
        console.error('⚠️ Stats persist failed:', e.message);
        dirty = true;   // retry on next tick
    }
}

loadStore();
setInterval(persist, 5000);                                    // debounced flush to disk
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, () => { persist(); process.exit(0); }));

function todayKey() { return new Date().toISOString().substring(0, 10); }

// Counters
function incr(key) { store.counters[key] = (store.counters[key] || 0) + 1; markDirty(); }
function getCount(key) { return store.counters[key] || 0; }
function incrDaily(metric) {
    const d = (store.daily[todayKey()] = store.daily[todayKey()] || { streams: 0, pageViews: 0 });
    d[metric] = (d[metric] || 0) + 1; markDirty();
}
function getDailyCount(date, metric) { return (store.daily[date] && store.daily[date][metric]) || 0; }

// User sets
function sadd(key, val) { const s = store[key]; if (s && !s.has(val)) { s.add(val); markDirty(); } }
function scard(key) { return store[key] ? store[key].size : 0; }
function isPreMigration(id) { return store.preMigrationUsers.has(id); }

// Daily snapshot "hash" (returned in the [field, value, ...] shape the dashboard expects)
function setDailySnap(date, json) { store.dailyStats[date] = json; markDirty(); }
function hgetall(key) {
    if (key !== 'dailyStats') return [];
    const out = [];
    for (const [d, v] of Object.entries(store.dailyStats)) out.push(d, v);
    return out;
}

// Logs (newest-first, last 500)
function logEvent(type, msg) {
    store.logs.unshift(`${new Date().toISOString().substring(0, 19)} [${type}] ${msg}`);
    if (store.logs.length > 500) store.logs.length = 500;
    markDirty();
}
function getLogs(count = 50) { return store.logs.slice(0, count); }

// Stats summary — trivial in-memory read (no cache / quota / fallback needed anymore)
function getStats() {
    return {
        configPageViews: store.counters.configPage || 0,
        installs: store.counters.installs || 0,
        streamRequests: store.counters.streams || 0,
        uniqueUsers: store.users.size,
        migratedUsers: store.migratedUsers.size,
        newUsers: store.newUsers.size,
    };
}

// Snapshot user totals once per day (for the growth-delta table)
let lastSnapshotDate = '';
function dailySnapshot() {
    const today = todayKey();
    if (today === lastSnapshotDate) return;
    lastSnapshotDate = today;
    setDailySnap(today, JSON.stringify({
        date: today,
        totalUsers: store.users.size,
        migrated: store.migratedUsers.size,
        newUsers: store.newUsers.size,
    }));
    console.log(`📊 Daily snapshot saved: ${today}`);
}
setInterval(dailySnapshot, 60 * 60 * 1000);
setTimeout(dailySnapshot, 5000);

// Evict stale cache entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    let evicted = 0;
    for (const [key, val] of cache) {
        if (now - val.time >= CACHE_TTL) { cache.delete(key); evicted++; }
    }
    if (evicted > 0) console.log(`🧹 Cache eviction: ${evicted} stale entries removed, ${cache.size} remaining`);
}, 10 * 60 * 1000);

// (stats now live in the local JSON store defined above — Upstash Redis removed)

// =====================================================
// CONFIG PARSING — config lives in URL path
// Format: key=value|key=value (like Torrentio)
// =====================================================
const DEFAULTS = {
    debrid: 'none',         // none | realdebrid | torbox
    rdtoken: '',            // Real-Debrid token
    tbtoken: '',            // TorBox token
    debridmode: 'guaranteed', // guaranteed | all (guaranteed + P2P fallback)
    content: 'all',        // bgaudio | all
    quality: '4k,1080p,720p,sd',
    sort: 'quality',        // quality | size
    sources: 'zamunda,arenabg,zelka',
    sizelimit: '',          // e.g. "10GB" or "10GB,2GB" (movie,series)
    lang: 'bg',
};

function parseConfig(configStr) {
    const config = { ...DEFAULTS };
    if (!configStr || configStr === 'configure') return config;
    configStr.split('|').forEach(part => {
        const [key, val] = part.split('=');
        if (key && val !== undefined) config[key.toLowerCase()] = val;
    });
    return config;
}

function configFingerprint(config) {
    const token = config.rdtoken || config.tbtoken || '';
    const tokenHash = token ? crypto.createHash('md5').update(token).digest('hex').substring(0, 8) : 'none';
    return `${config.debrid}:${tokenHash}:${config.content}:${config.quality}:${config.sort}:${config.sources}:${config.sizelimit}`;
}

// =====================================================
// MANIFEST — dynamic based on config
// =====================================================
function buildManifest(config) {
    const mode = config.debrid === 'realdebrid' ? 'RD' : config.debrid === 'torbox' ? 'TorBox' : 'P2P';
    return {
        id: 'community.zamunda.bgaudio',
        version: '2.1.1',
        name: 'Zamunda BG',
        description: config.lang === 'bg'
            ? `Филми и сериали от Zamunda.RIP архива (${mode} режим)`
            : `Movies and series from Zamunda.RIP archive (${mode} mode)`,
        logo: 'https://raw.githubusercontent.com/tzpopov-cc/zamunda-stremio/main/icon.png',
        background: 'https://zamunda.rip/static/pirateship.png',
        types: ['movie', 'series'],
        catalogs: [],
        resources: ['stream'],
        idPrefixes: ['tt'],
        behaviorHints: {
            configurable: true,
            configurationRequired: false
        },
        stremioAddonsConfig: {
            issuer: 'https://stremio-addons.net',
            signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..I5n4VXWV1rFYMbk-QIcBrg.uMqRzy0n_9XW-juwsnqSxoAnnHUxP4_IDtLaSUNHK9rwMFSB937yegKv1xVonZOCY5-vYMRePgqPLi0WJ_InT5e0tByivrfFy1i61vPjtGuTl_rn8tz8fP87NrRbi7z4.X1FwB5w383DiuUiG5djx6g'
        }
    };
}

// =====================================================
// HELPERS
// =====================================================
async function getMetadata(type, imdbId) {
    const key = `meta:${type}:${imdbId}`;
    const cached = getCached(key);
    if (cached) return cached;
    try {
        const res = await axios.get(`${CINEMETA_API}/${type}/${imdbId}.json`, { timeout: 5000 });
        const meta = res.data.meta;
        setCached(key, meta);
        return meta;
    } catch (e) {
        console.error('Cinemeta error:', e.message);
        return null;
    }
}

async function searchZamunda(query) {
    const key = `search:${query.toLowerCase()}`;
    const cached = getCached(key);
    if (cached) return cached;
    try {
        const res = await axios.get(ZAMUNDA_API, {
            params: { q: query, limit: 50 },
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 ZamundaStremio/1.0', 'X-Api-Key': PROXY_API_KEY }
        });
        const data = res.data || [];
        setCached(key, data);
        return data;
    } catch (e) {
        console.error('Zamunda search error:', e.message);
        return [];
    }
}

function isBgAudio(torrent) {
    if (torrent.is_bgaudio === 1) return true;
    const text = ((torrent.title || '') + ' ' + (torrent.description || '')).toLowerCase();
    return /bgaudio|bg[\.\-\s_]?audio|bg[\.\-\s_]?dub|bulgarian|български|бг[\.\-\s_]?аудио|бг[\.\-\s_]?дублаж|dualaudio|dual[\.\-\s_]audio|bul[\.\-\s_]eng|bultor/i.test(text);
}

function parseSize(sizeStr) {
    if (!sizeStr) return 0;
    const num = parseFloat(sizeStr);
    if (!num) return 0;
    const s = sizeStr.toUpperCase();
    if (s.includes('GB')) return num;
    if (s.includes('MB')) return num / 1024;
    if (s.includes('TB')) return num * 1024;
    return num;
}

function detectQuality(title, sizeStr) {
    const t = title.toUpperCase();
    if (/2160P|\b4K\b|UHD/.test(t)) return { tag: '4K', key: '4k', score: 4 };
    if (/1080P|FHD|FULL.?HD/.test(t)) return { tag: '1080p', key: '1080p', score: 3 };
    if (/720P/.test(t)) return { tag: '720p', key: '720p', score: 2 };
    if (/DVDRIP|XVID|480P|\bSD\b|BDRIP|BRRIP/.test(t)) return { tag: 'SD', key: 'sd', score: 1 };
    const gb = parseSize(sizeStr);
    if (gb > 15) return { tag: '4K', key: '4k', score: 4 };
    if (gb > 4) return { tag: '1080p', key: '1080p', score: 3 };
    if (gb > 1.5) return { tag: '720p', key: '720p', score: 2 };
    if (gb > 0) return { tag: 'SD', key: 'sd', score: 1 };
    return { tag: '?', key: 'unknown', score: 0 };
}

function detectExtras(title) {
    const t = title.toUpperCase();
    const tags = [];
    if (/HDR|DOVI|DOLBY.VISION/.test(t)) tags.push('HDR');
    if (/HEVC|X265|H\.?265/.test(t)) tags.push('HEVC');
    if (/REMUX/.test(t)) tags.push('REMUX');
    if (/TRUEHD|ATMOS/.test(t)) tags.push('Atmos');
    if (/DTS/.test(t)) tags.push('DTS');
    if (/5\.1|7\.1/.test(t)) tags.push('5.1');
    return tags;
}

function matchesEpisode(title, season, episode) {
    const t = title.toUpperCase();
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    const sInt = parseInt(season);
    const eInt = parseInt(episode);

    // 1. Exact episode match: S01E02, S01.E02, 1x02, Season.1.Episode.2
    if ([
        new RegExp(`S${s}E${e}\\b`),
        new RegExp(`S${s}\\.E${e}\\b`),
        new RegExp(`\\b${sInt}X${e}\\b`),
        new RegExp(`SEASON[\\s._]*${sInt}[\\s._]*EPISODE[\\s._]*${eInt}\\b`),
    ].some(p => p.test(t))) return 'episode';

    // 2. Anime absolute episode: "- 137", "- 07 [720p]", "EP02" (no season prefix)
    if (sInt === 1) {
        const absPatterns = [
            new RegExp(`[\\s._-]+0*${eInt}\\s*[\\[\\(]`),       // "- 137 [720p]" or "- 07 [480p]"
            new RegExp(`[\\s._-]+0*${eInt}\\s*$`),               // "- 137" at end
            new RegExp(`[\\s._-]+0*${eInt}\\.\\w{2,4}$`),        // "- 01.mp4" at end
            new RegExp(`EP[\\s._]*0*${eInt}\\b`),                // "EP02", "EP 137"
            new RegExp(`\\bE0*${eInt}\\b(?!.*S\\d)`),            // "E02" without S prefix
        ];
        if (absPatterns.some(p => p.test(t))) return 'episode';
    }

    // 3. Episode range: S01E01-03, "1_-_293", "101-114", "01 ~ 100"
    // Flexible: handles _-_, spaces, ~, plain dash as separators
    const rangePatterns = [
        new RegExp(`S${s}E(\\d+)\\s*[-–]\\s*(\\d+)`),                   // S01E01-03
        /(\d+)\s*[-–_~]+\s*(\d+)\s*[\[\(]/,                             // "101-114 [720p]"
        /(\d+)\s*[-–_~]+\s*(\d+)\s*$/,                                  // "1-293" at end
        /[_\s.-]+(\d+)\s*[_\s]*[-–~]+\s*[_\s]*(\d+)(?:\s*[\[\(]|\s*$|[_\s]+)/,  // "1_-_293", "01 ~ 100"
    ];
    for (const p of rangePatterns) {
        const m = t.match(p);
        if (m) {
            const from = parseInt(m[1]);
            const to = parseInt(m[2]);
            if (from < to && eInt >= from && eInt <= to) return 'episode';
        }
    }

    // 4. Season pack: S01 (no episode), Season 1, Series 1, Сезон 1
    if ([
        new RegExp(`\\bS${s}\\b(?!E|\\d)`),
        new RegExp(`SEASON[\\s._]*${sInt}\\b`),
        new RegExp(`SERIES[\\s._]*${sInt}\\b`),
        new RegExp(`СЕЗОН[\\s._]*${sInt}\\b`),
    ].some(p => p.test(t))) return 'season';

    // 5. Multi-season range: S01-S12, Seasons 1-5
    const msPatterns = [
        new RegExp(`S(\\d+)[-–]S?(\\d+)`),                        // S01-S12 or S01-12
        new RegExp(`SEASONS?[\\s._]*(\\d+)[-–](\\d+)`),           // Seasons 1-5
        new RegExp(`SERIES[\\s._]*(\\d+)[-–](\\d+)`),             // Series 1-5
    ];
    for (const p of msPatterns) {
        const m = t.match(p);
        if (m) {
            const from = parseInt(m[1]);
            const to = parseInt(m[2]);
            if (sInt >= from && sInt <= to) return 'season';
        }
    }

    // 6. Complete/full series packs
    if (/COMPLETE|FULL.SERIES|ALL.SEASONS|COLLECTION|BOX.SET|INTEGRALE/i.test(t)) {
        return 'season';
    }

    return null;
}

function extractInfohash(magnet) {
    const m = magnet.match(/btih:([a-fA-F0-9]{40})/i);
    return m ? m[1].toLowerCase() : null;
}


// =====================================================
// BENCODE + FILE INDEX RESOLUTION
// =====================================================
function decodeBencode(buf, pos = 0, depth = 0) {
    if (depth > 20 || pos >= buf.length) return [null, buf.length];
    const ch = buf[pos];
    if (ch === 0x69) { // 'i' — integer
        const end = buf.indexOf(0x65, pos + 1);
        if (end === -1) return [null, buf.length];
        return [parseInt(buf.slice(pos + 1, end).toString()), end + 1];
    }
    if (ch === 0x6C) { // 'l' — list
        const list = []; pos++;
        while (pos < buf.length && buf[pos] !== 0x65) { const [v, np] = decodeBencode(buf, pos, depth + 1); list.push(v); pos = np; }
        return [list, Math.min(pos + 1, buf.length)];
    }
    if (ch === 0x64) { // 'd' — dict
        const dict = {}; pos++;
        while (pos < buf.length && buf[pos] !== 0x65) {
            const [k, kp] = decodeBencode(buf, pos, depth + 1);
            const [v, vp] = decodeBencode(buf, kp, depth + 1);
            if (k !== null) dict[k.toString()] = v; pos = vp;
        }
        return [dict, Math.min(pos + 1, buf.length)];
    }
    // string — length:data
    const colon = buf.indexOf(0x3A, pos);
    if (colon === -1 || colon > pos + 10) return [null, buf.length];
    const len = parseInt(buf.slice(pos, colon).toString());
    if (isNaN(len) || len < 0 || colon + 1 + len > buf.length) return [null, buf.length];
    const str = buf.slice(colon + 1, colon + 1 + len);
    return [str, colon + 1 + len];
}

async function resolveFileIdx(infohash, season, episode) {
    try {
        const res = await axios.get(
            `https://itorrents.org/torrent/${infohash}.torrent`,
            { responseType: 'arraybuffer', timeout: 5000, maxRedirects: 3 }
        );
        const [torrent] = decodeBencode(Buffer.from(res.data));
        const info = torrent.info || torrent['info'];
        if (!info || !info.files) return null;

        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        const pattern = new RegExp(`S${s}E${e}\\b`, 'i');

        const videoExts = /\.(mkv|mp4|avi|mov|m4v|ts|webm)$/i;
        let videoIdx = 0;
        for (let i = 0; i < info.files.length; i++) {
            const path = (info.files[i].path || []).map(p => p.toString()).join('/');
            if (!videoExts.test(path)) continue;
            if (pattern.test(path)) {
                console.log(`  📁 fileIdx ${videoIdx} → ${path}`);
                return videoIdx;
            }
            videoIdx++;
        }
        return null;
    } catch (e) {
        console.error('  ⚠️ fileIdx resolve failed:', e.message);
        return null;
    }
}

// =====================================================
// REAL-DEBRID
// =====================================================
async function parallelLimit(tasks, limit) {
    const results = [];
    let i = 0;
    async function worker() {
        while (i < tasks.length) {
            const idx = i++;
            results[idx] = await tasks[idx]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
    return results;
}

async function checkAndResolve(magnet, rdToken, season, episode) {
    const headers = { Authorization: `Bearer ${rdToken}` };
    let torrentId;
    try {
        const addRes = await axios.post(`${RD_API}/torrents/addMagnet`,
            new URLSearchParams({ magnet }), { headers, timeout: 10000 });
        torrentId = addRes.data.id;

        const infoRes = await axios.get(`${RD_API}/torrents/info/${torrentId}`, { headers, timeout: 8000 });
        const info = infoRes.data;

        if (info.status === 'downloaded' && info.links?.length > 0) {
            const ur = await axios.post(`${RD_API}/unrestrict/link`,
                new URLSearchParams({ link: info.links[0] }), { headers, timeout: 8000 });
            return ur.data.download;
        }

        if (info.status !== 'waiting_files_selection' || !info.files) {
            await axios.delete(`${RD_API}/torrents/delete/${torrentId}`, { headers }).catch(() => {});
            return null;
        }

        const videoFiles = info.files.filter(f => /\.(mkv|mp4|avi|mov|m4v|ts|webm|vob)$/i.test(f.path));
        if (videoFiles.length === 0) {
            await axios.delete(`${RD_API}/torrents/delete/${torrentId}`, { headers }).catch(() => {});
            return null;
        }

        let target;
        if (season && episode && videoFiles.length > 1) {
            const s = String(season).padStart(2, '0');
            const e = String(episode).padStart(2, '0');
            target = videoFiles.find(f => new RegExp(`S${s}E${e}|${parseInt(season)}x${e}|E${e}[^0-9]`, 'i').test(f.path));
        }
        if (!target) target = videoFiles.sort((a, b) => b.bytes - a.bytes)[0];

        await axios.post(`${RD_API}/torrents/selectFiles/${torrentId}`,
            new URLSearchParams({ files: target.id.toString() }), { headers, timeout: 8000 });

        for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 1500));
            const poll = await axios.get(`${RD_API}/torrents/info/${torrentId}`, { headers, timeout: 8000 });
            if (poll.data.status === 'downloaded' && poll.data.links?.length > 0) {
                const ur = await axios.post(`${RD_API}/unrestrict/link`,
                    new URLSearchParams({ link: poll.data.links[0] }), { headers, timeout: 8000 });
                return ur.data.download;
            }
            if (poll.data.status === 'downloading' || poll.data.status === 'queued') {
                await axios.delete(`${RD_API}/torrents/delete/${torrentId}`, { headers }).catch(() => {});
                return null;
            }
        }
        await axios.delete(`${RD_API}/torrents/delete/${torrentId}`, { headers }).catch(() => {});
        return null;
    } catch (e) {
        if (torrentId) await axios.delete(`${RD_API}/torrents/delete/${torrentId}`,
            { headers: { Authorization: `Bearer ${rdToken}` } }).catch(() => {});
        return null;
    }
}

// =====================================================
// TORBOX
// =====================================================
async function tbCheckCached(infohashes, tbToken) {
    try {
        const res = await axios.post(
            `${TB_API}/api/torrents/checkcached?format=list&list_files=true`,
            { hashes: infohashes },
            { headers: { Authorization: `Bearer ${tbToken}` }, timeout: 10000 }
        );
        if (res.data?.success) {
            return new Map((res.data.data || []).map(r => [r.hash, r]));
        }
        return new Map();
    } catch (e) {
        const detail = e.response?.data?.detail || e.message;
        const isAuthError = e.response?.status === 401 || e.response?.status === 403 || /token.*invalid|token.*expired|log in again/i.test(detail);
        console.error('TorBox cache check error:', detail);
        logEvent('ERROR', `TB cache check: ${detail}`);
        const result = new Map();
        if (isAuthError) result._authError = true;
        return result;
    }
}

async function tbResolve(magnet, infohash, tbToken, season, episode) {
    const headers = { Authorization: `Bearer ${tbToken}` };
    try {
        // Create torrent (if cached, returns instantly)
        const createRes = await axios.post(`${TB_API}/api/torrents/createtorrent`,
            new URLSearchParams({ magnet, allow_zip: 'false' }),
            { headers, timeout: 15000 });

        if (!createRes.data?.success) return null;
        const torrentId = createRes.data.data?.torrent_id;
        if (!torrentId) return null;

        // Get torrent info
        const infoRes = await axios.get(`${TB_API}/api/torrents/mylist`, {
            params: { id: torrentId, bypass_cache: true },
            headers, timeout: 10000
        });

        const torrent = infoRes.data?.data;
        if (!torrent?.download_present) return null;

        // Find video file
        const videoFiles = (torrent.files || [])
            .filter(f => /\.(mkv|mp4|avi|mov|m4v|ts|webm|vob)$/i.test(f.short_name));
        if (videoFiles.length === 0) return null;

        let target;
        if (season && episode && videoFiles.length > 1) {
            const s = String(season).padStart(2, '0');
            const e = String(episode).padStart(2, '0');
            const epPattern = new RegExp(`S${s}E${e}|${parseInt(season)}x${e}|E${e}[^0-9]`, 'i');
            target = videoFiles.find(f => epPattern.test(f.name || f.short_name));
        }
        if (!target) target = videoFiles.sort((a, b) => b.size - a.size)[0];

        // Get download link
        const dlRes = await axios.get(`${TB_API}/api/torrents/requestdl`, {
            params: { token: tbToken, torrent_id: torrentId, file_id: target.id },
            headers, timeout: 10000
        });

        return dlRes.data?.data || null; // data is the download URL string
    } catch (e) {
        console.error('TorBox resolve error:', e.response?.data?.detail || e.message);
        logEvent('ERROR', `TB resolve: ${e.response?.data?.detail || e.message}`);
        return null;
    }
}

// =====================================================
// FILTERS
// =====================================================
function applyFilters(torrents, config, type) {
    let filtered = torrents;

    // Content filter
    if (config.content === 'bgaudio') {
        filtered = filtered.filter(isBgAudio);
    }

    // Source filter removed — all sources always included

    // Quality — always detect for display, only filter if not all selected
    const qualities = config.quality.split(',').map(q => q.trim().toLowerCase());
    const allQualities = qualities.length >= 4 || config.quality === DEFAULTS.quality;
    filtered.forEach(t => {
        t._quality = detectQuality(t.title, t.size);
        t._extras = detectExtras(t.title);
    });
    if (!allQualities) {
        filtered = filtered.filter(t => qualities.includes(t._quality.key) || t._quality.key === 'unknown');
    }

    // Size limit
    if (config.sizelimit) {
        const limits = config.sizelimit.split(',');
        const limitGB = parseSize(type === 'movie' ? limits[0] : (limits[1] || limits[0]));
        if (limitGB > 0) {
            filtered = filtered.filter(t => parseSize(t.size) <= limitGB);
        }
    }

    return filtered;
}

function sortTorrents(torrents, config) {
    const sortBy = config.sort || 'quality';
    return torrents.sort((a, b) => {
        if (sortBy === 'size') {
            return parseSize(b.size) - parseSize(a.size);
        }
        // Default: quality, then smaller size within same quality
        if (b._quality.score !== a._quality.score) return b._quality.score - a._quality.score;
        const aRemux = /REMUX/i.test(a.title);
        const bRemux = /REMUX/i.test(b.title);
        if (aRemux !== bRemux) return aRemux ? 1 : -1;
        return parseSize(a.size) - parseSize(b.size);
    });
}

// =====================================================
// MAIN RESOLVER
// =====================================================
async function resolveStreams(type, fullId, config) {
    const [imdbId, seasonStr, episodeStr] = fullId.split(':');
    const season = seasonStr ? parseInt(seasonStr) : null;
    const episode = episodeStr ? parseInt(episodeStr) : null;

    const meta = await getMetadata(type, imdbId);
    if (!meta) {
        logEvent('MISS', `${type} ${imdbId} — Cinemeta returned no metadata`);
        return [];
    }

    const label = `${type} "${meta.name}"${season ? ` S${season}E${episode}` : ''}`;
    console.log(`\n🔍 ${label} [${config.debrid}|${config.content}]`);
    logEvent('SEARCH', `${label} [${config.debrid}|${config.content}]`);

    // Build search queries — for series, search with season/episode patterns too
    // because zamunda API returns max 20 results per query
    const queries = [meta.name];
    if (meta.bulgarian_name) queries.push(meta.bulgarian_name);
    if (type === 'series' && season) {
        const s = String(season).padStart(2, '0');
        const e = episode ? String(episode).padStart(2, '0') : null;
        // Search "Friends S01" to get season packs + individual episodes
        queries.push(`${meta.name} S${s}`);
        // Search "Friends S01E05" for the specific episode
        if (e) queries.push(`${meta.name} S${s}E${e}`);
    }

    let allTorrents = [];
    for (const q of queries) {
        const results = await searchZamunda(q);
        allTorrents = allTorrents.concat(results);
    }

    // Deduplicate by infohash
    const seen = new Set();
    allTorrents = allTorrents.filter(t => {
        const h = extractInfohash(t.link);
        if (!h || seen.has(h)) return false;
        seen.add(h);
        t._infohash = h;
        return true;
    });
    console.log(`  ${allTorrents.length} unique torrents`);

    if (allTorrents.length === 0) {
        logEvent('MISS', `${label} — 0 results from zamunda`);
        return [];
    }

    // Episode matching for series
    if (type === 'series' && season && episode) {
        const beforeCount = allTorrents.length;
        const matched = allTorrents.map(t => ({
            ...t, _matchType: matchesEpisode(t.title, season, episode)
        })).filter(t => t._matchType !== null);
        console.log(`  ${matched.length} match S${season}E${episode}`);

        if (matched.length > 0) {
            allTorrents = matched;
        } else {
            // Fallback: show torrents with no season/episode info at all (bare title packs)
            // e.g. "Johnny Bravo" — likely a complete pack the user can pick from
            const fallback = allTorrents.filter(t => {
                const u = t.title.toUpperCase();
                return !/S\d|SEASON\s*\d|SERIES\s*\d|СЕЗОН|E\d|EP\d|\d+[-–~]\d+/.test(u);
            }).map(t => ({ ...t, _matchType: 'fallback' }));

            if (fallback.length > 0) {
                console.log(`  ${fallback.length} fallback (no season/ep info)`);
                allTorrents = fallback;
            } else {
                // Categorize WHY no episodes matched — helps debugging
                const seasons = new Set();
                const episodes = new Set();
                allTorrents.forEach(t => {
                    const u = t.title.toUpperCase();
                    const sm = u.match(/S(\d+)/g);
                    if (sm) sm.forEach(s => seasons.add(parseInt(s.slice(1))));
                    const em = u.match(/S\d+E(\d+)/g);
                    if (em) em.forEach(e => episodes.add(parseInt(e.match(/E(\d+)/)[1])));
                });
                let detail = '';
                if (seasons.size > 0 && !seasons.has(season)) {
                    const avail = [...seasons].sort((a, b) => a - b).map(s => `S${String(s).padStart(2, '0')}`).join(',');
                    detail = ` (available: ${avail})`;
                } else if (episodes.size > 0 && !episodes.has(episode)) {
                    const maxEp = Math.max(...episodes);
                    detail = ` (latest: E${String(maxEp).padStart(2, '0')})`;
                }
                const titles = allTorrents.slice(0, 3).map(t => t.title.substring(0, 80));
                logEvent('MISS', `${label} — ${beforeCount} torrents but 0 episode matches${detail} [${titles.join(' | ')}]`);
                return [];
            }
        }
    }

    // Apply content/source/quality/size filters
    let filtered = applyFilters(allTorrents, config, type);
    console.log(`  ${filtered.length} after filters`);
    if (filtered.length === 0) {
        const sampleTitles = allTorrents.slice(0, 3).map(t => t.title.substring(0, 80));
        logEvent('MISS', `${label} — ${allTorrents.length} torrents but 0 after filters (${config.content}|${config.quality}) [${sampleTitles.join(' | ')}]`);

        // If BG audio filter is the reason, fall back to showing all results with a hint
        if (config.content === 'bgaudio' && allTorrents.length > 0) {
            logEvent('BGFILTER', `${label} — no BG audio, falling back to all (${allTorrents.length} torrents)`);
            // Re-apply filters without bgaudio restriction
            const fallbackConfig = { ...config, content: 'all' };
            filtered = applyFilters(allTorrents, fallbackConfig, type);
            filtered = sortTorrents(filtered, fallbackConfig);
            // Continue to debrid/P2P resolution below with a hint prepended
            if (filtered.length > 0) {
                config._bgFallback = true; // flag to prepend hint stream later
            } else {
                return [];
            }
        } else {
            // Quality filter fallback — if quality filter killed everything, show all qualities with a warning
            const qualities = config.quality.split(',').map(q => q.trim().toLowerCase());
            const allQualities = qualities.length >= 4;
            if (!allQualities && allTorrents.length > 0) {
                logEvent('QUALFILTER', `${label} — no ${config.quality} results, falling back to all qualities (${allTorrents.length} torrents)`);
                const fallbackConfig = { ...config, quality: '4k,1080p,720p,sd' };
                filtered = applyFilters(allTorrents, fallbackConfig, type);
                filtered = sortTorrents(filtered, fallbackConfig);
                if (filtered.length > 0) {
                    config._qualityFallback = true;
                } else {
                    return [];
                }
            } else {
                return [];
            }
        }
    }

    // Sort
    filtered = sortTorrents(filtered, config);

    // Resolve correct fileIdx for pack torrents (season packs / complete series)
    if (season && episode) {
        const packs = filtered.filter(t => t._matchType === 'season' || t._matchType === 'fallback');
        if (packs.length > 0) {
            await Promise.all(packs.map(async (t) => {
                const idx = await resolveFileIdx(t._infohash, season, episode);
                if (idx !== null) t._resolvedFileIdx = idx;
            }));
        }
    }

    const hasRD = config.debrid === 'realdebrid' && config.rdtoken;
    const hasTB = config.debrid === 'torbox' && config.tbtoken;
    const debridMode = config.debridmode || config.rdmode || 'guaranteed'; // backward compat

    // BG audio fallback hint — prepended to results when bgaudio filter found no BG tracks
    const bgHint = config._bgFallback ? [{
        name: `⚠️ Няма БГ аудио\nZamunda BG`,
        title: `Няма торенти с БГ аудио.\nПоказваме всички ${filtered.length} резултата.`,
        externalUrl: 'https://zamunda-stremio-qd0j.onrender.com',
        behaviorHints: { notWebReady: true }
    }] : [];

    // Quality fallback hint — prepended to results when quality filter found no matching quality
    const qualHint = config._qualityFallback ? [{
        name: `⚠️ Няма ${config.quality}\nZamunda BG`,
        title: `Няма торенти в избраното качество.\nПоказваме всички ${filtered.length} резултата.`,
        externalUrl: 'https://zamunda-stremio.tzkppv.com',
        behaviorHints: { notWebReady: true }
    }] : [];

    const hints = [...bgHint, ...qualHint];

    // ---- TORBOX MODE ----
    if (hasTB) {
        console.log(`  TorBox mode (${debridMode}): checking ${filtered.length} torrents...`);
        const startTime = Date.now();
        const infohashes = filtered.map(t => t._infohash);
        const cached = await tbCheckCached(infohashes, config.tbtoken);

        // If TB token is expired/invalid, show warning + fall back to P2P
        if (cached._authError) {
            const tbAuthHint = [{
                name: `⚠️ TorBox грешка\nZamunda BG`,
                title: config.lang === 'bg'
                    ? `TorBox токенът е изтекъл или невалиден.\nПреконфигурирай добавката с нов токен.`
                    : `TorBox token expired or invalid.\nReconfigure the addon with a new token.`,
                externalUrl: 'https://zamunda-stremio.tzkppv.com',
                behaviorHints: { notWebReady: true }
            }];
            const p2pStreams = filtered.map(t => buildStream(t, null, 'p2p'));
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`  → TB auth error, ${p2pStreams.length} P2P fallback in ${elapsed}s`);
            logEvent('TB', `0 TB (auth error) + ${p2pStreams.length} P2P in ${elapsed}s — "${meta.name}"`);
            return [...hints, ...tbAuthHint, ...p2pStreams];
        }

        const cachedTorrents = filtered.filter(t => cached.has(t._infohash));
        console.log(`  ${cachedTorrents.length} cached on TorBox`);

        // Resolve cached torrents — TorBox is fast, can do more concurrency
        const tasks = cachedTorrents.map(torrent => async () => {
            const url = await tbResolve(torrent.link, torrent._infohash, config.tbtoken, season, episode);
            if (url) console.log(`  ✅ ${torrent._quality.tag} ${torrent.title.substring(0, 50)}`);
            return { torrent, url };
        });
        const results = await parallelLimit(tasks, 3);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const tbStreams = results.filter(r => r.url).map(({ torrent, url }) => buildStream(torrent, url, 'tb'));

        if (debridMode === 'all') {
            const resolvedHashes = new Set(results.filter(r => r.url).map(r => r.torrent._infohash));
            const p2pStreams = filtered
                .filter(t => !resolvedHashes.has(t._infohash))
                .map(t => buildStream(t, null, 'p2p'));
            console.log(`  → ${tbStreams.length} TB + ${p2pStreams.length} P2P in ${elapsed}s`);
            logEvent('TB', `${tbStreams.length} TB + ${p2pStreams.length} P2P in ${elapsed}s — "${meta.name}"`);
            return [...hints, ...tbStreams, ...p2pStreams];
        }

        console.log(`  → ${tbStreams.length} playable in ${elapsed}s`);
        logEvent('TB', `${tbStreams.length} playable in ${elapsed}s — "${meta.name}"`);
        return [...hints, ...tbStreams];
    }

    // ---- RD MODE ----
    if (hasRD) {
        console.log(`  RD mode (${debridMode}): checking ${filtered.length} torrents...`);
        const startTime = Date.now();
        const tasks = filtered.map((torrent, idx) => async () => {
            const url = await checkAndResolve(torrent.link, config.rdtoken, season, episode);
            if (url) console.log(`  ✅ ${torrent._quality.tag} ${torrent.title.substring(0, 50)}`);
            return { torrent, url };
        });
        const results = await parallelLimit(tasks, 2);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        const rdStreams = results.filter(r => r.url).map(({ torrent, url }) => buildStream(torrent, url, 'rd'));

        if (debridMode === 'all') {
            const resolvedHashes = new Set(results.filter(r => r.url).map(r => r.torrent._infohash));
            const p2pStreams = filtered
                .filter(t => !resolvedHashes.has(t._infohash))
                .map(t => buildStream(t, null, 'p2p'));
            console.log(`  → ${rdStreams.length} RD + ${p2pStreams.length} P2P in ${elapsed}s`);
            logEvent('RD', `${rdStreams.length} RD + ${p2pStreams.length} P2P in ${elapsed}s — "${meta.name}"`);
            return [...hints, ...rdStreams, ...p2pStreams];
        }

        console.log(`  → ${rdStreams.length} playable in ${elapsed}s`);
        logEvent('RD', `${rdStreams.length} playable in ${elapsed}s — "${meta.name}"`);
        return [...hints, ...rdStreams];
    }

    // ---- P2P MODE ----
    console.log(`  P2P mode: returning ${filtered.length} streams`);
    logEvent('P2P', `${filtered.length} streams — "${meta.name}"`);
    return [...hints, ...filtered.map(torrent => buildStream(torrent, null, 'p2p'))];
}

function buildStream(torrent, url, mode) {
    const q = torrent._quality;
    const extras = torrent._extras || [];
    const rawSrc = (torrent.source || '').toLowerCase();
    const src = rawSrc === 'z' ? 'Zelka' : rawSrc.charAt(0).toUpperCase() + rawSrc.slice(1);
    const bg = isBgAudio(torrent);
    const sizeStr = torrent.size || '?';

    // NAME field (left side in Stremio)
    const qualityLine = extras.length > 0 ? `${q.tag} ${extras.join(' ')}` : q.tag;
    const namePrefix = mode === 'rd' ? '⚡ RD' : mode === 'tb' ? '⚡ TB' : '🔗 P2P';

    // TITLE field (right side in Stremio)
    const bgFlag = bg ? ' 🇧🇬' : '';
    const infoLine = `💾 ${sizeStr} ⚙️ ${src}${bgFlag}`;

    const stream = {
        name: `${namePrefix}\nZamunda ${qualityLine}`,
        title: `${torrent.title.substring(0, 100)}\n${infoLine}`,
        behaviorHints: {
            bingeGroup: `zamunda-${q.key}`,
            notWebReady: true
        }
    };

    if (url) {
        stream.url = url;
    } else {
        stream.infoHash = torrent._infohash;
        // For packs with resolved file index, use it; for single episodes/movies use 0
        if (torrent._resolvedFileIdx !== undefined) {
            stream.fileIdx = torrent._resolvedFileIdx;
        } else if (torrent._matchType !== 'season' && torrent._matchType !== 'fallback') {
            stream.fileIdx = 0;
        }
    }

    return stream;
}

// =====================================================
// EXPRESS ROUTES (configPageHTML removed — served from config.html)
// =====================================================
// DEAD CODE REMOVED: configPageHTML() was ~400 lines of inline HTML
// Config page is now served from config.html file
// =====================================================
// =====================================================
// EXPRESS ROUTES
// =====================================================

// Track unique user from IP or RD token
function getUserId(req, config) {
    return config?.rdtoken ? config.rdtoken.substring(0, 8) : (req.ip || req.headers['x-forwarded-for'] || 'unknown');
}
function trackUser(req, config) {
    const id = getUserId(req, config);
    sadd('users', id);
}
function trackMigration(req, config) {
    const id = getUserId(req, config);
    // Was this user seen before the migration?
    if (isPreMigration(id)) sadd('migratedUsers', id);
    else sadd('newUsers', id);
}

// Config page
const configHTML = fs.readFileSync(path.join(__dirname, 'config.html'), 'utf8');
app.get('/', (req, res) => { incr('configPage'); incrDaily('pageViews'); res.type('html').send(configHTML); });
app.get('/configure', (req, res) => res.redirect('/'));
app.get('/:config/configure', (req, res) => res.redirect('/'));

// Manifest
app.get('/manifest.json', (req, res) => { incr('installs'); res.json(buildManifest(DEFAULTS)); });
app.get('/:config/manifest.json', (req, res) => {
    incr('installs');
    const config = parseConfig(decodeURIComponent(req.params.config));
    trackUser(req, config);
    trackMigration(req, config);
    res.json(buildManifest(config));
});

// Streams
app.get('/:config/stream/:type/:id.json', async (req, res) => {
    incr('streams'); incrDaily('streams');
    try {
        const config = parseConfig(decodeURIComponent(req.params.config));
        trackUser(req, config);
        const { type, id } = req.params;
        if (!['movie', 'series'].includes(type)) return res.json({ streams: [] });

        const cacheKey = `streams:${configFingerprint(config)}:${id}`;
        const cached = getCached(cacheKey);
        if (cached) {
            console.log(`⚡ Cache hit: ${id}`);
            return res.json({ streams: cached });
        }

        const streams = await resolveStreams(type, id, config);
        if (streams.length > 0) setCached(cacheKey, streams);
        res.json({ streams });
    } catch (e) {
        console.error('Stream handler error:', e);
        logEvent('ERROR', `Stream handler: ${e.message}`);
        res.json({ streams: [] });
    }
});

// Auth middleware for admin endpoints
function adminAuth(req, res, next) {
    const key = req.query.key || req.headers['x-dashboard-key'];
    // Fail closed: if DASHBOARD_KEY is unset, deny all (never match an empty key).
    if (DASHBOARD_KEY && key === DASHBOARD_KEY) return next();
    res.status(403).json({ error: 'Unauthorized. Add ?key=YOUR_KEY' });
}

// Stats — JSON API (public, used by config page)
app.get('/stats', async (req, res) => {
    const s = await getStats();
    res.json({ ...s, persistent: true });
});

// Stats history (auth required)
app.get('/stats/history', adminAuth, async (req, res) => {
    const raw = await hgetall('dailyStats');
    if (!raw || raw.length === 0) return res.json([]);
    // hgetall returns [field, value, field, value, ...]
    const history = [];
    for (let i = 0; i < raw.length; i += 2) {
        try { history.push(JSON.parse(raw[i + 1])); } catch (e) {}
    }
    history.sort((a, b) => a.date.localeCompare(b.date));
    res.json(history);
});

// Stats — Visual dashboard (auth required)
app.get('/dashboard', adminAuth, async (req, res) => {
    const s = await getStats();
    const { configPageViews: configPage, installs, streamRequests: streams, uniqueUsers: users, migratedUsers: migrated, newUsers: newU } = s;
    const historyRaw = await hgetall('dailyStats');
    // Build history from snapshots + daily counters
    const history = [];
    if (historyRaw && historyRaw.length > 0) {
        const dates = [];
        for (let i = 0; i < historyRaw.length; i += 2) {
            try { const s = JSON.parse(historyRaw[i + 1]); dates.push(s); } catch (e) {}
        }
        const dailyCounts = dates.map(d => ({
            ...d,
            dayStreams: getDailyCount(d.date, 'streams'),
            dayViews: getDailyCount(d.date, 'pageViews'),
        }));
        dailyCounts.sort((a, b) => b.date.localeCompare(a.date));
        history.push(...dailyCounts);
    }
    const count = Math.min(parseInt(req.query.n) || 50, 500);
    const logs = await getLogs(count);
    const errors = logs.filter(l => l.includes('[ERROR]'));
    const misses = logs.filter(l => l.includes('[MISS]'));
    const searches = logs.filter(l => l.includes('[SEARCH]'));

    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Zamunda BG — Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="https://raw.githubusercontent.com/tzpopov-cc/zamunda-stremio/main/icon.png">
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--gold:#f5d020;--bg:#060608;--surface:rgba(255,255,255,0.04);--border:rgba(255,255,255,0.08);--text:#e0e0e0;--dim:#777;--muted:#444;--green:#66bb6a;--red:#ef5350;--blue:#42a5f5;--orange:#ffa726}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:16px}
.wrap{max-width:700px;margin:0 auto}
h1{font-family:'Chakra Petch',sans-serif;font-size:24px;color:var(--gold);text-align:center;margin-bottom:4px;letter-spacing:1px}
.sub{text-align:center;font-size:12px;color:var(--muted);margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.card.wide{grid-column:span 2}
.card-value{font-family:'Chakra Petch',sans-serif;font-size:32px;font-weight:700;color:var(--gold);line-height:1}
.card-value.green{color:var(--green)}
.card-value.blue{color:var(--blue)}
.card-value.red{color:var(--red)}
.card-value.orange{color:var(--orange)}
.card-label{font-size:11px;color:var(--dim);margin-top:4px;letter-spacing:0.5px}
.section-title{font-family:'Chakra Petch',sans-serif;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--dim);margin:20px 0 10px}
.log-box{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;max-height:50vh;overflow-y:auto;font-size:12px;line-height:1.8}
.log-line{border-bottom:1px solid rgba(255,255,255,0.03);padding:2px 0}
.log-line:last-child{border:none}
.t-search{color:var(--blue)}
.t-miss{color:var(--orange)}
.t-error{color:var(--red)}
.t-p2p{color:var(--green)}
.t-rd,.t-tb{color:var(--gold)}
.t-bg{color:#ce93d8}
.refresh{display:block;margin:20px auto 0;padding:10px 24px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--dim);font-family:'Chakra Petch',sans-serif;font-size:13px;cursor:pointer;letter-spacing:0.5px}
.refresh:hover{border-color:var(--gold);color:var(--gold)}
@media(max-width:500px){.grid{grid-template-columns:repeat(2,1fr)}.card-value{font-size:26px}}
</style>
</head>
<body>
<div class="wrap">
<h1>ZAMUNDA BG</h1>
<p class="sub">Live Dashboard — ${new Date().toISOString().substring(0,16).replace('T',' ')}</p>

<div class="grid">
<div class="card"><div class="card-value">${Number(users||0)}</div><div class="card-label">Total Users</div></div>
<div class="card"><div class="card-value green">${Number(migrated||0)}</div><div class="card-label">Migrated</div></div>
<div class="card"><div class="card-value blue">${Number(newU||0)}</div><div class="card-label">New Users</div></div>
<div class="card"><div class="card-value">${Number(configPage)}</div><div class="card-label">Page Views</div></div>
<div class="card"><div class="card-value">${(Number(streams)/1000).toFixed(1)}K</div><div class="card-label">Stream Requests</div></div>
<div class="card"><div class="card-value orange">${searches.length}</div><div class="card-label">Searches (last ${logs.length})</div></div>
<div class="card"><div class="card-value ${misses.length > 0 ? 'orange' : 'green'}">${(misses.length/Math.max(searches.length,1)*100).toFixed(0)}%</div><div class="card-label">Miss Rate</div></div>
</div>

<div class="grid" style="grid-template-columns:repeat(2,1fr)">
<div class="card"><div class="card-value ${errors.length > 0 ? 'red' : 'green'}">${errors.length}</div><div class="card-label">Errors</div></div>
<div class="card"><div class="card-value orange">${misses.length}</div><div class="card-label">Misses</div></div>
</div>

<div class="section-title">Recent Activity (last ${logs.length})</div>
<div class="log-box">
${logs.map(l => {
    let cls = '';
    if (l.includes('[SEARCH]')) cls = 't-search';
    else if (l.includes('[MISS]')) cls = 't-miss';
    else if (l.includes('[ERROR]')) cls = 't-error';
    else if (l.includes('[P2P]')) cls = 't-p2p';
    else if (l.includes('[RD]')) cls = 't-rd';
    else if (l.includes('[TB]')) cls = 't-tb';
    else if (l.includes('[BGFILTER]')) cls = 't-bg';
    const time = l.substring(11,16);
    const rest = l.substring(20);
    return '<div class="log-line"><span style="color:var(--muted)">' + time + '</span> <span class="' + cls + '">' + rest.replace(/</g,'&lt;') + '</span></div>';
}).join('')}
</div>

${history.length > 0 ? `
<div class="section-title">Daily Stats</div>
<div class="log-box" style="max-height:30vh">
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr style="color:var(--gold);text-align:left;border-bottom:1px solid var(--border)">
<th style="padding:6px 4px">Date</th><th>Users</th><th>Migrated</th><th>New</th><th>Streams</th><th>Page Views</th></tr>
${history.map((h, i) => {
    const prev = history[i + 1]; // sorted desc, so i+1 is previous day
    const dMigrated = prev ? h.migrated - prev.migrated : h.migrated;
    const dNew = prev ? h.newUsers - prev.newUsers : h.newUsers;
    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)"><td style="padding:4px;color:var(--dim)">' + h.date.substring(5) + '</td>'
    + '<td>' + h.totalUsers + '</td>'
    + '<td style="color:var(--green)">' + (dMigrated > 0 ? '+' + dMigrated : dMigrated) + '</td>'
    + '<td style="color:var(--blue)">' + (dNew > 0 ? '+' + dNew : dNew) + '</td>'
    + '<td style="color:var(--gold)">' + (h.dayStreams || 0) + '</td>'
    + '<td style="color:var(--gold)">' + (h.dayViews || 0) + '</td></tr>';
}).join('')}
</table>
</div>` : ''}

<div class="section-title">Server Status</div>
<div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px">
<div style="display:flex;align-items:center;gap:10px">
<div style="width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)"></div>
<span style="font-size:14px;font-weight:600">Online</span>
<span style="font-size:12px;color:var(--dim)">v2.1.1</span>
</div>
<a href="https://stats.uptimerobot.com/w0wKhtFnIu" target="_blank" style="color:var(--gold);font-size:12px;text-decoration:none;font-family:'Chakra Petch',sans-serif">Full Status ↗</a>
</div>

<button class="refresh" onclick="location.reload()">Refresh</button>
</div>
</body>
</html>`);
});

// Logs — last 50 events (auth required)
app.get('/logs', adminAuth, async (req, res) => {
    const count = Math.min(parseInt(req.query.n) || 50, 500);
    const logs = await getLogs(count);
    const errors = logs.filter(l => l.includes('[ERROR]'));
    const misses = logs.filter(l => l.includes('[MISS]'));
    const searches = logs.filter(l => l.includes('[SEARCH]'));
    res.json({
        total: logs.length,
        searches: searches.length,
        misses: misses.length,
        errors: errors.length,
        missDetails: misses,
        logs
    });
});

// Health
app.get('/health', (req, res) => res.json({ ok: true, version: '2.1.1' }));

// Catch unhandled errors — log and keep running
process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled rejection:', err?.message || err);
    logEvent('ERROR', `Unhandled rejection: ${err?.message || 'unknown'}`);
});
process.on('uncaughtException', (err) => {
    console.error('💀 Uncaught exception:', err?.message || err);
    logEvent('ERROR', `Uncaught exception: ${err?.message || 'unknown'}`);
});

if (!PROXY_API_KEY) console.warn('⚠️  PROXY_API_KEY not set — Zamunda proxy calls will be rejected (no search results).');
if (!DASHBOARD_KEY) console.warn('⚠️  DASHBOARD_KEY not set — dashboard/logs are locked (fail-closed).');

app.listen(PORT, () => {
    console.log(`🍌 Zamunda BG addon v2.1.1 on port ${PORT}`);
    console.log(`Config: http://localhost:${PORT}/`);
});
