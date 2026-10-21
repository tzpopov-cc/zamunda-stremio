# Bugs

Found in the log review of 20.10.2026 (docker logs 15.10 15:13 – 20.10 15:13 UTC, 12 937 searches, plus the
500 in-app log lines). Each bug names the task that owns it.

## Open

- **B-037 — an anime whose archive name joins its hyphenated words is called missing** (deferred — the fix alone
  offers a wrong file). Found by the T-201 bug hunt pass 4: Mushi-Shi S1E11 → „Няма го в архива"; the archive has
  "[YSAnime] Mushishi [BDRip H.264 1920x1080 AAC]" (14,17 GB) and "[RyuKo]Mushishi" (8,10 GB). Kitsu's romaji name
  is "Mushishi", one word, and `animeAltNames` skips one-word names ("KuroBas" would match anything). Tried on a
  scratch copy (one-word names allowed when they are the show's own words joined): S1E1 gets both packs, S2E3
  "Mushishi S2", but S1E11 gets "[GFotaku&EasternSpirit] Mushishi 2 Special (11-12)" — season 2's specials read as
  season 1's episodes 11–12 (the "2" after the name is not read as a season). Needs that read first.
- **B-025 — a later series of the same name is offered for the earlier one** (no owner yet — needs a check
  first). Found by the T-208 check: "Avatar.The.Last.Airbender.2024.S01" (the live-action series) is offered for
  the animated Avatar: The Last Airbender (2005–2008) S1E1. The year in the name is outside the show's run, but a
  revival filed under the old show (Twin Peaks S03 2017 under 1990–1991) would read the same way, so it is not
  folded into T-208. Same kind: "Death Note - 01 (2015 Drama Series)" (the live-action drama) offered for the
  2006 anime S1E1 (T-208 replay).
- **B-008 — a pack whose file list is unknown plays the biggest file** (deferred — no source). itorrents
  answers 403 for a torrent it does not have (a made-up hash → 403) — 267 times in 5 days — and timed out
  176 times. Without the list a P2P pack has no `fileIdx`. No other free source of `.torrent` files.

## Closed
- **B-038 — a release without a year is taken for a recent film of the same name** (found by the T-201 bug hunt
  pass 5, live searches 20.10 ~23:15 – 23:53 UTC, closed by T-220): Don't Move (2026, a spider horror film) → „Без
  връзка в архива", from "Don't.Move.DVDRip.XviD.6CH.AC3-FaN" (no year, no description, no link) — by its age the
  2004 film, whose releases state 2004 next to the 2024 Netflix film's. With a link it would have been offered as the
  2026 film. Same shape in the T-219 replay: "East Of Eden - E01-04" (the 2008 drama) for the 2026 series. Over the
  200 films of the replay and both passes × every cached row: 2 films take a yearless row while every namesake states
  another year — Don't Move (2026) and Highlander (2013-dated; a bare "Highlander" with a link, the 1986/1991/1994
  namesakes stating theirs).
- **B-036 — a season the archive has only without a link is called missing** (found by the T-201 bug hunt pass 4,
  closed by T-219): The Simpsons S9 — the only season-9 releases are "The Simpsons season 1-18 complete" and "Simpsons
  Seasons 00-19", both without an infohash; the viewer is told „Няма сезон 9" (the season is not in the archive)
  instead of „Без връзка в архива" (B-004's row). The same for Grey's Anatomy S04 ("Greys.Anatomy.S04.DVDRip", no
  infohash) until B-034 surfaced the playable pack.
- **B-034 — an older season of a long show is called missing when its only pack is a multi-season one** (found by the T-201
  bug hunt pass 4, live searches 20.10 21:01 – ~23:15 UTC, closed by T-218): the season is looked
  for as "<name>" (the newest 50 rows) and "<name> S04"; a pack named "S01-16" or "Season 01-15" is in neither.
  Grey's Anatomy S4E1 → „Няма сезон 4" while "Greys.Anatomy.S01-16.WEBRip.x264-ION10" (147,46 GB) answers "Grey's
  Anatomy Season 4"; NCIS S2E3 → „Няма сезон 2" while "NCIS - Season 01-15" (110,48 GB) answers "NCIS Season 2";
  Joey S1E23/E24 → „Не е намерен" while "Joey Season 1 [BGAudio.TVRip]-Planet" (3,93 GB, BG audio) answers "Joey
  Season 1".
- **B-035 — a season list "Season 1,2,3" is read as season 1 only** (found by the T-201 bug hunt pass 4, closed by T-217):
  "NCIS Season 1,2,3 DVDRip-TVRip BGAudio DivX-bbb" is on the first page of "NCIS", but `declaredSeasons` reads
  "Season 1" and stops at the comma, so the BG-audio pack is not offered for seasons 2 and 3. 1 of 13 682 names in
  the replay cache lists seasons this way ("S01+S02+Movie" is read right already).
