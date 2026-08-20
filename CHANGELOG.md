# Changelog

<!-- markdownlint-disable MD013 -->

All notable changes to Table Cards are documented here.

## 0.2.2 — 2026-08-20

### Fixed

- The stylesheet declares nothing `!important` any more: the visually-hidden helper and the reduced-motion reset win on specificity alone, and a duplicate `text-align` in the listbox option rule is gone.

## 0.2.1 — 2026-08-20

### Fixed

- Escape inside the picker's table selection closes the selection instead of the whole dialog.
- The runtime no longer calls APIs newer than the declared ES2018 target (`Array.at`, `flatMap`, `matchAll`, `Object.fromEntries`), which could throw on an older mobile WebView.

### Changed

- Selector state that relied on `:has()` is carried by classes the plugin sets itself, and redundant `!important` declarations are gone.
- Releases carry GitHub build-provenance attestations for `main.js`, `manifest.json`, and `styles.css`.

## 0.2.0 — 2026-08-20

### Changed

- A configured deck opens straight into the cards; the picker appears only when several decks exist and none has been studied. When several decks are enabled, the deck name in the session header returns to the picker.
- Saving in the layout editor keeps the undo history, the selected block, the previewed row, and the open panel.
- The block toolbar drops its duplicate button, names the block list, states the width it holds, and marks parse warnings with a dot instead of a bare number.
- The launcher prints the diagnostic sentence for a broken deck instead of a warning count.
- The first-run wizard opens once, starts from the note you have open when it holds a table, and lists notes containing tables first.
- On the phone the card centres in the viewport, search sits beside shuffle in the thumb row, and full-screen sheets can be pulled down by their grab handle.
- Russian speaks with one voice, and Slavic metric labels agree with any count.

### Fixed

- Decks follow notes that the vault renames or moves.
- A deck pinned to specific tables survives an edit to those tables: adding, renaming or removing a column re-identifies the table instead of dropping it, and the saved study scope follows it.
- Turning every deck off says so instead of opening the setup wizard and building another deck.
- An empty table scope says that no table is selected instead of blaming file paths.
- Switching a column off keeps its block; switching it back on restores it in place.
- A block that renders nothing on the previewed row can be selected from the block list.
- The find sheet opens on its search field and `Enter` opens the top match; the table picker keeps focus on the row being ticked.
- Arabic keeps card counts left to right, mirrors navigation icons, and separates metadata correctly.
- The block height handle is reachable from a block's default state, the block list drops its undraggable grip, and the study controls announce their keyboard shortcuts.

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
