# Table Cards v3 — Multi-table Sessions and Internationalization

<!-- markdownlint-disable MD010 MD013 -->

Date: 2026-08-18  
Status: approved  
Builds on: `2026-08-18-table-cards-v2.md`

## Acceptance spec

1. A deck can include all tables or any explicit subset of tables from every configured file and folder.
2. A fresh install uses a short setup wizard that scans real tables, recommends one of six task presets, previews a real row, and creates the first deck without exposing advanced controls.
3. Each deck can own an optional left-ribbon button with its own icon; clicking it opens the mandatory table-selection launcher already locked to that deck.
4. The general command opens the same launcher with a deck picker, and every launch shows selected tables, valid card count, remembered selection, and one `Open N cards` confirmation action.
5. The study screen can change scope without closing, while search can find an exact card and show its source file, table label, and row.
6. Overlapping file and folder sources never duplicate a table or card; a vault file is read at most once per load.
7. Existing schema-v2 settings migrate idempotently to schema v3 without changing source Markdown or losing deck, block, appearance, progress, or locale settings.
8. The UI supports EN, RU, UK, ES, DE, FR, PT-BR, IT, PL, TR, ZH-CN, ZH-TW, JA, KO, AR, and HI, with English fallback and automatic Obsidian-locale matching.
9. Arabic uses a scoped right-to-left UI; user table content keeps its own natural direction and is never translated.
10. Setup, launcher, study, editor, and ribbon behavior pass unit, type, lint, accessibility, and Playwright desktop/phone verification without horizontal page overflow.

## Product decision

The launch screen is mandatory. It replaces the previous immediate jump into the last deck and prevents an unclear mixed session when one deck contains many tables.

The screen stays small rather than becoming a dashboard:

- deck picker;
- table scope summary;
- expandable table selector grouped by source file;
- live card count and warning count;
- one primary start button;
- one secondary `Select all` or `Clear` action inside the selector.

The previous valid selection is preselected to reduce repetition, but the user still confirms each session. Missing saved tables are removed from the selection and reported inline. If no tables or cards remain, the start button is disabled with a localized explanation.

This combines the useful parts of common patterns: Quizlet-style multi-set sessions, Anki-style card browsing and filtering, RemNote-style source scopes, and Notion-style multi-source views. It intentionally does not add a second permanent deck hierarchy.

## In scope

- Selecting multiple individual tables from the same file or folder source.
- Smart first-run setup with six presets and real-data preview.
- Optional deck-specific buttons in Obsidian's left ribbon.
- Mandatory pre-session deck and table selection.
- Switching the selected table scope during a running session.
- Searching all cell text within the active table scope.
- Opening an exact result and continuing navigation from that card.
- Human-readable table names derived from nearby Markdown headings.
- A compact source/table browser in the editor with counts and preview actions.
- Targeted decomposition of the current loader, study modal, fields panel, and localization catalog.
- Sixteen complete UI locales and Arabic RTL.

## Out of scope

- Editing Markdown table cells from Table Cards.
- Spaced repetition, scoring, statistics, stars, or tags owned by the plugin.
- Network translation, machine translation at runtime, or translating user content.
- Permanent external links to a row: Markdown rows have no stable native identifier and can move or change.
- Arbitrary Boolean filter builders over cell values.
- Virtualized rendering of every result; the browser renders the first 100 matches and reports the full count.
- A second deck system nested under existing decks.
- Hard-coded global keyboard shortcuts or one ribbon button per generic plugin action.

## Schema v3

