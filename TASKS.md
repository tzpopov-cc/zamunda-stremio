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

- [ ] **T-201** Process pass with real data (read-only on live): P2P film, P2P series and packs, RD, TorBox
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
- [ ] **T-215** A v2.0.0 install link's `rdmode=all` is read as "debrid + P2P" again (B-032).
- [ ] **T-216** A config with a broken "%" sequence gets a plain answer — no stack trace, no hung request (B-033).
