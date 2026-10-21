# Zamunda BG — Runbook

What to do when the addon is down. Written 2026-09-20, after the `.rip` → `.life` migration.

## The chain

```
Stremio client
  └─> https://zamunda-stremio.tzkppv.com        Hetzner 178.104.89.141, Docker + Caddy
        ├─ data/torrent-index.jsonl             local index — answers without the network
        ├─> http://10.8.0.1:7011               WireGuard tunnel (encrypted) — PRIMARY
        └─> http://zproxy.tzkppv.com:7011      public path, IP-pinned — AUTOMATIC FALLBACK
              (both reach the same proxy on Oracle Amsterdam, 150.230.21.90)
              └─> https://zamunda.life/api/torrents
```

**Every link can fail independently.** Work down the list below; each step tells you which link is broken.

`api-proxy.tzkppv.com` (the old Cloudflare Worker) is **no longer in the path** — see "Why Oracle".

## Is it actually down?

```bash
# 1. addon alive, and what it thinks of itself
curl -s https://zamunda-stremio.tzkppv.com/health
# {"ok":true,"version":"2.3.0","index":{"queries":N,"rows":M},"providers":1}

# 2. the end-to-end test — The Matrix
curl -s "https://zamunda-stremio.tzkppv.com/lang=bg/stream/movie/tt0133093.json" | head -c 300
```

- Several streams with titles → **working, stop here.**
- Exactly one stream named `⚠️ Zamunda BG` → upstream unreachable *and* nothing indexed for that title. Continue.
- Connection refused / 502 → the container is down. Jump to "Addon container".

## Diagnose down the chain

```bash
# A. can Hetzner reach the Oracle proxy? (tunnel first, then the public fallback)
ssh root@178.104.89.141 'wg show wg0 | grep -E "latest handshake|transfer"'
ssh root@178.104.89.141 'curl -sS -o /dev/null -w "wg:     %{http_code}\n" --max-time 12 http://10.8.0.1:7011/health'
ssh root@178.104.89.141 'curl -sS -o /dev/null -w "public: %{http_code}\n" --max-time 15 http://zproxy.tzkppv.com:7011/health'
#   wg 200            -> everything normal
#   wg 000/public 200 -> tunnel is down, the addon is silently using the fallback. Fix the tunnel.
#   both 000          -> proxy itself is down. Go to "Egress proxy".
#   200   -> proxy fine, problem is the addon. Go to "Addon container".
#   000   -> blocked or proxy down. Go to "Egress proxy".

# B. can the proxy reach zamunda.life? (unauthenticated, safe)
curl -s http://zproxy.tzkppv.com:7011/probe   # only from an allowed source IP
#   {"usable":true,...}   -> .life is fine
#   {"usable":false,"status":403,...} -> .life is challenging this host. Go to "Oracle IP changed".

# C. is .life up at all? (from your laptop, which is never blocked)
curl -sS -o /dev/null -w "%{http_code}\n" -H "User-Agent: Mozilla/5.0" \
  "https://zamunda.life/api/torrents?q=matrix&limit=3"
#   200 -> .life fine, the problem is ours
#   5xx -> .life itself is down; nothing to fix, the index covers indexed titles
```

## Recovery

### Magnet catalogue — backups and restore

Pulled nightly over HTTPS from the key-protected `/catalogue.jsonl` export by
`backup-catalogue.sh` (in this repo). A download is kept only if every line is a valid record and
the count is ≥ 90% of the last good backup; a failure is pushed to the ntfy source-monitor topic.

| Where | Schedule | Copies | Key file |
|---|---|---|---|
| Oracle `/var/backups/zamunda-catalogue/` | root cron 05:30 UTC | 30 dated `.jsonl.gz` + `latest` | `/etc/zamunda-backup.env` (root 600) |
| Mac `~/Backups/zamunda-catalogue/` | launchd `com.tzkppv.zamunda-backup` 09:00 local (runs on wake if missed) | same | `~/.config/zamunda/backup.env` (600) |

Logs: Oracle `/var/log/zamunda-backup.log`, Mac `~/Backups/zamunda-catalogue/backup.log`.
A download is tried 6 times a minute apart (`TRIES`, `RETRY_WAIT`): a Mac just woken from sleep runs
the job before its network is back ("Could not resolve host"), which lost four Mac copies in two weeks.
The Mac job runs a copy at `~/.local/bin/zamunda-backup-catalogue.sh` (launchd cannot read
`~/Downloads`) — re-`install` it after changing the script. If `DASHBOARD_KEY` is rotated, update
both key files or the backups fail (loudly).

**Restore** (verified 2026-09-29 — an addon started from the backup alone loads every magnet):

```bash
zcat latest.jsonl.gz > magnet-catalogue.jsonl
scp magnet-catalogue.jsonl root@178.104.89.141:/opt/personal/sites/zamunda-stremio/data/
ssh root@178.104.89.141 'cd /opt/personal/sites/zamunda-stremio && docker compose restart'
```

