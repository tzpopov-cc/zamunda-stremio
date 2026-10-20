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
