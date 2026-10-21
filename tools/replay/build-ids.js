// Build ids.txt: real searches (name + episode, from the server log) mapped to IMDb ids through
// Cinemeta, popular titles from Cinemeta's catalogs, and the targeted cases every version must keep.
//   node build-ids.js real_searches.tsv > ids.txt
const fs = require('fs');
const axios = require('axios');
const CM = 'https://v3-cinemeta.strem.io';
const norm = s => s.toLowerCase().replace(/[^a-z0-9а-я]+/g, ' ').trim();
const TARGETED = `
series tt2306299:1:1   # Vikings — no Valhalla / Rise and Fall; "s01 ep01" files
series tt2306299:4:5
series tt2348803:1:5   # Kuroko — season 1 only under the romaji name
series tt2348803:2:3
series tt2348803:3:5   # anime "3 - 05"
series tt1520211:1:1   # TWD — no Fear / Tales
series tt1520211:3:5
series tt0412142:1:11  # House — not Fuller House
series tt1733785:1:1   # Bron/Broen AKA The Bridge
series tt0988824:1:5   # Naruto Shippuden
series tt0409591:1:5   # Naruto
series tt2560140:3:1   # Attack on Titan
series tt0903747:5:14  # Breaking Bad
series tt0108778:5:6   # Friends
series tt4565380:3:9   # Fauda
series tt0773262:1:1   # Dexter
series tt0364845:1:1   # NCIS
series tt0203259:1:1   # Law & Order SVU
series tt13111078:1:1  # Special Ops: Lioness
series tt3613454:1:1   # Fuller House (its own)
series tt0386676:6:13  # The Office
series tt0460649:9:24  # HIMYM double episode
series tt0118480:1:3   # Stargate SG-1
series tt0417299:1:3   # Avatar: The Last Airbender
series tt0944947:1:1   # Game of Thrones
series tt0388629:1:5   # One Piece
series tt9335498:1:1   # Demon Slayer
series tt0877057:1:1   # Death Note
series tt2098220:1:1   # Hunter x Hunter
movie tt0133093        # The Matrix — collections
movie tt0234215        # The Matrix Reloaded
movie tt0242653        # The Matrix Revolutions
movie tt0114709        # Toy Story
movie tt0120363        # Toy Story 2
movie tt0435761        # Toy Story 3
movie tt0068646        # The Godfather
movie tt0071562        # The Godfather Part II
movie tt0126029        # Shrek
movie tt0298148        # Shrek 2
movie tt0317219        # Cars
movie tt0110357        # The Lion King
movie tt0232500        # The Fast and the Furious
movie tt0120737        # LOTR Fellowship
movie tt0167261        # LOTR Two Towers
movie tt15398776       # Oppenheimer
movie tt0240772        # Ocean's Eleven — released as "Ocean_s_Eleven" (B-039)
series tt0413573:22:7  # Grey's Anatomy S22E7 — "Grey_s_Anatomy_S22E07" (B-039)
movie tt2888046        # Ip Man 3 — Cinemeta's main host says 2025 (B-055)
series tt9170318:2:3   # Besa: Blood Oath — archived as "Besa" (B-047)
`;
(async () => {
    const out = new Set();
    for (const l of TARGETED.split('\n')) { const x = l.replace(/#.*/, '').trim(); if (x) out.add(x); }
    // real searches
    const rows = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
    for (const [type, name, s, e] of rows) {
        try {
            const r = await axios.get(`${CM}/catalog/${type}/top/search=${encodeURIComponent(name)}.json`, { timeout: 15000 });
            const hit = (r.data.metas || []).find(m => norm(m.name) === norm(name)) || null;
            const id = hit && (hit.imdb_id || hit.id);
            if (id && /^tt\d+$/.test(id)) out.add(type === 'series' ? `series ${id}:${s || 1}:${e || 1}` : `movie ${id}`);
        } catch (err) { /* skip */ }
    }
    // popular
    for (const [type, n] of [['movie', 90], ['series', 60]]) {
        const r = await axios.get(`${CM}/catalog/${type}/top.json`, { timeout: 15000 });
        for (const m of (r.data.metas || []).slice(0, n)) {
            const id = m.imdb_id || m.id; if (!/^tt\d+$/.test(id)) continue;
            if (type === 'movie') out.add(`movie ${id}`); else { out.add(`series ${id}:1:1`); out.add(`series ${id}:2:3`); }
        }
    }
    console.log([...out].join('\n'));
})();
