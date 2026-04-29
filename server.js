const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 7000;

// =====================================================
// CONFIG
// =====================================================
const ZAMUNDA_API = 'https://zamunda.rip/api/torrents';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';
const RD_API = 'https://api.real-debrid.com/rest/1.0';
const TB_API = 'https://api.torbox.app/v1';

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(key) {
    const c = cache.get(key);
    if (c && Date.now() - c.time < CACHE_TTL) return c.data;
    return null;
}
function setCached(key, data) {
    cache.set(key, { data, time: Date.now() });
}

// =====================================================
// STATS — persisted in Upstash Redis
// =====================================================
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

async function redisCmd(...args) {
    if (!UPSTASH_URL) return null;
    try {
        const res = await axios.post(`${UPSTASH_URL}`, args, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
            timeout: 3000
        });
        return res.data?.result;
    } catch (e) { return null; }
}

async function incr(key) { return redisCmd('INCR', `zamunda:${key}`); }
async function sadd(key, val) { return redisCmd('SADD', `zamunda:${key}`, val); }
async function scard(key) { return redisCmd('SCARD', `zamunda:${key}`); }
async function getCount(key) { return (await redisCmd('GET', `zamunda:${key}`)) || 0; }

// Recent logs — store last 100 events in a Redis list
async function logEvent(type, msg) {
    const entry = `${new Date().toISOString().substring(0,19)} [${type}] ${msg}`;
    await redisCmd('LPUSH', 'zamunda:logs', entry);
    await redisCmd('LTRIM', 'zamunda:logs', '0', '499'); // keep last 500
}
async function getLogs(count = 50) {
    return (await redisCmd('LRANGE', 'zamunda:logs', '0', String(count - 1))) || [];
}

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
    return `${config.debrid}:${config.content}:${config.quality}:${config.sort}:${config.sources}:${config.sizelimit}`;
}

// =====================================================
// MANIFEST — dynamic based on config
// =====================================================
function buildManifest(config) {
    const mode = config.debrid === 'realdebrid' ? 'RD' : config.debrid === 'torbox' ? 'TorBox' : 'P2P';
    return {
        id: 'community.zamunda.bgaudio',
        version: '2.1.0',
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
            headers: { 'User-Agent': 'Mozilla/5.0 ZamundaStremio/1.0' }
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
            new RegExp(`[\\s._-]+0*${eInt}\\s*[\\[\\(.]`),      // "- 137 [720p]" or "- 07 [480p]"
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
        console.error('TorBox cache check error:', e.response?.data?.detail || e.message);
        logEvent('ERROR', `TB cache check: ${e.response?.data?.detail || e.message}`);
        return new Map();
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
                logEvent('MISS', `${label} — ${beforeCount} torrents but 0 episode matches`);
                return [];
            }
        }
    }

    // Apply content/source/quality/size filters
    let filtered = applyFilters(allTorrents, config, type);
    console.log(`  ${filtered.length} after filters`);
    if (filtered.length === 0) {
        logEvent('MISS', `${label} — ${allTorrents.length} torrents but 0 after filters (${config.content}|${config.quality})`);

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
            return [];
        }
    }

    // Sort
    filtered = sortTorrents(filtered, config);

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

    // ---- TORBOX MODE ----
    if (hasTB) {
        console.log(`  TorBox mode (${debridMode}): checking ${filtered.length} torrents...`);
        const startTime = Date.now();
        const infohashes = filtered.map(t => t._infohash);
        const cached = await tbCheckCached(infohashes, config.tbtoken);
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
            return [...bgHint, ...tbStreams, ...p2pStreams];
        }

        console.log(`  → ${tbStreams.length} playable in ${elapsed}s`);
        logEvent('TB', `${tbStreams.length} playable in ${elapsed}s — "${meta.name}"`);
        return [...bgHint, ...tbStreams];
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
            return [...bgHint, ...rdStreams, ...p2pStreams];
        }

        console.log(`  → ${rdStreams.length} playable in ${elapsed}s`);
        logEvent('RD', `${rdStreams.length} playable in ${elapsed}s — "${meta.name}"`);
        return [...bgHint, ...rdStreams];
    }

    // ---- P2P MODE ----
    console.log(`  P2P mode: returning ${filtered.length} streams`);
    logEvent('P2P', `${filtered.length} streams — "${meta.name}"`);
    return [...bgHint, ...filtered.map(torrent => buildStream(torrent, null, 'p2p'))];
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
        stream.fileIdx = 0;
    }

    return stream;
}