Records carry `x` (the archive's `external_id`) and `d` (its description) since v2.6.2; older
records were backfilled from the search index at boot. `/catalogue/stats` reports `maxArchiveId` —
the number to watch to see whether `.life` is still growing (853,782 on 2026-09-29).

### Torrent file lists (since v2.6.3)

`data/torrent-files.jsonl` holds the media files of every season pack whose `.torrent` was fetched
from itorrents, one line per infohash: `{"h": hash, "m": [[index, path, bytes], …]}`. The index is the
position in the WHOLE torrent (subtitles and .nfo included), which is what Stremio's streaming
server expects as `fileIdx`. It is a cache, not data to protect: delete it and it rebuilds on demand.

Rollback: the server keeps `server.js.bak-<version>-predeploy` + `config.html.bak-<version>-predeploy`
for every deploy (2.6.2 – 2.6.9 are there, plus `*.bak-2.6.5-early` and `*.bak-2.6.6-early`) — copy a pair back and `docker compose up -d --build`.
Since 2.6.7 a deploy also tags the old image (`docker tag zamunda-stremio-zamunda-stremio:latest …:<old version>`)
and copies `data/` to `data.bak-<old version>-predeploy` while the container is STOPPED (build first, then
`stop` → `cp -a` → `up -d`: about 3 s down, and the copy is consistent).

### zamunda.life reads only the first five words of a query

Everything after the fifth word is ignored (proved 2026-10-07). Long titles therefore get a shortened
twin query next to the original (`shortenQuery` — stopwords out, year/S01E05 kept). If a long title
comes back "not in the archive" while a short search on the site finds it, this is the place to look.

### Dashboard numbers (since v2.6.5)

**Users.** "Active today / 7 days / 30 days" come from `lastSeen` in `stats.json` (user id → last
active day, pruned after 60 days). RD users are keyed by token prefix and TorBox users by an HMAC of
their token, so both are one per account. P2P users are keyed by an HMAC of their IP: approximate (a
phone switching networks counts twice, a household behind one router counts once). `lastSeen` starts
2026-10-07, so the 7- and 30-day cards say "(since 07.10)" until their window is full.
The old all-time `uniqueUsers` (still on `/stats`, no longer shown anywhere) mixes RD accounts
collected since launch with P2P IPs counted only since v2.6.3 — do not read it as growth.

**Landing page numbers must be true.** Each is rounded DOWN so "N+" holds: users = `totalUsers`,
searches = `streamRequests`, torrents = the archive's live total (was a hardcoded "450K+" while the
archive holds 448 023).

**`totalUsers` (since v2.6.6) is a floor, never inflated.** The raw all-time id set cannot be trusted:
every new IP of a P2P user is a new id. Counted instead: every RD account (well-formed 8-char token
prefix) + every TorBox account (`tb:`) + every P2P install id (`u:`) + for older P2P installs without
an id, the most distinct IPs seen on one day in the last 30 (`daily[d].byKind.ip`). The result is
never below the busiest single day of the last 30. **Install id:** the config page puts
`uid=<12 random chars>` in the addon link, kept in the browser's localStorage so reconfiguring does not
make a second user. Stremio syncs the link to every device of the account, so one id = one Stremio
account. Installs made before v2.6.6 carry no id until they reinstall — the "older P2P" part shrinks
as they do. A shared link counts as one user (errs low).

**Busiest user (since v2.6.7).** The daily table's "Busiest user" column is the one user with the most
stream requests that day, as count, share of the day's requests, kind and a 6-character tag (a salted
hash — the same client keeps its tag across days, but it cannot be turned back into an IP or a token).
The top five per day are kept in `daily[date].top`. Added after stream requests halved from 12.10.2026
with the number of people flat: if one client makes a large share, it shows here.

**Magnet coverage.** Catalogue size divided by the archive's own size. The archive publishes it at
`https://zamunda.life/api/stats` (`{"total":448023,"zamunda":396421,"arena":42989,"zelka":8613}` on
2026-10-07); the addon reads it every 6 h through the proxy's keyed `/stats` route and keeps the last
good answer in `stats.json` (`archive`). Catalogue `src` maps `z`→zamunda, `arenabg`→arena,
`zelka`→zelka. New magnets per day are computed from each record's first-seen time, so the daily table
needs no stored history. `/catalogue/stats` returns the same `archive` and `coverage` as JSON.


### Series matching (v2.6.6)

`matchesSeriesTitle` → `matchesEpisode` → plain-name preference → bare fallback. The rules, each
from a real wrong stream:
- **Different show after the name** (`namesAnotherShow`): words between the show name and the
  season/year/quality marker that are not edition/language tags make it another show —
  "Vikings.Valhalla", "Vikings.Rise.And.Fall", "Naruto.Shippuden", "Law.and.Order.SVU",
  "Dexter.New.Blood". Neutral: tags (`SHOW_NAME_TAGS`), Cyrillic words, single letters ("House.M.D."),
  bracketed text. A bundle listing the show on its own is kept ("Naruto + … Collection",
  "Bron-Broen AKA The Bridge").
