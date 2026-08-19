# Changelog

<!-- markdownlint-disable MD013 -->

All notable changes to Table Cards are documented here.

## 0.1.0 — 2026-08-19

First complete release.

### Added

- Three-step first-run setup with real table scans, six deterministic presets, a representative-row preview, and optional deck ribbon setup.
- Mandatory general and deck-locked launchers with grouped multi-table selection, live valid-card counts, missing-table recovery, loading/error states, and explicit confirmation.
- Multi-table study scopes, in-session scope changes, Unicode-aware card search, grouped results, and exact-card opening with source metadata.
- Deck-specific ribbon buttons with curated icons, live reconciliation, ordering, and generic command fallback.
- Complete typed UI catalogs for 16 locales, automatic Obsidian-locale matching, cached locale number formatting, and scoped Arabic RTL.
- Simplified editor sources with compact summaries, a focused table-selection route, real-row preview, and draft-only exact-table launch.
- Deterministic launcher, setup, study, and editor fixtures plus a Playwright accessibility/interaction matrix for desktop, tablet, zoom-equivalent, and phone viewports.

### Preserved

- All-visible cards, adaptive blocks, long-content rules, image rendering/zoom, visual layout editing, undo/redo, and per-deck appearance overrides.
- Idempotent migration from schema v1/v2 without changing source Markdown or losing decks, sources, blocks, progress, appearance, or locale.

### Intentional limits

- No external row deep links, spaced repetition, scoring/statistics, or in-card cell editing.
- Card browser mounts the first 100 matches and reports the full total.