```ts
export const SCHEMA_VERSION = 3 as const;

export const UI_LOCALES = [
	"en",
	"ru",
	"uk",
	"es",
	"de",
	"fr",
	"pt-BR",
	"it",
	"pl",
	"tr",
	"zh-CN",
	"zh-TW",
	"ja",
	"ko",
	"ar",
	"hi",
] as const;

export type UiLocale = (typeof UI_LOCALES)[number];
export type LocaleMode = "auto" | UiLocale;

export const RIBBON_ICONS = [
	"gallery-horizontal",
	"languages",
	"message-square-quote",
	"circle-help",
	"image",
	"book-open",
	"layers-3",
	"graduation-cap",
	"brain",
	"library",
	"notebook-tabs",
	"rows-3",
] as const;

export type RibbonIcon = (typeof RIBBON_ICONS)[number];

export interface TableSelector {
	headerSignature: string;
	occurrence: number;
}

export type TableSelection =
	| { mode: "all" }
	| { mode: "include"; selectors: TableSelector[] };

export interface DeckSource {
	id: string;
	kind: "file" | "folder";
	path: string;
	tables: TableSelection;
}

export type StudyScope =
	| { mode: "all" }
	| { mode: "tables"; tableKeys: string[] };

export interface DeckProgress {
	index: number;
	shuffle: boolean;
	seed: number;
	scope: StudyScope;
	cardKey: string | null;
}

export interface DeckRibbonSettings {
	visible: boolean;
	icon: RibbonIcon;
}
```

`Deck` gains `ribbon: DeckRibbonSettings`. `PluginSettings` gains `setupVersion: number`. Card blocks, appearance, column type overrides, and empty-value rules keep their v2 meaning. Source table selection, progress scope, card origin, and locale types change as specified above.

### Migration

- v2 `{ table: { mode: "all" } }` becomes `{ tables: { mode: "all" } }`.
- v2 `{ table: { mode: "single", selector } }` becomes `{ tables: { mode: "include", selectors: [selector] } }`.
- Missing v2 progress scope becomes `{ mode: "all" }`; missing `cardKey` becomes `null`.
- Existing `index`, shuffle state, seed, deck IDs, block IDs, appearance, and locale are preserved.
- Migrated users receive `setupVersion: 1`, so the first-run wizard never interrupts an upgrade.
- The last active enabled deck receives the existing generic ribbon position as its deck-specific button; other migrated decks default to hidden ribbon buttons.
- A fresh install starts with `setupVersion: 0` and no saved deck until the setup wizard completes.
- `mergeSettings(mergeSettings(raw))` must equal `mergeSettings(raw)`.
- Unknown locale values fall back to `auto`; `ru` and `en` retain their exact stored values.

## Canonical table catalog

The loader first produces a canonical catalog before it produces cards.

```ts
export interface TableCatalogItem {
	key: string;
	selector: TableSelector;
	sourcePath: string;
	sourceIds: string[];
	label: string;
	tableNumber: number;
	headingPath: string[];
	headers: string[];
	rowCount: number;
}

export interface CardOrigin {
	tableKey: string;
	tableLabel: string;
	tableNumber: number;
	sourcePath: string;
	rowNumber: number;
	rowKey: string;
}

export interface Card {
	cells: Record<string, CellValue>;
	headers: string[];
	origin: CardOrigin;
}
```

`tableKey` is derived from source path, normalized header signature, and occurrence. A table reached through overlapping file and folder sources has one canonical key and lists every matching source ID.

`label` is the nearest preceding Markdown heading text. `tableNumber` is the one-based table position within its file. If no heading exists, the label is localized as `Table N`. Repeated labels include a short file-path and, when needed, table-number disambiguator in the UI.

`rowKey` is a deterministic short hash of the table key, normalized header/value pairs, and duplicate ordinal. It survives row reordering. If a row is edited and the saved key no longer exists, progress falls back to the clamped saved index instead of opening the wrong card silently.

The source Markdown is never modified to create IDs.

## Smart first-run setup

The wizard is shown automatically only when no prior plugin data exists and `setupVersion` is `0`. Existing users can launch it manually through `Create deck with setup` without replacing current decks.

### Step 1: Data

Choose one or more files or folders, then select tables through the same grouped selector used by the session launcher. The wizard scans once and reports tables, valid rows, inferred column types, and warnings. Advanced block settings remain hidden.

### Step 2: Preset

A pure rule-based scorer ranks six presets from column names, inferred data types, fill rate, and image presence. The best fit receives a localized `Recommended` badge. Every option previews one real representative row, and changing preset never changes source data.

The six presets are:

