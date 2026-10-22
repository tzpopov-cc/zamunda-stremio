# The bug loop — state

The loop's memory. After a context compaction trust this file, `plans/T-NNN.md`, `TASKS.md`, `BUGS.md`
and `git log` — not the recollection.

## The order (owner, 20.10.2026)

After the log review of 20.10.2026 (docker logs 15–20.10, 12 937 searches — findings in `BUGS.md`):
„fix them all brother - i want you to apply the loop system we are using to fix bugs and improve the app."

## Stage 3 (owner, 21.10.2026)

„work it out brother, lets polish the addon and make it proper" — after v2.6.9 went live. Stage 3 = T-301: a
polish pass over everything a viewer sees (stream rows, notices, ranking, the config page, the manifest, the
README) and the live log since v2.6.9, plus the open bugs that can be measured (B-047, B-025, B-037). Findings →
`BUGS.md` → tasks T-302…; same rules and same stage end (review, replay, version, deploy with backup, push).

## Decisions

1. **Deploy:** by me, at the end of each stage (T-107, then T-2xx end), only after the replay shows
   0 lost correct streams. Before: `cp -a data data.bak-<ver>-predeploy` taken with the container
   STOPPED, `server.js`/`config.html` → `*.bak-<ver>-predeploy`, old image tagged `:<ver>`. Then
   `docker compose up -d --build`, live checks. Prefer outside the Bulgarian evening peak (17–21 UTC).
   Procedure: RUNBOOK „Deploy" (manual scp, renames `server-full.js`→`server.js`,
   `config-page-v2.html`→`config.html`). If auto mode blocks the deploy → hand the owner a script.
2. **Live server:** read-only from the loop, except the deploy. Never `docker exec` into the container.
3. **Secrets:** no token, key or user id in logs, commits, plans or chat. The repo is PUBLIC.
4. **Tests without an RD token:** a local stub of the RD API (the owner has no RD token for testing).

## Rules of every turn

1. `git status`: on `main`, clean or only my current task. Someone else's change → stop and ask.
2. A plan in `plans/` with unchecked steps → continue it. Otherwise the next unchecked task in `TASKS.md`.
3. Every task: plan `plans/T-NNN.md` (method of the `project-manager` skill: task, sources, steps with
   checks, two tests, outside-the-task, journal) → do it → two checks (a unit check against real
   release names / real API shapes, and the replay `tools/replay/` old vs new) → `TASKS.md` / `BUGS.md`
   → ONE local commit `T-NNN …`.