- **A name word only outside the name part (v2.6.8)**: "Fire Country S02E06 Alert the Sheriff" has
  "sheriff" only in the episode title and a word of its own ("fire") in the name part — another show,
  not Sheriff Country. Same for a release group: "Peacemaker…H.265-WAR" is not "War". Kept: a missing
  word that is a number ("1923", "Mob Psycho 100"), one in brackets ("Sousou no Frieren (Frieren Beyond
  Journey's End) - 05"), or a name part of name words only ("Spartacus.S01E01.Blood.and.Sand"). Price:
  "Original.Title.S01E05.English.Title" is an honest miss (anime season 1 is rescued by the romaji names).
- **Words before the name** ("Fuller.House", "Fear.the.Walking.Dead"): kept only when nothing for
  that episode carries the plain name AND the show is in the results under its own name too AND every
  match carries the same longer name, at least twice — "Special.Ops.Lioness" ×11 next to "Lioness.S02…".
  Since v2.6.8; before, "Chief of War" / "Bleach Thousand-Year Blood War" were served for War and
  "Brews.Brothers" (2020) for Brothers (2026).
- **Sequel numbers (v2.6.8)** (`foldSequel` in `normalizeTitle`): roman II–XX and "Part N" / "Part Two"
  fold to the plain number on both sides — "Extraction II" = "Extraction.2.2023", "Toy Story 2" =
  "Toy.Story.II"; I, V and X stay words ("V for Vendetta", "X", "Malcolm X"). A name with a roman
  number or "Part N" is also searched with the plain number ("The Karate Kid 2"). Show-name heads
  compare words AS WRITTEN (`normalizeWords`, `headTokens`): folded, "Lupin.III.Part.6" would stop at
  "3" like at an episode number and pass for Lupin (found by the 20.10.2026 review).
- **Declared seasons** (`declaredSeasons`): "S3", "Season.01", "3rd Season", season ranges and anime
  "Title 3 - 25". A release naming only other seasons is not a match; for the right season the episode
  part after it decides (`episodeSpan`). Before this, "Kuroko's Basketball 3 - 25" was read as episodes
  3–25 and "2 - 01-25" matched every season.
- **Bare fallback** (no season anywhere) only for shows whose releases carry no seasons at all, and only
  for releases named exactly as the show with no episode number after the name. Otherwise the viewer
  gets "Няма сезон N" instead of a film or a season-1 pack.
- **Romaji names (v2.6.7)** (`animeAltNames`): for Japanese animation Cinemeta gives the English name
  ("Kuroko's Basketball") while many releases carry the romaji one ("Kuroko no Basket 1-25"). Kitsu
  supplies it — only from an entry whose English title is the show and whose first year matches, cached
  7 days. Each later season has a romaji name of its own, so a release found ONLY by the romaji name
  counts as season 1 unless it declares a season ("Kuroko no Basket (2012) (Complete)" is not S2/S3).
- Known gap: an absolute anime number ("Kuroko's Basketball 3 - 72" = S3E22) is not mapped.

Test method: `tools/replay/` (below) — `old` vs `new` over real ids with the caching stub. v2.6.6 lost
no correct stream; the 30 titles only the old version served were all wrong releases.

### Which file plays (v2.6.7)

One rule for TorBox, Real-Debrid and the P2P `fileIdx` (`pickEpisodeFile`, `pickMovieFile`,
`chooseDebridFile`). Until v2.6.7 the debrid paths knew only "S01E05" and otherwise played the biggest
file — a real TorBox account showed "Vikings s01-03" playing `s02 ep07` for S1E1 and
"The.Matrix.Collection" playing Reloaded.
- **Episode:** season and episode in the file name in any common spelling (S01E05, s01 ep05, S1.E5,
  1x05, "ahs01e05"); a single-episode file beats a double one (S01E04E05). Failing that, a file whose
  season is known — from its name, its folder ("Season 2/", "Сезон 2/", "S02/") or a torrent declaring
  one season — and that names only the episode (E05, Ep 05, Епизод 5, anime " - 05 ", "05 - Pilot").
  A file that spells out a different episode is never taken ("11.22.63.S01E01" is not E11). A torrent
  that names no season counts as season 1 when season 1 is asked for.
- **Film:** one feature-length file (≥ 40 % of the biggest) → that one. Several (a collection) → the
  one with the film's year and words, fewest extra words; scene folders count ("Toy.Story.II.1999…/
  wtstory2.mkv"). P2P resolves this only for collection-named torrents (`COLLECTION_NAME`).
- **No answer:** a debrid row is dropped (a pack without the episode, a collection that does not say
  which file is the film); P2P sends no `fileIdx` and the player chooses.
- Tested 14.10.2026 on the 1 781 stored file lists (`tools/test-file-picker.js`): 21 393 picks
  identical to v2.6.6, 0 lost, ~2 800 new episodes found, 0 picks of a file naming another episode;
  31 films in 9 real collections all right.

### What the viewer is told (v2.6.8)

An empty list reads as a broken addon, so every dead end now carries a row (all point at
`NOTICE_INFO_URL`, Bulgarian and English by `lang`):
- **Not in the archive** (`notInArchiveRow`, GAP): the search found nothing that is this title. For a
  title from 2026 on it adds that the archive receives no new torrents (448 023 since 07.10.2026). 25 %
  of all searches over 15–20.10 used to end with nothing at all.
- **In the archive without a link** (`noLinkRow`, GAP): 7,9 % of archive rows carry `btih:&dn=` — no
  hash, unplayable, and no detail endpoint to recover it.
- **Real-Debrid refused** (`rdNotice`): `checkAndResolve` returns RD's `{status, code, error}`;
  `rdAccountProblem` reads the error code first (35 "infringing file" on a 503 is one torrent, not RD
  down), the HTTP status only without one. An account-level refusal (token 8 / premium 9,14,15,20 /
  limit 21,23,36 / busy 5,34 / ip 22 / down 25,37) stops the remaining torrents (≤ 2 in flight), shows
  the notice and the P2P rows in both modes, and the list is not cached — also when some RD links had
  resolved before it (notice under the RD rows). Before: up to 23 calls, then an empty list. The log
  line names the refusal (`RD refused: 403 permission_denied ×N`), never the token.
- **Cinemeta** (`getMetadata`): main host 2,5 s, then cinemeta-live 5 s. The main host answers in
  milliseconds (20.10.2026: median 12 ms; slowest from the server 2,1 s), so 5 s was a hang. The fallback
  names 7 % of titles differently ("Toplo" → "The Central Warmth", which the archive does not have), so
  its answer is kept 30 min, not 24 h, and a list built on it is not cached.

### Matching, search depth and notices (v2.6.9)

Stage 2 of the bug loop (T-201 hunt, five passes over real searches; T-202 – T-220). Each rule from a real
wrong or missing answer:
- **Series.** A dotted abbreviation is searched and matched joined too ("Chicago P.D." → "Chicago PD",
  "S.W.A.T.", "The O.C."), but not when the joined word is short and alone ("I.T." is not "IT"). "_" reads as a space
  ("Chicago_PD_S01E02", "The_Wire_-_Season_2") and as an apostrophe before s/t/d/m/ll/re/ve ("Grey_s_Anatomy",
  `spaceUnderscores`). A DVD disc
  ("S01.D02.DVD5") is never an episode. A repeated name word passes ("Hunter x Hunter"); the name's words in
  another order do not ("Eden of the East" is not East of Eden). An episode range without a season ("01 - 21",
  "1-293", "S01E01-02" for later seasons) counts for season 1 only. A season list ("Season 1,2,3", "Seasons 1 &
  2", "Сезони 1 и 2") is a pack of each listed season. A film of the same name is left out of a series: a bare or
  "complete" release filed as a film / Blu-ray disc, or with years outside the show's run (Carrie 1976/2013 for
  Carrie 2026, U.S. Marshals 1998 for Marshals). A P2P pack whose known file list holds other episodes of the
  season but not this one is not offered ("Stranger Things S05 Vol.2" = E05–E07, not E01).
- **Films.** A yearless release is checked against the years in its archive description ("Aladdin" described as
  the 1994–1995 TV series is not Aladdin 2019). A long name (four words or more, articles aside) matched exactly
  allows two years of difference (The Witch: Part 1, 2018 vs Cinemeta's 2020). A yearless release is not taken for
  a film when releases of the same name state years and none is the film's (Don't Move 2026 vs 2004/2024 —
  `namesakesOnly`).
- **Search depth.** `deepSearch`: when the name's own query returns a full page (50 rows) with nothing of the
  title, the next pages are read (4 at a time, up to `DEEP_MAX_ROWS` = 1 000, at most `DEEP_BUDGET_MS` = 5 s in all),
  only rows carrying the name kept, remembered 6 h per film/series and year — an empty answer too; two requests at
  once share one read. Not for a name without a word of four letters ("The O.C." searches every row). Hunter x
  Hunter's BG packs were on page 13. **Season search:** a show that is in the results with no playable row of the
  episode under its plain name is searched once more as "<name> Season N" (`shortenQuery` keeps a "Season N" tail);
  only rows that are this episode under the plain name, with no year outside the show's run, join (Grey's Anatomy
  S4 = "Greys.Anatomy.S01-16", Joey S1 = "Joey Season 1 [BGAudio]"). The log line is `season search "…": N row(s)
  of SxEy`. **A search that did not come back** (a main query, a deep page, the time limit, the season search) sets
  `config._upstreamPartial`: a list of notices only is then not cached, so the next request asks again.
