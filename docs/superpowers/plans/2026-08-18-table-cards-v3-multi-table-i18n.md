# Table Cards v3 Multi-table Sessions Implementation Plan

<!-- markdownlint-disable MD010 MD013 -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add smart first-run setup, six real-data presets, explicit multi-table sessions, exact-card search, deck-specific ribbon buttons, and sixteen complete UI locales without regressing the all-visible responsive card editor.

**Architecture:** Schema v3 adds multi-table source selection, persisted study scope, card origins, setup state, and per-deck ribbon metadata. Pure modules own catalog construction, filtering/search, preset scoring, locale resolution, and launcher state; Obsidian-facing classes only read vault files, render DOM, reconcile ribbon elements, and persist confirmed drafts. The existing modal becomes a two-phase launcher/study coordinator and reuses one canonical load result so scope changes never rescan the vault.

**Tech Stack:** TypeScript 5.8, Obsidian API 1.8.7+, esbuild, Vitest in Node mode, CSS Grid, Pointer Events, `Intl`, and Playwright MCP for desktop/mobile UI verification.

**Spec:** `docs/superpowers/specs/2026-08-18-table-cards-v3-multi-table-i18n.md`

## Global Constraints

- Opening through a general command or a deck ribbon button always stops at the launch screen until the user confirms `Open N cards`.
- A deck ribbon button locks the launcher's deck but still requires table selection confirmation.
- Never modify source Markdown tables or add hidden IDs to them.
- Preserve every v2 deck, block, source, appearance override, progress value, and locale through an idempotent schema-v3 migration.
- Keep `manifest.json.isDesktopOnly` false and use no Node or Electron runtime API in `src/`.
- Keep the plugin offline; no runtime translation, telemetry, or separate image request.
- Render all enabled card blocks immediately; do not reintroduce front/back or reveal state.
- Use only public Obsidian APIs. `Plugin.addRibbonIcon(icon, title, callback)` returns the `HTMLElement` stored for dynamic removal; commands remain an alternative when the ribbon is hidden.
- All visible strings and accessible names use the typed translator; UI locales are EN, RU, UK, ES, DE, FR, PT-BR, IT, PL, TR, ZH-CN, ZH-TW, JA, KO, AR, and HI.
- All visible counts pass through cached `formatUiNumber()` before interpolation.
- Arabic applies RTL only to plugin chrome; user data containers use `dir="auto"`.
- Phone and coarse-pointer targets are at least 44×44 CSS px, use safe-area insets, and never create document-level horizontal overflow.
- Editor and setup changes remain drafts until one explicit Save or Finish action.
- Apply red-green-refactor to migration, catalog, search, preset, locale, and state logic.
- Current repository safety: `obsidian-table-cards/` is wholly untracked inside a dirty parent repository. Keep the commit commands below as future checkpoints, but do not execute them until the project is tracked as one coherent repository; never create partial commits containing only new v3 files.

---

## File map

### Model, migration, and pure data

- Modify `src/model.ts` — schema-v3 persisted and runtime contracts.
- Modify `src/settings/defaults.ts` — fresh-install defaults plus v1/v2/v3 normalization.
- Modify `src/parse/table-scanner.ts` — heading context for human table labels.
- Create `src/deck/catalog.ts` — canonical table keys, source merging, labels, and row keys.
- Modify `src/deck/load.ts` — one-read-per-file orchestration and canonical load result.
- Create `src/deck/filter.ts` — scope normalization, search indexing, filtering, and progress restoration.
- Create `src/setup/presets.ts` — six preset definitions, scoring, and block mapping.
- Create `src/setup/state.ts` — first-run draft reducer and pure deck creation.
- Create `src/session/launcher-state.ts` — pure launcher selection state and count derivation.

### Internationalization

- Create `src/i18n/keys.ts` — canonical English keys and typed message interpolation.
- Create `src/i18n/locale.ts` — BCP-47 alias resolution, direction, and number formatting.
- Create `src/i18n/catalogs/{en,ru,uk,es,de,fr,pt-BR,it,pl,tr,zh-CN,zh-TW,ja,ko,ar,hi}.ts` — complete catalogs.
- Create `src/i18n/catalogs/index.ts` — typed catalog registry.
- Modify `src/i18n/index.ts` — small public facade preserving existing imports.

### Runtime UI

- Create `src/ui/ScopePicker.ts` — grouped multi-table selector with desktop/mobile presentation.
- Create `src/ui/SessionLauncher.ts` — mandatory deck/table confirmation screen.
- Create `src/ui/CardBrowser.ts` — exact-card search and grouped results.
- Create `src/ui/RibbonDecks.ts` — deck-specific public-API ribbon reconciliation.
- Create `src/ui/SetupWizard.ts` — three-step first-run draft flow.
- Modify `src/ui/CardsModal.ts` — launcher/study phase orchestration and scope switching.
- Modify `src/ui/CardView.ts` — source metadata line and `dir="auto"` content boundary.
- Modify `src/main.ts` — setup trigger, general commands, and ribbon host wiring.

### Editor and shared source UI

- Create `src/ui/sources/SourcePickers.ts` — reusable file/folder fuzzy pickers.
- Create `src/ui/sources/TableSelectionView.ts` — reusable source/table selection route.
- Create `src/ui/editor/SourcesSection.ts` — compact source summaries and focused selector navigation.
- Create `src/ui/editor/ProfilesSection.ts` — column profiles and automatic layout.
- Modify `src/ui/editor/FieldsSheet.ts` — compose the two focused sections.
- Modify `src/ui/editor/DeckEditorModal.ts` — transient table launch callback and source-route state.
- Modify `src/settings/settings-tab.ts` — first-run command, deck ribbon controls, and deck ordering.

### Verification and documentation

- Modify `tests/stubs/obsidian.ts` — workspace, plugin, ribbon, and file-read test doubles.
- Modify `tests/settings.test.ts`, `tests/tables.test.ts`, `tests/deck-load.test.ts`, and `tests/i18n.test.ts`.
- Create `tests/catalog.test.ts`, `tests/deck-filter.test.ts`, `tests/presets.test.ts`, `tests/launcher-state.test.ts`, `tests/ribbon.test.ts`, and `tests/setup-state.test.ts`.
- Create `preview/launcher.html` and `preview/setup.html`.
- Modify `preview/v2.html`, `preview/editor.html`, `styles.css`, `README.md`, `README.ru.md`, and `docs/ux-audit-2026-08-18.md`.

---

### Task 1: Introduce schema v3 and lossless migration

**Files:**

- Modify: `src/model.ts`
- Modify: `src/settings/defaults.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**

- Consumes: unknown persisted v1/v2/v3 JSON.
- Produces: `SCHEMA_VERSION`, `UI_LOCALES`, `RIBBON_ICONS`, `TableSelection`, `StudyScope`, `DeckRibbonSettings`, v3 `Deck`, v3 `DeckProgress`, v3 `PluginSettings`, `createDeck()`, and `mergeSettings()`.

- [ ] **Step 1: Replace v2 expectations with failing v3 migration cases**

Add tests that use raw JSON so TypeScript cannot hide migration defects:

```ts
it("migrates a v2 single table into an include selection", () => {
	const settings = mergeSettings({
		schemaVersion: 2,
		locale: "ru",
		lastDeckId: "words",
		decks: [{
			id: "words",
			name: "Words",
			enabled: true,
			sources: [{
				id: "source",
				kind: "file",
				path: "words.md",
				table: { mode: "single", selector: { headerSignature: "term\u001fru", occurrence: 1 } },
			}],
			blocks: [],
		}],
		perDeck: { words: { index: 7, shuffle: true, seed: 42 } },
	});

	expect(settings.schemaVersion).toBe(3);
	expect(settings.setupVersion).toBe(1);
	expect(settings.decks[0]?.sources[0]?.tables).toEqual({
		mode: "include",
		selectors: [{ headerSignature: "term\u001fru", occurrence: 1 }],
	});
	expect(settings.decks[0]?.ribbon.visible).toBe(true);
	expect(settings.perDeck.words).toMatchObject({
		index: 7,
		shuffle: true,
		seed: 42,
		scope: { mode: "all" },
		cardKey: null,
	});
});

it("creates an empty first-run state only when persisted data is absent", () => {
	const fresh = mergeSettings(null);
	expect(fresh).toMatchObject({ schemaVersion: 3, setupVersion: 0, decks: [] });
	expect(mergeSettings({})).toMatchObject({ schemaVersion: 3, setupVersion: 1 });
});

