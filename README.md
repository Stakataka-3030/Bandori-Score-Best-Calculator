# Bandori Score Best Calculator

Experimental BanG Dream! score calculator derived in part from the open-source HHWX scoring implementation.

## Baseline policy

The initial import preserves the relevant HHWX scoring/profile code as closely as practical before feature changes are introduced. Subsequent changes should remain reviewable against that baseline.

## Data and safety boundary

This project is intended to work from user-supplied profile data, including Bestdori-compatible / HHWX-exported profile files.

It deliberately does **not** implement or call HHWX's private user-fetcher, game-account synchronization, Bilibili/game sessions, or other unofficial account-access infrastructure.

## Upstream

Relevant source code is derived from:

- HHWX: https://github.com/BluewaterAlnilamII/hhwx
- Original HHWX code copyright (c) 2026 BluewaterAlnilamII
- HHWX is licensed under GNU Affero General Public License v3.0 only.

This repository will retain the applicable AGPL license and attribution for derived code.