1. `Vocabulary` — word or term title, translation, pronunciation/tags, example, note, and optional image.
2. `Phrases` — phrase title, translation, example/context quote, and note.
3. `Question and answer` — question title, answer body, explanation/note, and optional image.
4. `Gallery` — leading full-width image, title, tags, and description.
5. `Reference` — title followed by dense labeled properties in a responsive two-column layout.
6. `Universal` — best title candidate plus every remaining column in source order using inferred block kinds.

Preset application creates ordinary editable v3 blocks. It does not introduce a second rendering path or permanently lock the deck to a template.

### Step 3: Finish

The final screen sets the localized deck name and offers `Show this deck in the left ribbon`, enabled by default for the first deck. It previews the chosen icon and summarizes `N cards · M tables · K fields`. The primary action creates and saves the deck once; Back preserves the draft, while closing discards it after confirmation.

## Deck-specific ribbon buttons

Ribbon buttons represent decks, not generic plugin actions.

- Each deck has a `Show in ribbon` toggle and one icon from the curated Obsidian/Lucide set.
- The tooltip is the current deck name; disabled decks do not render a button.
- Clicking a deck button opens the mandatory launcher with that deck fixed, its last valid tables preselected, and no redundant deck picker.
- The general `Open table cards` command opens the launcher with a deck picker.
- The deck settings list controls button order with accessible move-up/move-down actions; runtime order follows that list.
- Renaming, enabling, pinning, reordering, or deleting a deck reconciles ribbon DOM immediately without requiring an Obsidian restart.
- There is no hard ribbon-button limit, but first-run copy recommends pinning only frequently used decks.
- Command-palette actions remain generic; the plugin does not reserve default global hotkeys that could conflict with the vault.

## Loading and selection pipeline

1. Resolve every file and folder source.
2. Deduplicate files by vault path and cache one `cachedRead` promise per path.
3. Scan each file once, including preceding heading context.
4. Build canonical tables and merge their matching source IDs.
5. Apply each source's `all` or `include` table selection.
6. Deduplicate selected tables by canonical table key.
7. Convert rows to cards with origin metadata and deterministic row keys.
8. Apply required-field rules and collect diagnostics.
9. Build a normalized search index once per card.
10. Apply the launch/session scope and shuffle order.

An empty explicit `include` list means no selected tables; it does not silently mean all tables.

## Mandatory launch screen

### Desktop

The existing modal opens into a centered monochrome launch panel. A general-command launch shows the deck picker first. A deck-ribbon launch shows the fixed deck name instead. Both continue with a compact scope button such as `All tables`, `3 tables`, or a single table name. Expanding scope shows a searchable grouped selector without leaving the modal.

Each source-file group shows:

- file name and compact parent path;
- selected/total table count;
- table heading, row count, and abbreviated columns;
- a checkbox with a 44 px target;
- group-level select/clear action.

The footer shows `N cards · M tables` and the primary `Open N cards` button. Loading uses a stable skeleton; it must not move the action buttons.

### Mobile

The launch screen fills the available viewport and respects safe-area insets. The table selector opens as a full-height bottom sheet with a sticky search field, independently scrolling groups, and a sticky `Apply` button. No nested popover is used on a coarse pointer.

### State rules

- Changing deck loads its catalog, then restores that deck's last valid scope.
- The last scope is shown as a default, never auto-started.
- `Select all` sets scope to `all`; manually unchecking one table materializes the remaining canonical table keys.
- `Clear` produces an empty explicit table scope and disables start.
- The card count includes required-field filtering and excludes duplicate rows produced by overlapping sources.
- A load failure keeps the launch screen open and offers retry.
- Starting saves the selected scope and opens the first saved card key or clamped index.

## Study screen

The card remains the visual focus. The header contains only:

- deck name;
- clickable scope chip;
- search button;
- progress count;
- close button.

The source line below the card title uses the human table label and file name. It is visually secondary and becomes a button that scopes the current session to that table after confirmation when doing so would discard a multi-table scope.

Changing scope reuses the loaded canonical catalog and cards; it does not rescan the vault. The current card remains selected when it belongs to the new scope. Otherwise the session uses the one saved card key when it belongs to the new scope or starts at the first card.

