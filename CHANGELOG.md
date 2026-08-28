# Changelog

<!-- markdownlint-disable MD013 -->

All notable changes to Table Cards are documented here.

## Unreleased

### Added

- On the shared deck layout the switch reports how many tables already carry a layout of their own, so a deck of five or six tables can be read at a glance without opening the list, and one action gives every remaining table its own layout — or takes them all back to the shared one.
- The fields sheet names the tables each column comes from, so a deck spanning several tables explains its own column list.
- A deck that holds more than one table can give each table its own card layout. The editor shows a **Layout for** switch above the canvas; a table starts on the shared deck layout and can take its own blocks, built from that table's own columns, or go back to the deck layout at any time. Stored layouts follow a table that gains, renames, or loses a column, exactly as table selection already did.
- `tests-obsidian/defects.spec.ts` audits every surface — session, card search, table picker, launcher, editor with all four panels, and the setup wizard — across the eight supported viewports, and again in Arabic on the three shapes that matter most. It fails on any control that leaves the screen, text clipped without an ellipsis, a layout that scrolls sideways, overlapping boxes, content escaping its parent, an unnamed control, or a control too small to hit. It runs behind `TABLE_CARDS_AUDIT=1`.
- `tests-obsidian/responsive.spec.ts` drives the real application across eight viewports — desktop, laptop, narrow window, tablet in both orientations, phone in both orientations, and a 320 px phone — and fails on chrome that leaves the viewport, horizontal scrolling, a panel that swallows the canvas, or card content that escapes its block.

### Fixed

- A deck built from several tables no longer drops rows from the other tables. A required field can only be violated by a row whose table actually has that column, so the Phrases rows of a Vocabulary deck stop disappearing into a `requiredEmpty` warning. Blocks whose columns a table does not have are skipped for that table instead of drawing an empty placeholder.
- A study session reserves room for its side panel on a wide window: opening **Find a card** or the table picker no longer hides the card and the Next button behind the panel.
- Card rows no longer squeeze below the height their content needs. On a short window the title's underline could land on the next block's label; the card now scrolls instead.
- The card title scales with the card, not the application window, so the editor's phone preview shows phone-sized type.
- Four of the twelve ribbon icons and two of the six preset icons drew nothing on the supported app floor: those Lucide names arrived after it. The picker now offers eight icons that all draw, every preset card has its own icon, and a deck that had picked a removed icon falls back to the stack icon. `tests-obsidian/ribbon-icons.spec.ts` fails on any icon that renders no glyph.
- Automatic layout gives a table a headline even when no column is called "word" or "phrase": the first column names the row unless its values repeat, so an `Idiom` or `Preposition` table gets a title instead of a labelled field.
- In the block-order panel each row's type caption stayed outside its own button: Obsidian sizes every button to one input row, and a two-line button spilled its second line onto the row below.
- A long option no longer widens its dropdown past the panel on a narrow phone; the value ellipsises instead.
- The editor header no longer runs past the right edge of a tablet in portrait or a phone held sideways. A panel reserves room beside the canvas only when the window is wide enough for both.
- A short viewport keeps a side panel and compact chrome instead of a bottom sheet that covered the card.
- Modal height is measured against the dynamic viewport, so mobile browser chrome no longer cuts off the footer.

### Changed

- The **Card style** panel groups spacing and frame controls behind two sections instead of listing twenty controls at once; alignment moved into the block's size group.
- The block panel keeps its column list inside its own scroller, so every settings group stays reachable without scrolling the whole panel.
- The editor names things plainly: the row picker reads **Row 1 / 5**, the selected block reads **Block · Title**, and the reordering button reads **Order** instead of the ambiguous **Blocks**.
- Continuous integration runs the unit, lint, type, build, and link checks; the Playwright suites are local gates, because their configuration is deliberately not part of the repository.

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