// =====================================================
// CONFIG PAGE HTML
// =====================================================
function configPageHTML() {
    // SVG icon helpers (inline, no emoji)
    const icons = {
        satellite: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7L9 3 3 9l4 4"/><path d="m11 15 4 4 6-6-4-4"/><path d="m8 12 4 4"/><path d="m16 8-4-4"/><circle cx="18" cy="18" r="3"/><path d="M2 22c3-6 6-9 12-12"/></svg>',
        film: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>',
        monitor: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        shuffle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
        box: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    };
    return `<!DOCTYPE html>
<html lang="bg">
<head>
    <meta charset="UTF-8">
    <title>Zamunda BG — Stremio Addon</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               background: #0a0a0a; color: #e8e8e8; min-height: 100vh; padding: 20px; }
        .wrap { max-width: 640px; margin: 0 auto; }

        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 56px; margin-bottom: 8px; }
        h1 { font-size: 32px; margin-bottom: 4px; color: #f5d020; }
        .subtitle { opacity: 0.5; font-size: 14px; }

        .lang-toggle { position: fixed; top: 16px; right: 16px; display: flex; gap: 4px;
                       background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 3px; z-index: 100; }
        .lang-btn { padding: 6px 14px; border: none; border-radius: 6px; cursor: pointer;
                    font-size: 13px; font-weight: 600; background: transparent; color: #666;
                    transition: all 0.2s; }
        .lang-btn.active { background: rgba(245,208,32,0.15); color: #f5d020; }

        .section { background: #111; border: 1px solid #1e1e1e; border-radius: 12px;
                   padding: 20px; margin-bottom: 16px; }
        .section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px;
                         display: flex; align-items: center; gap: 8px; color: #ccc; }
        .section-title .icon { display: flex; align-items: center; color: #f5d020; }

        .radio-cards { display: flex; gap: 10px; }
        .radio-card { flex: 1; padding: 14px; border-radius: 10px; cursor: pointer;
                      border: 2px solid #1e1e1e; transition: all 0.2s; }
        .radio-card:hover { border-color: #333; }
        .radio-card.selected { border-color: #f5d020; background: rgba(245,208,32,0.04); }
        .radio-card input { display: none; }
        .radio-card .card-title { font-weight: 700; font-size: 15px; margin-bottom: 6px;
                                  display: flex; align-items: center; gap: 6px; }
        .radio-card .card-desc { font-size: 12px; opacity: 0.5; line-height: 1.5; }
        .badge { font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
        .badge-free { background: rgba(76,175,80,0.15); color: #66bb6a; }
        .badge-premium { background: rgba(245,208,32,0.15); color: #f5d020; }

        .token-row { margin-top: 12px; display: none; }
        .token-row.visible { display: block; }
        .token-row label { font-size: 13px; font-weight: 600; margin-bottom: 6px; display: block; color: #999; }
        .token-row input { width: 100%; padding: 11px 14px; background: #0a0a0a;
                          border: 1px solid #2a2a2a; border-radius: 8px;
                          color: #f5d020; font-family: monospace; font-size: 13px; }
        .token-row input:focus { outline: none; border-color: #f5d020; }
        .token-help { font-size: 11px; opacity: 0.4; margin-top: 6px; }
        .token-help a { color: #f5d020; text-decoration: none; }

        .check-group { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px;
                border: 1px solid #2a2a2a; transition: all 0.15s; user-select: none;
                font-weight: 500; color: #888; background: #0a0a0a; }
        .chip:hover { border-color: #444; color: #bbb; }
        .chip.on { border-color: #f5d020; background: rgba(245,208,32,0.08); color: #f5d020; }

        select { width: 100%; padding: 11px 14px; background: #0a0a0a; border: 1px solid #2a2a2a;
                 border-radius: 8px; color: #e8e8e8; font-size: 13px; appearance: none;
                 background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23666'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E");
                 background-repeat: no-repeat; background-position: right 14px center; }
        select:focus { outline: none; border-color: #f5d020; }
        select option { background: #111; color: #e8e8e8; }

        .size-row { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
        .size-input { flex: 1; padding: 11px 14px; background: #0a0a0a; border: 1px solid #2a2a2a;
                     border-radius: 8px; color: #e8e8e8; font-family: monospace; font-size: 13px; }
        .size-input:focus { outline: none; border-color: #f5d020; }
        .hint { font-size: 11px; opacity: 0.35; margin-top: 8px; line-height: 1.5; }

        .install-section { margin-top: 24px; }
        .btn-row { display: flex; gap: 10px; }
        .btn { flex: 1; padding: 15px 20px; border: none; border-radius: 10px; font-size: 15px;
               font-weight: 700; cursor: pointer; transition: all 0.2s; text-align: center; }
        .btn:hover { transform: translateY(-2px); }
        .btn-primary { background: #f5d020; color: #000; }
        .btn-primary:hover { background: #ffd83d; }
        .btn-secondary { background: #1a1a1a; color: #ccc; border: 1px solid #2a2a2a; }
        .btn-secondary:hover { border-color: #444; }
        #manifestUrl { font-family: monospace; font-size: 11px; background: #0a0a0a;
                      border: 1px solid #1e1e1e; padding: 12px; border-radius: 8px;
                      margin-top: 12px; word-break: break-all; display: none;
                      line-height: 1.5; color: #f5d020; }

        .footer { text-align: center; margin-top: 24px; font-size: 12px; opacity: 0.25; }
        .footer a { color: #f5d020; text-decoration: none; }

        @media (max-width: 500px) {
            .radio-cards { flex-direction: column; }
            .lang-toggle { position: static; justify-content: center; margin-bottom: 16px; }
        }
    </style>
</head>
<body>
<div class="lang-toggle">
    <button class="lang-btn active" onclick="setLang('bg')" id="langBG">BG</button>
    <button class="lang-btn" onclick="setLang('en')" id="langEN">EN</button>
</div>
<div class="wrap">
    <div class="header">
        <div class="logo"><img src="https://raw.githubusercontent.com/tzpopov-cc/zamunda-stremio/main/icon.png" alt="Zamunda BG" style="width:64px;height:64px;border-radius:12px;"></div>
        <h1>Zamunda BG</h1>
        <p class="subtitle" data-bg="Stremio addon — филми и сериали от Zamunda.RIP" data-en="Stremio addon — movies & series from Zamunda.RIP"></p>
    </div>

    <!-- DEBRID -->
    <div class="section">
        <div class="section-title">
            <span class="icon">${icons.satellite}</span>
            <span data-bg="Streaming метод" data-en="Streaming method"></span>
        </div>
        <div class="radio-cards">
            <label class="radio-card selected" id="card-p2p" onclick="selectDebrid('none')">
                <input type="radio" name="debrid" value="none" checked>
                <div class="card-title">
                    P2P <span class="badge badge-free" data-bg="Безплатно" data-en="Free"></span>
                </div>
                <div class="card-desc" data-bg="Директен torrent streaming. Не изисква акаунт. Скоростта зависи от seeders — популярни филми вървят добре, по-стари може да буферират."
                     data-en="Direct torrent streaming. No account needed. Speed depends on seeders — popular movies work great, older ones may buffer."></div>
            </label>
            <label class="radio-card" id="card-rd" onclick="selectDebrid('realdebrid')">
                <input type="radio" name="debrid" value="realdebrid">
                <div class="card-title">
                    Real-Debrid <span class="badge badge-premium" data-bg="Премиум" data-en="Premium"></span>
                </div>
                <div class="card-desc" data-bg="Моментално пускане без буфериране. Показва само torrents с гарантиран playback. Изисква Real-Debrid абонамент (~3\u20AC/месец). Списъкът се зарежда по-бавно (~10-15 сек), защото проверява кои торенти са кеширани."
                     data-en="Instant playback, zero buffering. Only shows torrents with guaranteed playback. Requires Real-Debrid subscription (~3\u20AC/month). Stream list loads slower (~10-15 sec) as it checks which torrents are cached."></div>
            </label>
            <label class="radio-card" id="card-tb" onclick="selectDebrid('torbox')">
                <input type="radio" name="debrid" value="torbox">
                <div class="card-title">
                    TorBox <span class="badge badge-premium" data-bg="Премиум" data-en="Premium"></span>
                </div>
                <div class="card-desc" data-bg="Моментално пускане без буфериране. Бърза проверка на кеш (~2-3 сек). Изисква TorBox абонамент."
                     data-en="Instant playback, zero buffering. Fast cache check (~2-3 sec). Requires TorBox subscription."></div>
            </label>
        </div>
        <!-- RD Token -->
        <div class="token-row" id="rdTokenRow">
            <label data-bg="Real-Debrid API Token" data-en="Real-Debrid API Token"></label>
            <input type="text" id="rdToken" placeholder="ABCDEFGHIJKLMNOP1234567890...">
            <div class="token-help">
                <span data-bg="Вземи от" data-en="Get it from"></span>
                <a href="https://real-debrid.com/apitoken" target="_blank">real-debrid.com/apitoken</a>
            </div>
        </div>
        <!-- TorBox Token -->
        <div class="token-row" id="tbTokenRow">
            <label data-bg="TorBox API Token" data-en="TorBox API Token"></label>
            <input type="text" id="tbToken" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
            <div class="token-help">
                <span data-bg="Вземи от" data-en="Get it from"></span>
                <a href="https://torbox.app/settings" target="_blank">torbox.app/settings</a>
            </div>
        </div>
        <!-- Debrid mode (shared by RD and TB) -->
        <div class="token-row" id="debridModeRow">
            <div style="margin-top: 4px;">
                <label style="font-size:13px; font-weight:600; margin-bottom:8px; display:block; color:#999;"
                       data-bg="Какво да показва" data-en="What to show"></label>
                <div class="check-group" id="debridModeGroup" data-mode="radio">
                    <div class="chip on" data-value="guaranteed">
                        <span data-bg="Само гарантирани" data-en="Guaranteed only"></span>
                    </div>
                    <div class="chip" data-value="all">
                        <span data-bg="Гарантирани + останали" data-en="Guaranteed + others"></span>
                    </div>
                </div>
                <div class="hint" data-bg="'Гарантирани' са кеширани — пускат моментално. 'Останали' се показват отдолу като P2P backup."
                     data-en="'Guaranteed' are cached — instant playback. 'Others' appear below as P2P backup."></div>
            </div>
        </div>
    </div>

    <!-- CONTENT -->
    <div class="section">
        <div class="section-title">
            <span class="icon">${icons.film}</span>
            <span data-bg="Съдържание" data-en="Content"></span>
        </div>
        <div class="check-group" id="contentGroup" data-mode="radio">
            <div class="chip" data-value="bgaudio"><span data-bg="Само БГ аудио" data-en="BG Audio only"></span></div>
            <div class="chip on" data-value="all"><span data-bg="Всички" data-en="All content"></span></div>
        </div>
    </div>

    <!-- QUALITY -->
    <div class="section">
        <div class="section-title">
            <span class="icon">${icons.monitor}</span>
            <span data-bg="Качество" data-en="Quality"></span>
        </div>
        <div class="check-group" id="qualityGroup" data-mode="multi">
            <div class="chip on" data-value="4k">4K</div>
            <div class="chip on" data-value="1080p">1080p</div>
            <div class="chip on" data-value="720p">720p</div>
            <div class="chip on" data-value="sd">SD</div>
        </div>
    </div>

    <!-- Sources always included — shown in stream info only -->

    <!-- SORTING -->
    <div class="section">
        <div class="section-title">
            <span class="icon">${icons.shuffle}</span>
            <span data-bg="Сортиране" data-en="Sorting"></span>
        </div>
        <select id="sortSelect">
            <option value="quality" data-bg="По качество (най-добро първо)" data-en="By quality (best first)">По качество (най-добро първо)</option>
            <option value="size" data-bg="По размер (най-голям първо)" data-en="By size (largest first)">По размер (най-голям първо)</option>
        </select>
    </div>

    <!-- SIZE LIMIT -->
    <div class="section">
        <div class="section-title">
            <span class="icon">${icons.box}</span>
            <span data-bg="Лимит на размер" data-en="Size limit"></span>
        </div>
        <input type="text" class="size-input" id="sizeLimit" style="width:100%"
               data-bg-placeholder="Без лимит" data-en-placeholder="No limit" placeholder="Без лимит">
        <div class="hint" data-bg="Максимален размер на файл. Примери: 5GB, 10GB. За различен лимит за филми и сериали: 10GB,2GB"
             data-en="Maximum file size. Examples: 5GB, 10GB. Different limit for movies and series: 10GB,2GB"></div>
    </div>

    <!-- INSTALL -->
    <div class="install-section">
        <div class="btn-row">
            <button class="btn btn-primary" onclick="install()">
                <span data-bg="📥 Инсталирай в Stremio" data-en="📥 Install in Stremio"></span>
            </button>
            <button class="btn btn-secondary" onclick="copyUrl()">
                <span data-bg="📋 Копирай URL" data-en="📋 Copy URL"></span>
            </button>
        </div>
        <div id="manifestUrl"></div>
        <div style="margin-top:16px; padding:12px 16px; background:rgba(245,208,32,0.06); border:1px solid rgba(245,208,32,0.15); border-radius:8px; font-size:12px; line-height:1.6; color:#999;">
            <span data-bg="⏱ Addon-ът е на безплатен сървър, който заспива след 15 мин. неактивност. Първото търсене след пауза отнема ~30 сек. за събуждане, след което работи нормално."
                  data-en="⏱ This addon runs on a free server that sleeps after 15 min. of inactivity. The first search after a pause takes ~30 sec. to wake up, then works normally."></span>
        </div>
    </div>

    <div class="footer">
        <span data-bg="Данни от" data-en="Data from"></span>
        <a href="https://zamunda.rip" target="_blank">zamunda.rip</a>
        · Zamunda + ArenaBG + Zelka · 450K+ torrents
    </div>
</div>

<script>
let currentLang = 'bg';

function setLang(lang) {
    currentLang = lang;
    document.getElementById('langBG').classList.toggle('active', lang === 'bg');
    document.getElementById('langEN').classList.toggle('active', lang === 'en');
    document.querySelectorAll('[data-bg]').forEach(el => {
        const val = el.getAttribute('data-' + lang);
        if (val) el.textContent = val;
    });
    document.querySelectorAll('select option').forEach(opt => {
        const val = opt.getAttribute('data-' + lang);
        if (val) opt.textContent = val;
    });
    document.querySelectorAll('[data-bg-placeholder]').forEach(el => {
        el.placeholder = el.getAttribute('data-' + lang + '-placeholder');
    });
}

function selectDebrid(value) {
    document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
    const cardId = value === 'realdebrid' ? 'card-rd' : value === 'torbox' ? 'card-tb' : 'card-p2p';
    document.getElementById(cardId).classList.add('selected');
    document.querySelector('input[name="debrid"][value="' + value + '"]').checked = true;
    document.getElementById('rdTokenRow').classList.toggle('visible', value === 'realdebrid');
    document.getElementById('tbTokenRow').classList.toggle('visible', value === 'torbox');
    document.getElementById('debridModeRow').classList.toggle('visible', value === 'realdebrid' || value === 'torbox');
}

// Chip toggle logic
document.querySelectorAll('.check-group').forEach(group => {
    const mode = group.dataset.mode; // 'radio' or 'multi'
    group.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (mode === 'radio') {
                group.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
                chip.classList.add('on');
            } else {
                chip.classList.toggle('on');
                // Prevent deselecting all
                if (!group.querySelector('.chip.on')) chip.classList.add('on');
            }
        });
    });
});

function getSelected(groupId) {
    const chips = document.querySelectorAll('#' + groupId + ' .chip.on');
    return Array.from(chips).map(c => c.dataset.value);
}

function buildConfigString() {
    const parts = [];
    const debrid = document.querySelector('input[name="debrid"]:checked').value;
    parts.push('debrid=' + debrid);
    if (debrid === 'realdebrid') {
        const token = document.getElementById('rdToken').value.trim();
        if (token) parts.push('rdtoken=' + token);
    }
    if (debrid === 'torbox') {
        const token = document.getElementById('tbToken').value.trim();
        if (token) parts.push('tbtoken=' + token);
    }
    if (debrid === 'realdebrid' || debrid === 'torbox') {
        const mode = getSelected('debridModeGroup');
        if (mode[0] && mode[0] !== 'guaranteed') parts.push('debridmode=' + mode[0]);
    }

    const content = getSelected('contentGroup');
    parts.push('content=' + content[0]);

    const qualities = getSelected('qualityGroup');
    if (qualities.length > 0 && qualities.length < 4) parts.push('quality=' + qualities.join(','));

    const sort = document.getElementById('sortSelect').value;
    if (sort !== 'quality') parts.push('sort=' + sort);

    const sizeLimit = document.getElementById('sizeLimit').value.trim();
    if (sizeLimit) parts.push('sizelimit=' + sizeLimit);

    parts.push('lang=' + currentLang);
    return parts.join('|');
}

function getManifestUrl() {
    const debrid = document.querySelector('input[name="debrid"]:checked').value;
    if (debrid === 'realdebrid') {
        const token = document.getElementById('rdToken').value.trim();
        if (!token) { alert(currentLang === 'bg' ? 'Въведи Real-Debrid token' : 'Enter Real-Debrid token'); return null; }
        if (token.length < 20) { alert(currentLang === 'bg' ? 'Token-ът изглежда невалиден' : 'Token looks invalid'); return null; }
    }
    if (debrid === 'torbox') {
        const token = document.getElementById('tbToken').value.trim();
        if (!token) { alert(currentLang === 'bg' ? 'Въведи TorBox token' : 'Enter TorBox token'); return null; }
        if (token.length < 10) { alert(currentLang === 'bg' ? 'Token-ът изглежда невалиден' : 'Token looks invalid'); return null; }
    }
    return window.location.origin + '/' + encodeURIComponent(buildConfigString()) + '/manifest.json';
}

function install() {
    const url = getManifestUrl();
    if (!url) return;
    window.location.href = url.replace(/^https?:/, 'stremio:');
}

function copyUrl() {
    const url = getManifestUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
        const div = document.getElementById('manifestUrl');
        div.textContent = url;
        div.style.display = 'block';
    });
}

setLang('bg');
</script>
</body>
</html>`;
}