it("keeps a v3 explicit empty table selection and is idempotent", () => {
	const once = mergeSettings({
		schemaVersion: 3,
		setupVersion: 1,
		decks: [{
			id: "x",
			name: "X",
			sources: [{ id: "s", kind: "file", path: "x.md", tables: { mode: "include", selectors: [] } }],
			blocks: [],
			ribbon: { visible: true, icon: "brain" },
		}],
	});
	expect(once.decks[0]?.sources[0]?.tables).toEqual({ mode: "include", selectors: [] });
	expect(mergeSettings(once)).toEqual(once);
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `npx vitest run tests/settings.test.ts`  
Expected: FAIL because schema 3, `tables`, `setupVersion`, `scope`, `cardKey`, and `ribbon` do not exist.

- [ ] **Step 3: Add exact v3 contracts to `src/model.ts`**

Replace locale/source/progress contracts and extend `Deck`/`PluginSettings`:

```ts
export const SCHEMA_VERSION = 3 as const;
export const UI_LOCALES = ["en", "ru", "uk", "es", "de", "fr", "pt-BR", "it", "pl", "tr", "zh-CN", "zh-TW", "ja", "ko", "ar", "hi"] as const;
export const RIBBON_ICONS = ["gallery-horizontal", "languages", "message-square-quote", "circle-help", "image", "book-open", "layers-3", "graduation-cap", "brain", "library", "notebook-tabs", "rows-3"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];
export type LocaleMode = "auto" | UiLocale;
export type RibbonIcon = (typeof RIBBON_ICONS)[number];
export type TableSelection = { mode: "all" } | { mode: "include"; selectors: TableSelector[] };
export type StudyScope = { mode: "all" } | { mode: "tables"; tableKeys: string[] };

export interface DeckRibbonSettings {
	visible: boolean;
	icon: RibbonIcon;
}

export interface DeckSource {
	id: string;
	kind: "file" | "folder";
	path: string;
	tables: TableSelection;
}

export interface DeckProgress {
	index: number;
	shuffle: boolean;
	seed: number;
	scope: StudyScope;
	cardKey: string | null;
}
```

Add `ribbon: DeckRibbonSettings` to `Deck`; add `setupVersion: number` to `PluginSettings`. Add `origin: CardOrigin` to `Card` in Task 2 rather than mixing runtime origin migration into this task.

- [ ] **Step 4: Implement version-specific normalization without mutation**

In `src/settings/defaults.ts`, keep `recordOf`, block migration, and appearance normalization, but separate version routing:

```ts
function migrateV2Source(value: unknown): DeckSource | null {
	const input = recordOf(value);
	if (!input || (input.kind !== "file" && input.kind !== "folder") || typeof input.path !== "string") return null;
	const oldTable = recordOf(input.table);
	const selector = normalizeSelector(oldTable?.selector);
	return {
		id: typeof input.id === "string" && input.id ? input.id : newId("source"),
		kind: input.kind,
		path: input.path,
		tables: oldTable?.mode === "single" && selector
			? { mode: "include", selectors: [selector] }
			: { mode: "all" },
	};
}

export function mergeSettings(raw: unknown): PluginSettings {
	if (raw === null || raw === undefined) return freshSettings();
	const version = recordOf(raw)?.schemaVersion;
	if (version === 3) return normalizeV3Settings(raw);
	if (version === 2) return migrateV2Settings(raw);
	return migrateV1Settings(raw);
}
```

Normalize locale membership through `UI_LOCALES`, ribbon icon membership through `RIBBON_ICONS`, table selectors with deduplication, and scopes by copying arrays. `freshSettings()` returns zero decks and `setupVersion: 0`. V1/v2 migrations set `setupVersion: 1` and pin only `lastDeckId` or the first enabled deck.

- [ ] **Step 5: Make `createDeck()` and progress defaults deterministic**

Use:

```ts
export function createDeck(partial: Partial<Deck> = {}): Deck {
	return {
		id: partial.id ?? newId("deck"),
		name: partial.name ?? "New deck",
		enabled: partial.enabled ?? true,
		sources: partial.sources?.map(cloneJson) ?? [],
		blocks: partial.blocks?.map((block) => createBlock(block)) ?? [],
		columnTypes: { ...partial.columnTypes },
		appearance: partial.appearance ? { ...partial.appearance } : undefined,
		shuffleDefault: partial.shuffleDefault ?? false,
		ribbon: { visible: partial.ribbon?.visible ?? false, icon: partial.ribbon?.icon ?? "layers-3" },
	};
}
```

Do not restore hard-coded personal vault paths in fresh defaults; the first-run wizard owns initial source selection.

- [ ] **Step 6: Run migration and full tests**

Run: `npx vitest run tests/settings.test.ts && npm test`  
Expected: PASS after updating existing fixtures from `.table` to `.tables` and schema `2` to `3` where they represent current data.

- [ ] **Step 7: Record the model checkpoint**

When the project is tracked as a coherent repository:

```bash
git add src/model.ts src/settings/defaults.ts tests/settings.test.ts
git commit -m "feat: add table cards v3 schema"
```

---

### Task 2: Build heading-aware canonical table and card identities

**Files:**

- Modify: `src/model.ts`
- Modify: `src/parse/table-scanner.ts`
- Modify: `src/parse/tables.ts`
- Create: `src/deck/catalog.ts`
- Modify: `src/deck/load.ts`
- Modify: `src/ui/CardView.ts`
- Test: `tests/tables.test.ts`
- Test: `tests/catalog.test.ts`
- Test: `tests/deck-load.test.ts`
- Test: `tests/resolve.test.ts`
- Test: `tests/editor-state.test.ts`

**Interfaces:**

- Consumes: v3 `DeckSource[]`, Markdown strings, `ParsedTable[]`, and source IDs.
- Produces: heading-aware `ParsedTable`, `TableCatalogItem`, `CardOrigin`, `DeckLoadOptions`, `DeckScanResult`, `tableKey()`, `rowKey()`, `cardOrigins()`, `canonicalizeTables()`, `scanDeckSources()`, `buildDeckDataFromScan()`, and `DeckLoadResult.catalog`.

- [ ] **Step 1: Add failing scanner and identity tests**

```ts
it("uses the nearest preceding heading as the table path", () => {
	const tables = scanMarkdownTables("# English\n## Verbs\n\n| Term | RU |\n|---|---|\n|remain|оставаться|", "words.md");
	expect(tables[0]?.headingPath).toEqual(["English", "Verbs"]);
});

it("ignores headings and tables inside fenced code", () => {
	const tables = scanMarkdownTables("```md\n# Fake\n| A |\n|---|\n|x|\n```\n\n## Real\n| B |\n|---|\n|y|", "x.md");
	expect(tables).toHaveLength(1);
	expect(tables[0]?.headingPath).toEqual(["Real"]);
});

it("merges overlapping source origins into one canonical table", () => {
	const table = scanMarkdownTables("## Verbs\n| Term |\n|---|\n|remain|", "English/a.md")[0]!;
	const catalog = canonicalizeTables([
		{ sourceId: "folder", table },
		{ sourceId: "file", table },
	]);
	expect(catalog).toHaveLength(1);
	expect(catalog[0]).toMatchObject({ label: "Verbs", sourceIds: ["folder", "file"], rowCount: 1 });
});

it("keeps row keys stable when rows move", () => {
	const first = scanMarkdownTables("| A |\n|---|\n|one|\n|two|", "x.md")[0]!;
	const moved = scanMarkdownTables("| A |\n|---|\n|two|\n|one|", "x.md")[0]!;
	expect(cardOrigins(first).map((item) => item.rowKey).sort())
		.toEqual(cardOrigins(moved).map((item) => item.rowKey).sort());
});
```

- [ ] **Step 2: Run focused tests and verify red**

Run: `npx vitest run tests/tables.test.ts tests/catalog.test.ts tests/deck-load.test.ts`  
Expected: FAIL because heading paths, catalog helpers, origins, and v3 selections do not exist.

- [ ] **Step 3: Track headings and fenced regions in the scanner**

Extend `ParsedTable` with `headingPath: string[]`. In `scanMarkdownTables()`, maintain a six-slot heading stack and a fenced-code flag before looking for table headers:

```ts
const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
if (heading) {
	const level = heading[1]?.length ?? 1;
	headingStack[level - 1] = stripMarkdownText(heading[2] ?? "");
	headingStack.length = level;
	continue;
}
```

Track both backtick and tilde fences, including the opener marker and minimum length, so only a matching closing fence resumes scanning. Copy `headingStack.filter(Boolean)` into every parsed table. Preserve existing protected-pipe and row-number behavior.

- [ ] **Step 4: Implement deterministic canonical helpers**

Create `src/deck/catalog.ts` with no Obsidian imports:

```ts
export interface SourceTableEntry {
	sourceId: string;
	table: ParsedTable;
}

export interface CanonicalTable extends TableCatalogItem {
	table: ParsedTable;
}

export interface DeckLoadOptions {
	untitledTableLabel?: (ordinal: number) => string;
}

export interface DeckScanResult {
	tables: CanonicalTable[];
	diagnostics: DeckDiagnostic[];
}

export function tableKey(sourcePath: string, selector: TableSelector): string {
	return `${sourcePath}\u0000${selector.headerSignature}\u0000${selector.occurrence}`;
}

export function tableLabel(
	table: ParsedTable,
	untitledTableLabel: (ordinal: number) => string = (ordinal) => `Table ${ordinal}`,
): string {
	return table.headingPath.at(-1) || untitledTableLabel(table.index + 1);
}

export function rowKey(tableKeyValue: string, cells: Record<string, CellValue>, duplicateOrdinal: number): string {
	const canonical = Object.entries(cells)
		.map(([header, cell]) => `${normalizeHeader(header)}=${cell.raw.normalize("NFKC").replace(/\s+/g, " ").trim()}`)
		.join("\u001f");
	return `row-${stableHash(`${tableKeyValue}\u001e${canonical}\u001e${duplicateOrdinal}`)}`;
}
```

Implement a small exported 32-bit FNV-1a `stableHash()` that returns unsigned base-36 text. `canonicalizeTables()` groups by `tableKey`, preserves first-seen table order, appends unique source IDs, and records the one-based `tableNumber` from `ParsedTable.index`. `cardOrigins()` copies `tableNumber` and counts duplicate canonical rows before assigning duplicate ordinals.

- [ ] **Step 5: Split one scan from repeatable deck selection**

`scanDeckSources(app, sources, options)` resolves sources into `Map<string, { file: TFile; sourceIds: Set<string> }>`, calls `cachedRead()` once per path, scans once, and returns every reachable canonical table plus source/file diagnostics. Source selection is applied later by `buildDeckDataFromScan(app, deck, scan)`:

```ts
function sourceSelects(source: DeckSource, table: ParsedTable): boolean {
	if (source.tables.mode === "all") return true;
	return source.tables.selectors.some((selector) =>
		selector.headerSignature === table.selector.headerSignature &&
		selector.occurrence === table.selector.occurrence
	);
}
```

`loadDeckData(app, deck, options = {})` is only the composition of `scanDeckSources()` followed by `buildDeckDataFromScan()`. The English label default exists for pure helpers and tests; every UI-facing caller introduced in Tasks 7, 9, and 11 passes the active translator so the fallback is localized.

For every `include` source, compare all requested selectors with that source's live scanned tables. Emit one `tableMissing` diagnostic per unmatched selector without mutating or deleting it from settings. Return both selected `tables: ParsedTable[]` for compatibility and selected `catalog: TableCatalogItem[]` for launcher/browser grouping. Convert each row to `Card` with `origin`, and keep existing diagnostics/profiling/required-row behavior. Keep `scanDeckTables()` as a compatibility wrapper over `scanDeckSources()` until Task 11 moves the editor to the cached scan. Update `parseMarkdownTables()`, `CardView` resource resolution, and every hand-built `Card` fixture in `tests/resolve.test.ts` and `tests/editor-state.test.ts` to use `origin`; do not keep duplicate `sourcePath`, `tableSelector`, or `rowIndex` fields on `Card`.

- [ ] **Step 6: Prove one-read and no-duplicate behavior**

Extend `fakeApp()` with a read counter and assert:

```ts
expect(readCount.get("English/a.md")).toBe(1);
expect(result.catalog[0]?.sourceIds).toEqual(["folder", "file"]);
expect(result.cards).toHaveLength(1);
expect(result.cards[0]?.origin).toMatchObject({
	sourcePath: "English/a.md",
	tableLabel: "Verbs",
	rowNumber: 4,
	tableNumber: 1,
});
```

Also call `buildDeckDataFromScan()` twice with different table selections and assert the read counter remains `1`; this is the contract used by setup and the editor.

Run: `npx vitest run tests/tables.test.ts tests/catalog.test.ts tests/deck-load.test.ts tests/resolve.test.ts tests/editor-state.test.ts && npm test`  
Expected: PASS.

- [ ] **Step 7: Record the catalog checkpoint**

```bash
git add src/model.ts src/parse/table-scanner.ts src/parse/tables.ts src/deck/catalog.ts src/deck/load.ts src/ui/CardView.ts tests/tables.test.ts tests/catalog.test.ts tests/deck-load.test.ts tests/resolve.test.ts tests/editor-state.test.ts
git commit -m "feat: add canonical multi-table catalog"
```

---

### Task 3: Add scope filtering, Unicode search, and exact progress restoration

**Files:**

- Create: `src/deck/filter.ts`
- Test: `tests/deck-filter.test.ts`

**Interfaces:**

- Consumes: `Card[]`, `TableCatalogItem[]`, `StudyScope`, query text, saved `cardKey`, and saved index.
- Produces: `normalizeScope()`, `materializeTableScope()`, `filterCardsByScope()`, `buildSearchIndex()`, `searchCards()`, and `restoreCardIndex()`.

- [ ] **Step 1: Write failing scope and search tests**

Define complete fixture helpers before the cases:

```ts
function catalog(key: string): TableCatalogItem {
	return {
		key,
		selector: { headerSignature: key, occurrence: 0 },
		sourcePath: `${key}.md`,
		sourceIds: [key],
		label: key,
		tableNumber: 1,
		headingPath: [key],
		headers: ["Value"],
		rowCount: 1,
	};
}

