# Architecture and upstream map

## Distribution target

The primary distribution artifact is a single self-contained HTML file built from a modular React + TypeScript + Vite source tree. Native wrappers such as Tauri may be added later without changing the scoring/profile layers.

## Safety boundary

The application accepts user-supplied Bestdori-compatible JSON files, including the optional HHWX `hhwx-profile-v1` extension. It does not query players by UID and does not implement HHWX user-fetcher, game sessions, account synchronization, Bilibili sessions, or unofficial game-account access.

## HHWX-derived baseline

Upstream: `BluewaterAlnilamII/hhwx` (GNU AGPL v3.0 only).

| Local file | HHWX source / role | Planned changes |
| --- | --- | --- |
| `src/lib/bestdori-profile-codec.ts` | `src/lib/bestdori-profile-codec.ts` | Keep format compatibility; avoid game-network concerns. |
| `src/lib/bandori-server.ts` | `src/lib/bandori-server.ts` | Keep server-number conventions. |
| `src/lib/bandori/team-builder/core/calculator.ts` | same upstream path | Keep card power and skill resolution semantics unless a verified game rule requires a change. |
| `src/lib/bandori/team-builder/core/chart.ts` | same upstream path | Generalize skill trigger representation only if the new scoring model needs more than the current five + encore windows. |
| `src/lib/bandori/team-builder/core/scoring.ts` | same upstream path | Main modification point: explicit activation timeline, encore/return rules, probabilistic skills and score distributions. |
| `src/lib/bandori/team-builder/core/constants.ts` | same upstream path | Change only verified game-rule constants. |
| `src/lib/bandori/team-builder/core/events.ts` | same upstream path | Retained only for fever/live-type behavior used by scoring. |
| `src/lib/bandori/team-builder/core/types.ts` | same upstream path | Add portable score-scenario/result contracts; progressively remove search-only surface when safe. |
| `src/lib/profile-import.ts` | portable adapter around HHWX/Bestdori formats | Normalize Bestdori and HHWX-exported files into local calculator inputs. |

## Intentionally not imported

- HHWX private user-fetcher and all account-sync code.
- Supabase/auth/account binding infrastructure.
- HHWX private ingestion/mirroring services.
- Large-scale team enumeration/pruning code unless the portable calculator later needs automatic team search.
- Next.js routing/server infrastructure.

## UI direction

Port the useful interaction patterns and visual component shapes from HHWX rather than the Next.js application shell. Keep card tiles, compact data panels, spacing and score/result presentation concepts, but use a distinct theme palette and project identity. The UI must remain functional with images disabled or unavailable.