- **Quality labels.** A pack with no quality word is not labelled by its total size ("SOUTHPARK Season 01-27",
  105 GB, was "4K") — it shows "?" unless a fetched file list says; DVD5/DVD9/DVDR/DivX/TVRip/PDTV and 594p/576p/
  480p read as SD.
- **What the viewer is told.** Every dead end with a known reason has a row (non-video rows leave before
  matching; „Няма епизод N" (until v2.7.0 „Не е намерен") for "no row carries the show name"). „Само кеширани" with nothing cached says so and how
  to see the P2P releases. An episode the archive has only without an infohash gets „Без връзка в архива" naming
  the season and episode (The Simpsons S9) — only for a row under the plain name that states its season, also when
  every result is linkless; otherwise „Няма епизод N".
- **Links.** A v2.0.0 link's `rdmode=all` is "debrid + P2P" again. A config segment with a broken "%" gets a plain
  400 ("bad config link" / "bad play link" / "bad request"); the last Express error handler logs only the status
  and the error's name — no stack trace, no file paths, no token.

Tested: replay 387 ids vs v2.6.8 — 91 rows lost, every one a wrong release (other films, other shows, other
seasons, DVD discs, packs without the episode); 33 gained (Chicago P.D., Hunter x Hunter, NCIS S2, My Hero Academia
S8, Stranger Things S5E8 finale, The Witch…); 47 info rows changed, 0 errors. The fresh-context review then found
8 more (B-039…B-046, among them "Grey_s_Anatomy" no longer matching — no replay id asks for such a name); after
the fixes the replay is the same.

### TorBox plays on demand (v2.6.7)

The list makes ONE cache check (`checkcached`, with file lists) and keeps a cached release only if it
holds the right file. Each TorBox row points to `/<config>/play/tb/<type>/<id>/<hash>`; pressing play
adds the torrent, picks the file and redirects (302) to TorBox's link, reused for 2 h. Before, every
cached release of every title merely opened was added to the viewer's library (a test account had 805)
and the list took 4–5 s; now 0,3–0,5 s, play ~1,5 s. Real-Debrid still adds at list time: RD has no
cache check any more, so adding is the only way to know what is instant — and it is untested without
an RD token.

### Replay test — run before every matching or file-choice change

```bash
cd tools/replay
node build-ids.js real_searches.tsv > ids.txt   # real searches (from stats.json logs) + popular + targeted
./start.sh HEAD                                  # OLD = HEAD on :7101, NEW = working copy on :7102
node drive.js ids.txt out/warm && node drive.js ids.txt out/final   # 2nd pass: caches warm, packs resolved
node diff.js out/final                           # lost / gained rows, fileIdx changes, info rows
```