4. A task that waits for the owner does not stop the loop: it goes to „Waiting" and the loop moves on.
5. End of stage: review from a fresh context (method of the `stage-review` skill: one reviewer agent over
   the stage's diff, findings → `BUGS.md` first, then fixed one by one) → full replay → version bump
   (6 strings + changelog entry, see RUNBOOK) → deploy (decision 1) → live checks → push.
6. After stage 1: the bug hunt (stage 2) — every user process end to end with real data, read-only on
   live. A full pass with no new finding → the loop stops with a report to the owner (in Bulgarian).
7. Every turn ends with a line in „Log" below.

## Waiting for the owner

- (nothing)

## Log

- 20.10.2026: loop set up. Bugs B-001…B-009 from the log review; stage 1 = T-101…T-107, stage 2 = T-201.
- 20.10.2026: T-101 ✅ — the replay shows info rows; 23 targeted ids. Baseline shows B-003…B-006. Next T-102.
- 20.10.2026: T-102 ✅ — RD says why it refused, stops after 2 calls, notice + P2P (B-001, B-002); found and fixed B-010 (cache ignored debrid mode); replay compares RD rows. Next T-103.
- 20.10.2026: T-103 ✅ — no more empty lists for titles the archive lacks (B-003, B-004); replay 361: 0 lost, 51 new info rows. Found: Cinemeta fallback can name a film differently (→ T-106). Next T-104.
- 20.10.2026: T-104 ✅ — sequel numbers both ways (B-005): "Extraction II" finds "Extraction.2"; replay 361: 0 lost, 23 gained, all the right film. X (2022) unsearchable (one-letter word). Next T-105.
- 20.10.2026: T-105 ✅ — a release of another show no longer counts as the show (B-006): Sheriff Country S2 → „Няма сезон 2"; War / Brothers no longer get other shows (old: up to 32 wrong rows); replay 361: 0 gained, 52 lost, all other shows. Next T-106.
- 20.10.2026: T-106 ✅ — Cinemeta hang costs 2,5 s instead of 5 s; a fallback name is kept 30 min, not a day (B-007); replay 361 identical. Next T-107 (stage end).
- 20.10.2026: T-107 steps 1–4 ✅ — review (9 findings: B-011…B-017; 7 fixed, 1 accepted, 1 by design), replay vs live 2.6.7: 0 right rows lost, 23 gained, 52 other-show rows removed, 52 new info rows; v2.6.8 committed (5a3ccfc). Deploy waits for 21:00 UTC (outside the evening peak), script ready.
- 20.10.2026: T-202 ✅ — dotted abbreviations also searched and matched joined (B-018): Chicago P.D. S1E3 gets the 8 season-1 rows; replay 372: 0 lost, 12 gained, all the right show. Found by the hunt and queued: B-019 underscores (T-203), B-020 empty lists with a known reason (T-204). Next T-203.
- 20.10.2026: T-203 ✅ — "_" read as a space (B-019): Blue Lights / The Wire season packs found with the episode's file; DVD discs never an episode; "Taxi Driver 3 … E08" is S3E8; replay 387: 9 gained, 13 lost (all wrong rows). Found by the replay: a pack known to lack the episode is still offered (B-023 → T-207). Next T-204.
- 20.10.2026: T-204 ✅ — every dead end with a known reason gets a row (B-020): games/music leave before matching; „Не е намерен", „Над ограничението"; replay 387: 0 playable rows changed, 25 [] → a row, 0 empty answers of 392. Next T-205.
- 20.10.2026: T-205 ✅ — „Само кеширани" with nothing cached gets „Няма кеширани" + how to see P2P (B-021); RD stub replays 34 ids: RD rows identical, empty lists → the row, mixed mode identical. Next T-206.
- 20.10.2026: T-206 ✅ — a pack without a quality word is „?" instead of 4K/1080p by total size (B-022); DVD discs, DivX, TVRip, 594p read as SD; a quality filter keeps „?" rows only next to the chosen quality. Replay 387: 0 lost, 0 gained, 130 labels changed, each read. Found by the hunt: films offered for a series of the same name (B-024 → T-208); a later series of the same name (B-025, needs a check). Next T-207.
- 20.10.2026: T-107 steps 5–7 ✅ — v2.6.8 live 21:01 UTC (backup verified, data identical, 1 008 users kept); live checks: Extraction II found, Sheriff Country S2E2 „Няма сезон 2", Spider-Man: Brand New Day „Няма го в архива", 0 errors; pushed. Stage 1 closed.
- 20.10.2026: T-207 ✅ — a P2P pack whose known files lack the episode is left out (B-023): Stranger Things Vol.2 not for S5E1, Vol.1 not for S5E5/E8. Found by the replay and fixed in the task: "Final Season - 07" was read as season 7 — My Hero Academia S8 now gets its file for E1 and E11. Replay 387: 3 lost (all wrong), 0 gained, 2 file indexes found. Next T-208.
- 20.10.2026: T-208 ✅ — a film of the same name is not offered for a series (B-024): bare-named releases filed as films/Blu-ray or with years outside the run, and "COMPLETE.BLURAY" discs, leave; complete series filed under films (FRIENDS.Complete) stay. Replay 387: 70 lost (all films or another show), 0 gained, 13 [] → „Не е намерен". Next: T-201 hunt pass 2 on the post-T-208 tree.
- 20.10.2026: T-209 ✅ — a repeated word in a show name ("Hunter x Hunter") no longer rejects its own releases (B-026); the name's words must stand together ("Eden of the East" is not East of Eden). Unit 17/17, cache-wide pairs identical, replay 387 identical. Hunt pass 2 also found B-027 (titles beyond the archive's first 50 rows) → T-210; Extraction II on live = 7 dead torrents hidden by design. Next T-210.
- 21.10.2026: T-211 ✅ — an episode range without a season counts for season 1 only (B-028), found by the T-210 check (Hunter x Hunter "01 - 21" offered for S2E3). Unit 12/12, cache-wide: 64 names change, none for season 1; replay 387: 4 lost, all wrong (Alice in Borderland "S01E01-02" for S2E1, Black Clover season-1 batches for S2E3), 0 gained. Found by the replay: "Eden of the East" passes for East of Eden (B-029 → T-212). Next T-210.
- 21.10.2026: T-210 ✅ — a full first page with nothing of the title is read further, capped at 1 000 rows, 4 pages at a time, remembered 6 h (B-027): Hunter X Hunter S1 gets its BG packs; the 10 honest misses still say so, each paged once; titles with rows on page 1 never page. A film's row past page 1 must state its year ("Animals", 70 MB, no year, was offered for the 2026 film). Replay 387: 386 identical, 0 lost, 4 gained (Hunter x Hunter S1E1). Next T-212.
- 21.10.2026: T-212 ✅ — a show name's words in another order are another show (B-029): "Eden of the East" no longer passes for East of Eden, nor "Detective Dee … Hole" for Detective Hole. Unit 14/14; cache-wide 3 pairs change, all wrong; replay 387: 1 lost (wrong), 0 gained. Next: T-201 hunt pass 3 on the post-T-212 tree.
- 21.10.2026: T-201 pass 3 (post-T-212): census 242 playable / 150 info / 0 empty; every MISS, missing season and not-found row checked against the archive; found B-030 (The Witch: Part 1 — Cinemeta's year two off → T-214) and B-031 (the Aladdin TV series offered for the 2019 film → T-213). RD/TorBox/config steps running.
- 21.10.2026: T-213 ✅ — a film release without a year is checked against the years in its archive description (B-031): the Aladdin 1994–1995 TV series no longer comes for Aladdin (2019); trilogies spanning the year stay. Unit 9/9; cache-wide 1 pair changes; replay 387: 1 lost (wrong), 0 gained. Next T-214.
- 21.10.2026: T-201 pass 3 steps 4–7: RD stub (6 kinds), TorBox without an account, config page ↔ server (7 200 combinations), live landing and dashboard numbers — all right; found B-032 (v2.0.0 links' rdmode=all ignored → T-215) and B-033 (a broken "%" in the config → stack trace / hung TorBox play → T-216).
- 21.10.2026: T-214 ✅ — a long film name matched exactly allows two years of difference (B-030): The Witch: Part 1 - The Subversion found (Cinemeta 2020, release 2018); short names keep ±1 (The Godfather 1974 = Part II). Unit 7/7; cache-wide 1 pair gained; replay 387: 1 gained, 0 lost. Next T-215.
- 21.10.2026: T-215 ✅ — a v2.0.0 install link's rdmode=all is "debrid + P2P" again (B-032): through the RD stub such a link now gets the P2P rows instead of „Няма кеширани". 7 200 page links read back as before; replay 387: 386 identical (Toplo: Cinemeta timing on the old side). Next T-216.
- 21.10.2026: T-216 ✅ — a config with a broken "%" sequence gets a plain answer (B-033): manifest 400 "bad config link" instead of a 500 stack trace with the server's paths, TorBox play 400 at once instead of hanging, Express's own decode errors plain text; no token logged. 7 200 page links as before; replay 387: identical. Next: T-201 pass 4 findings (B-034, B-035).
- 21.10.2026: T-201 pass 4 (fresh live searches, post-T-216): 212 searches → 87 ids + 5 older seasons; every info row searched again by several spellings. Found B-034 (older seasons only in multi-season / "Season N" packs → T-218), B-035 ("NCIS Season 1,2,3" → T-217), B-036 (a season only without a link called missing → T-219), B-037 (Mushi-Shi → deferred: the joined name offers a season-2 special for S1E11). 49 „Няма го в архива" all honest.
- 21.10.2026: T-217 ✅ — a season list ("Season 1,2,3", "Сезони 1 и 2") is a pack of every season in it (B-035): NCIS S2E3 gets the BG-audio pack. Cache-wide 1 name of 13 696 changes; replay 387: 386 identical, 1 gained, 0 lost. Next T-218.
- 21.10.2026: T-218 ✅ — a show in the archive with nothing playable for the episode is searched once more as "<name> Season N"; only that episode's rows under the plain name are added (B-034): Grey's Anatomy S4E1 gets the S01-16 pack, Joey S1E23 the BG-audio season pack. The first draft let "Melissa and Joey" pass for Joey S2 — caught by check 1, fixed. Pass-4 answers: 90 identical, 2 gained; replay 387: identical. Next T-219.
- 21.10.2026: T-219 ✅ — an episode the archive has only without a link, in a release that names its season, gets „Без връзка в архива" naming the season and episode (B-036): The Simpsons S9, Nip/Tuck S1/S2. The first replay caught "East Of Eden - E01-04" (the 2008 Korean drama) passing for the 2026 series → the row must name its season. Replay 387: 385 identical, 2 info rows changed, 0 lost.
- 21.10.2026: T-201 pass 5 (live 20.10 ~23:15–23:53 UTC, post-T-219): 50 ids, 24 info rows searched again → B-038 (a yearless DVDRip, by its age the 2004 film, gave „Без връзка" for Don't Move 2026; measured: 2 of 200 films) → T-220; the rest honest.
- 21.10.2026: T-220 ✅ — a film release without a year is not taken for the film when releases of the same name state years and none is the film's (B-038): Don't Move (2026) → „Няма го в архива"; Carrie, Shrek, The Godfather keep their yearless rows. Pass-4/5 answers: 141/142 identical; replay 387: identical. Next: T-201 pass 6 (full) on the post-T-220 tree.
- 21.10.2026: T-201 ✅ pass 6 (full, post-T-220) — nothing new: replay census 148 info rows each searched again, 36 fresh live ids, RD stub 6 kinds (0 errors, 0 leaks, 0 empty), config page 7 200 links, live numbers all right. The hunt ends. Next T-221 (stage end: review, replay vs v2.6.8, v2.6.9, deploy).
- 21.10.2026: T-221 ✅ — stage 2 ends. Review (8 findings: B-039…B-046, all fixed; the worst, "Grey_s_Anatomy" no longer matching, a T-203 regression no replay id covered), replay vs v2.6.8: 0 right rows lost, 91 wrong rows gone, 33 gained; v2.6.9 committed (925a92a) and deployed 01:33 UTC with backup (files, image :2.6.8, data copy verified); live checks all right, stats kept (1 009 users); pushed. Open: B-047 (Cinemeta's two names), B-037, B-025, B-008. No stage 3 tasks yet — the loop stops here.
- 21.10.2026: stage 3 opened (owner: „lets polish the addon and make it proper"); T-301 polish pass running. T-302 ✅ — the row's source and size: "z" is Zamunda (1 221 of 1 585 replay rows said Zelka), ArenaBG spelled right, one size form (B-048, B-049); replay: only the info line changes.
- 21.10.2026: T-301 ✅ — polish pass: live log since v2.6.9 clean (224 searches, 0 errors, every miss honest); findings B-050 (AI-enhanced 4K first), B-051 (binge group, no file name hints), B-052 (notice wording), B-053 (config page), B-054 (manifest, README), B-055 (Cinemeta wrong year, Ip Man 3); B-047 measured (gain 2, lose 0). Tasks T-303…T-308.
- 21.10.2026: T-303 ✅ — an AI-enhanced / RIFE-interpolated release ranks as an upscale and says "Upscale" (B-050): The Matrix trilogy, Thor, The Fast and the Furious no longer open with it; replay: same rows, 5 orders changed.
- 21.10.2026: T-304 ✅ — the next episode stays on the same pack or release group (`bingeGroup`), and rows with a known file give subtitle addons its name and size (B-051); replay: same rows and text, only hints change.
- 21.10.2026: T-305 ✅ — notice rows in plain words (B-052): „ℹ️ Няма това качество (720p)", „единствения резултат", „ключ" for RD and TorBox, „⚠️ Архивът не отговаря", „ℹ️ Няма епизод N" everywhere; replay: 27 rows renamed, nothing else.
- 21.10.2026: T-306 ✅ — the config page (B-053): the broken changelog line whole, one numbers box, Bulgarian words everywhere, „ключ" for both services, TorBox „~1 сек.", readable grey, a line that the archive gets no new torrents; install-link code untouched.
- 21.10.2026: T-307 ✅ — manifest names the three sites and the mode in full, a 1600×900 background picture (push before deploy: it is served from GitHub); README true and in Bulgarian, its self-host steps checked in a clean folder (B-054).
- 21.10.2026: T-308 ✅ — a dead end asks Cinemeta's other host and searches its name/year (B-047, B-055): Ghostland +2, Ip Man 3 +12, Besa S2E3 +1, Besa S1E1 „Няма сезон 1 (S02)"; Toplo kept; replay 387: 385 identical, 0 lost. Replay ids +4 (Ocean's Eleven, Grey's S22E7, Ip Man 3, Besa S2E3).
- 21.10.2026: T-309 ✅ — a show of the same name from other years is not offered (B-025): a release's own years (before its season mark, not the show's name) against the season's air years from Cinemeta; replay 391: 12 rows of another show gone (MacGyver 2016, Avatar 2024, One Piece 2023, Death Note 2015, Undercover 2016…), Death Note anime packs +2, 0 right rows lost. B-056 found ("HS0" read as S00) → T-310.
- 21.10.2026: T-310 ✅ — the dead end reads seasons only from real marks ("HS0" was S00 for Furious; 83 of 15 182 cached names carry such a token), and a notice for a season first aired in 2026+ says the archive gets no new torrents (32 replay notices) (B-056). Tried and dropped: „Няма го в архива" when only films carry the name (untrue for Formula 1 and Cross S2). Replay: 0 stream rows changed.
- 21.10.2026: T-311 ✅ — stage 3 ends. Review (B-057…B-060: one viewer's debrid file name on others' P2P rows, the other Cinemeta name of another title, a second GAP line, three texts — all fixed), replay vs v2.6.9: 0 right rows lost, 12 wrong gone, 17 gained; v2.7.0 (changelog: every line ПОДОБРЕНИЕ, owner's request) pushed and deployed 09:54 UTC with backup (files, image :2.6.9, data copy verified); live checks all right, stats kept (1 012 users). Open: B-037, B-008. No stage 4 tasks yet — the loop stops here.
- 22.10.2026: stage 4 (owner: „fix everything we can please") T-401…T-404 ✅ — B-061 (MacGyver 2016 dead rows), B-062, B-063 (Besa), B-037 (Mushi-Shi); B-008 stays (no source). Fresh-context review: 4 findings fixed. Replay 391 vs v2.7.0: identical. v2.7.1 committed and pushed (e0420d5). Deploy: auto mode refused the SSH deploy → script `~/Desktop/zamunda-deploy-271.sh` (backup first) waits for the owner. T-405 closes after the live checks.