Previous/next, swipe, shuffle, internal scrolling, image zoom, and all-visible blocks retain v2 behavior.

## Card browser and exact opening

Search is a separate browser surface, not a text field permanently occupying the study header.

- Desktop: side sheet.
- Mobile: full-height bottom sheet.
- Search covers normalized plain text from every cell in the active scope.
- Matching is case-insensitive, Unicode-aware, and accent-insensitive for Latin text.
- Results group by table and show the resolved primary title, one matching snippet, file name, and row number.
- Empty query shows tables and their first cards rather than an empty state.
- At most 100 result rows are mounted; the full match count remains visible.
- Clicking a result closes the browser, makes that exact card current, resets card scroll, and updates saved progress.
- Changing scope while the browser is open rebuilds the result list; stale result clicks are ignored.

Search does not create or save a second deck.

## Editor source experience

The current Fields panel is split into a source section and a column-profile section. The canvas and block editing behavior do not change.

Each source card shows only path, kind, selected-table summary, warnings, and two actions: `Choose tables` and remove. `Choose tables` replaces the sheet body with a focused table-selection view and a back action; it does not stack a modal inside a sheet.

The table-selection view supports:

- grouped file sections for folder sources;
- search by heading, path, or column name;
- all/none bulk actions;
- individual table checkboxes;
- row and column counts;
- one-card preview;
- `Open this table` to launch the mandatory start screen with that table preselected.

Choosing tables updates only the editor draft. Persisted settings change only after the existing Save action.

The deck settings row also exposes the ribbon visibility toggle and icon picker. Preset choice is not shown after setup because presets only create normal blocks; further changes happen through the existing visual editor.

## Localization architecture

The current single large catalog file is split by responsibility:

```text
src/i18n/
  index.ts
  locale.ts
  keys.ts
  catalogs/
    en.ts
    ru.ts
    uk.ts
    es.ts
    de.ts
    fr.ts
    pt-BR.ts
    it.ts
    pl.ts
    tr.ts
    zh-CN.ts
    zh-TW.ts
    ja.ts
    ko.ts
    ar.ts
    hi.ts
```

English is the typed canonical catalog. Every other catalog must satisfy the same key type at compile time and in a parity test. Runtime lookup still falls back to English so corrupted or older external data cannot render an undefined label.

Automatic locale resolution canonicalizes the Obsidian language as BCP 47, then maps language/script aliases:

- `pt` and `pt-*` to `pt-BR` unless an exact supported locale appears later;
- `zh-Hans`, `zh-CN`, and `zh-SG` to `zh-CN`;
- `zh-Hant`, `zh-TW`, `zh-HK`, and `zh-MO` to `zh-TW`;
- unsupported locales to `en`.

Manual language selection uses the plugin's styled listbox and native language names. Locale-sensitive numbers use one cached `Intl.NumberFormat` per active locale. The Arabic catalog sets `dir="rtl"` on Table Cards roots only; CSS uses logical properties. Card data containers use `dir="auto"`.

## Targeted code boundaries

- `src/deck/catalog.ts` owns canonical table keys, labels, source merging, and catalog construction.
- `src/deck/filter.ts` owns scope normalization, card filtering, search normalization, and exact-result lookup.
- `src/deck/load.ts` remains the Obsidian file-access orchestrator.
- `src/setup/presets.ts` owns six preset definitions, scoring, field mapping, and default icons.
- `src/ui/SetupWizard.ts` owns the three-step draft-only first-run flow.
- `src/ui/SessionLauncher.ts` owns the mandatory pre-session flow.
- `src/ui/ScopePicker.ts` owns grouped multi-table selection for desktop and mobile.
- `src/ui/CardBrowser.ts` owns search results and exact-card selection.
- `src/ui/CardsModal.ts` coordinates launcher and study state but contains no parsing or search logic.
- `src/ui/RibbonDecks.ts` owns deck-button reconciliation and delegates launches back to the plugin host.
- `src/ui/editor/SourcesSection.ts` owns source cards and the focused table-selection route.
- `src/ui/editor/ProfilesSection.ts` owns column profiles and automatic layout.
- `src/ui/editor/FieldsSheet.ts` composes those two sections.
- `src/i18n/index.ts` exposes only locale resolution, catalog lookup, and translator creation.

