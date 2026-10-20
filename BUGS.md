# Bugs

Found in the log review of 20.10.2026 (docker logs 15.10 15:13 – 20.10 15:13 UTC, 12 937 searches, plus the
500 in-app log lines). Each bug names the task that owns it.

## Open

- **B-006 — a missing season loses its explanation when a stray release names another season** (owner:
  T-105). "Sheriff Country" S2E2: the results hold "Fire Country S02E06 Alert the Sheriff…", which passes the
  show-name check, adds season 2 and episode 2 to the "available" sets, and the viewer gets an empty list
  instead of „Сезон 2 го няма". 3 of 24 episode misses in the in-app log sample (≈ 1 in 8).
- **B-007 — a slow Cinemeta costs the viewer 5 s** (owner: T-106). 220 timeouts in 5 days (1,7 % of
  searches), clustered 17–20 UTC (the Bulgarian evening); the fallback host answers, but only after the 5 s
  timeout of the first.
- **B-008 — a pack whose file list is unknown plays the biggest file** (deferred — no source). itorrents
  answers 403 for a torrent it does not have (a made-up hash → 403) — 267 times in 5 days — and timed out
  176 times. Without the list a P2P pack has no `fileIdx`. No other free source of `.torrent` files.

## Closed

- **B-005 — Roman and Arabic numbers are different words** (closed by T-104). `matchesMovie` rejects
  "Extraction.2.2023…" for "Extraction II" (2023), "Rocky.2.1979" for "Rocky II", "Toy.Story.II.1999" for
  "Toy Story 2", "Kung.Fu.Panda.IV" for "Kung Fu Panda 4", "The.Godfather.Part.2" for "The Godfather Part
  II". The archive returns 0 rows for "The Karate Kid Part II" but has "The Karate Kid 2 (1986) [BG Audio]"
  (found by "Karate Kid 2" and "Karate Kid 1986").
- **B-004 — archive rows without an infohash are dropped silently** (closed by T-103). 7,9 % of all archive
  rows seen (11 303 / 142 784, all source `z`, mostly old SD/DVD films) carry `magnet:?xt=urn:btih:&dn=…`.
  `extractInfohash` fails, the row is dropped, and the title reads "0 results" — e.g. "The Unbearable
  Lightness of Being" (2 such releases). ~4 % of the zero-result searches. The archive API has no detail
  endpoint, so the hash cannot be recovered.
- **B-003 — a title the archive does not have returns an empty list** (closed by T-103). 25 % of all searches
  (3 215 / 12 937; 670 titles) end in `[MISS] … 0 results` and the viewer gets nothing — not even the info
  row a missing season or film gets (GAP). Mostly 2025–2026 releases (Spider-Man: Brand New Day 385
  searches in 5 days, Crystal Lake, Verity, Project Hail Mary): the archive receives no new torrents.
- **B-010 — the stream cache ignores the debrid mode** (closed by T-102). `configFingerprint`
  keys on debrid, token, content, quality, sort, sources, size limit and language — not `debridmode`. A list
  built for "all" (RD + P2P rows) is served to the same token's "guaranteed" install for up to an hour, and
  the other way round. Seen in the T-102 stub run: the guaranteed request came back with the cached P2P rows.
- **B-002 — an RD account problem is never shown to the viewer** (closed by T-102). TorBox has a notice row
  for an invalid token (`_authError`); RD has none. In "guaranteed" mode 136 of 163 RD lists came back
  EMPTY; in "all" mode the viewer silently gets P2P only.
- **B-001 — Real-Debrid refusals are swallowed** (closed by T-102). `checkAndResolve` catches every error and
  returns `null`, so a refused request looks like "not cached" and nothing records why. About 36 % of RD
  lists with ≥ 4 torrents fail on the FIRST call for every torrent (< 45 ms each; the RD API answers in
  ~75 ms cold, ~25 ms on a kept connection — a real check is add + info + delete). Example 17.10 22:xx:
  "Interstellar" — 23 torrents, 0 RD in 0,4 s; a TorBox viewer got 8 cached from the same 23 on 18.10.
  RD > 0 in 20 % of RD lists vs TorBox > 0 in 48 % of TorBox lists.
- **B-009 — the replay hides info-row changes** (closed by T-101). `tools/replay/diff.js` counts as info rows
  only streams with neither `infoHash` nor `url`, but every notice row has a `url` (`notice-info.mp4`)
  since v2.1.6 — so a new or lost info row never shows in the diff.