`stubs.js` answers the archive and itorrents from `cache/` so both versions see identical data; the
tracker is pointed at a dead port so seeder counts cannot differ. `rd-stub.js` (:9913) plays Real-Debrid
by token — `stub-ok` (cached = hash starting 0–7), `stub-bad` / `stub-free` / `stub-busy` /
`stub-infr` (refusals), `stub-late` (2 calls pass, then 429) — so RD runs without an account:
`node drive.js ids.txt out/rd "debrid=realdebrid|rdtoken=stub-ok|debridmode=all"`. `diff.js` compares
debrid rows by release name and lists info rows separately (a notice appearing is not a lost stream). Unit tests alone are not enough:
every v2.6.6 round found real losses they missed.

### Egress proxy (Oracle)

```bash
ssh -i ~/Downloads/ssh-key-2026-09-20.key opc@150.230.21.90
sudo systemctl status zamunda-proxy
sudo journalctl -u zamunda-proxy -n 50 --no-pager
sudo systemctl restart zamunda-proxy
```

Layout: app `/opt/zamunda-proxy` (root-owned) · env `/etc/zamunda-proxy.env` (root:zproxy 0640) ·
unit `/etc/systemd/system/zamunda-proxy.service` · runs as **`zproxy`** (system account, no shell, no
home, no sudo) · port 7011. A pre-hardening copy of the unit is at `/root/zamunda-proxy.service.bak`.
Routes: `/` (search, keyed), `/stats` (archive size, keyed, since 2026-10-07), `/health`, `/probe`.
The repo copy is `home-proxy/server.js`; the version before `/stats` is on the box as
`/opt/zamunda-proxy/server.js.bak-2026-10-07-prestats`.

The unit is sandboxed (`ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`, empty
`CapabilityBoundingSet`, `SystemCallFilter=@system-service`, …). If you add a feature that needs to
write to disk, it will fail until you add a `ReadWritePaths=` line — that is the sandbox doing its job,
not a bug. **Never add `MemoryDenyWriteExecute`** — it breaks the V8 JIT and Node will not start.

### Addon container (Hetzner)

```bash
ssh root@178.104.89.141
cd /opt/personal/sites/zamunda-stremio
docker compose ps
docker compose logs --tail=50
docker compose up -d --build     # rebuild; a restart is NOT enough after a file change
```

### Oracle IP changed

The addon points at **`zproxy.tzkppv.com`**, not at a bare IP, so an IP change is a **one-record DNS
edit** and needs no deploy, no restart and no code change:

> Cloudflare → tzkppv.com → DNS → Records → `zproxy` → Edit → new IPv4 → Save.

⚠️ **Keep it "DNS only" (grey cloud).** Proxied would break it twice over: Cloudflare does not proxy
port 7011 at all, and it would replace the source IP arriving at Oracle, which the NSG rule pins to
the Hetzner box.

**Why a DNS name and not a reserved IP:** the public IP is EPHEMERAL and *cannot* be made reserved on
this tenancy. Symptom if it ever changes: step A returns `000` and the Oracle console shows a
different public IP.

Converting to a reserved IP was attempted on 2026-09-20 and does not work here:
- Once an ephemeral IP is attached, the VNIC's Edit dialog offers only *No public IP* / *Ephemeral* —
  the *Reserved* option disappears. Oracle does not convert in place.
- The `⋮ → Reserve IPv4 address` menu item is a **trap**: it reserves the *private* IP (10.0.0.12), a
  different feature entirely. Read the dialog title before confirming.
- Assigning a secondary private IP with a reserved public IP fails with
  `API Error — Authorization failed or requested resource not found`, on a free tenancy.

So treat "the IP changed" as a known failure mode with a one-line fix, below. **Do not stop the
instance** unless you are ready to re-point the addon afterwards.

Only if you ever move off DNS, or want to point at a different host directly:

```bash
ssh root@178.104.89.141 \
  "cd /opt/personal/sites/zamunda-stremio && sed -i 's#^ZAMUNDA_PROVIDERS=.*#ZAMUNDA_PROVIDERS=http://<NEW_HOST>:7011#' .env && docker compose up -d --force-recreate"
```

An `env_file` change needs `--force-recreate`; a plain restart keeps the old environment.

Also update the NSG ingress rule if the **Hetzner** IP ever changes (it is pinned to `178.104.89.141/32`).

### Moving to a different proxy host entirely

`ZAMUNDA_PROVIDERS` is a comma-separated list tried in order. Adding a host is an env change and a
restart — never a code edit under pressure:

```
ZAMUNDA_PROVIDERS=http://newhost:7011,http://150.230.21.90:7011
```

To find a host that works at all, deploy `home-proxy/` there and read `/probe`. Known results:
**Oracle Cloud (Amsterdam) 200** · Render (Frankfurt) 403 · Hetzner 403 · Cloudflare Workers 403.

### WireGuard tunnel

Hetzner `10.8.0.2` <-> Oracle `10.8.0.1`, Oracle listening on UDP 51820, endpoint set by DNS name so
an IP change does not break it. Keys in `/etc/wireguard/` on each box; **private keys never left their
host** and the public keys are in each other's `wg0.conf`.

```bash
ssh root@178.104.89.141 'systemctl restart wg-quick@wg0; sleep 3; wg show wg0'
ssh -i ~/Downloads/ssh-key-2026-09-20.key opc@150.230.21.90 'sudo systemctl restart wg-quick@wg0; sudo wg show wg0'
```

`latest handshake` should be under ~2 minutes old. `transfer: 0 B received` with a non-zero sent count
means packets are leaving Hetzner and nothing is coming back — almost always the Oracle NSG missing its
**UDP 51820** ingress rule from `178.104.89.141/32` (firewalld needs the same rule, separately).