// =====================================================
// EXPRESS ROUTES
// =====================================================

// Track unique user from IP or RD token
function trackUser(req, config) {
    const id = config?.rdtoken ? config.rdtoken.substring(0, 8) : (req.ip || req.headers['x-forwarded-for'] || 'unknown');
    sadd('users', id);
}

// Config page
app.get('/', (req, res) => { incr('configPage'); res.type('html').send(configPageHTML()); });
app.get('/configure', (req, res) => res.redirect('/'));
app.get('/:config/configure', (req, res) => res.redirect('/'));

// Manifest
app.get('/manifest.json', (req, res) => { incr('installs'); res.json(buildManifest(DEFAULTS)); });
app.get('/:config/manifest.json', (req, res) => {
    incr('installs');
    const config = parseConfig(decodeURIComponent(req.params.config));
    trackUser(req, config);
    res.json(buildManifest(config));
});

// Streams
app.get('/:config/stream/:type/:id.json', async (req, res) => {
    incr('streams');
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

// Stats
app.get('/stats', async (req, res) => {
    const [configPage, installs, streams, users] = await Promise.all([
        getCount('configPage'),
        getCount('installs'),
        getCount('streams'),
        scard('users'),
    ]);
    res.json({
        configPageViews: Number(configPage),
        installs: Number(installs),
        streamRequests: Number(streams),
        uniqueUsers: Number(users || 0),
        persistent: !!UPSTASH_URL,
    });
});

// Logs — last 50 events (searches, results, errors)
app.get('/logs', async (req, res) => {
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
app.get('/health', (req, res) => res.json({ ok: true, version: '2.0.0' }));

app.listen(PORT, () => {
    console.log(`🍌 Zamunda BG addon v2.0.0 on port ${PORT}`);
    console.log(`Config: http://localhost:${PORT}/`);
});
