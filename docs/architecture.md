# Architecture and upstream map

## Distribution target

The primary distribution artifact is a single self-contained HTML file built from a modular React + TypeScript + Vite source tree. Native wrappers such as Tauri may be added later without changing the search/scoring/profile layers.

## Product goal

The application is an **optimal Bandori team-search calculator**, not merely a fixed-team score calculator.

Given a user profile plus song / event / live conditions, it must search legal five-card teams and return the best teams under the selected objective (score or supported event-point modes). Team search should preserve HHWX's exact-search architecture: normalize cards and area items, construct safe upper bounds, prune dominated candidates/configurations, run exact DFS over surviving candidates, and hydrate detailed score results only for competitive teams.

The true in-game first-five skill shuffle is position-dependent and non-uniform. Therefore exact team evaluation must optimize not only the selected five cards and leader but also their initial team-slot assignment. Search bounds must remain conservative after this probability model is introduced.

## Safety boundary

The application accepts user-supplied Bestdori-compatible JSON files, including the optional HHWX `hhwx-profile-v1` extension. It does not query players by UID and does not implement HHWX user-fetcher, game sessions, account synchronization, Bilibili sessions, or unofficial game-account access.

Bestdori synchronization is limited to public master/chart data required for gameplay calculations and optional presentation resources. Player data remains local and user-supplied.

## HHWX-derived baseline

Upstream: `BluewaterAlnilamII/hhwx` (GNU AGPL v3.0 only).

### Core modules to retain

| Local file | HHWX source / role | Planned changes |
| --- | --- | --- |
| `src/lib/bestdori-profile-codec.ts` | `src/lib/bestdori-profile-codec.ts` | Keep format compatibility; avoid game-network concerns. |
| `src/lib/bandori-server.ts` | `src/lib/bandori-server.ts` | Keep server-number conventions. |
| `src/lib/bandori/team-builder/core/calculator.ts` | same upstream path | Keep card power and skill resolution semantics unless a verified game rule requires a change. |
| `src/lib/bandori/team-builder/core/chart.ts` | same upstream path | Keep note/window normalization unless a verified game rule requires a change. |
| `src/lib/bandori/team-builder/core/scoring.ts` | same upstream path | Main scoring change: replace uniform 5! first-five ordering with the real weighted shuffle while keeping note-level scoring and encore semantics. |
| `src/lib/bandori/team-builder/core/cards.ts` | same upstream path | Retain candidate/card preprocessing, area-item and support-band preparation. Update per-card skill-rate proxies so search bounds remain safe under position-dependent shuffle. |
| `src/lib/bandori/team-builder/core/character-bounds.ts` | same upstream path | Retain exact-search upper bounds and pruning. Adjust skill contribution bounds conservatively for the new shuffle/slot model. |
| `src/lib/bandori/team-builder/core/team-context.ts` | same upstream path | Retain context handling used by conditional skills. |
| `src/lib/bandori/team-builder/core/team-evaluation.ts` | same upstream path | Retain exact five-card hydration/evaluation. Add leader + slot-layout optimization under the real shuffle distribution. |
| `src/lib/bandori/team-builder/core/constraints.ts` | same upstream path | Retain team-search constraints. |
| `src/lib/bandori/team-builder/core/card-identity.ts` | same upstream path | Retain stable card-instance identity helpers. |
| `src/lib/bandori/team-builder/core/events.ts` | same upstream path | Retain live/event target mapping. |
| `src/lib/bandori/team-builder/core/types.ts` | same upstream path | Keep search contracts and add slot/shuffle probability results where needed. |
| `src/lib/bandori/team-builder/core/constants.ts` | same upstream path | Change only verified game-rule constants. |
| `src/lib/bandori/team-builder/core/utils.ts` | same upstream path | Keep shared helpers. |

### Single-song search modules to retain

The complete HHWX `src/lib/bandori/team-builder/single/` exact-search layer is in scope:

- `objective.ts`
- `results.ts`
- `scopes.ts`
- `search-execution.ts`
- `search-prep.ts`
- `search.ts`
- `seeds.ts`

These modules provide objective adapters, seed teams, context scopes, candidate/configuration preparation, branch-and-bound / DFS execution, result ranking, timeout/bounded-search behavior, and top-level orchestration. They should be preserved rather than replaced with brute-force enumeration.

## Real skill-order model

The game does not choose uniformly from all 5! permutations for the first five skill activations. Starting from the team's original slot order (with the leader in the center slot), the game repeatedly removes the current item and reinserts it into `Random.Range(0, list.Count)` after removal. Because the upper bound is exclusive, reinsertion never uses the final index.

For five cards this produces 4^5 = 1024 equally likely random-choice paths which collapse to 96 reachable final permutations with unequal weights. Exact expected score must therefore use weighted permutations (or an equivalent probability matrix), not an `x/120` uniform model.

For team search, initial card slot matters. A selected five-card set must therefore be evaluated over legal leader/slot layouts. This does **not** require multiplying the entire DFS by 1024: expected trigger contribution can be evaluated from precomputed position-to-trigger probabilities, and the four non-leader cards can be assigned to their four slots with a tiny exact assignment step. Detailed permutation distributions can be calculated only for hydrated top results.

## Bestdori data synchronization

The project should maintain current public gameplay data independently of HHWX production infrastructure. Build/update tooling should synchronize the public Bestdori datasets needed by the calculator, including cards, skills, characters/bands, area items, songs, charts and events. Optional artwork (card images, event banners, jackets) is presentation-only and must not be required for calculation.

The portable HTML may embed a current compact master-data snapshot and should also support importing a newer compatible data pack. Player profiles are never fetched by UID.

## Intentionally not imported

- HHWX private user-fetcher and all account-sync code.
- Supabase/auth/account binding infrastructure.
- HHWX private ingestion/mirroring services.
- Next.js routing/server infrastructure.
- Unrelated HHWX site features outside the Bandori calculator/search dependency closure.

## UI direction

Port the useful interaction patterns and visual component shapes from HHWX rather than the Next.js application shell. Keep card tiles, compact data panels, filters, team/result presentation, spacing and responsive behavior, but use a distinct theme palette and project identity. The UI must remain functional with images disabled or unavailable.