**The tunnel is not a single point of failure.** `ZAMUNDA_PROVIDERS` lists the tunnel first and the
public path second, so if WireGuard drops the addon falls back automatically on the next search. That
is why the public TCP 7011 rule is deliberately kept — it is the break-glass path, not an oversight.

### The independent magnet catalogue (v2.6.0)

Two stores doing different jobs — keep them straight:

| file | keyed by | job |
|---|---|---|
| `data/torrent-index.jsonl` | query string | answer a repeat search with no network; serve during an outage |
| `data/magnet-catalogue.jsonl` | **infohash** | own the data — deduplicated, enumerable, exportable |

The catalogue grows on every successful search (`catPut`, right next to `idxPut`). A **new** infohash
is appended to disk immediately, because the magnet is the irreplaceable part; `last_seen` and the
sighting counter live in memory and flush on compaction (30 min) and on shutdown. Losing a counter to
a hard kill costs nothing, whereas appending a line per repeat sighting would bloat the file.

`catSeedFromIndex()` runs at boot and backfills any infohash present in the index but missing from the
catalogue. It is **idempotent**, so it doubles as self-healing: delete the catalogue file and it
rebuilds from the index on the next restart.

```bash
# stats
curl -s "https://zamunda-stremio.tzkppv.com/catalogue/stats?key=$DASHBOARD_KEY"

# export — the whole point of normalising it is that the data can leave
curl -s "https://zamunda-stremio.tzkppv.com/catalogue.jsonl?key=$DASHBOARD_KEY" -o catalogue.jsonl
```

Both endpoints use `adminAuth` and are fail-closed: 403 without the key, and 403 for everyone if
`DASHBOARD_KEY` is unset. Record shape `{h, t, s, c, src, bg, m, f, l, n}` — infohash, title, size,
category, source, bg-audio flag, full magnet, first seen, last seen, times seen.

**Baseline at deploy, 2026-09-21:** 8,362 unique magnets (1,361 BG audio; z 6,519 · arenabg 1,410 ·
zelka 433), 3.0 MB on disk. Around two-thirds of the index's growth is organic user traffic and one
third the 04:00 pre-warm, so this climbs on its own.

### Seeder counts (v2.4.0)

`.life` returns no swarm data, so counts come from a UDP tracker scrape (BEP 15) against
`tracker.opentrackr.org:1337` — the single tracker embedded in the magnets. One connect + one scrape,
whole list in one packet (70 hashes max), 3s timeout, cached 10 minutes, shown as `👥 N` on P2P rows only.

**Failure is silent by design.** If the tracker is slow, rate-limiting or down, rows simply carry no
count — it must never cost a user their stream list. So "the seeders disappeared" is a tracker problem,
not an addon bug. Counts reflect only peers that announced to *that* tracker; DHT-only peers are invisible,
so a low number is a floor, not a ceiling.

## Security posture (Oracle box)

- **Traffic is encrypted.** The addon talks to the proxy over WireGuard; the plaintext public path
  remains only as an automatic fallback.
- **Nothing is open to the internet.** Both TCP 7011 and UDP 51820 are allowed only from
  `178.104.89.141/32`, enforced twice over: the cloud NSG, and `firewalld`.
- Requests still need the `X-Api-Key` header; the proxy refuses to start without a key set, rather than
  running open.
- Service runs as `zproxy` — system account, no shell, no home, not in any sudo group.
- SSH: `passwordauthentication no`, `kbdinteractiveauthentication no`, keys only.
- Automatic **security** updates via `dnf-automatic.timer` (`upgrade_type = security`, `apply_updates = yes`).
- Only TCP 22, TCP 7011 and UDP 51820 listen on public addresses. `rpcbind` (port 111, an Oracle
  Linux default, unused here) was disabled on 2026-10-14; it was already blocked by NSG and firewalld.
- Kernel updates install automatically but need a reboot: `sudo needs-restarting -r`. A reboot from
  the OS keeps the IP (never stop the instance from the console); everything comes back on its own in
  ~20 s (proxy, tunnel, firewall). Last reboot 2026-10-14.

**Closed 2026-09-20:** the hop used to be plain HTTP with the API key in cleartext. It now runs over
WireGuard. The fallback path is still plaintext, but it is only used when the tunnel is down, and it
remains pinned to one source IP and key-protected.

### Polish: rows, hints, names and notices (v2.7.0)

Stage 3 of the bug loop (owner: „lets polish the addon and make it proper"; T-301 – T-311):
- **The row.** Source "z" reads Zamunda (v2.6.9 called 1 221 of 1 585 replay rows "Zelka"), "arenabg" ArenaBG; a size
  is always "number unit" (`sizeLabel`). An AI-enhanced or RIFE-interpolated release ranks as an upscale and says
  "Upscale" (the 4K Ai-Enhanced Matrix no longer comes first).
- **Hints.** `bingeGroup`: a pack `zamunda|<infohash>`, a single episode `zamunda|<quality>|<bg or empty>|<release group>`, a
  film `zamunda-<quality>` — the next episode stays on the same pack or group. `filename` + `videoSize` when the file is
  known: the debrid file, or a P2P file index (never on a P2P row without one). Every request works on its own copies
  of the rows: the search cache keeps the archive's row objects an hour, and v2.6.9 let one request's file, file index
  and seeders show in another's answer (B-057).
- **Cinemeta's other host** (`otherHostMetadata`): on a dead end (nothing found, nothing carrying the show's name, no
  release that is this film), cinemeta-live is asked once (2,5 s, kept a day, a failure not kept). Its name is
  searched when it is the same name in another year (Ip Man 3: 2025 / 2015) or one name holds the other's words
  (Ghostland / Incident in a Ghostland, Besa / Besa: Blood Oath); its answer is used unless it is a dead end too or the
  archive went down. The log label ends "— Cinemeta's other name"; no second SEARCH line, and the first dead end's GAP
  line is logged only if that answer is the one shown.