No unrelated parser, renderer, or appearance refactor is included. New boundaries must reduce the responsibilities of the current 742-line i18n file and 374-line Fields panel without changing existing card rendering semantics.

## Visual direction

- Preserve the black/white Obsidian-native direction and remove decorative chrome.
- One elevated surface per task: launch, table selection, browser, or card.
- Use typography, spacing, and subtle borders before shadows.
- Use one accent color only for selection, focus, and the primary action.
- Avoid permanent filter bars, dashboard tiles, gradients, and nested cards.
- Desktop transitions are 120–160 ms; reduced-motion mode removes them.
- Phone touch targets are at least 44×44 px and primary actions remain above the safe area.

## Failure and recovery behavior

- Missing file: keep the source in settings, show a localized source warning, and exclude it from counts.
- Missing selected table: retain its selector for repair in the editor, remove its runtime table key from launch scope, and show the warning count.
- Duplicate table through overlapping sources: merge source IDs and render once.
- Duplicate table headings: disambiguate with file path and table number.
- Empty selected scope: disable start and show `Select at least one table`.
- Selected tables with zero valid rows: disable start and report skipped rows.
- Search with no matches: keep scope controls available and show a localized empty state.
- Saved card key missing: fall back to the clamped index.
- Stale async load: discard its result through the existing load-version guard.

## Verification

### Unit and type tests

- v2-to-v3 migration and migration idempotence.
- Fresh-install setup state, upgrade suppression, and one-save wizard completion.
- Six preset scores, deterministic tie-breaking, field mapping, and ordinary-block output.
- Ribbon migration, deck-specific launch target, icon normalization, ordering, and live reconciliation.
- Multi-selector normalization, missing-table retention, and empty-include semantics.
- Overlapping file/folder deduplication and one-read-per-file behavior.
- Heading-derived labels, canonical table keys, and deterministic row keys.
- Scope filtering, group selection, search normalization, and exact-card lookup.
- Card-key fallback after row edits or removals.
- Locale alias resolution, English fallback, and exact catalog parity for all 16 locales.
- Arabic direction metadata and user-content `dir="auto"`.

### UI verification

- Playwright screenshot and accessibility snapshot at 1440×1000, 768×1024, 720×500, 390×844, and 320×568.
- Mandatory launcher appears before every session and restores without auto-starting.
- First-run data, preset, real-row preview, Back, close confirmation, and finish flows.
- Multiple deck ribbon buttons open their own locked launchers and update after rename/reorder without reload.
- Desktop grouped selector, mobile bottom sheet, live counts, empty selection, and retry state.
- Exact search result opens the expected source/table/row card.
- Keyboard: tab order, focus trap, Escape layer order, Enter selection, arrows, and shuffle shortcut.
- No document-level horizontal overflow, no obscured fixed footer, 44 px coarse-pointer targets, and reduced-motion compliance.
- RTL screenshot for Arabic on desktop and phone.
- Console has zero errors and warnings in verification fixtures.

### Release gate

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm exec --yes --package=markdownlint-cli2 -- markdownlint-cli2 "README*.md" "docs/**/*.md"
```

After the release gate, deploy only `main.js`, `manifest.json`, and `styles.css` to the vault plugin directory and verify that `data.json` is byte-identical before and after deployment.

## Research references

- [Anki search and card browser](https://docs.ankiweb.net/searching.html)
- [Anki filtered decks](https://docs.ankiweb.net/filtered-decks.html)
- [Quizlet combining flashcard sets](https://help.quizlet.com/hc/en-us/articles/360029638892-Combining-study-sets)
- [RemNote practicing specific flashcards](https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards)
- [Notion multi-source databases](https://www.notion.com/help/what-is-a-database)
- [Notion views, filters, and search](https://www.notion.com/en-gb/help/views-filters-and-sorts)
- [MDN JavaScript internationalization](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Internationalization)
