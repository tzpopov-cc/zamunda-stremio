// One-time migration: dump stats from Upstash Redis → local stats.json.
// Run inside a node:20 container with the app's .env, mounting the sites dir at /work:
//   docker run --rm --env-file .env -v $PWD:/work -w /work node:20-alpine node migrate-to-local.js
// Reads are retried because the Upstash free quota is exhausted and rejects bursts.
const fs = require('fs');
const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!URL || !TOKEN) { console.error('Missing UPSTASH_REDIS_REST_URL / _TOKEN'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cmd(args, tries = 80) {
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(args) });
            const j = await r.json();
            if (j && !j.error && Object.prototype.hasOwnProperty.call(j, 'result')) return j.result;
        } catch (e) { /* retry */ }
        await sleep(350);
    }
    console.error('  ! gave up on', args.join(' '));
    return null;
}

(async () => {
    console.log('counters…');
    const configPage = await cmd(['GET', 'zamunda:configPage']);
    const installs = await cmd(['GET', 'zamunda:installs']);
    const streams = await cmd(['GET', 'zamunda:streams']);
    console.log('user sets…');
    const users = (await cmd(['SMEMBERS', 'zamunda:users'])) || [];
    const migratedUsers = (await cmd(['SMEMBERS', 'zamunda:migratedUsers'])) || [];
    const newUsers = (await cmd(['SMEMBERS', 'zamunda:newUsers'])) || [];
    const preMigrationUsers = (await cmd(['SMEMBERS', 'zamunda:preMigrationUsers'])) || [];
    console.log('dailyStats + logs…');
    const dsFlat = (await cmd(['HGETALL', 'zamunda:dailyStats'])) || [];
    const dailyStats = {};
    for (let i = 0; i < dsFlat.length; i += 2) dailyStats[dsFlat[i]] = dsFlat[i + 1];
    const logs = (await cmd(['LRANGE', 'zamunda:logs', '0', '499'])) || [];
    console.log('daily counters…');
    const dailyKeys = (await cmd(['KEYS', 'zamunda:daily:*'])) || [];
    const daily = {};
    for (const k of dailyKeys) {
        const m = /^zamunda:daily:(\d{4}-\d{2}-\d{2}):(\w+)$/.exec(k);
        if (!m) continue;
        const v = await cmd(['GET', k]);
        (daily[m[1]] = daily[m[1]] || {})[m[2]] = Number(v) || 0;
    }
    const out = {
        counters: { configPage: Number(configPage) || 0, installs: Number(installs) || 0, streams: Number(streams) || 0 },
        daily, users, migratedUsers, newUsers, preMigrationUsers, dailyStats, logs,
    };
    fs.mkdirSync('/work/data', { recursive: true });
    fs.writeFileSync('/work/data/stats.json', JSON.stringify(out));
    console.log('MIGRATED →', JSON.stringify({
        users: users.length, migrated: migratedUsers.length, new: newUsers.length, pre: preMigrationUsers.length,
        installs: out.counters.installs, streams: out.counters.streams, configPage: out.counters.configPage,
        dailyDays: Object.keys(daily).length, snapshots: Object.keys(dailyStats).length, logs: logs.length,
    }));
})();
