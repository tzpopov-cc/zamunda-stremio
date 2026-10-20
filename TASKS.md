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
- [ ] **T-106** Cinemeta: a shorter wait on the main host before the fallback (B-007); a name that came from the
      fallback host is not kept for a day (it can differ: tt0189154 "Toplo" on v3, "The Central Warmth" on
      cinemeta-live — the archive has it only as Toplo).
- [ ] **T-107** End of stage 1: fresh-context review → fixes → full replay (0 lost) → v2.6.8 (version strings +
      changelog + RUNBOOK) → deploy with backup → live checks → push.

## Stage 2 — bug hunt

- [ ] **T-201** Process pass with real data (read-only on live): P2P film, P2P series and packs, RD, TorBox
      (list and play), config page and install link, dashboard and landing numbers. New findings → `BUGS.md`
      → tasks T-202… A full pass with no new finding ends the loop with a report.

## New tasks

(none)