- **B-033 — a config with a broken "%" sequence answers with a stack trace or not at all** (found by the T-201 bug hunt pass 3, closed by T-216):
  the config segment is decoded twice (Express, then the route); one that decodes to a bad
  "%" sequence ("…tbtoken%3Dab%25zz…") makes `decodeURIComponent` throw — the manifest answers 500 with an HTML stack
  trace showing the server's file paths, the TorBox play route never answers (an unhandled rejection), the stream
  route returns []. The config page never builds such a link; a hand-edited or damaged one does.
- **B-032 — an install link from v2.0.0 loses its "debrid + P2P" choice** (found by the T-201 bug hunt pass 3, closed by T-215): links built 15–17.04.2026 say `rdmode=all`; the server reads `config.debridmode || config.rdmode`, but
  `debridmode` always holds the default 'guaranteed', so such a viewer gets no P2P fallback. Whether any such link
  still reaches the server cannot be seen in the logs (they show the parsed mode, not the link).

- **B-030 — a film whose Cinemeta year is two off is called missing** (found by the T-201 bug hunt pass 3, closed by T-214): The Witch: Part 1 - The Subversion — Cinemeta says 2020 (a later release date), the film and its only
  release are 2018 ("The.Witch.Part.1.The.Subversion.2018.1080p.BluRay"); the year check allows ±1, so the viewer is
  told „Няма го в архива".