function card(key: string, value: string): Card {
	return {
		cells: { Value: parseCell(value) },
		headers: ["Value"],
		origin: { tableKey: key, tableLabel: key, tableNumber: 1, sourcePath: `${key}.md`, rowNumber: 3, rowKey: `${key}:${value}` },
	};
}

const cards = [card("nouns", "cat"), card("verbs", "remain"), card("nouns", "dog")];
const cardsWithText = (values: string[]): Card[] => values.map((value, index) => card(`table-${index}`, value));
```

```ts
it("distinguishes all, selected tables, and an explicit empty scope", () => {
	expect(filterCardsByScope(cards, { mode: "all" })).toHaveLength(3);
	expect(filterCardsByScope(cards, { mode: "tables", tableKeys: ["verbs"] }))
		.toEqual([cards[1]]);
	expect(filterCardsByScope(cards, { mode: "tables", tableKeys: [] })).toEqual([]);
});

it("matches case, accents, Cyrillic, and CJK text", () => {
	const index = buildSearchIndex(cardsWithText(["Café", "ОСТАВАТЬСЯ", "猫"]));
	expect(searchCards(index, "cafe").total).toBe(1);
	expect(searchCards(index, "оставаться").total).toBe(1);
	expect(searchCards(index, "猫").total).toBe(1);
});

it("restores by card key before falling back to a clamped index", () => {
	expect(restoreCardIndex(cards, cards[2]!.origin.rowKey, 0)).toBe(2);
	expect(restoreCardIndex(cards.slice(0, 2), "missing", 99)).toBe(1);
	expect(restoreCardIndex(cards.slice(0, 2), "missing", -4)).toBe(0);
});

it("removes stale table keys without turning an empty explicit scope into all", () => {
	expect(normalizeScope({ mode: "tables", tableKeys: ["live", "gone"] }, [catalog("live")]))
		.toEqual({ mode: "tables", tableKeys: ["live"] });
	expect(normalizeScope({ mode: "tables", tableKeys: ["gone"] }, [catalog("live")]))
		.toEqual({ mode: "tables", tableKeys: [] });
});
```

- [ ] **Step 2: Run the new test and verify red**

Run: `npx vitest run tests/deck-filter.test.ts`  
Expected: FAIL because `src/deck/filter.ts` does not exist.

- [ ] **Step 3: Implement normalized indexing once per load**

```ts
export interface SearchEntry {
	card: Card;
	normalized: string;
	primary: string;
}

export interface SearchResult {
	matches: SearchEntry[];
	total: number;
}

