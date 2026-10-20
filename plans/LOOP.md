# The bug loop — state

The loop's memory. After a context compaction trust this file, `plans/T-NNN.md`, `TASKS.md`, `BUGS.md`
and `git log` — not the recollection.

## The order (owner, 20.10.2026)

After the log review of 20.10.2026 (docker logs 15–20.10, 12 937 searches — findings in `BUGS.md`):
„fix them all brother - i want you to apply the loop system we are using to fix bugs and improve the app."

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