- **B-031 — a release without a year is offered for a film its description dates otherwise** (found by the T-201 bug hunt pass 3, closed by
  T-213): "Aladdin" (Анимации/Аниме, 39,88 GB; description "Aladdin (TV Series 1994–1995) /
  Аладин 1994-1995") is offered for Aladdin (2019). A release name without a year passes on the exact name alone;
  the archive's description line, which often carries the year, is not read.

- **B-029 — a show name's words in another order pass the show check** (found by the T-211 replay, closed by T-212):
  "[RyuKo-JB] Eden of the East 01-11 + Movies" (an anime) is offered for East of Eden (2026) S1E1. When the name's
  words do not stand together, the show check falls back to the old rule (the furthest first word) and accepts
  "eden … east" for "east … eden".

- **B-028 — an episode range that names no season is offered for every season** (found by the T-210 check, closed by
  T-211). "[SFS] Hunter x Hunter - 01 - 21 (Hunter Exam Arc)" (season-1 episodes) was offered for S2E3 and S3E5,
  and "Alice in Borderland S01E01-02" for S2E1: the season-less range patterns read "01 - 21" and the "01-02" inside
  "S01E01-02" for any season. Cinemeta restarts each season at 1, so a range without a season is season 1's.

- **B-027 — a title beyond the archive's first 50 rows is called missing** (found by the T-201 bug hunt pass 2, closed by T-210): the archive answers at most 50 rows, newest first, and matches every word as a substring, so
  "Hunter X Hunter" is a search for "hunter" + "x" (in every "x264") — 796 rows, the 2011 series ("[SFS] Hunter x
  Hunter - 01 - 148 [HD]", BG subs, its films and OVAs) at rows 488–711. The viewer is told „Няма го в архива".
  Of the 92 titles answered as missing in the replay, 19 have a full first page; this one is the only real miss.
  `offset` pages the answer (the Oracle proxy passes it on).

- **B-026 — a show name with a repeated word rejects its own releases** (found by the T-201 bug hunt pass 2, closed by T-209). Found with B-027:
  "[SFS] Hunter x Hunter - 01 - 148" fails the show check for Hunter X Hunter — the name's end is looked up from the
  first "hunter", so " x hunter" reads as another show's words after the name.

- **B-024 — a film of the same name is offered for a series** (found by the T-201 bug hunt pass 2, closed by T-208). Found by the T-201 bug hunt pass 2:
  Carrie (2026) S1E1 → 21 rows of the 1976 and 2013 films ("Carrie.2013.1080p.BluRay", "Carrie.BDRip.XviD-WAR");
  Below (2026) S1E1 → "Below.2002"; Tom & Jerry (1940–1967) S1E1 → "Tom.and.Jerry.2021.MULTi.COMPLETE.BLURAY".
  The first two come from the "bare show name" fallback; the third reads "COMPLETE" (a full Blu-ray disc) as a
  complete-series pack.

- **B-023 — a P2P pack whose file list lacks the episode is still offered** (found by the T-203 replay, closed by T-207). Found by the T-203
  replay: "Stranger Things S05 Vol.2 2025" — its file list (known, from itorrents) holds chapters 5–7 — is offered
  for S5E1 with no file index, so the player opens whatever it picks. TorBox and Real-Debrid already give no link
  for a pack that lacks the file (v2.6.7); P2P keeps the row.
- **B-022 — a season pack without a quality word is labelled by its total size** (found by the T-201 bug hunt, closed by T-206). 156 of 4 534
  series/animation rows in the replay cache: "SOUTHPARK Season 01-27" (105,94 GB) shows as 4K and sorts above real
  1080p episodes, "Chicago PD s01" (7,08 GB, XviD by the archive text) as 1080p, "Sleepy Hollow s03" (XviD) as
  1080p. A quality filter keeps or drops them by that guess. The size rule was written for single files.

- **B-021 — "cached only" with nothing cached returns an empty list** (found by the T-201 bug hunt, closed by T-205). Found by the T-201 bug hunt
  (RD stub) and seen on live 20.10 18:49–18:50: a Real-Debrid viewer with „Само кеширани" asked for Lucifer S5E6
  twice in 9 s, S5E4 and The Matrix Resurrections — 4 × „0 playable", 4 empty lists, no row saying why (logged as
  RD, so the dashboard does not count them as misses). Same for TorBox. The RD stub "infringing_file" (one torrent
  refused, not the account) ends the same way.
- **B-020 — a dead end with a known reason still returns an empty list** (found by the T-201 bug hunt, closed by T-204). In the bug-hunt pass
  (361 ids on v2.6.8) 25 lists were empty: (a) a game or a music album passes as the title before the category
  filter drops it — "Haunted Hotel 2 - Believe the Lies" (game) for Haunted Hotel S2E3 instead of „Няма сезон
  2" (the archive has S01), "36 Crazyfists - Lanterns" (album) for Lanterns, a Linux game for Digger (2026);
  (b) "none carry the show name" (Hunter X Hunter — not in the archive under any spelling, Last Seen, Slime S4);
  (c) show releases but no season/episode to name (Detective Hole ← the film "Detective.Dee…Hole.2023",
  Formula 1 S77); (d) the T-105 "all under a longer name" path.
- **B-019 — underscores in a release name hide its season** (found by the T-201 bug hunt, closed by T-203). 3,9 % of archive titles use "_"
  for spaces (300 of 7 732 in the replay cache; 104 with a season marker: "Slow_Horses_S05E05",
  "The_Wire_-_Season_1_-_1_2002_UHD", "Mayor_of_Kingstown_S04E07"). "_" is a word character, so "Season_2" and
  "_S02_" are not read: "Blue_Lights_-_Season_2_-_2_2024_UHD" is not offered for Blue Lights S2E3 (the viewer
  gets nothing), and "Some_Show_S02_Complete_1080p" counts as a match for S1E1 — a wrong stream.
- **B-018 — a name with a dotted abbreviation misses the releases written without dots** (found by the T-201 bug hunt, closed by T-202). Found
  by the bug hunt in the live dashboard log (20.10 18:40): "Chicago P.D." S1E3 → „Няма сезон 1, в архива има S03",
  while the archive holds 32 rows for "Chicago PD S01" ("Chicago.PD.S01.720p.HDTV…", "Chicago PD s01"). The name
  becomes the words "chicago p d"; "Chicago.PD" is "chicago pd". In the 5-day log: Chicago P.D. 18 searches, every
  one with only 1 of 61–93 results passing as the show; also S.W.A.T., The O.C., R.J. Decker, M.I.A.
- **B-011 — roman numerals reached the show-name head** (found by the T-107 review, closed by T-107).
  Folded to a bare number, "III" ended the head like an episode number: "Lupin.III.Part.6.S01E05" passed for
  Lupin (2021), "Overlord IV - 05" for Overlord S1E5, "Final.Fantasy.VII.Remake" for Final Fantasy. Introduced by
  T-104, never deployed.
- **B-012 — an RD refusal mid-list was silent and cached** (T-107 review, closed by T-107). After ≥1 link
  resolved, an account-level refusal skipped the rest without a notice and the short list was kept 1 h.
- **B-013 — the longer-name path could still serve another show** (T-107 review, closed by T-107): two
  qualities of "Chief.of.War.S01E09" would pass for War. Now the show must also be in the results under its own
  name.
- **B-014 — a list built on Cinemeta's fallback name was cached 1 h** (T-107 review, closed by T-107).
- **B-015 — the TorBox auth notice name was Bulgarian with lang=en** (T-102 note, closed by T-107).
- **B-016 — `RD_API` could be redirected by an env variable** (T-107 review, closed by T-107): unused by the
  replay, and an env could send the RD token to another host.
- **B-017 — "Original.Title.S01E05.English.Title" is rejected** (T-107 review, ACCEPTED): the price of rejecting
  episode-title strays; an honest miss, anime season 1 rescued by romaji names; no right row lost in the replay.
- **B-007 — a slow Cinemeta costs the viewer 5 s** (closed by T-106). 220 timeouts in 5 days (1,7 % of
  searches), clustered 17–20 UTC (the Bulgarian evening); the fallback host answers, but only after the 5 s
  timeout of the first. Measured 20.10: the main host answers in 12 ms (median), the fallback names 7 % of titles differently
  and its name was kept for a day.
- **B-006 — a missing season loses its explanation when a stray release names another season** (closed by
  T-105). "Sheriff Country" S2E2: the results hold "Fire Country S02E06 Alert the Sheriff…", which passes the
  show-name check, adds season 2 and episode 2 to the "available" sets, and the viewer gets an empty list
  instead of „Сезон 2 го няма". 3 of 24 episode misses in the in-app log sample (≈ 1 in 8). Same root served wrong episodes: "War" (2025) got 32 releases of other shows by the group "-WAR",
  "Brothers" (2026) got "Brews.Brothers" (2020), Sheriff Country S2E6 got the Fire Country episode.
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