- **Same-name shows** (`anotherShowsYears`): a release whose own years (before its season mark, never the show's own
  name — "1923") fit neither the asked season's air years from Cinemeta (`seasonYears`, ±1) nor the show's first year
  is another show: MacGyver 2016 for 1985, Avatar 2024 for 2005, One Piece 2023 for the anime. No year, no air dates:
  kept. Log: `N of another show's years left out (season S aired Y–Y)`.
- **Notices.** One name per kind (ℹ️ facts, ⚠️ the archive not answering): „Няма епизод N", „Няма сезон N",
  „Няма това качество", „Над максималния размер", „⚠️ Архивът не отговаря". A season first aired in 2026 or later adds
  that the archive gets no new torrents (`seasonIsNew`). The dead end reads a season only from a real mark — the
  release group "HS0" was "S00" (B-056).
- **Manifest and page.** The description names the three sites and the mode; the background is `background.jpg`
  from the GitHub repo (push before deploying a change to it). The config page: Bulgarian throughout, one key wording,
  readable grey, the frozen-archive line, the outage banner says „Архивът е недостъпен"; the changelog marks each
  v2.7.0 line ПОДОБРЕНИЕ.

Tested: replay 391 ids vs v2.6.9 — 12 rows lost, every one another show's (MacGyver 2016, Avatar 2024, One Piece 2023,
Death Note 2015, Undercover 2016, 2 Fast 2 Furious for Furious 2026); 17 gained (Ip Man 3 ×12, Ghostland ×2, Death
Note anime packs ×2, Besa S2E3); 0 errors. The fresh-context review found 4 more (B-057…B-060), fixed.

## Deploying a new version

Full procedure is in `CLAUDE.md` (local, gitignored). The parts that bite:

1. **Filenames change on deploy.** `server-full.js` → `server.js`, `config-page-v2.html` → `config.html`.
2. **Ship `package.json` AND `package-lock.json`** whenever a dependency changed. The image runs
   `npm ci --production`, which hard-fails on a lock that disagrees with the manifest.
3. **Rebuild, don't restart** — the Dockerfile `COPY`s the files into the image.
4. **Version lives in 6 strings** (4 in `server-full.js`, 2 in `config-page-v2.html`). A mismatch between
   `/health` and the page badge means a half-done bump.
5. Back up first: `cp -p server.js server.js.bak-<ver>-predeploy` (same for `config.html` and `.env`).
6. Verify `/health` matches what you shipped, and that `/stats` counters are **not** zeroed.

## Hard-won gotchas

- **SELinux is Enforcing on Oracle Linux 9.** systemd reads `EnvironmentFile` as root *before*
  dropping to the service user, and it cannot read `/home`. Symptom: `Failed to load environment
  files: Permission denied` and a crash loop. Keep the env file in `/etc` and the app in `/opt`.
- **Oracle has TWO firewalls.** The OS (`firewalld`) *and* the cloud NSG / security list. Opening one
  and not the other gives a silent timeout with no error anywhere.
- **Oracle Linux 9 ships Node 16**, which has no global `fetch()`. The proxy needs 18+:
  `sudo dnf -y module reset nodejs && sudo dnf -y module enable nodejs:20 && sudo dnf -y install nodejs`
- **`.life` blocks by IP reputation, not headers.** Bare curl, a browser UA and a full browser header
  set all get the same `cf-mitigated: challenge` 403 from a flagged host. Don't debug headers.
- **`.life` breaks PER TERM, not per character.** It splits the query on whitespace and 500s on
  certain characters *inside* a term. `Matrix - Reloaded` is fine; `Matrix-Reloaded` is a 500. Testing
  a character surrounded by spaces therefore gives a false all-clear — that mistake shipped a
  half-fix and left `Spider-Man`, `Spider-Noir` and `Five-Star` failing overnight. Unspaced, each of
  `- & # / : ? , . ! %` fails; `'` `(` `)` `+` are fine. `sanitizeQuery` keeps only letters, digits,
  whitespace and the apostrophe. **Validate with real titles, not with synthetic single characters.**
- **`.life` returns HTTP 500 for a query containing `:` `?` `,` `.` `!` or `%`** (verified 2026-09-20).
  Cinemeta supplies titles with exactly those characters, so every colon or full-stop title —
  "Daredevil: Born Again", "Mr. Robot", "Star Wars: The Mandalorian and Grogu" — failed with the
  outage notice while the archive had the episodes. `sanitizeQuery()` now spaces out anything outside
  letters, digits and the punctuation that tested safe (`& ' ( ) + # / -`). **Symptom to recognise:
  `[DOWN] … source unavailable` for some titles while others work fine in the same minute.** A real
  outage takes everything down at once; a per-title pattern means the query, not the source.
- **An episode range in its own brackets — `(01-24)`, `[01-24]` — needs its own pattern.** Every other
  range pattern requires the range preceded by `_ . -` or a space, or followed directly by `[` or `(`;
  the enclosing brackets defeat both, so a 24-episode batch matched nothing. Symptom:
  `[MISS] … N torrents but 0 episode matches` with a `[Batch]` release in the sample.
- **Series results must be checked against the show name — substring matching is not enough.** Until
  v2.5.2 series went straight into `matchesEpisode` with no title check, so "Silo" S3E8 was offered
  "Hju Haui - Siloz - 3. Prah" (a Hugh Howey audiobook) and "Silovata redakcia na prehoda". Whole-word
  matching is the fix; articles are dropped because releases omit them, and the name need not be a
  prefix because releases bury it ("Special.Ops.Lioness.S01E01"). If this ever over-filters you will
  see `[MISS] … N results, none carry the show name` — that log line exists to make it diagnosable.
