# Build Plan — Image → 3D Asset Tool

Workflow using the installed mattpocock skills (`.claude/skills/`), sequenced for a production-grade,
layered, test-driven build. No issue tracker configured — everything defaults to the local-markdown
tracker (`.scratch/`).

## Phase A — Discovery (`wayfinder` orchestrates)

The project is too big for one session, so it starts as a **wayfinder** map.

1. Invoke `wayfinder` with the loose idea: "production-grade image-to-3D asset tool."
2. Wayfinder runs `grill-with-docs` (= `grilling` + `domain-modeling`) to **name the destination**
   — what "done" means for this map (e.g. "a spec for the MVP pipeline"). Builds `CONTEXT.md`
   glossary as a side effect (terms like Asset, Reconstruction, Mesh, Pipeline Stage).
3. Wayfinder grills again, breadth-first, to **map the frontier** — surfaces open decisions as
   tickets typed `research` / `prototype` / `grilling` / `task`.
4. Work the map **one ticket per session** (never more):
   - **Research ticket** (e.g. "TripoSR vs Zero123 vs paid APIs like Meshy/Tripo3D") → fires
     `research`: background agent, primary sources only, cited findings saved as markdown.
   - **Prototype ticket** (e.g. "does the chosen model produce usable mesh quality/latency") →
     fires `prototype`: throwaway code, one command to run, no persistence, captured to a scratch
     branch when done.
   - **Grilling ticket** (architecture/UX decisions) → default case, uses `domain-modeling` +
     `grilling`.
   - **Task ticket** (get API keys, GPU access, provision storage) → manual checklist, HITL or AFK.
5. Map is done when no tickets remain — the route to the destination is clear.

## Phase B — Spec + layered architecture

6. `to-spec` — synthesizes everything decided in Phase A into a formal spec (Problem Statement,
   Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope). No
   interview — pure synthesis of the conversation/map so far.
7. `codebase-design` — apply while drafting the spec's Implementation Decisions: define each
   pipeline layer as a **deep module** (small interface, large implementation hidden behind it):
   - Upload / Ingestion
   - Preprocessing (image cleanup, background removal, normalization)
   - Reconstruction / Inference (the actual image → 3D model step)
   - Postprocessing (mesh cleanup, texture bake, optimization)
   - Export / Storage (format conversion — GLTF/OBJ/USDZ — and persistence)
   One seam per layer. Rule of thumb: one adapter = hypothetical seam, don't build it yet;
   two adapters = it's real, build the seam.
8. `to-tickets` — breaks the spec into **tracer-bullet** tickets: each one is a thin vertical
   slice through *every* layer, not a horizontal slice of one layer.
   - Good: "upload one image → get back a crude placeholder mesh, end-to-end."
   - Bad: "build the upload layer" (horizontal, not demoable alone).
   Each ticket declares its blocking edges. Published as local markdown files under
   `.scratch/<feature-slug>/issues/`, numbered in dependency order.

## Phase C — Build, ticket by ticket

9. `implement` on the frontier ticket (blockers all closed):
   - Drives `tdd` — red before green, one seam/test/implementation per cycle, seams agreed
     with the user up front, never horizontal (all-tests-then-all-code).
   - Runs typechecking and tests regularly, full suite once at the end.
   - Then runs `code-review` — Standards axis + Spec axis, two parallel sub-agents, reported
     side by side.
   - Commits the work.
   - Repeat for the next frontier ticket, clearing context between tickets.

## Standing by (invoke as needed, not sequential)

- `diagnosing-bugs` — for any hard bug or performance regression. Build a tight, red-capable,
  deterministic feedback loop **first** — never jump to a hypothesis before that loop exists.
  Then: reproduce + minimise → rank 3–5 falsifiable hypotheses → instrument → fix + regression
  test → cleanup + post-mortem.
- `improve-codebase-architecture` — run periodically (e.g. after each phase lands). Scans for
  shallow modules, produces a visual HTML report of deepening opportunities, then `grilling`
  through whichever candidate is picked.

## Next action

Describe the tool idea in full and say "start wayfinder" to kick off step 1 (naming the
destination).