export function normalizeSearchText(value: string): string {
	return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildSearchIndex(cards: Card[]): SearchEntry[] {
	return cards.map((card) => ({
		card,
		normalized: normalizeSearchText(Object.values(card.cells).map((cell) => cell.text).join("\n")),
		primary: Object.values(card.cells).find((cell) => cell.text.trim())?.text ?? "",
	}));
}

export function searchCards(index: SearchEntry[], query: string, limit = 100): SearchResult {
	const needle = normalizeSearchText(query);
	const filtered = needle ? index.filter((entry) => entry.normalized.includes(needle)) : index;
	return { matches: filtered.slice(0, limit), total: filtered.length };
}
```

Keep card order stable. Use a `Set` to deduplicate scope keys in catalog order. `materializeTableScope()` converts `all` into current keys before one table is unchecked. `restoreCardIndex()` uses the exact row key first, then a true `[0, length - 1]` clamp; do not reuse wraparound navigation logic for restoration.

- [ ] **Step 4: Keep runtime integration isolated to Task 8**

This task exports `restoreCardIndex()` only. Task 8 integrates it after `orderCards()`, persists both `index` and `current.origin.rowKey`, and preserves the current key when shuffle changes.

- [ ] **Step 5: Run the filter and full suites**

Run: `npx vitest run tests/deck-filter.test.ts && npm test`  
Expected: PASS, including empty-scope and stale-key behavior.

- [ ] **Step 6: Record the filter checkpoint**

```bash
git add src/deck/filter.ts tests/deck-filter.test.ts
git commit -m "feat: add table scopes and card search"
```

---

### Task 4: Implement six smart presets as ordinary block layouts

**Files:**

- Create: `src/setup/presets.ts`
- Test: `tests/presets.test.ts`

**Interfaces:**

- Consumes: `ColumnProfile[]` and an optional representative `Card`.
- Produces: `PresetId`, `PRESETS`, `scorePreset()`, `rankPresets()`, and `blocksForPreset()`.

- [ ] **Step 1: Write failing ranking and mapping tests**

Use this complete fixture builder:

```ts
function profile(header: string, inferredType: ColumnDataType): ColumnProfile {
	return {
		header,
		inferredType,
		confidence: 1,
		total: 10,
		nonEmpty: 10,
		unique: 10,
		samples: [header],
		warnings: [],
	};
}
```

```ts
it("recommends vocabulary for term, translation, example, and image", () => {
	const ranked = rankPresets([
		profile("Word", "text"),
		profile("Translation", "text"),
		profile("Example", "text"),
		profile("Picture", "image"),
	]);
	expect(ranked[0]?.id).toBe("vocabulary");
});

it("recommends gallery when image evidence dominates", () => {
	expect(rankPresets([profile("Image", "image"), profile("Caption", "text")])[0]?.id)
		.toBe("gallery");
});

it.each([
	["phrases", [profile("Phrase", "text"), profile("Translation", "text"), profile("Context", "text")]],
	["qa", [profile("Question", "text"), profile("Answer", "markdown")]],
	["reference", [profile("Title", "text"), profile("Year", "number"), profile("Author", "text"), profile("Status", "tags")]],
	["universal", [profile("Unknown", "mixed")]],
] as const)("recommends %s for its canonical shape", (expected, profiles) => {
	expect(rankPresets(profiles)[0]?.id).toBe(expected);
});

it("always returns all six presets in deterministic order", () => {
	expect(rankPresets([profile("Unknown", "mixed")]).map((item) => item.id)).toEqual([
		"universal", "reference", "vocabulary", "phrases", "qa", "gallery",
	]);
});

it("emits normal editable blocks and never loses a column", () => {
	const profiles = [profile("Question", "text"), profile("Answer", "markdown"), profile("Notes", "text")];
	const blocks = blocksForPreset("qa", profiles);
	expect(blocks[0]).toMatchObject({ kind: "title", columns: ["Question"] });
	expect(new Set(blocks.flatMap((block) => block.columns))).toEqual(new Set(profiles.map((item) => item.header)));
	expect(blocks.every((block) => block.id.startsWith("block-"))).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `npx vitest run tests/presets.test.ts`  
Expected: FAIL because the preset module does not exist.

- [ ] **Step 3: Define the exact preset registry and tie order**

```ts
export type PresetId = "vocabulary" | "phrases" | "qa" | "gallery" | "reference" | "universal";

export interface PresetDefinition {
	id: PresetId;
	nameKey: TranslationKey;
	descriptionKey: TranslationKey;
	icon: RibbonIcon;
	tieOrder: number;
}

export const PRESETS: readonly PresetDefinition[] = [
	{ id: "vocabulary", nameKey: "preset.vocabulary", descriptionKey: "preset.vocabulary.desc", icon: "languages", tieOrder: 2 },
	{ id: "phrases", nameKey: "preset.phrases", descriptionKey: "preset.phrases.desc", icon: "message-square-quote", tieOrder: 3 },
	{ id: "qa", nameKey: "preset.qa", descriptionKey: "preset.qa.desc", icon: "circle-help", tieOrder: 4 },
	{ id: "gallery", nameKey: "preset.gallery", descriptionKey: "preset.gallery.desc", icon: "image", tieOrder: 5 },
	{ id: "reference", nameKey: "preset.reference", descriptionKey: "preset.reference.desc", icon: "book-open", tieOrder: 1 },
	{ id: "universal", nameKey: "preset.universal", descriptionKey: "preset.universal.desc", icon: "layers-3", tieOrder: 0 },
] as const;
```

- [ ] **Step 4: Implement explainable scores and lossless mappings**

Normalize headers with the scanner's `normalizeHeader()` and classify them with these ordered, word-boundary-aware alias groups (substring matching is allowed for scripts without spaces):

```ts
const ROLE_ALIASES = {
	term: ["word", "term", "vocabulary", "слово", "термин", "лексема", "слово українською"],
	translation: ["translation", "meaning", "definition", "перевод", "значение", "переклад", "визначення"],
	pronunciation: ["ipa", "pronunciation", "transcription", "phonetic", "транскрипция", "произношение", "вимова"],
	phrase: ["phrase", "expression", "idiom", "фраза", "выражение", "вислів"],
	question: ["question", "prompt", "вопрос", "запитання"],
	answer: ["answer", "response", "ответ", "відповідь"],
	example: ["example", "sentence", "usage", "пример", "предложение", "приклад", "речення"],
	context: ["context", "situation", "literal", "контекст", "ситуация", "буквально"],
	note: ["note", "hint", "mnemonic", "comment", "explanation", "заметка", "подсказка", "мнемоника", "примечание", "объяснение", "нотатка", "пояснення"],
	image: ["image", "picture", "photo", "cover", "изображение", "картинка", "фото", "зображення"],
	title: ["title", "name", "heading", "название", "имя", "заголовок", "назва"],
	tags: ["tag", "tags", "label", "category", "тег", "теги", "категория", "мітка", "мітки"],
	description: ["description", "details", "описание", "детали", "опис", "подробиці"],
} as const;

const PRESET_ROLE_WEIGHTS = {
	vocabulary: { term: 5, translation: 4, pronunciation: 1, example: 2, note: 1, image: 1 },
	phrases: { phrase: 5, translation: 3, example: 2, context: 2, note: 1 },
	qa: { question: 5, answer: 5, note: 2, image: 1 },
	gallery: { image: 6, title: 3, tags: 2, description: 2 },
	reference: { title: 2, tags: 1 },
} as const;
```

Each matched role contributes its weight once. An inferred `image` column contributes the gallery image weight even when its header is unknown; inferred `tags` contributes the tags weight. Multiply the resulting score by `0.75 + 0.25 * meanFillRate` where fill rate is `nonEmpty / max(total, 1)`, then round to three decimals. Reference receives `min(4, max(0, profiles.length - 2))` density points. Universal has score `1`; if the highest specialized score is below `3`, set Universal to that score plus `0.001`. Return `{ id, score, reasons }`, with reason keys from the localization catalog, and sort score descending then `tieOrder` ascending.

Use pure helpers `takeHeader(profiles, used, roles, inferredType?)` and `remainingProfiles()`. Mapping order is exact: Vocabulary = term/title, translation, pronunciation/tags chips, example quote, note, image; Phrases = phrase/title, translation, context/example quote, note; Q&A = question/title, answer text, explanation/note, image; Gallery = image first/full-width, title, tags chips, description; Reference = title then remaining properties as half-width labeled blocks; Universal = first title/term/question/phrase candidate (otherwise first non-image column) then every remaining column in source order. Infer unused block kinds as image → image, tags/boolean → chips, markdown → text, everything else → text. Every input header appears exactly once across output block columns; compatible chip columns may share one block. Assign deterministic IDs `block-${presetId}-${index + 1}` so preview and finish produce the same layout. Do not store `PresetId` on the deck; a preset only seeds ordinary blocks.

- [ ] **Step 5: Run preset and layout regression tests**

Run: `npx vitest run tests/presets.test.ts tests/resolve.test.ts tests/editor-state.test.ts && npm test`  
Expected: PASS with every profile header represented exactly once unless a preset intentionally combines compatible chip columns.

- [ ] **Step 6: Record the preset checkpoint**

```bash
git add src/setup/presets.ts tests/presets.test.ts
git commit -m "feat: add smart card presets"
```

---

### Task 5: Split localization and add sixteen complete catalogs

**Files:**

- Create: `src/i18n/keys.ts`
- Create: `src/i18n/locale.ts`
- Create: `src/i18n/catalogs/en.ts`
- Create: `src/i18n/catalogs/ru.ts`
- Create: `src/i18n/catalogs/uk.ts`
- Create: `src/i18n/catalogs/es.ts`
- Create: `src/i18n/catalogs/de.ts`
- Create: `src/i18n/catalogs/fr.ts`
- Create: `src/i18n/catalogs/pt-BR.ts`
- Create: `src/i18n/catalogs/it.ts`
- Create: `src/i18n/catalogs/pl.ts`
- Create: `src/i18n/catalogs/tr.ts`
- Create: `src/i18n/catalogs/zh-CN.ts`
- Create: `src/i18n/catalogs/zh-TW.ts`
- Create: `src/i18n/catalogs/ja.ts`
- Create: `src/i18n/catalogs/ko.ts`
- Create: `src/i18n/catalogs/ar.ts`
- Create: `src/i18n/catalogs/hi.ts`
- Create: `src/i18n/catalogs/index.ts`
- Modify: `src/i18n/index.ts`
- Modify: `src/settings/settings-tab.ts`
- Test: `tests/i18n.test.ts`

**Interfaces:**

- Consumes: Obsidian language strings, `LocaleMode`, translation keys, and interpolation values.
- Produces: typed `EN`, `TranslationKey`, `TranslationCatalog`, `resolveUiLocale()`, `uiDirection()`, `formatUiNumber()`, and backward-compatible `createTranslator()`.

- [ ] **Step 1: Add failing locale, parity, interpolation, and direction tests**

```ts
it.each([
	["uk-UA", "uk"], ["pt-PT", "pt-BR"], ["zh-Hans", "zh-CN"],
	["zh-HK", "zh-TW"], ["ar-EG", "ar"], ["xx-ZZ", "en"],
] as const)("maps %s to %s", (input, expected) => {
	expect(resolveUiLocale("auto", input)).toBe(expected);
});

it("keeps all sixteen catalogs in exact parity", () => {
	const expected = Object.keys(CATALOGS.en).sort();
	for (const locale of UI_LOCALES) {
		expect(Object.keys(CATALOGS[locale]).sort()).toEqual(expected);
		expect(Object.values(CATALOGS[locale]).every((value) => value.trim().length > 0)).toBe(true);
	}
});

it("interpolates values in the active catalog", () => {
	const t = createTranslator("ru");
	expect(t("launcher.open", { count: "583" })).toBe("Открыть карточки: 583");
	expect(createTranslator("en")("launcher.summary", { cards: "3", tables: "2" }))
		.toBe("3 cards · 2 tables");
});

it("scopes RTL to Arabic only", () => {
	expect(uiDirection("ar")).toBe("rtl");
	expect(uiDirection("ru")).toBe("ltr");
});
```

- [ ] **Step 2: Run localization tests and verify red**

Run: `npx vitest run tests/i18n.test.ts`  
Expected: FAIL because only `en` and `ru` exist and the current translator has no variables.

- [ ] **Step 3: Make English the canonical typed catalog**

Move the current 239 EN entries verbatim into `catalogs/en.ts`, add this complete v3 key set, then derive types. Reuse existing generic close/back/cancel/editor keys where the action is semantically identical; do not create synonyms outside this list:

```ts
export const V3_EN_MESSAGES = {
	"command.createWithSetup": "Create deck with setup",
	"settings.language.uk": "Українська",
	"settings.language.es": "Español",
	"settings.language.de": "Deutsch",
	"settings.language.fr": "Français",
	"settings.language.pt-BR": "Português (Brasil)",
	"settings.language.it": "Italiano",
	"settings.language.pl": "Polski",
	"settings.language.tr": "Türkçe",
	"settings.language.zh-CN": "简体中文",
	"settings.language.zh-TW": "繁體中文",
	"settings.language.ja": "日本語",
	"settings.language.ko": "한국어",
	"settings.language.ar": "العربية",
	"settings.language.hi": "हिन्दी",
	"launcher.title": "Choose cards",
	"launcher.open": "Open cards: {count}",
	"launcher.summary": "{cards} cards · {tables} tables",
	"launcher.selectAtLeastOne": "Select at least one table",
	"launcher.noValidCards": "The selected tables have no valid cards",
	"launcher.loading": "Reading selected tables…",
	"launcher.loadFailed": "Could not read this deck",
	"launcher.saveFailed": "Could not save this session",
	"launcher.deckUnavailable": "This deck is no longer available",
	"launcher.retry": "Retry",
	"launcher.warnings": "Warnings: {count}",
	"scope.label": "Tables",
	"scope.all": "All tables",
	"scope.count": "Tables: {count}",
	"scope.search": "Search tables",
	"scope.selectAll": "Select all",
	"scope.clear": "Clear",
	"scope.apply": "Apply",
	"scope.groupSummary": "Selected: {selected}/{total}",
	"scope.rows": "Rows: {count}",
	"scope.columns": "Columns: {count}",
	"scope.noMatches": "No matching tables",
	"scope.missing": "Missing saved tables: {count}",
	"table.untitled": "Table {number}",
	"table.open": "Open this table",
	"table.preview": "Preview row",
	"browser.title": "Find a card",
	"browser.search": "Search card content",
	"browser.results": "Matches: {count}",
	"browser.showing": "Showing {shown} of {total}",
	"browser.noMatches": "No matching cards",
	"browser.empty": "Browse cards or start typing",
	"browser.row": "Row {number}",
	"study.search": "Find a card",
	"study.useTableTitle": "Use only this table?",
	"study.useTableDescription": "This replaces the current multi-table scope.",
	"study.useTable": "Use this table",
	"setup.title": "Set up Table Cards",
	"setup.step": "Step {current} of {total}",
	"setup.dataTitle": "Choose your data",
	"setup.dataDescription": "Add notes or folders, then choose the tables to study.",
	"setup.presetTitle": "Choose a card layout",
	"setup.presetDescription": "The recommendation uses your real columns and values.",
	"setup.finishTitle": "Name your deck",
	"setup.finishDescription": "You can change every field later in the editor.",
	"setup.next": "Continue",
	"setup.recommended": "Recommended",
	"setup.scanSummary": "{cards} cards · {tables} tables · {fields} fields",
	"setup.detectedTypes": "Detected column types",
	"setup.noSources": "Choose at least one note or folder",
	"setup.noTables": "No Markdown tables found",
	"setup.noCards": "The selected tables have no valid cards",
	"setup.deckName": "Deck name",
	"setup.ribbonHint": "Pin decks you open often.",
	"setup.finish": "Create deck",
	"setup.finishing": "Creating deck…",
	"setup.saveError": "Could not create the deck",
	"setup.closeTitle": "Discard setup?",
	"setup.closeDescription": "Your setup draft has not been saved.",
	"setup.continue": "Continue setup",
	"setup.discard": "Discard setup",
	"preset.vocabulary": "Vocabulary",
	"preset.vocabulary.desc": "Terms, translations, examples, notes, and images.",
	"preset.phrases": "Phrases",
	"preset.phrases.desc": "Phrases, translations, context, and notes.",
	"preset.qa": "Question and answer",
	"preset.qa.desc": "Questions, answers, explanations, and images.",
	"preset.gallery": "Gallery",
	"preset.gallery.desc": "Large images with titles, tags, and descriptions.",
	"preset.reference": "Reference",
	"preset.reference.desc": "A title with compact labeled properties.",
	"preset.universal": "Universal",
	"preset.universal.desc": "Every column in source order.",
	"preset.reason.header": "Column names match this layout",
	"preset.reason.type": "Detected data types fit this layout",
	"preset.reason.image": "Image content was detected",
	"preset.reason.coverage": "Most selected rows contain these fields",
	"ribbon.show": "Show this deck in the left ribbon",
	"ribbon.icon": "Ribbon icon",
	"ribbon.moveUp": "Move deck up",
	"ribbon.moveDown": "Move deck down",
	"ribbon.pinHint": "Pin only decks you open often.",
	"editor.source.chooseTables": "Choose tables",
	"editor.source.summaryAll": "All {count} tables",
	"editor.source.summarySome": "{selected} of {total} tables",
	"editor.source.summaryNone": "No tables selected",
	"diagnostic.sourceMissing": "Source is missing: {path}",
	"diagnostic.tableMissing": "A selected table is missing",
	"diagnostic.requiredEmpty": "Rows skipped because required fields are empty: {count}",
	"diagnostic.brokenImage": "Missing image files: {count}",
} as const;

```

After copying those entries into the complete `EN` object, derive the public types from that full object:

```ts

export type TranslationKey = keyof typeof EN;
export type TranslationCatalog = { [K in TranslationKey]: string };
export type TranslationVars = Record<string, string | number>;
export type Translator = (key: TranslationKey, vars?: TranslationVars) => string;
```

`createTranslator(locale)` resolves `const catalog = CATALOGS[locale] ?? EN` and each message as `catalog[key] ?? EN[key]`. Implement escaped literal replacement with `/\{([a-zA-Z0-9_]+)\}/g`; missing variables leave the token visible in development rather than silently deleting content.

- [ ] **Step 4: Add locale resolution and cached number formatting**

Canonicalize with `Intl.getCanonicalLocales()` inside a guarded pure function, then use explicit aliases for Portuguese and Chinese scripts/regions. Cache `Intl.NumberFormat` by locale in a module `Map`. `uiDirection(locale)` returns `"rtl"` only for `ar`.

- [ ] **Step 5: Translate every catalog and enforce compile-time parity**

Each locale file exports all canonical keys. Use a typed core excerpt while translating, then merge it into the full catalog only after the compiler reports no missing key:

```ts
import type { TranslationCatalog } from "../keys";

export const UK_CORE = {
	"launcher.title": "Виберіть картки",
	"launcher.open": "Відкрити картки: {count}",
	"launcher.summary": "{cards} карток · {tables} таблиць",
	"launcher.selectAtLeastOne": "Виберіть щонайменше одну таблицю",
	"setup.recommended": "Рекомендовано",
	"ribbon.show": "Показувати цю колоду на лівій стрічці",
} satisfies Pick<TranslationCatalog,
	| "launcher.title"
	| "launcher.open"
	| "launcher.summary"
	| "launcher.selectAtLeastOne"
	| "setup.recommended"
	| "ribbon.show"
>;
```

The shipped export is `UK`, not `UK_CORE`, and must satisfy the complete `TranslationCatalog`; repeat that exact full-key constraint for every locale. Use native language names in the language picker. Do not translate brand names, file paths, table headers, deck names, or card content. No catalog may ship partially.

- [ ] **Step 6: Keep a small compatibility facade and style the language picker**

`src/i18n/index.ts` re-exports types/functions/catalogs so existing imports keep compiling. Replace the settings tab's native language dropdown with the existing `Listbox`, populated from `UI_LOCALES`, while retaining `auto` first. On every settings rerender, set `lang` and `dir` on the plugin settings root from the resolved locale; never set direction on the whole Obsidian document.

- [ ] **Step 7: Run parity, type, and full tests**

Run: `npx vitest run tests/i18n.test.ts && npx tsc --noEmit && npm test`  
Expected: PASS with 16 equal key sets, no blank values, correct aliases, and no undefined runtime translation.

- [ ] **Step 8: Record the localization checkpoint**

```bash
git add src/i18n src/settings/settings-tab.ts tests/i18n.test.ts
git commit -m "feat: add complete table cards localization"
```

---

### Task 6: Model mandatory launcher state as a pure reducer

**Files:**

- Create: `src/session/launcher-state.ts`
- Test: `tests/launcher-state.test.ts`

**Interfaces:**

- Consumes: enabled `Deck[]`, optional `DeckOpenRequest`, each deck's catalog/cards, and persisted `DeckProgress`.
- Produces: `DeckOpenRequest`, `LauncherState`, `LauncherAction`, `createLauncherState()`, `reduceLauncherState()`, `selectedTableKeys()`, `launcherCards()`, and `canStartSession()`.

- [ ] **Step 1: Write failing state-transition tests**

Define self-contained fixtures:

```ts
const decks = [createDeck({ id: "verbs", name: "Verbs" }), createDeck({ id: "phrases", name: "Phrases" })];
const result: DeckLoadResult = {
	cards: [
		{ cells: { Value: parseCell("remain") }, headers: ["Value"], origin: { tableKey: "verbs", tableLabel: "Verbs", tableNumber: 1, sourcePath: "verbs.md", rowNumber: 3, rowKey: "verbs:remain" } },
		{ cells: { Value: parseCell("cat") }, headers: ["Value"], origin: { tableKey: "nouns", tableLabel: "Nouns", tableNumber: 1, sourcePath: "nouns.md", rowNumber: 3, rowKey: "nouns:cat" } },
	],
	tables: [],
	catalog: [
		{ key: "verbs", selector: { headerSignature: "verbs", occurrence: 0 }, sourcePath: "verbs.md", sourceIds: ["verbs"], label: "Verbs", tableNumber: 1, headingPath: ["Verbs"], headers: ["Value"], rowCount: 1 },
		{ key: "nouns", selector: { headerSignature: "nouns", occurrence: 0 }, sourcePath: "nouns.md", sourceIds: ["nouns"], label: "Nouns", tableNumber: 1, headingPath: ["Nouns"], headers: ["Value"], rowCount: 1 },
	],
	profiles: [],
	diagnostics: [],
};

const initialState = (): LauncherState => createLauncherState(decks, { deckId: "verbs", lockedDeck: false });

function loadedState(scope: StudyScope = { mode: "all" }): LauncherState {
	const loading = reduceLauncherState(initialState(), { type: "loading", deckId: "verbs", requestId: 1 });
	return reduceLauncherState(loading, { type: "loaded", deckId: "verbs", requestId: 1, result, savedScope: scope });
}
```

```ts
it("locks a ribbon launch to its requested deck", () => {
	const state = createLauncherState(decks, { deckId: "verbs", lockedDeck: true });
	const attempted = reduceLauncherState(state, { type: "selectDeck", deckId: "phrases" });
	expect(attempted.deckId).toBe("verbs");
	expect(attempted.lockedDeck).toBe(true);
});

it("restores valid saved tables but never auto-starts", () => {
	const state = reduceLauncherState(
		createLauncherState(decks, { deckId: "verbs", lockedDeck: false }),
		{ type: "loading", deckId: "verbs", requestId: 1 },
	);
	const loaded = reduceLauncherState(state, {
		type: "loaded",
		deckId: "verbs",
		requestId: 1,
		result,
		savedScope: { mode: "tables", tableKeys: ["verbs", "gone"] },
	});
	expect(loaded.scope).toEqual({ mode: "tables", tableKeys: ["verbs"] });
	expect(loaded.phase).toBe("choose");
	expect(canStartSession(loaded)).toBe(true);
});

it("uses an explicit request scope before persisted progress", () => {
	const state = createLauncherState(decks, {
		deckId: "verbs",
		lockedDeck: true,
		initialScope: { mode: "tables", tableKeys: ["nouns"] },
	});
	const loading = reduceLauncherState(state, { type: "loading", deckId: "verbs", requestId: 1 });
	const loaded = reduceLauncherState(loading, {
		type: "loaded",
		deckId: "verbs",
		requestId: 1,
		result,
		savedScope: { mode: "tables", tableKeys: ["verbs"] },
	});
	expect(loaded.scope).toEqual({ mode: "tables", tableKeys: ["nouns"] });
});

it("clear creates an explicit empty selection and disables start", () => {
	const cleared = reduceLauncherState(loadedState(), { type: "clearTables" });
	expect(cleared.scope).toEqual({ mode: "tables", tableKeys: [] });
	expect(launcherCards(cleared)).toEqual([]);
	expect(canStartSession(cleared)).toBe(false);
});

it("unchecking from all materializes the remaining catalog keys", () => {
	const state = reduceLauncherState(loadedState({ mode: "all" }), { type: "toggleTable", tableKey: "verbs" });
	expect(state.scope).toEqual({ mode: "tables", tableKeys: ["nouns"] });
});

it("discards a stale asynchronous load", () => {
	const current = reduceLauncherState(initialState(), { type: "loading", deckId: "phrases", requestId: 2 });
	expect(reduceLauncherState(current, { type: "loaded", deckId: "verbs", requestId: 1, result, savedScope: { mode: "all" } }))
		.toBe(current);
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `npx vitest run tests/launcher-state.test.ts`  
Expected: FAIL because launcher state does not exist.

- [ ] **Step 3: Define request, phase, and reducer contracts**

```ts
export interface DeckOpenRequest {
	deckId?: string;
	lockedDeck: boolean;
	initialScope?: StudyScope;
	deckOverride?: Deck;
	persistProgress?: boolean;
}

export interface LauncherState {
	phase: "loading" | "choose" | "error";
	deckId: string | null;
	lockedDeck: boolean;
	requestId: number;
	initialScope: StudyScope | null;
	scope: StudyScope;
	result: DeckLoadResult | null;
	error: { code: "deckUnavailable" | "loadFailed"; detail?: string } | null;
}

export type LauncherAction =
	| { type: "selectDeck"; deckId: string }
	| { type: "loading"; deckId: string; requestId: number }
	| { type: "loaded"; deckId: string; requestId: number; result: DeckLoadResult; savedScope: StudyScope }
	| { type: "failed"; deckId: string; requestId: number; detail?: string }
	| { type: "toggleTable"; tableKey: string }
	| { type: "selectAllTables" }
	| { type: "clearTables" }
	| { type: "replaceScope"; scope: StudyScope };
```

Reducers return the identical object for stale load IDs and forbidden deck changes. On the first successful load, normalize `state.initialScope ?? action.savedScope`; clear `initialScope` after it is consumed, and clear it immediately when an unlocked launcher changes deck. `launcherCards()` applies the scope to already-loaded cards. `canStartSession()` requires choose phase, at least one selected table, and at least one valid card.

`createLauncherState()` includes `deckOverride` as the selected deck even when it is not present in persisted settings. A locked request for a missing persisted deck enters a localized unavailable-deck error instead of silently selecting another deck. `persistProgress` defaults to true; `CardsModal` reads it in Tasks 7–8 and suppresses all settings mutations for transient editor previews.

- [ ] **Step 4: Keep counts derived, not duplicated in state**

Expose `selectedTableKeys(state)`, `selectedTableCount(state)`, `launcherCards(state)`, and `launcherWarningCount(state)`. Never store derived counts that can drift after table toggles.

- [ ] **Step 5: Run launcher and filter tests**

Run: `npx vitest run tests/launcher-state.test.ts tests/deck-filter.test.ts && npm test`  
Expected: PASS.

- [ ] **Step 6: Record the launcher-state checkpoint**

```bash
git add src/session/launcher-state.ts tests/launcher-state.test.ts
git commit -m "feat: add session launcher state"
```

---

### Task 7: Build the mandatory session launcher and reusable scope picker

**Files:**

- Create: `src/ui/ScopePicker.ts`
- Create: `src/ui/SessionLauncher.ts`
- Modify: `src/ui/CardsModal.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/editor/controls/Sheet.ts`
- Modify: `styles.css`

**Interfaces:**

- Consumes: `LauncherState`, enabled decks, `DeckLoadResult.catalog`, `Translator`, `Platform.isMobile`, and launcher actions.
- Produces: `ScopePicker`, `SessionLauncher`, and a `CardsModal` launch phase that emits `{ deck, result, scope }` only after explicit confirmation.

- [ ] **Step 1: Extend `Sheet` for a full-height mobile selector**

Add an optional `variant: "default" | "full"` and `ariaLabelledBy` contract without changing current editor sheets. The full variant keeps a sticky header/footer, independently scrolling body, focus trap, opener restoration, and Escape close behavior.

- [ ] **Step 2: Implement grouped selection with one change callback**

```ts
export interface ScopePickerOptions {
	catalog: TableCatalogItem[];
	scope: StudyScope;
	t: Translator;
	mobile: boolean;
	onChange: (scope: StudyScope) => void;
	onClose: () => void;
}

export class ScopePicker {
	constructor(parent: HTMLElement, options: ScopePickerOptions);
	destroy(): void;
}
```

Group catalog items by `sourcePath`. Search matches normalized heading, file path, or header. Each group includes selected/total count and a group toggle. Repeated normalized labels append the compact parent path; repeats within the same file also append localized `Table N` using `tableNumber`. `Select all` emits `{ mode: "all" }`; `Clear` emits `{ mode: "tables", tableKeys: [] }`. Toggling from `all` first materializes all keys, then removes the target.

- [ ] **Step 3: Render launcher states without a dashboard layout**

```ts
export interface SessionLauncherOptions {
	decks: Deck[];
	request: DeckOpenRequest;
	settings: PluginSettings;
	t: Translator;
	locale: UiLocale;
	loadDeck: (deck: Deck) => Promise<DeckLoadResult>;
	onStart: (selection: { deck: Deck; result: DeckLoadResult; scope: StudyScope }) => Promise<void>;
	onClose: () => void;
}
```

General requests render the styled deck `Listbox`; locked requests render only the deck name. Below it, render one scope chip, live `cards · tables` summary, warnings, and primary action. Loading uses fixed-size skeleton rows. Error state maps its error code to localized copy, keeps deck/scope context, and adds Retry. Empty selection and zero valid rows disable the primary action with distinct localized messages. Await `onStart`, disable the primary button while saving, and keep the launcher intact with `launcher.saveFailed` if persistence rejects. The `CardsModal` load callback calls `loadDeckData(app, deck, { untitledTableLabel: (number) => t("table.untitled", { number }) })`.

- [ ] **Step 4: Make `CardsModal` open in launch phase every time**

Change constructor to accept an optional request:

```ts
export interface CardsModalHost {
	settings: PluginSettings;
	saveSettings: () => Promise<void>;
	getTranslator: () => Translator;
	getLocale: () => UiLocale;
}

constructor(app: App, host: CardsModalHost, request: DeckOpenRequest = { lockedDeck: false })
```

`onOpen()` creates component/modal roots and renders `SessionLauncher`; it does not call `buildChrome()` until `onStart`. Loading, changing a deck, opening the scope picker, and closing the launcher do not mutate `lastDeckId` or `perDeck`. On start, retain the supplied `DeckLoadResult` and filter/order cards. For persistent requests, snapshot `lastDeckId` and the prior progress entry, apply the confirmed values, await one save, and roll the in-memory snapshot back if it fails; only then build study chrome. Transient editor previews keep all progress in memory and build immediately. Do not call `loadDeckData()` again.

In `src/main.ts`, add `getLocale(): UiLocale`, make `getTranslator()` call `createTranslator(this.getLocale())`, and pass the plugin itself as `CardsModalHost`. This keeps the new host contract compiling before setup/ribbon tasks modify main again.

- [ ] **Step 5: Apply locale direction at the plugin root**

Read locale through `host.getLocale()`, set `this.modalEl.dir = uiDirection(locale)`, and set `lang` to the resolved locale. Scope-picker search and plugin labels inherit that direction; table headings and paths use `dir="auto"`.

- [ ] **Step 6: Add launcher CSS with responsive states**

Add `.tc-launcher`, `.tc-launcher-deck`, `.tc-scope-trigger`, `.tc-scope-groups`, `.tc-scope-group`, `.tc-scope-row`, `.tc-launcher-summary`, `.tc-launcher-footer`, skeleton, warning, and error selectors. Use logical properties, one border layer, no gradients, 120–160 ms transitions, safe-area footer padding, and reduced-motion overrides.

- [ ] **Step 7: Verify compile and current tests before browser work**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`  
Expected: PASS. UI screenshot verification is reserved for Task 12 after fixtures exist.

- [ ] **Step 8: Record the launcher UI checkpoint**

```bash
git add src/ui/ScopePicker.ts src/ui/SessionLauncher.ts src/ui/CardsModal.ts src/main.ts src/ui/editor/controls/Sheet.ts styles.css
git commit -m "feat: add mandatory table session launcher"
```

---

### Task 8: Add scoped study switching and exact-card browser

**Files:**

- Create: `src/ui/CardBrowser.ts`
- Modify: `src/ui/CardsModal.ts`
- Modify: `src/ui/CardView.ts`
- Modify: `styles.css`

**Interfaces:**

- Consumes: confirmed `DeckLoadResult`, active `StudyScope`, `SearchEntry[]`, and exact `Card.origin.rowKey`.
- Produces: scope switching without reload, grouped search results, exact-card opening, and source metadata in study cards.

- [ ] **Step 1: Add browser interfaces and stale-result protection**

```ts
export interface CardBrowserOptions {
	index: SearchEntry[];
	catalog: TableCatalogItem[];
	scope: StudyScope;
	t: Translator;
	onScopeChange: (scope: StudyScope) => void;
	onOpenCard: (rowKey: string) => void;
	onClose: () => void;
}

export class CardBrowser {
	constructor(parent: HTMLElement, options: CardBrowserOptions);
	destroy(): void;
}
```

Every rendered result captures the current render version. Scope or query changes increment it; a click from an old version returns without opening a card.

- [ ] **Step 2: Render grouped, bounded results**

Search only active-scope entries, mount at most 100, report full total, and group contiguous results by `tableKey`. Each result shows primary text, the first matching value snippet, table label, file basename, and row number. Empty query shows the first cards in source order; zero matches keeps the scope button and search input usable.

- [ ] **Step 3: Add scope and search actions to study chrome**

Replace the study deck picker with fixed deck text plus a compact scope chip and search icon. Clicking scope opens `ScopePicker`; clicking search opens `CardBrowser`. Both use side sheets on desktop and full bottom sheets on mobile. Escape closes listbox → browser/scope sheet → modal in that order.

- [ ] **Step 4: Update scope without rescanning**

Keep `allCards`, `catalog`, and `searchIndex` for the modal lifetime. `applyScope(nextScope)` filters and orders the existing cards, keeps the current row key when present, otherwise restores saved key/index, updates progress, and persists once. No vault API is called.

- [ ] **Step 5: Open an exact result and persist both locators**

`openCard(rowKey)` finds the card in the active ordered list, sets the in-memory index/key, rerenders, resets stage/internal scrolling, and closes the browser. It writes `progress.index`, `progress.cardKey`, and settings only when `request.persistProgress !== false`. A missing key leaves the browser open and rerenders its current results.

- [ ] **Step 6: Render origin metadata and isolate content direction**

In `CardView`, use `card.card.origin.sourcePath` for Markdown/image resolution. Add a secondary source line with table label and file basename outside the configurable block grid. `CardsModal` derives its display label from the retained catalog and appends localized `Table N` only when the same label repeats in one file. Set `dir="auto"` on source text, block values, captions, and missing-image source text; do not force user data into Arabic RTL.

- [ ] **Step 7: Preserve navigation, shuffle, and current card**

Every successful step updates the modal's in-memory card key and, for persistent sessions, `DeckProgress.cardKey`. Shuffle reorders the active scoped cards and restores the previous row key. Switching scope retains the card if its table remains selected. Existing arrow, `S`, swipe, image lightbox, reduced motion, and fixed footer behavior remain unchanged.

- [ ] **Step 8: Run code verification**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`  
Expected: PASS.

- [ ] **Step 9: Record the browser checkpoint**

```bash
git add src/ui/CardBrowser.ts src/ui/CardsModal.ts src/ui/CardView.ts styles.css
git commit -m "feat: browse and open exact table cards"
```

---

### Task 9: Build the smart first-run wizard

**Files:**

- Create: `src/setup/state.ts`
- Create: `src/ui/sources/SourcePickers.ts`
- Create: `src/ui/sources/TableSelectionView.ts`
- Create: `src/ui/SetupWizard.ts`
- Modify: `src/main.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `tests/stubs/obsidian.ts`
- Test: `tests/setup-state.test.ts`

**Interfaces:**

- Consumes: fresh `PluginSettings`, selected sources, cached `DeckScanResult`, selected catalog/profiles/cards, six preset rankings, and translator.
- Produces: `SetupState`, `SetupAction`, `reduceSetupState()`, `finishSetup()`, reusable source/table pickers, and `SetupWizard`.

- [ ] **Step 1: Write failing draft and finish tests**

Define these complete fixtures:

```ts
const profiles: ColumnProfile[] = [
	{ header: "Word", inferredType: "text", confidence: 1, total: 1, nonEmpty: 1, unique: 1, samples: ["remain"], warnings: [] },
	{ header: "Translation", inferredType: "text", confidence: 1, total: 1, nonEmpty: 1, unique: 1, samples: ["оставаться"], warnings: [] },
];

function source(path: string): DeckSource {
	return { id: `source-${path}`, kind: "file", path, tables: { mode: "all" } };
}

const setupResult: DeckLoadResult = {
	cards: [{
		cells: { Word: parseCell("remain"), Translation: parseCell("оставаться") },
		headers: ["Word", "Translation"],
		origin: { tableKey: "words", tableLabel: "Words", tableNumber: 1, sourcePath: "words.md", rowNumber: 3, rowKey: "words:remain" },
	}],
	tables: [],
	catalog: [{ key: "words", selector: { headerSignature: "word", occurrence: 0 }, sourcePath: "words.md", sourceIds: ["source-words.md"], label: "Words", tableNumber: 1, headingPath: ["Words"], headers: ["Word", "Translation"], rowCount: 1 }],
	profiles,
	diagnostics: [],
};

function completeSetupState(): SetupState {
	return {
		...createSetupState(),
		step: "finish",
		sources: [source("words.md")],
		result: setupResult,
		presetId: "vocabulary",
		deckName: "English words",
		ribbonVisible: true,
		ribbonIcon: "languages",
		dirty: true,
	};
}
```

```ts
it("keeps source and preset changes inside a draft", () => {
	const initial = createSetupState();
	const withSource = reduceSetupState(initial, { type: "replaceSources", sources: [source("words.md")] });
	const withPreset = reduceSetupState(withSource, { type: "selectPreset", presetId: "vocabulary" });
	expect(initial.sources).toEqual([]);
	expect(withPreset).toMatchObject({ step: "data", presetId: "vocabulary" });
});

it("requires source, table, valid card, preset, and name before finish", () => {
	expect(canFinishSetup(createSetupState())).toBe(false);
	expect(canFinishSetup(completeSetupState())).toBe(true);
});

it("creates one ordinary deck and marks setup complete", () => {
	const settings = mergeSettings(null);
	const result = finishSetup(settings, completeSetupState(), profiles, { deckId: "deck-english", seed: 42 });
	expect(result.setupVersion).toBe(1);
	expect(result.decks).toHaveLength(1);
	expect(result.decks[0]).toMatchObject({
		name: "English words",
		ribbon: { visible: true, icon: "languages" },
	});
	expect(result.decks[0]?.blocks.flatMap((block) => block.columns)).toContain("Translation");
	expect(result.perDeck["deck-english"]).toEqual({
		index: 0,
		shuffle: false,
		seed: 42,
		scope: { mode: "all" },
		cardKey: null,
	});
});
```

- [ ] **Step 2: Run the state test and verify red**

Run: `npx vitest run tests/setup-state.test.ts`  
Expected: FAIL because setup state does not exist.

- [ ] **Step 3: Implement a three-step pure draft reducer**

```ts
export type SetupStep = "data" | "preset" | "finish";

export interface SetupState {
	step: SetupStep;
	sources: DeckSource[];
	scan: DeckScanResult | null;
	result: DeckLoadResult | null;
	presetId: PresetId | null;
	deckName: string;
	ribbonVisible: boolean;
	ribbonIcon: RibbonIcon;
	dirty: boolean;
}
```

Actions replace sources/result, choose preset, name/icon/ribbon, and move only to an allowed next step. `finishSetup(settings, state, profiles, { deckId, seed })` clones settings, appends one `createDeck()` built from `blocksForPreset()`, initializes progress as index `0`, deck-default shuffle, the supplied seed, scope `all`, and `cardKey: null`, sets `lastDeckId`, and sets `setupVersion: 1`; it has no persistence or clock/random side effect. `SetupWizard` generates the ID and seed once immediately before calling it.

- [ ] **Step 4: Extract reusable source pickers and table-selection view**

Move the existing `MarkdownFilePicker` and `FolderPicker` behavior into `SourcePickers.ts`. Build `TableSelectionView` with this contract:

```ts
export interface TableSelectionViewOptions {
	source: DeckSource;
	tables: ParsedTable[];
	t: Translator;
	onChange: (source: DeckSource) => void;
	onOpenTable?: (table: ParsedTable) => void;
	onBack: () => void;
}
```

Group folder results by file, search heading/path/header, support all/none/individual selectors, show row/column counts, and emit a complete cloned `DeckSource`. Expanding a row shows one compact label/value preview built from its first data row; the optional `Open this table` action is separate and calls `onOpenTable`. It must work inside either the setup wizard or editor sheet. All UI catalog loads pass `untitledTableLabel: (number) => t("table.untitled", { number })`.

- [ ] **Step 5: Render the wizard without advanced editor controls**

Step 1 renders source cards and `TableSelectionView`. Compute a topology key from source IDs, kinds, and paths: changing that key runs `scanDeckSources()` once, while changing only `.tables` calls `buildDeckDataFromScan()` against the cached scan with zero vault reads. A monotonically increasing scan version discards stale async results. Step 2 shows all six ranked presets, compatibility reasons, a `Recommended` badge, and a real representative card through existing `renderCard()`. Step 3 edits deck name, curated ribbon icon, and default-on first-deck ribbon checkbox, then displays `cards · tables · fields` summary. The wizard root receives the resolved locale's `lang`/`dir`, while its real-row preview keeps `dir="auto"`.

Back preserves draft state. Close with a dirty draft asks `Continue setup` or `Discard setup`; discard is the only path that destroys the draft. Finish disables itself during one `saveSettings()` call; failure restores the button and keeps the draft.

- [ ] **Step 6: Trigger setup only for genuinely fresh installs**

In `main.onload()`:

```ts
if (this.settings.setupVersion === 0) {
	this.app.workspace.onLayoutReady(() => this.openSetup());
}
```

Always register `Create deck with setup` in the command palette and add the same action to settings. Manual setup appends a deck and never replaces existing decks.

If `Open table cards` is invoked with no enabled deck, open the setup wizard rather than an empty study modal. A migrated user who deliberately deleted all decks gets the same manual creation path without resetting other settings.

- [ ] **Step 7: Extend Obsidian stubs and run tests/build**

Add `Workspace.onLayoutReady`, `FuzzySuggestModal`, `Plugin.addCommand`, and modal lifecycle members used by the new modules. Run: `npx vitest run tests/setup-state.test.ts tests/presets.test.ts && npm test && npm run lint && npx tsc --noEmit && npm run build`  
Expected: PASS.

- [ ] **Step 8: Record the setup checkpoint**

```bash
git add src/setup/state.ts src/ui/sources src/ui/SetupWizard.ts src/main.ts src/settings/settings-tab.ts tests/setup-state.test.ts tests/stubs/obsidian.ts
git commit -m "feat: add smart first-run setup"
```

---

### Task 10: Reconcile deck-specific ribbon buttons through the public API

**Files:**

- Create: `src/ui/RibbonDecks.ts`
- Modify: `src/main.ts`
- Modify: `src/settings/settings-tab.ts`
- Test: `tests/ribbon.test.ts`

**Interfaces:**

- Consumes: ordered v3 decks, `Plugin.addRibbonIcon`, deck open callback, and translator.
- Produces: pure `ribbonSpecs()`, `RibbonDecks.sync()`, `RibbonDecks.destroy()`, and immediate refresh after settings saves.

- [ ] **Step 1: Write failing ribbon descriptor tests**

Define the descriptor fixture exactly once:

```ts
function deck(
	id: string,
	options: { enabled?: boolean; visible?: boolean; icon?: RibbonIcon } = {},
): Deck {
	return createDeck({
		id,
		name: id,
		enabled: options.enabled ?? true,
		ribbon: { visible: options.visible ?? false, icon: options.icon ?? "layers-3" },
	});
}
```

```ts
it("returns one descriptor per enabled visible deck in deck order", () => {
	expect(ribbonSpecs([
		deck("hidden", { enabled: true, visible: false }),
		deck("verbs", { enabled: true, visible: true, icon: "languages" }),
		deck("disabled", { enabled: false, visible: true }),
		deck("phrases", { enabled: true, visible: true, icon: "message-square-quote" }),
	])).toEqual([
		{ deckId: "verbs", title: "verbs", icon: "languages" },
		{ deckId: "phrases", title: "phrases", icon: "message-square-quote" },
	]);
});

it("normalizes a deleted or invalid icon through deck migration", () => {
	expect(mergeDeck({ id: "x", name: "X", ribbon: { visible: true, icon: "not-real" } }).ribbon.icon)
		.toBe("layers-3");
});

it("removes stale elements and keeps callbacks locked to exact deck ids", () => {
	const removed: string[] = [];
	const opened: string[] = [];
	const callbacks: Array<() => void> = [];
	const controller = new RibbonDecks({
		add: (_icon, title, callback) => {
			callbacks.push(() => callback({} as MouseEvent));
			return { remove: () => removed.push(title) } as HTMLElement;
		},
		openDeck: (deckId) => opened.push(deckId),
	});
	controller.sync([deck("verbs", { visible: true }), deck("phrases", { visible: true })]);
	callbacks[1]?.();
	controller.sync([deck("verbs", { visible: true })]);
	expect(opened).toEqual(["phrases"]);
	expect(removed).toEqual(["verbs", "phrases"]);
});
```

- [ ] **Step 2: Run focused tests and verify red**

Run: `npx vitest run tests/ribbon.test.ts tests/settings.test.ts`  
Expected: FAIL because ribbon descriptors/controller do not exist.

- [ ] **Step 3: Implement a small reconcile controller**

```ts
export interface RibbonSpec {
	deckId: string;
	title: string;
	icon: RibbonIcon;
}

export interface RibbonHost {
	add: (icon: string, title: string, callback: (event: MouseEvent) => void) => HTMLElement;
	openDeck: (deckId: string) => void;
}

export class RibbonDecks {
	private elements: HTMLElement[] = [];

	constructor(private readonly host: RibbonHost) {}

	sync(decks: Deck[]): void {
		this.destroy();
		for (const spec of ribbonSpecs(decks)) {
			this.elements.push(this.host.add(spec.icon, spec.title, () => this.host.openDeck(spec.deckId)));
		}
	}

	destroy(): void {
		for (const element of this.elements) element.remove();
		this.elements = [];
	}
}
```

Use `this.addRibbonIcon.bind(this)` from the plugin host; do not query or mutate Obsidian's private ribbon container.

- [ ] **Step 4: Wire deck-locked launches and live refresh**

`openDeck(deckId)` calls `new CardsModal(app, host, { deckId, lockedDeck: true }).open()`. The generic command calls `{ lockedDeck: false }`. After every successful `saveSettings()`, call `ribbonDecks.sync(settings.decks)`. `onunload()` calls `destroy()`; removed/deleted/renamed/reordered decks therefore update without restart.

- [ ] **Step 5: Add compact deck controls without a second manager**

In each settings deck row, add `Show in ribbon`, curated icon `Listbox`, and accessible up/down buttons that reorder `settings.decks`. Disable pinning while the deck itself is disabled but preserve the stored preference. The editor Finish/Save callback returns to settings and triggers the same central save/reconcile path.

- [ ] **Step 6: Keep commands as the ribbon-independent path**

Register only stable generic commands: Open table cards, Edit current deck, and Create deck with setup. Exact-card search remains inside the mandatory launcher/study flow. Do not dynamically register one command per deck and do not assign default hotkeys.

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run tests/ribbon.test.ts tests/settings.test.ts && npm test && npm run lint && npx tsc --noEmit && npm run build`  
Expected: PASS.

- [ ] **Step 8: Record the ribbon checkpoint**

```bash
git add src/ui/RibbonDecks.ts src/main.ts src/settings/settings-tab.ts tests/ribbon.test.ts
git commit -m "feat: add deck-specific ribbon buttons"
```

---

### Task 11: Simplify editor multi-table selection and preview exact tables

**Files:**

- Create: `src/ui/editor/SourcesSection.ts`
- Create: `src/ui/editor/ProfilesSection.ts`
- Modify: `src/ui/editor/FieldsSheet.ts`
- Modify: `src/ui/editor/DeckEditorModal.ts`
- Modify: `src/editor/state.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`
- Test: `tests/editor-state.test.ts`

**Interfaces:**

- Consumes: editor draft, cached `DeckScanResult`, selected profiles, shared `TableSelectionView`, and `DeckOpenRequest`.
- Produces: compact source summaries, a focused table-selection route, v3 source edits through reducer history, and transient exact-table launch from the draft.

- [ ] **Step 1: Add failing v3 source undo tests**

Define the source helpers in the test:

```ts
const selector = (headerSignature: string, occurrence: number): TableSelector => ({ headerSignature, occurrence });

const sourceAll = (path: string): DeckSource => ({
	id: `source-${path}`,
	kind: "file",
	path,
	tables: { mode: "all" },
});
```

```ts
it("changes multiple table selectors through one undoable source action", () => {
	const initial = createEditorState(createDeck({ sources: [sourceAll("words.md")] }));
	const selectors = [selector("a", 0), selector("b", 0)];
	const next = reduceEditorState(initial, {
		type: "replaceSources",
		sources: [{ ...initial.draft.sources[0]!, tables: { mode: "include", selectors } }],
	});
	expect(next.draft.sources[0]?.tables).toEqual({ mode: "include", selectors });
	expect(undo(next).draft.sources[0]?.tables).toEqual({ mode: "all" });
});
```

- [ ] **Step 2: Run focused tests and verify red where v2 fixtures remain**

Run: `npx vitest run tests/editor-state.test.ts`  
Expected: FAIL until source fixtures/actions use v3 `.tables` consistently.

- [ ] **Step 3: Split the 374-line fields panel by responsibility**

`SourcesSection` renders metrics, compact source cards, add file/folder, summary (`all tables`, `3 of 8 tables`, or `no tables`), warnings, Choose tables, and remove. It holds a local route `{ view: "list" } | { view: "tables"; sourceId: string }`; choosing a source replaces the same sheet body and adds Back rather than stacking a modal. `DeckEditorModal` caches one `DeckScanResult` by source topology and uses `buildDeckDataFromScan()` for table, block, type, and preview changes; only adding/removing/changing a source path rescans the vault.

`ProfilesSection` contains only effective profiles, type listboxes, warnings, samples, enabled columns, and automatic layout confirmation. `FieldsSheet` composes both and owns no file/folder modal classes.

- [ ] **Step 4: Reuse the shared table selector for arbitrary subsets**

Pass every available table for the active source to `TableSelectionView`. An all selection stays `{ mode: "all" }`; individual choices emit `{ mode: "include", selectors: [...] }`, including an explicit empty array. Folder tables group by file. A missing persisted selector remains visible as a repair warning rather than redirecting silently. Expanded table rows show the shared compact first-row preview without launching a session.

- [ ] **Step 5: Launch an exact table from the unsaved draft safely**

Extend `EditorHost`:

```ts
onOpenDraftSession?: (deck: Deck, table: ParsedTable) => void;
```

The `Open this table` action clones the current draft, replaces the clone's sources with one ephemeral file source for `table.sourcePath` and `{ mode: "include", selectors: [table.selector] }`, and opens `CardsModal` with `{ deckId: draft.id, lockedDeck: true, deckOverride: draft, initialScope: { mode: "all" }, persistProgress: false }`. It does not save the draft or mutate persisted progress. The mandatory launcher still appears with that exact table preselected.

Add `openDraftSession(deck, table)` to `SettingsHost`; `TableCardsPlugin` implements it and `TableCardsSettingTab.openEditor()` passes it through as `EditorHost.onOpenDraftSession`. Editor and settings catalog loads pass the active localized untitled-table formatter. Keep modal construction centralized in the plugin rather than importing `CardsModal` into source/editor components.

- [ ] **Step 6: Preserve editor focus and mobile behavior**

Back from table selection focuses the originating Choose tables button. Source cards expose only two primary actions at once. On phone, the existing Fields bottom sheet remains one layer with a sticky Back/header and footer; no nested sheet is created. The editor root uses the resolved plugin `lang`/`dir`; canvas values and source paths remain `dir="auto"`.

- [ ] **Step 7: Run editor and code verification**

Run: `npx vitest run tests/editor-state.test.ts tests/deck-load.test.ts && npm test && npm run lint && npx tsc --noEmit && npm run build`  
Expected: PASS.

- [ ] **Step 8: Record the editor checkpoint**

```bash
git add src/ui/editor/SourcesSection.ts src/ui/editor/ProfilesSection.ts src/ui/editor/FieldsSheet.ts src/ui/editor/DeckEditorModal.ts src/editor/state.ts src/settings/settings-tab.ts src/main.ts styles.css tests/editor-state.test.ts
git commit -m "feat: simplify multi-table deck editing"
```

---

### Task 12: Refine visual fixtures, accessibility, docs, and deployment

**Files:**

- Create: `preview/launcher.html`
- Create: `preview/setup.html`
- Modify: `preview/v2.html`
- Modify: `preview/editor.html`
- Modify: `styles.css`
- Modify: `README.md`
- Modify: `README.ru.md`
- Modify: `docs/ux-audit-2026-08-18.md`
- Modify: `scripts/deploy.mjs` only if its three-artifact allowlist has regressed.

**Interfaces:**

- Consumes: final v3 class names, interaction hierarchy, localized fixtures, and built artifacts.
- Produces: deterministic launcher/setup/study/editor fixtures, updated documentation, clean automated gates, and byte-verified vault deployment.

- [ ] **Step 1: Create deterministic launcher and setup fixtures**

`preview/launcher.html` includes: general deck picker, locked-deck state, grouped table selector, selected/empty/loading/error states, mobile full sheet, counts, and a card-browser view. `preview/setup.html` includes all three steps, recommended preset, six presets, real-row preview, ribbon icon choice, and RTL toggle. Fixture buttons use `aria-pressed`, focus restoration, Escape layer order, and no external assets.

- [ ] **Step 2: Update study and editor fixtures to v3**

`preview/v2.html` starts on launcher rather than directly on a card, then exposes study scope/search/source metadata states. `preview/editor.html` replaces all/single source choices with compact summary and multi-table route. Keep long, empty, image, 320 px, and expanded-copy fixtures.

- [ ] **Step 3: Run desktop Playwright verification**

At 1440×1000 capture screenshot and accessibility snapshot for:

- fresh setup data/preset/finish;
- general launcher and deck-locked launcher;
- open grouped selector with keyboard focus;
- study card and grouped search results;
- editor source summary and focused table selection;
- Arabic RTL launcher and study card with LTR/auto English content.

Expected: no overlap, clipped label, inaccessible control, unexpected native select, console error, warning, or document overflow.

- [ ] **Step 4: Run tablet, zoom-equivalent, and phone Playwright verification**

Verify 768×1024, 720×500, 390×844, and 320×568. Exercise select all, clear, disabled start, Apply, exact-result open, back/close focus restoration, swipe, image zoom, keyboard arrows, and reduced motion. Assert every coarse-pointer action is at least 44×44 px and fixed footers remain above safe-area padding.

- [ ] **Step 5: Update documentation with exact v3 behavior**

README sections must cover: first-run wizard, six presets, multi-table sources, mandatory launcher, deck-specific ribbon buttons, exact-card browser, 16 locales, RTL, migration, phone behavior, and how to rerun setup. Update the UX audit with resolved findings and remaining intentional limitations: no external row deep links, no spaced repetition, and no cell editing.

- [ ] **Step 6: Run the complete automated release gate**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm exec --yes --package=markdownlint-cli2 -- markdownlint-cli2 "README*.md" "docs/**/*.md"
```

Expected: all tests pass, ESLint clean, TypeScript clean, build clean, markdownlint zero issues. Then confirm `main.js` has no `sourceMappingURL`, Node/Electron runtime import, or unexpected network client.

- [ ] **Step 7: Check documentation links without trusting a broken checker**

Extract Markdown URLs with `rg`. Use direct `curl -L` GET checks for ordinary pages; accept a 403 only when the same page was opened successfully through web research and is known to block automated clients. Report every exception explicitly.

- [ ] **Step 8: Deploy only runtime artifacts and prove settings unchanged**

```bash
plugin_src="/Users/maksimkravcov/Projects/Personal/obsidian-table-cards"
plugin_dst="/Users/maksimkravcov/Obsidian/.obsidian/plugins/table-cards"
data_before="$(shasum "$plugin_dst/data.json" | awk '{print $1}')"
npm run deploy
data_after="$(shasum "$plugin_dst/data.json" | awk '{print $1}')"
test "$data_before" = "$data_after"
for artifact in main.js manifest.json styles.css; do
	cmp -s "$plugin_src/$artifact" "$plugin_dst/$artifact"
done
```

Expected: three artifacts are byte-identical and `data.json` hash is unchanged. Open `preview/setup.html`, `preview/launcher.html`, and Obsidian; if Obsidian was already running, reload the app/plugin once.

- [ ] **Step 9: Record the release checkpoint**

```bash
git add preview styles.css README.md README.ru.md docs/ux-audit-2026-08-18.md
git commit -m "docs: finish table cards v3 experience"
```

Do not execute this commit in the current partially tracked parent repository.