- **The apostrophe splits the archive in two (v2.6.1).** `.life` drops `'` from the query, so
  "JoJo's Bizarre Adventure" searches for "jojos" → 0 rows, while "JoJo s Bizarre Adventure" → 42.
  Neither form is a superset ("We're the Millers" finds `Were.the.Millers`, "We re the Millers" finds
  `We're.the.Millers`), so every apostrophe query is searched in BOTH forms and merged. The matchers'
  `normalizeTitle` DROPS apostrophes (and folds accents, and `Grey_s`→`greys`) — spacing them made
  "Sorcerer's" ≠ "Sorcerers" and "grey s" ≠ "Greys", so those films/shows silently lost releases.
- **A movie with no matching torrent gets an info row, never "all results" (v2.6.1).** The old
  `keeping all (fallback)` fired on ~2,100 searches in 21–29.09 and mostly served the WRONG film
  ("Toy Story 5" → Toy Story 1–4, "Resident Evil" 2026 → the old series). Replayed 223 real titles
  old-vs-new: 0 regressions among the 139 that were served correctly. Logged as `[GAP]`, not `[MISS]`.
  Known casualty: films released only under the original-language title (The Invisible Guest =
  `Contratiempo`). With a confirmed year, the part before a colon is accepted ("Léon: The
  Professional" = `Leon.1994`).
- **Dashboard: `MISS` = viewer got nothing; `GAP` = told it is not in the archive.** A BG-audio or
  quality fallback that serves streams is no longer logged as a miss.
- **Known, not fixed: anime numbering.** For "Kuroko's Basketball" S3E25 the episode matcher also
  accepts `Kuroko's Basketball 2 - 01-25` (season-2 range) and absolute-numbered releases.
- **Most "misses" are the archive's coverage ceiling, not a bug.** Measured 2026-09-21 against the
  live API: Fauda holds S1-S4 (S5 requested), Special Ops Lioness S1, Silo S1-S2 (S3 requested),
  MobLand S1 complete with no S02, and Neagley / Agent Kim Reactivated / Spider-Noir return **0 rows**.
  116 of 237 pre-warmed popular titles returned nothing. `[MISS] … 0 episode matches (available:
  S01,S02,…)` is the addon correctly reporting the season is absent. **Before debugging a miss, check
  whether the archive has that season at all** — the "available:" list in the log already tells you.

  ⚠️ **On "frozen": be careful how far you take this.** What is established is (a) the ceiling above,
  and (b) from the Sept-2026 notes, that `zamunda.rip` went CF 521 on 2026-08-25 while `zelka.org` and
  `arenabg.com` began serving seizure pages. What is NOT established is a precise cutoff date, or that
  `.life` is static — it does contain 2026 titles. A coverage test of "new" vs "older" Cinemeta
  catalogues came out the *opposite* way to the frozen hypothesis (13/18 vs 5/18), though that test was
  weak because both catalogues are almost all 2026 and `limit=5` only shows the cap was hit.
  **The clean test is `external_id`, which looks sequential by insertion.** Baseline from 18,034 rows
  sampled on 2026-09-21: **max 853,755**, median 728,324, and the highest ids are all back-catalogue
  (Two and a Half Men, National Security 2003, Basic Instinct 1992) rather than new releases — which
  is what a source that stopped taking new content, then trickled in old uploads, looks like. Re-read
  the max id in a week: if it has climbed, the archive is still growing and "frozen" is wrong.
- **`configFingerprint` keys the stream cache — anything language-dependent MUST be in it.** `lang`
  was missing until v2.5.4, so a Bulgarian response was served to an English config for the next hour.
  It went unnoticed for ages because the hint rows were hardcoded Bulgarian; the first properly
  bilingual row exposed it immediately. Same trap for any future per-user output: if it changes the
  response, it belongs in the fingerprint.
- **A requested season that is absent now says so on screen.** The reason used to live only in the
  log, so the viewer got an empty list, which reads as a broken addon. `[MISS] … (available: S01)` now
  also returns an info row naming what the archive does hold. ⚠️ It is inferred from the rows that came
  back, and the API caps at 50 per query — the per-season searches make this reliable in practice, but
  a very heavily-released show could in principle report an incomplete "available" list.
- **A 200 is not data.** During the August outage, `zelka.org` and `arenabg.com` returned HTTP 200
  serving a seizure page. Read the body.
- **Cache-bust before declaring a source alive.** `?q=Dune` served from Cloudflare's edge cache looked
  healthy while the origin was dead; `?q=Dune&cb=<random>` showed the truth.

## Why this shape

- **Why `.life`** — `zamunda.rip` has been CF 521 since 2026-08-25; `zelka.org` and `arenabg.com` serve
  a seizure page. `.life` is the only surviving index, and it serves a **frozen archive** of those dead
  sites. No new releases are arriving, which is why a local copy is worth so much.
- **Why not the Cloudflare Worker** — it worked for months against `.rip`, which had no bot protection.
  `.life` challenges datacenter ASNs, and Cloudflare's own egress is flagged. No header or code change
  in the Worker can fix that.
- **Why Oracle** — its ASN is not flagged. It was the first non-residential host to return 200.
- **Why the local index** — it makes any single upstream non-fatal. Every result set the addon has ever
  seen is kept in `data/torrent-index.jsonl` (bind-mounted, survives rebuilds), served directly when
  under 1h old and fallen back to at any age up to 90 days when every provider fails.
