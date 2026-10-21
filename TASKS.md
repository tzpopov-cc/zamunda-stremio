# Tasks

Order of work for the bug loop (`plans/LOOP.md`). One task = one plan in `plans/` = one commit.

## Stage 1 — fixes from the log review of 20.10.2026 (→ v2.6.8)

- [x] **T-101** Replay harness: info rows visible in `diff.js` (B-009); add the targeted ids from the 20.10
      review (Extraction II, The Karate Kid Part II/III, Sheriff Country S2, The Unbearable Lightness of
      Being, the top zero-result titles) to `ids.txt`.
- [x] **T-102** Real-Debrid: record why RD refused (error code, never the token), stop checking the rest of a
      list after an account-level refusal, and show a notice row + P2P fallback like TorBox (B-001, B-002).
      Tested against a local RD stub.
- [x] **T-103** A title with nothing usable in the archive gets an info row instead of an empty list: "not in
      the archive" (B-003), and "in the archive, but without a download link" when every row lacks a hash
      (B-004). Logged as GAP so the dashboard counts it as told.
- [x] **T-104** Roman ↔ Arabic sequel numbers in search queries and in film/series matching ("II" = "2",
      "Part II" = "2") without matching unrelated titles (B-005).
- [x] **T-105** The "season/episode not in the archive" explanation counts only the show's own releases
      (B-006).
- [x] **T-106** Cinemeta: a shorter wait on the main host before the fallback (B-007); a name that came from the
      fallback host is not kept for a day (it can differ: tt0189154 "Toplo" on v3, "The Central Warmth" on
      cinemeta-live — the archive has it only as Toplo).
- [x] **T-107** End of stage 1: fresh-context review → fixes → full replay (0 lost) → v2.6.8 (version strings +
      changelog + RUNBOOK) → deploy with backup → live checks → push.

## Stage 2 — bug hunt

- [x] **T-201** Process pass with real data (read-only on live): P2P film, P2P series and packs, RD, TorBox
      (list and play), config page and install link, dashboard and landing numbers. New findings → `BUGS.md`
      → tasks T-202… A full pass with no new finding ends the loop with a report.

## New tasks

- [x] **T-202** A name with a dotted abbreviation ("Chicago P.D.", "S.W.A.T.", "The O.C.") is also searched and
      matched in its joined form ("Chicago PD") (B-018).
- [x] **T-203** A release name with underscores is read like one with spaces — season packs found, no wrong
      season (B-019).
- [x] **T-204** Every dead end with a known reason gets a row: non-video rows leave before matching; "none carry
      the show name", "no season/episode to name" and "all under a longer name" get an honest row (B-020).
- [x] **T-205** „Само кеширани" with nothing cached (RD or TorBox) gets a row saying so and how to see the P2P
      releases, instead of an empty list (B-021).
- [x] **T-206** A pack whose name carries no quality is not labelled 4K/1080p by its total size (B-022).
- [x] **T-207** A P2P pack whose known file list lacks the episode is not offered for it (B-023).
- [x] **T-208** A film of the same name is not offered for a series: a bare-named release or a "complete" pack that
      looks like a film (filed as a film or Blu-ray disc, or years outside the show's run) is left out (B-024).
- [x] **T-209** A show name with a repeated word ("Hunter x Hunter") passes the show check for its own releases (B-026).
- [x] **T-210** A full first page of a name search with nothing of the title in it is read further (next pages,
      capped and cached) before the title is called missing (B-027).
- [x] **T-211** An episode range that names no season ("01 - 21", "1-293") counts for season 1 only, like the
      absolute episode numbers (B-028). Before T-210, which reaches such packs for later seasons.
- [x] **T-212** A show name's words in another order ("Eden of the East" for East of Eden) do not pass the show
      check (B-029).
- [x] **T-213** A film release without a year is checked against the years in its archive description: "Aladdin"
      described as the 1994–1995 TV series is not offered for Aladdin (2019) (B-031).
- [x] **T-214** A film whose long name matches a release exactly allows two years of difference: Cinemeta's 2020 for
      The Witch: Part 1 - The Subversion, released 2018 (B-030).
- [x] **T-215** A v2.0.0 install link's `rdmode=all` is read as "debrid + P2P" again (B-032).
- [x] **T-216** A config with a broken "%" sequence gets a plain answer — no stack trace, no hung request (B-033).
- [x] **T-217** A season list ("Season 1,2,3", "Seasons 1 & 2") is a pack of every season in it (B-035).
- [x] **T-218** A show in the archive with nothing playable for the asked episode is searched once more as "<name>
      Season N" before the season or episode is called missing (B-034).
- [x] **T-219** A season or episode the archive has only without an infohash gets „Без връзка в архива", not „Няма
      сезон N" (B-036).
- [x] **T-220** A film release without a year is not taken for the film when releases of the same name state years
      and none is the film's (B-038).
- [x] **T-221** End of stage 2: fresh-context review → fixes → full replay vs v2.6.8 (0 lost) → v2.6.9 (version
      strings + changelog + RUNBOOK) → deploy with backup → live checks → push.

## Stage 3 — polish (owner, 21.10.2026: „lets polish the addon and make it proper")

- [x] **T-301** Polish pass (read-only on live): the live log since v2.6.9, every stream and notice row as the viewer
      sees it (bg and en), the ranking of the first rows, the config page on a phone and a computer, the manifest,
      the README; measure B-047. Findings → `BUGS.md` → tasks T-302…
- [x] **T-302** The row's info line tells the truth and reads one way: source "z" is Zamunda, "arenabg" ArenaBG
      (B-048); a size is always "number unit" (B-049).
- [x] **T-303** An AI-enhanced or frame-interpolated release ranks as an upscale and says so on its row (B-050).
- [x] **T-304** The next episode stays on the same pack or release (`bingeGroup`), and a row whose file is known
      tells subtitle addons its file name and size (B-051).
- [x] **T-305** Notice rows: plain words for the setting, right plurals, one word for the key, a name that says what
      happened, one emoji per kind (B-052).
- [x] **T-306** The config page: the broken changelog line, one numbers box, Bulgarian words, the key wording,
      TorBox timing, readable grey, a line that the archive gets no new torrents (B-053).
- [x] **T-307** Manifest description per mode in full words, a real background picture; README true and in
      Bulgarian (B-054).
- [x] **T-308** A dead end asks Cinemeta's other host and searches again when its name or year differs (B-047,
      B-055).
- [x] **T-309** A show of the same name from other years is not offered: a release's own years against the asked
      season's air years (B-025).
- [ ] **T-310** The dead end reads seasons only from real season marks, and a show whose name only films carry is
      „Няма го в архива" (B-056).
