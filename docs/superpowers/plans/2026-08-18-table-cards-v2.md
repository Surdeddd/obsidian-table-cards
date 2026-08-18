# Table Cards v2 Implementation Plan

<!-- markdownlint-disable MD010 MD013 -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reveal-based v1 plugin with an all-visible, typed, image-aware card renderer and a responsive canvas-first editor that remains usable on desktop and phone.

**Architecture:** Parsing, profiling, block resolution, migration, and editor history stay pure and unit-tested. Obsidian-specific file access and DOM rendering consume those pure contracts. Deck blocks form an ordered responsive grid; the editor edits a cloned draft and commits once on Save.

**Tech Stack:** TypeScript 5.8, Obsidian API, esbuild, Vitest, CSS Grid, Pointer Events, Playwright MCP for UI verification.

**Spec:** `docs/superpowers/specs/2026-08-18-table-cards-v2.md`

## Global Constraints

- Render every enabled block immediately; do not keep a reveal state or front/back UI.
- Never modify source Markdown tables.
- Keep `isDesktopOnly: false`; use no Node/Electron APIs in plugin runtime code.
- Keep the plugin offline; remote image URLs may be assigned to `<img src>` but the plugin performs no separate request.
- Phone layout is one column and respects safe-area insets.
- All visible strings and accessible names use typed RU/EN translation keys.
- Coarse-pointer interactive targets are at least 44×44 CSS px.
- Persist only on explicit Save; editor preview updates from a local draft.
- Preserve v1 settings through a pure, idempotent schema migration.
- Apply TDD to every pure parser, profiler, migration, reducer, and layout function.

---

## File map

### Core data and parsing

- Modify `src/model.ts` — v2 persisted/runtime contracts and diagnostics.
- Modify `src/settings/defaults.ts` — v2 defaults and v1→v2 migration.
- Create `src/parse/cells.ts` — empty normalization, Markdown/plain text, and image reference parsing.
- Create `src/parse/table-scanner.ts` — pipe-safe Markdown table scanner and stable selectors.
- Create `src/parse/profile.ts` — data-type inference and column statistics.
- Modify `src/parse/tables.ts` — public compatibility exports and card conversion.
- Modify `src/deck/load.ts` — source resolution, table filtering, diagnostics, and profiles.
- Create `src/layout/resolve.ts` — empty policy and block/card view-model resolution.

### Study UI

- Modify `src/ui/CardView.ts` — all-visible block renderer, Markdown, and images.
- Create `src/ui/ImageLightbox.ts` — accessible image zoom dialog.
- Modify `src/ui/CardsModal.ts` — remove reveal behavior and consume `DeckLoadResult`.
- Modify `src/ui/gestures.ts` — ignore horizontal scrolling blocks and reset per-card state.
- Modify `src/settings/appearance.ts` — merge global defaults with per-deck appearance.
- Modify `styles.css` — responsive card grid, overflow modes, images, editor, focus, and motion.

### Editor UI

- Create `src/editor/state.ts` — pure draft/history reducer.
- Create `src/ui/editor/DeckEditorModal.ts` — lifecycle, draft commit/cancel, and composition.
- Create `src/ui/editor/EditorShell.ts` — header, canvas region, and single-layer panel controller.
- Create `src/ui/editor/FieldsSheet.ts` — source/table selection and column profiles.
- Create `src/ui/editor/CardCanvas.ts` — live card canvas, selection, pointer reorder, and row navigation.
- Create `src/ui/editor/InspectorSheet.ts` — block/card properties with progressive disclosure.
- Create `src/ui/editor/ReorderSheet.ts` — touch and keyboard reorder mode.
- Create `src/ui/editor/controls/Sheet.ts` — accessible side/bottom sheet primitive.
- Create `src/ui/editor/controls/Listbox.ts` — styled accessible dropdown/listbox.
- Create `src/ui/editor/controls/ColorField.ts` — color input, hex input, and contrast result.
- Modify `src/ui/DeckEditorModal.ts` — compatibility re-export.
- Modify `src/settings/settings-tab.ts` — compact global defaults and deck entry points.
- Modify `src/i18n/index.ts` — all new RU/EN strings and catalog parity.

### Tests and verification

- Modify `tests/settings.test.ts` — schema migration and appearance inheritance.
- Replace/extend `tests/tables.test.ts` — pipe-safe tables and images.
- Create `tests/profile.test.ts` — type inference and statistics.
- Create `tests/deck-load.test.ts` — table selection and diagnostics.
- Create `tests/resolve.test.ts` — empty/fallback/required behavior.
- Create `tests/editor-state.test.ts` — draft/history reducer.
- Create `tests/i18n.test.ts` — catalog parity.
- Modify `tests/stubs/obsidian.ts` — file/app/render stubs required by tests.
- Create `preview/v2.html` — production-class static verification fixture using `styles.css`.
- Modify `README.md` and `README.ru.md` — v2 behavior and configuration.

---

### Task 1: Add the v2 model and idempotent migration

**Files:**

- Modify: `src/model.ts`
- Modify: `src/settings/defaults.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**

- Consumes: current v1 `PluginSettings`, `Deck`, and `CardBlock` JSON.
- Produces: `PluginSettings.schemaVersion: 2`, `DeckSource`, v2 `CardBlock`, per-deck `Partial<AppearanceSettings>`, `Deck.columnTypes`, and `mergeSettings(raw): PluginSettings`.

- [ ] **Step 1: Write migration tests before changing the model**

Add these cases to `tests/settings.test.ts` using the old JSON shape rather than typed v2 objects:

```ts
it("migrates v1 faces and slots into ordered v2 blocks", () => {
	const settings = mergeSettings({
		locale: "ru",
		files: [],
		decks: [{
			id: "legacy",
			name: "Legacy",
			files: ["Dictionary.md"],
			folders: ["English"],
			blocks: [
				{ id: "word", style: "title", face: "front", column: "main", columns: ["Words"], visible: true },
				{ id: "translation", style: "text", face: "back", column: "full", columns: ["Translation"], visible: true },
			],
		}],
	});

	expect(settings.schemaVersion).toBe(2);
	expect(settings.decks[0]?.sources).toEqual([
		expect.objectContaining({ kind: "file", path: "Dictionary.md", table: { mode: "all" } }),
		expect.objectContaining({ kind: "folder", path: "English", table: { mode: "all" } }),
	]);
	expect(settings.decks[0]?.blocks.map((block) => [block.kind, block.width])).toEqual([
		["title", "half"],
		["text", "full"],
	]);
	expect(settings.decks[0]?.blocks.every((block) => !("face" in block))).toBe(true);
});

it("is idempotent after schema version 2", () => {
	const once = mergeSettings({ decks: [{ id: "x", name: "X", files: ["x.md"] }] });
	expect(mergeSettings(once)).toEqual(once);
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npx vitest run tests/settings.test.ts`  
Expected: FAIL because `schemaVersion`, `sources`, `kind`, and `width` do not exist.

- [ ] **Step 3: Replace the v1 contracts with the exact v2 contracts from the spec**

In `src/model.ts`, retain `LocaleMode`, `UiLocale`, progress, `cloneJson`, and `newId`, then add these top-level contracts and the remaining fields verbatim from the spec:

```ts
export const SCHEMA_VERSION = 2 as const;
export type ColumnDataType = "text" | "number" | "date" | "boolean" | "tags" | "link" | "markdown" | "image" | "mixed";
export type BlockKind = "title" | "text" | "chips" | "quote" | "note" | "image";
export type BlockWidth = "half" | "full";
export type MobilePresentation = "stack" | "compact";
export type OverflowMode = "wrap" | "shrink" | "ellipsis" | "scroll";
export type EmptyValueMode = "hide" | "dash" | "custom" | "preserve" | "fallback";

export interface PluginSettings {
	schemaVersion: typeof SCHEMA_VERSION;
	locale: LocaleMode;
	lastDeckId: string | null;
	decks: Deck[];
	perDeck: Record<string, DeckProgress>;
	appearance: AppearanceSettings;
}
```

Define `createBlock(partial?: Partial<CardBlock>): CardBlock` with stable defaults:

```ts
const DEFAULT_EMPTY: EmptyValuePolicy = {
	mode: "hide",
	customText: "",
	emptyTokens: ["", "-", "—", "n/a", "null"],
	required: false,
};

export function createBlock(partial: Partial<CardBlock> = {}): CardBlock {
	const kind = partial.kind ?? "text";
	return {
		id: partial.id ?? newId("block"),
		kind,
		columns: partial.columns?.slice() ?? [],
		visible: partial.visible ?? true,
		showLabel: partial.showLabel ?? (kind !== "title" && kind !== "chips"),
		label: partial.label ?? "",
		combine: partial.combine ?? "all",
		width: partial.width ?? "full",
		mobile: partial.mobile ?? "stack",
		height: partial.height ?? { mode: "auto", valuePx: 96 },
		overflow: partial.overflow ?? { mode: kind === "title" ? "shrink" : "wrap", minFontPx: 18, maxLines: null },
		empty: { ...DEFAULT_EMPTY, ...partial.empty, emptyTokens: partial.empty?.emptyTokens?.slice() ?? DEFAULT_EMPTY.emptyTokens.slice() },
		image: partial.image ?? { fit: "contain", aspect: "auto", position: "center", caption: "alt", zoom: true },
		appearance: partial.appearance ?? { inherit: true },
	};
}
```

- [ ] **Step 4: Implement schema-aware migration in `settings/defaults.ts`**

Use separate pure helpers so migration is testable and does not mutate raw data:

```ts
function migrateV1Block(raw: Record<string, unknown>): CardBlock {
	const oldStyle = typeof raw.style === "string" ? raw.style : "text";
	const kind: BlockKind = oldStyle === "title" || oldStyle === "chips" || oldStyle === "quote" || oldStyle === "note" ? oldStyle : "text";
	return createBlock({
		id: typeof raw.id === "string" ? raw.id : undefined,
		kind,
		columns: Array.isArray(raw.columns) ? raw.columns.filter((value): value is string => typeof value === "string") : [],
		visible: raw.visible !== false,
		showLabel: typeof raw.showLabel === "boolean" ? raw.showLabel : undefined,
		width: raw.column === "full" ? "full" : "half",
	});
}

export function mergeSettings(raw: unknown): PluginSettings {
	if (isV2Settings(raw)) return normalizeV2Settings(raw);
	return migrateV1Settings(raw);
}
```

Generate one `DeckSource` per legacy file/folder, preserve block array order, and set `schemaVersion: SCHEMA_VERSION` in `DEFAULT_SETTINGS`.

- [ ] **Step 5: Run migration tests and the full unit suite**

Run: `npx vitest run tests/settings.test.ts && npm test`  
Expected: PASS, including legacy field-map migration.

- [ ] **Step 6: Commit the model boundary**

```bash
git add src/model.ts src/settings/defaults.ts tests/settings.test.ts
git commit -m "feat: add table cards v2 data model"
```

---

### Task 2: Parse pipe-safe tables and image cells

**Files:**

- Create: `src/parse/cells.ts`
- Create: `src/parse/table-scanner.ts`
- Modify: `src/parse/tables.ts`
- Test: `tests/tables.test.ts`

**Interfaces:**

- Consumes: Markdown source text and vault-relative source path.
- Produces: `splitTableRow(line): string[] | null`, `parseCell(raw): CellValue`, `headerSignature(headers): string`, `scanMarkdownTables(markdown, sourcePath): ParsedTable[]`, and `tableSelector(headers, occurrence): TableSelector`.

- [ ] **Step 1: Add failing tests for protected pipes and images**

```ts
it("does not split pipes inside embeds, links, or escaped text", () => {
	expect(splitTableRow("| ![[image.png|300]] | [docs](https://x.test/a|b) | a\\|b |"))
		.toEqual(["![[image.png|300]]", "[docs](https://x.test/a|b)", "a|b"]);
});

it("parses Obsidian and Markdown images without losing raw text", () => {
	expect(parseCell("![[assets/cat.png|300x200]]")).toMatchObject({
		raw: "![[assets/cat.png|300x200]]",
		detectedType: "image",
		images: [{ source: "assets/cat.png", alt: "cat.png", width: 300, height: 200, external: false }],
	});
	expect(parseCell("![Cat](https://example.com/cat.png)").images[0]).toMatchObject({
		source: "https://example.com/cat.png",
		alt: "Cat",
		external: true,
	});
});

it("returns stable selectors for repeated header signatures", () => {
	const tables = scanMarkdownTables("| A | B |\n|---|---|\n|1|2|\n\n| A | B |\n|---|---|\n|3|4|", "x.md");
	expect(tables.map((table) => table.selector.occurrence)).toEqual([0, 1]);
	expect(tables[0]?.selector.headerSignature).toBe(tables[1]?.selector.headerSignature);
});
```

- [ ] **Step 2: Run the parser tests and confirm red**

Run: `npx vitest run tests/tables.test.ts`  
Expected: FAIL because the existing `split("|")` creates extra cells and `parseCell` is missing.

- [ ] **Step 3: Implement a deterministic row scanner**

In `src/parse/table-scanner.ts`, scan characters once and split only when all protected depths are zero:

```ts
export function splitTableRow(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|")) return null;
	let source = trimmed.slice(1);
	let slashCount = 0;
	for (let index = source.length - 2; index >= 0 && source[index] === "\\"; index -= 1) slashCount += 1;
	if (source.endsWith("|") && slashCount % 2 === 0) source = source.slice(0, -1);
	const cells: string[] = [];
	let cell = "";
	let wikiDepth = 0;
	let destinationDepth = 0;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index] ?? "";
		const next = source[index + 1] ?? "";
		if (char === "\\" && next === "|") { cell += "|"; index += 1; continue; }
		if (char === "[" && next === "[") { wikiDepth += 1; cell += "[["; index += 1; continue; }
		if (char === "]" && next === "]" && wikiDepth > 0) { wikiDepth -= 1; cell += "]]"; index += 1; continue; }
		if (char === "(" && source[index - 1] === "]") destinationDepth += 1;
		else if (char === "(" && destinationDepth > 0) destinationDepth += 1;
		else if (char === ")" && destinationDepth > 0) destinationDepth -= 1;
		if (char === "|" && wikiDepth === 0 && destinationDepth === 0) { cells.push(cell.trim()); cell = ""; continue; }
		cell += char;
	}
	cells.push(cell.trim());
	return cells;
}
```

- [ ] **Step 4: Implement typed cell parsing**

In `src/parse/cells.ts`, export `stripMarkdownText`, `parseImageRefs`, and `parseCell`. Parse numeric aliases with `^(\d+)(?:x(\d+))?$`; treat a non-numeric embed alias as alt text. Preserve `raw` exactly after outer trim and derive `text` separately.

```ts
export function parseCell(input: string): CellValue {
	const raw = input.trim();
	const images = parseImageRefs(raw);
	return {
		raw,
		text: stripMarkdownText(raw),
		detectedType: images.length > 0 && stripImageSyntax(raw).trim() === "" ? "image" : detectCellType(raw, images),
		images,
	};
}
```

- [ ] **Step 5: Build `ParsedTable[]` without merging unrelated tables**

`scanMarkdownTables` must assign an index, calculate `headerSignature` from normalized headers joined with `\u001f`, count occurrences per signature, preserve rows with empty cells, and skip separator rows only.

Keep `parseMarkdownTables(markdown, sourcePath)` in `src/parse/tables.ts` as a compatibility wrapper that flattens `scanMarkdownTables(...).rows` into cards while later tasks migrate callers.

- [ ] **Step 6: Run parser tests, lint the new files, and commit**

Run: `npx vitest run tests/tables.test.ts && npx eslint src/parse tests/tables.test.ts`  
Expected: PASS with no lint errors.

```bash
git add src/parse/cells.ts src/parse/table-scanner.ts src/parse/tables.ts tests/tables.test.ts
git commit -m "feat: parse typed table cells and images"
```

---

### Task 3: Profile column types and data quality

**Files:**

- Create: `src/parse/profile.ts`
- Test: `tests/profile.test.ts`

**Interfaces:**

- Consumes: `ParsedTable[]`, default empty tokens, and `Record<string, ColumnDataType>` overrides.
- Produces: `inferColumnType(values): { type: ColumnDataType; confidence: number }`, `profileColumn(header, cells, options): ColumnProfile`, and `profileColumns(tables, overrides): ColumnProfile[]`.

- [ ] **Step 1: Write type and statistics tests**

```ts
it.each([
	[["42", "-3.5", "1000"], "number"],
	[["2026-08-18", "2025-01-02"], "date"],
	[["true", "нет", "yes"], "boolean"],
	[["#english, #verb", "#study, #daily"], "tags"],
	[["[[Note]]", "[Docs](docs.md)"], "link"],
	[["![[cat.png]]", "![Dog](dog.png)"], "image"],
])("infers %s as %s", (values, expected) => {
	expect(inferColumnType(values).type).toBe(expected);
});

it("marks an undominated column as mixed", () => {
	expect(inferColumnType(["42", "hello", "2026-08-18"]).type).toBe("mixed");
});

it("reports fill, unique values, samples, and warnings", () => {
	const profile = profileColumn("Picture", [parseCell("![[ok.png]]"), parseCell(""), parseCell("![[missing.png]]")], {
		isImageResolvable: (source) => source === "ok.png",
	});
	expect(profile).toMatchObject({ total: 3, nonEmpty: 2, unique: 2, warnings: ["brokenImage"] });
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npx vitest run tests/profile.test.ts`  
Expected: FAIL because profiler exports do not exist.

- [ ] **Step 3: Implement ordered detector predicates**

Apply detectors in this order: image, boolean, number, unambiguous ISO date, tags, link, Markdown, text. Count matching non-empty values and return a type only at `matches / nonEmpty >= 0.8`; otherwise return `mixed`. Empty input returns `text` with confidence `0`.

```ts
export function inferColumnType(values: string[]): TypeInference {
	const nonEmpty = values.map((value) => value.trim()).filter(Boolean);
	if (nonEmpty.length === 0) return { type: "text", confidence: 0 };
	for (const [type, predicate] of DETECTORS) {
		const confidence = nonEmpty.filter(predicate).length / nonEmpty.length;
		if (confidence >= 0.8) return { type, confidence };
	}
	return { type: "mixed", confidence: 1 };
}
```

- [ ] **Step 4: Implement compact profiles and overrides**

Return at most three distinct non-empty samples, count unique normalized values, mark `mostlyEmpty` below 50% fill, mark `mixed` for mixed inference, and accept an injected `isImageResolvable` callback so pure tests do not import Obsidian.

Stored overrides replace `inferredType` while retaining measured confidence and warnings.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run tests/profile.test.ts && npm test`  
Expected: PASS.

```bash
git add src/parse/profile.ts tests/profile.test.ts
git commit -m "feat: profile table column data types"
```

---

### Task 4: Load selected tables and return diagnostics

**Files:**

- Modify: `src/deck/load.ts`
- Modify: `tests/stubs/obsidian.ts`
- Create: `tests/deck-load.test.ts`

**Interfaces:**

- Consumes: `App`, v2 `Deck.sources`, table selectors, and block requirements.
- Produces: `loadDeckData(app, deck): Promise<DeckLoadResult>` and compatibility `loadDeckCards(app, deck): Promise<Card[]>`.

- [ ] **Step 1: Add testable file/folder stubs**

Expand `tests/stubs/obsidian.ts` with constructors that retain paths and children:

```ts
export class TFile {
	constructor(public path = "", public extension = "md") {}
}
export class TFolder {
	constructor(public path = "", public children: Array<TFile | TFolder> = []) {}
}
```

- [ ] **Step 2: Write failing source-selection tests**

Build a fake app whose vault implements `getAbstractFileByPath`, `cachedRead`, and `getResourcePath`. Assert:

```ts
it("loads only the saved table selector", async () => {
	const deck = createDeck({ sources: [{
		id: "source-1", kind: "file", path: "two.md",
		table: { mode: "single", selector: { headerSignature: headerSignature(["Term", "RU"]), occurrence: 0 } },
	}] });
	const result = await loadDeckData(fakeApp({ "two.md": TWO_TABLES }), deck);
	expect(result.cards.map((card) => card.cells.Term?.text)).toEqual(["remain"]);
});

it("reports a missing selected table without falling back", async () => {
	const result = await loadDeckData(fakeApp({ "x.md": SIMPLE_TABLE }), deckWithMissingSelector());
	expect(result.cards).toEqual([]);
	expect(result.diagnostics[0]?.code).toBe("tableMissing");
});
```

- [ ] **Step 3: Run the focused test and confirm red**

Run: `npx vitest run tests/deck-load.test.ts`  
Expected: FAIL because `loadDeckData` and table filtering are missing.

- [ ] **Step 4: Implement explicit source resolution**

Add these result contracts to `src/model.ts` if Task 1 did not already place them:

```ts
export interface DeckDiagnostic {
	code: "sourceMissing" | "tableMissing" | "duplicateHeader" | "emptyHeader" | "requiredEmpty" | "brokenImage";
	sourcePath: string;
	tableIndex?: number;
	rowIndex?: number;
	detail: string;
}

export interface DeckLoadResult {
	cards: Card[];
	tables: ParsedTable[];
	profiles: ColumnProfile[];
	diagnostics: DeckDiagnostic[];
}
```

Resolve folder children non-recursively as v1 did, scan each file independently, apply `table.mode`, and never substitute a different table when a single selector is missing.

- [ ] **Step 5: Profile the selected tables and preserve diagnostics**

Call `profileColumns(selectedTables, deck.columnTypes)` after filtering. Convert selected rows to cards with source path, table selector, and original one-based Markdown row index for later diagnostics.

Keep `loadDeckCards` as:

```ts
export async function loadDeckCards(app: App, deck: Deck): Promise<Card[]> {
	return (await loadDeckData(app, deck)).cards;
}
```

- [ ] **Step 6: Run focused/full tests and commit**

Run: `npx vitest run tests/deck-load.test.ts tests/profile.test.ts && npm test`  
Expected: PASS.

```bash
git add src/model.ts src/deck/load.ts tests/stubs/obsidian.ts tests/deck-load.test.ts
git commit -m "feat: load explicit table sources with diagnostics"
```

---

### Task 5: Resolve empty policies and block view models

**Files:**

- Create: `src/layout/resolve.ts`
- Modify: `src/layout.ts`
- Modify: `src/deck/load.ts`
- Create: `tests/resolve.test.ts`
- Modify: `tests/tables.test.ts`

**Interfaces:**

- Consumes: `Card`, ordered `CardBlock[]`, and stored column type overrides.
- Produces: `resolveBlock(card, block): ResolvedBlock`, `resolveCard(card, blocks): ResolvedCard`, and `isConfiguredEmpty(value, tokens): boolean`.

- [ ] **Step 1: Write the empty-policy matrix as failing tests**

```ts
it.each([
	["hide", false, ""],
	["dash", true, "—"],
	["custom", true, "Нет данных"],
	["preserve", true, ""],
])("resolves %s empty policy", (mode, visible, text) => {
	const block = createBlock({ columns: ["A"], empty: { mode, customText: "Нет данных", emptyTokens: ["", "-"], required: false } });
	const resolved = resolveBlock(card({ A: "-" }), block);
	expect(resolved.visible).toBe(visible);
	expect(resolved.values[0]?.text ?? "").toBe(text);
});

it("uses the first non-empty fallback column", () => {
	const block = createBlock({ columns: ["A", "B"], combine: "firstNonEmpty", empty: { mode: "fallback", customText: "", emptyTokens: [""], required: false } });
	expect(resolveBlock(card({ A: "", B: "second" }), block).values[0]?.text).toBe("second");
});

it("skips a card when a required block is empty", () => {
	const block = createBlock({ columns: ["Term"], empty: { mode: "hide", customText: "", emptyTokens: [""], required: true } });
	expect(resolveCard(card({ Term: "" }), [block]).skipReason).toMatchObject({ code: "requiredEmpty", blockId: block.id });
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npx vitest run tests/resolve.test.ts`  
Expected: FAIL because resolver exports do not exist.

- [ ] **Step 3: Implement normalized value lookup and policy resolution**

Use normalized headers for aliases, keep configured column order, and return view models that contain no Obsidian objects:

```ts
export interface ResolvedBlock {
	block: CardBlock;
	visible: boolean;
	values: CellValue[];
	placeholder: boolean;
}

export interface ResolvedCard {
	card: Card;
	blocks: ResolvedBlock[];
	skipReason: null | { code: "requiredEmpty"; blockId: string };
}
```

For `combine: "all"`, include every non-empty value. For `firstNonEmpty`, include at most one. Apply `dash/custom/preserve` only after no real value resolves.

Update `loadDeckData` to call `resolveCard` for each row, omit required-empty cards, and append one `requiredEmpty` diagnostic per skipped row.

- [ ] **Step 4: Remove face/slot layout helpers**

Replace `stacksOf` and `visibleBlocks` usage with ordered blocks and a simple helper:

```ts
export function activeBlocks(blocks: CardBlock[]): CardBlock[] {
	return blocks.filter((block) => block.visible);
}
```

Keep migration tests, not runtime face/back compatibility.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run tests/resolve.test.ts tests/tables.test.ts && npm test`  
Expected: PASS.

```bash
git add src/layout.ts src/layout/resolve.ts src/deck/load.ts tests/resolve.test.ts tests/tables.test.ts
git commit -m "feat: resolve block values and empty policies"
```

---

### Task 6: Render all blocks, Markdown, and images in study mode

**Files:**

- Modify: `src/ui/CardView.ts`
- Create: `src/ui/ImageLightbox.ts`
- Modify: `src/ui/CardsModal.ts`
- Modify: `src/ui/gestures.ts`
- Modify: `tests/stubs/obsidian.ts`

**Interfaces:**

- Consumes: `ResolvedCard`, `App`, an Obsidian `Component`, translator, and resolved appearance.
- Produces: `renderCard(root, resolved, context): Promise<void>` and `ImageLightbox`.

- [ ] **Step 1: Remove reveal state and its commands from `CardsModal`**

Delete `revealed`, `toggleReveal`, stage click-to-reveal, Space/Enter handlers, reveal reset calls, and reveal hint creation. Keep ArrowLeft, ArrowRight, `S`, close, swipe, counter, and progress.

Replace the render path with:

```ts
const current = this.currentCard();
const resolved = current && this.deck ? resolveCard(current, this.deck.blocks) : null;
void renderCard(this.stageEl, resolved, {
	app: this.app,
	component: this,
	appearance: resolveDeckAppearance(this.host.settings.appearance, this.deck?.appearance),
	t: this.host.t,
});
```

- [ ] **Step 2: Implement async content rendering with stale-render protection**

Give `CardsModal` an incrementing `renderVersion`. Before each `await MarkdownRenderer.render(...)` or image decode-related update, compare the captured version so fast navigation cannot paint the previous card into the new one.

`CardView` must set these attributes from each block:

```ts
box.dataset.kind = block.kind;
box.dataset.width = block.width;
box.dataset.mobile = block.mobile;
box.dataset.overflow = block.overflow.mode;
box.style.setProperty("--tc-block-height", `${block.height.valuePx}px`);
box.style.setProperty("--tc-min-font", `${block.overflow.minFontPx}px`);
box.style.setProperty("--tc-max-lines", block.overflow.maxLines === null ? "none" : String(block.overflow.maxLines));
```

- [ ] **Step 3: Render text, Markdown, chips, and images by block kind**

Use `textContent` for plain text. Use Obsidian `MarkdownRenderer.render` only when the block kind/data type requests Markdown. For image blocks:

```ts
const image = box.createEl("img", {
	cls: "table-cards-image",
	attr: { alt: ref.alt, loading: "lazy", decoding: "async" },
});
image.src = ref.external ? ref.source : app.vault.getResourcePath(resolveImageFile(app, card.sourcePath, ref.source));
image.addEventListener("error", () => renderMissingImage(box, ref, t));
```

Never assign table HTML through `innerHTML`.

- [ ] **Step 4: Implement the accessible image lightbox**

`ImageLightbox` extends `Modal`, supplies a localized title/close name, focuses close on open, restores the opener on close, closes on Escape through the modal scope, and renders the same alt text. Open it only when `block.image.zoom` is true.

- [ ] **Step 5: Make swipe ignore horizontal block scrolling**

In `gestures.ts`, abort navigation when `event.target` is inside `[data-overflow="scroll"]` and that element has horizontal overflow. Retain the `56 px` and `1.5 × vertical` threshold.

- [ ] **Step 6: Run static checks and manually smoke the modal**

Run: `npm test && npm run lint && npx tsc --noEmit`  
Expected: all pass.

Open Obsidian with a fixture table containing text and `![[image.png|300]]`; verify all blocks render at once and Space does not alter the card.

- [ ] **Step 7: Commit the study vertical slice**

```bash
git add src/ui/CardView.ts src/ui/ImageLightbox.ts src/ui/CardsModal.ts src/ui/gestures.ts tests/stubs/obsidian.ts
git commit -m "feat: render all card blocks with images"
```

---

### Task 7: Add per-deck appearance and responsive block layout

**Files:**

- Modify: `src/settings/appearance.ts`
- Modify: `src/settings/defaults.ts`
- Modify: `styles.css`
- Test: `tests/settings.test.ts`
- Create: `preview/v2.html`

**Interfaces:**

- Consumes: global `AppearanceSettings`, optional `Deck.appearance`, and block layout attributes.
- Produces: `resolveDeckAppearance(defaults, override): AppearanceSettings` and CSS custom properties for card/block colors and spacing.

- [ ] **Step 1: Add failing appearance inheritance tests**

```ts
it("inherits global appearance and applies a deck override", () => {
	const defaults = defaultAppearance();
	const resolved = resolveDeckAppearance(defaults, {
		preset: "monochrome",
		cardBackground: "#181818",
		radius: 18,
	});
	expect(resolved.cardBackground).toBe("#181818");
	expect(resolved.radius).toBe(18);
	expect(resolved.gap).toBe(defaults.gap);
});

it("rejects invalid persisted colors", () => {
	expect(mergeAppearance({ cardBackground: "javascript:bad" }).cardBackground).toBe(defaultAppearance().cardBackground);
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npx vitest run tests/settings.test.ts`  
Expected: FAIL because per-deck resolution and color fields are missing.

- [ ] **Step 3: Extend appearance validation and application**

Accept only `#[0-9a-fA-F]{6}` colors. Add preset plus window, card, primary, secondary, label, accent, and border colors. Keep current size, radius, border, padding, gap, shadow, and breakpoint values.

```ts
export function resolveDeckAppearance(defaults: AppearanceSettings, override?: Partial<AppearanceSettings>): AppearanceSettings {
	return mergeAppearance({ ...defaults, ...override });
}
```

`applyAppearance` sets only validated values:

```ts
el.setCssProps({
	"--tc-window-bg": appearance.windowBackground,
	"--tc-card-bg": appearance.cardBackground,
	"--tc-text": appearance.primaryText,
	"--tc-text-muted": appearance.secondaryText,
	"--tc-label": appearance.labelText,
	"--tc-accent": appearance.accent,
	"--tc-border": appearance.borderColor,
});
```

- [ ] **Step 4: Replace the stack CSS with an ordered responsive grid**

Use one card surface and direct block children:

```css
.table-cards-stage {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	align-content: center;
	gap: var(--tc-gap);
}

.table-cards-modal {
	container: table-cards / inline-size;
}

.table-cards-box[data-width="full"] { grid-column: 1 / -1; }
.table-cards-box[data-width="half"] { grid-column: span 1; }

@container table-cards (max-width: 559px) {
	.table-cards-stage { grid-template-columns: minmax(0, 1fr); align-content: start; }
	.table-cards-box { grid-column: 1 !important; }
}
```

Implement `auto/min/fixed` height, clamp/ellipsis, internal scroll, image aspect/fit/position, block overrides, and `overflow-wrap: anywhere`. Do not use `justify-content: space-between` to pin the last block to the bottom.

- [ ] **Step 5: Build the static production-class fixture**

Create `preview/v2.html` with Obsidian-like CSS variables and four switchable fixtures: normal card, long word, missing optional values, and image. Load `../styles.css` and use the same classes/data attributes emitted by `CardView`; do not copy production CSS into the fixture.

- [ ] **Step 6: Run tests and capture baseline screenshots**

Run: `npx vitest run tests/settings.test.ts && npm run lint && npx tsc --noEmit`  
Expected: PASS.

Serve `preview/v2.html`; capture Playwright screenshots at 1440×1000, 390×844, and 320×568. Confirm no horizontal document overflow and a one-column card at both phone widths.

- [ ] **Step 7: Commit appearance and layout**

```bash
git add src/settings/appearance.ts src/settings/defaults.ts styles.css tests/settings.test.ts preview/v2.html
git commit -m "feat: add responsive per-deck card appearance"
```

---

### Task 8: Build the pure editor draft and history reducer

**Files:**

- Create: `src/editor/state.ts`
- Create: `tests/editor-state.test.ts`

**Interfaces:**

- Consumes: a persisted `Deck` clone and `EditorAction` values.
- Produces: `createEditorState(deck): EditorState`, `reduceEditorState(state, action): EditorState`, `undo(state)`, `redo(state)`, and `isDirty(state)`.

- [ ] **Step 1: Write history, resize coalescing, and cancel tests**

```ts
it("changes only the draft and records one undo state", () => {
	const persisted = createDeck({ blocks: [createBlock({ id: "a", width: "half" })] });
	const initial = createEditorState(persisted);
	const next = reduceEditorState(initial, { type: "setBlockWidth", blockId: "a", width: "full" });
	expect(persisted.blocks[0]?.width).toBe("half");
	expect(next.draft.blocks[0]?.width).toBe("full");
	expect(undo(next).draft.blocks[0]?.width).toBe("half");
});

it("reorders blocks with pointer and keyboard through one action", () => {
	const initial = stateWithBlocks("a", "b", "c");
	const next = reduceEditorState(initial, { type: "moveBlock", blockId: "c", toIndex: 0 });
	expect(next.draft.blocks.map((block) => block.id)).toEqual(["c", "a", "b"]);
});

it("keeps at most 100 past states", () => {
	let state = stateWithBlocks("a");
	for (let index = 0; index < 120; index += 1) state = reduceEditorState(state, { type: "patchBlock", blockId: "a", patch: { label: String(index) } });
	expect(state.past).toHaveLength(100);
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npx vitest run tests/editor-state.test.ts`  
Expected: FAIL because editor state exports do not exist.

- [ ] **Step 3: Define explicit state and action unions**

```ts
export interface EditorState {
	baseline: Deck;
	draft: Deck;
	past: Deck[];
	future: Deck[];
	selectedBlockId: string | null;
	previewRow: number;
	activePanel: null | "fields" | "block" | "card" | "reorder";
}

export type EditorAction =
	| { type: "replaceDraft"; deck: Deck }
	| { type: "selectBlock"; blockId: string | null }
	| { type: "setPreviewRow"; index: number }
	| { type: "openPanel"; panel: EditorState["activePanel"] }
	| { type: "moveBlock"; blockId: string; toIndex: number }
	| { type: "setBlockWidth"; blockId: string; width: BlockWidth }
	| { type: "patchBlock"; blockId: string; patch: Partial<CardBlock> }
	| { type: "patchAppearance"; patch: Partial<AppearanceSettings> }
	| { type: "replaceSources"; sources: DeckSource[] }
	| { type: "setColumnType"; header: string; dataType: ColumnDataType }
	| { type: "setColumnEnabled"; header: string; enabled: boolean };
```

Selection, panel, and preview-row actions do not create history entries. Draft-changing actions push the previous draft, clear future, and cap history at 100.

`patchBlock` deep-merges `height`, `overflow`, `empty`, `image`, and `appearance`; a partial nested patch must not reset sibling values.

- [ ] **Step 4: Implement pure undo/redo and dirty comparison**

Use `cloneJson` only at state boundaries. Compare serializable `baseline` and `draft` through a stable JSON representation; do not include transient UI state.

```ts
export function isDirty(state: EditorState): boolean {
	return JSON.stringify(state.baseline) !== JSON.stringify(state.draft);
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run tests/editor-state.test.ts && npm test`  
Expected: PASS.

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: add editor draft and undo history"
```

---

### Task 9: Create the editor shell and safe persistence flow

**Files:**

- Create: `src/ui/editor/DeckEditorModal.ts`
- Create: `src/ui/editor/EditorShell.ts`
- Create: `src/ui/editor/controls/Sheet.ts`
- Modify: `src/ui/DeckEditorModal.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `styles.css`

**Interfaces:**

- Consumes: `EditorHost`, persisted `Deck`, `EditorState`, `loadDeckData`, and translator.
- Produces: a full-screen/mobile or centered/desktop editor with one active panel and explicit save/cancel behavior.

- [ ] **Step 1: Replace the compatibility entry point without changing callers**

Make `src/ui/DeckEditorModal.ts` contain only:

```ts
export { DeckEditorModal, type EditorHost } from "./editor/DeckEditorModal";
```

Keep imports in `main.ts` and `settings-tab.ts` stable until the new modal is verified.

- [ ] **Step 2: Implement draft lifecycle and one-write Save**

`DeckEditorModal` initializes `createEditorState(deck)`, loads data into separate runtime fields, and never mutates the constructor deck before Save.

```ts
private async save(): Promise<void> {
	const index = this.host.settings.decks.findIndex((deck) => deck.id === this.persistedId);
	if (index < 0) return;
	this.host.settings.decks[index] = cloneJson(this.state.draft);
	await this.host.saveSettings();
	this.state = createEditorState(this.host.settings.decks[index]!);
	this.render();
}
```

Back/close checks `isDirty`. Use an Obsidian confirmation modal with localized Save, Discard, and Continue editing actions.

- [ ] **Step 3: Build the canvas-first shell**

`EditorShell` renders exactly these persistent regions:

```text
header: back | title + dirty state | undo | redo | device | save
canvas bar: fields | row navigator | card style
canvas host: live card
selected block toolbar: type | desktop width | move | more
single sheet host
```

Do not render the four-step mobile navigation, global language selector, auto-layout button, source path, or all settings at once.

- [ ] **Step 4: Implement the reusable sheet contract**

`Sheet` accepts `{ id, title, mode, opener, onClose, renderBody, renderFooter }`. It renders `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, closes on Escape, traps Tab/Shift+Tab, and restores focus to `opener`.

Desktop mode docks right at `min(390px, 88%)`; mobile mode uses one bottom sheet with `max-height: 85dvh`, safe-area footer, and a visible drag indicator. Opening one sheet closes the previous sheet before rendering the next.

- [ ] **Step 5: Add editor responsive and focus CSS**

Use `@media (max-width: 700px)` for the editor shell only, not `Platform.isMobile`. Ensure visible `:focus-visible`, 44 px coarse-pointer targets, `100dvh`, and `prefers-reduced-motion` overrides for sheet/canvas transitions.

- [ ] **Step 6: Run static checks and keyboard smoke test**

Run: `npm run lint && npx tsc --noEmit && npm run build`  
Expected: PASS.

Manual keyboard flow: open editor → Fields → Tab cycle remains in sheet → Escape returns focus to Fields → modify width → Undo → Redo → Back shows dirty confirmation → Continue editing retains draft.

- [ ] **Step 7: Commit the shell**

```bash
git add src/ui/DeckEditorModal.ts src/ui/editor/DeckEditorModal.ts src/ui/editor/EditorShell.ts src/ui/editor/controls/Sheet.ts src/settings/settings-tab.ts styles.css
git commit -m "feat: add canvas-first editor shell"
```

---

### Task 10: Build source, table, and column profiling setup

**Files:**

- Create: `src/ui/editor/FieldsSheet.ts`
- Modify: `src/ui/editor/DeckEditorModal.ts`
- Modify: `src/ui/editor/EditorShell.ts`
- Modify: `src/editor/state.ts`
- Modify: `src/i18n/index.ts`
- Modify: `styles.css`

**Interfaces:**

- Consumes: `DeckLoadResult.tables`, `profiles`, `diagnostics`, source picker callbacks, and editor actions.
- Produces: source/table selection, compact profile rows, overrides, warnings, and auto-layout confirmation.

- [ ] **Step 1: Implement the first-setup summary state**

When the deck has no valid sources, open Fields automatically. Otherwise keep the canvas visible and show a compact button label such as `Fields · 7 · 2 warnings`.

The sheet header summary is exactly: column count, row count, warning count. Do not expand samples by default.

- [ ] **Step 2: Add Obsidian-native file selection**

Use `AbstractInputSuggest<TFile>` or a small `FuzzySuggestModal<TFile>` backed by `app.vault.getMarkdownFiles()`. Store vault-relative paths only. Provide a separate advanced Folder action using `TFolder` suggestions.

Selecting a file immediately scans available tables but changes only the editor draft.

- [ ] **Step 3: Render table choices with stable identifiers**

Each option shows `Table N`, headers, and row count. Persist `{ headerSignature, occurrence }`, not the visible number. For an existing missing selector, render the saved header signature and a Repair button; never select the first table automatically.

- [ ] **Step 4: Render progressively disclosed column rows**

Collapsed row content:

```text
[checked] Words                 text
          583 / 583             
```

Expanded row content adds up to three samples, confidence, warnings, styled type picker, empty-token override, and `Use in card` state. Use native checkbox semantics and make the full 44 px row label clickable. `setColumnEnabled(false)` removes the normalized header from every block and removes blocks left with zero columns; `setColumnEnabled(true)` appends one automatically typed block for that column.

- [ ] **Step 5: Add deterministic auto-layout**

Add a pure `autoLayout(profiles): CardBlock[]` in `src/layout.ts` and tests in `tests/resolve.test.ts`. Mapping rules:

```ts
image -> image/full
tags -> chips/full
first high-fill text column matching term/word/title names -> title/half/required
example-like Markdown/text -> quote/full
tip/note-like text -> note/full
remaining columns -> text/full
```

The confirmation states how many blocks will be replaced. Do not overwrite a non-empty custom layout without confirmation.

- [ ] **Step 6: Add localized loading/error/empty states**

Add typed RU/EN keys for scanning, source missing, table missing, mixed type, mostly empty, broken image, row/column counts, samples, repair, and auto-layout confirmation.

- [ ] **Step 7: Verify the data setup flow and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`  
Expected: PASS.

Manual fixtures: one-column table, two-column table, two tables in one note, mixed column, 60% empty column, and image column.

```bash
git add src/ui/editor/FieldsSheet.ts src/ui/editor/DeckEditorModal.ts src/ui/editor/EditorShell.ts src/editor/state.ts src/layout.ts src/i18n/index.ts styles.css tests/resolve.test.ts
git commit -m "feat: add profiled table setup flow"
```

---

### Task 11: Implement the WYSIWYG card canvas and accessible reordering

**Files:**

- Create: `src/ui/editor/CardCanvas.ts`
- Create: `src/ui/editor/ReorderSheet.ts`
- Modify: `src/ui/editor/EditorShell.ts`
- Modify: `src/editor/state.ts`
- Modify: `src/ui/CardView.ts`
- Modify: `styles.css`

**Interfaces:**

- Consumes: draft deck, selected preview row, `renderCard`, and reducer dispatch.
- Produces: selectable true-size blocks, row navigation, pointer reorder, desktop resize preview, and keyboard/touch reorder alternatives.

- [ ] **Step 1: Share rendering instead of duplicating preview markup**

Extend `renderCard` with optional editor hooks:

```ts
export interface CardRenderOptions {
	selectedBlockId?: string | null;
	onSelectBlock?: (blockId: string) => void;
	interactiveImages?: boolean;
}
```

The editor passes `interactiveImages: false`; study mode passes `true`. In editor mode, a selectable block receives `role="button"`, `tabindex="0"`, `aria-pressed`, and `is-selected`; study markup remains non-interactive.

- [ ] **Step 2: Add representative row navigation**

Provide previous/next and a styled row picker. Add quick choices `first`, `random`, `longest`, `most empty`, computed from loaded cards. Changing the preview row is transient and does not dirty history.

- [ ] **Step 3: Implement pointer reorder without HTML5 drag-and-drop**

Use Pointer Events with pointer capture. During movement, render only a visual insertion marker and local transform. Dispatch one `moveBlock` action on pointer-up. Cancel on pointercancel/Escape and dispatch nothing.

Do not write settings or push multiple history states during movement.

- [ ] **Step 4: Implement desktop width/height handles**

Only show handles for a selected block with `(pointer: fine)`. Width snaps to half/full; height snaps to auto/min/fixed and clamps values to `48..480 px`. Preview during drag through temporary CSS variables; dispatch one `patchBlock` on pointer-up.

Hide both handles under `(pointer: coarse)` and below 700 px.

- [ ] **Step 5: Implement explicit reorder mode**

`ReorderSheet` renders 44 px rows with label, type, drag handle, Move up, and Move down controls. Buttons announce the resulting one-based position through an `aria-live="polite"` region. This is the keyboard and phone fallback for pointer drag.

- [ ] **Step 6: Verify selection and reordering**

Run: `npm test && npm run lint && npx tsc --noEmit`  
Expected: PASS.

Keyboard/manual assertions: every block selectable, Move up/down preserves focus, pointercancel leaves order unchanged, Undo restores order, phone has no resize handle, and the canvas has no horizontal overflow at 320 px.

- [ ] **Step 7: Commit canvas interactions**

```bash
git add src/ui/editor/CardCanvas.ts src/ui/editor/ReorderSheet.ts src/ui/editor/EditorShell.ts src/editor/state.ts src/ui/CardView.ts styles.css
git commit -m "feat: add accessible visual card canvas"
```

---

### Task 12: Add progressive block/card settings and custom controls

**Files:**

- Create: `src/ui/editor/InspectorSheet.ts`
- Create: `src/ui/editor/controls/Listbox.ts`
- Create: `src/ui/editor/controls/ColorField.ts`
- Modify: `src/ui/editor/EditorShell.ts`
- Modify: `src/editor/state.ts`
- Modify: `src/i18n/index.ts`
- Modify: `styles.css`

**Interfaces:**

- Consumes: selected block, draft appearance, profiles, translator, and reducer dispatch.
- Produces: block/card tabs, one-open accordion groups, styled listboxes, color editing, and live contrast validation.

- [ ] **Step 1: Implement the accessible listbox primitive**

`Listbox<T>` takes `{ id, label, value, options, searchable, onChange }`. Trigger and options implement `aria-expanded`, `aria-controls`, `role="listbox"`, `role="option"`, `aria-selected`, ArrowUp/Down, Home/End, Enter, Escape, and type-ahead. Use an anchored popover on desktop and the shared bottom `Sheet` on phone.

Search appears only when options length exceeds eight.

- [ ] **Step 2: Implement color editing and complete contrast checks**

`ColorField` uses a native `<input type="color">`, a validated six-digit hex text input, and a swatch button. Export pure helpers and unit-test them in `tests/settings.test.ts`:

```ts
export function contrastRatio(foreground: string, background: string): number;
export function contrastGrade(ratio: number, largeText: boolean): "aaa" | "aa" | "fail";
```

Card settings show contrast for primary/card, secondary/card, label/card, and each non-inherited block text/background pair. Saving remains allowed on failure, but the failing pair is named and visually marked.

- [ ] **Step 3: Render only common block controls initially**

The default Block tab contains type, columns, combine mode, label, width, order action, and empty behavior. Advanced accordions are Content, Layout, Typography, Appearance, Rules, and Image. Only one accordion is open at a time.

Hide Image completely unless `block.kind === "image"`; when visible it contains fit, aspect, focal position, caption, and zoom.

- [ ] **Step 4: Render card presets before custom values**

Card tab begins with Obsidian, Monochrome, and Custom. For Obsidian/Monochrome show only spacing, radius, border, shadow, and maximum width. Show individual color controls only for Custom.

Change the footer copy according to context: `Reset block` on Block and `Reset card style` on Card.

- [ ] **Step 5: Bind every control to one reducer action**

Selections and sliders preview immediately. A keyboard slider change is one history action. Pointer range input bursts are coalesced from pointerdown to change/pointerup so Undo returns to the starting value rather than visiting every pixel.

- [ ] **Step 6: Verify custom controls and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`  
Expected: PASS.

Manual keyboard flow: open each listbox, navigate with arrows/Home/End, select with Enter, close with Escape, return focus to trigger, edit hex, observe named contrast failure, undo and redo.

```bash
git add src/ui/editor/InspectorSheet.ts src/ui/editor/controls/Listbox.ts src/ui/editor/controls/ColorField.ts src/ui/editor/EditorShell.ts src/editor/state.ts src/i18n/index.ts styles.css tests/settings.test.ts
git commit -m "feat: add progressive card and block controls"
```

---

### Task 13: Complete localization, settings cleanup, and accessibility semantics

**Files:**

- Modify: `src/i18n/index.ts`
- Create: `tests/i18n.test.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/ui/CardsModal.ts`
- Modify: `src/ui/editor/DeckEditorModal.ts`
- Modify: `src/ui/editor/EditorShell.ts`
- Modify: `src/ui/editor/FieldsSheet.ts`
- Modify: `src/ui/editor/CardCanvas.ts`
- Modify: `src/ui/editor/InspectorSheet.ts`
- Modify: `styles.css`

**Interfaces:**

- Consumes: every user-visible translation key and interactive component.
- Produces: RU/EN parity, compact global settings, complete names/roles/states, focus behavior, and reduced motion.

- [ ] **Step 1: Add catalog parity and no-hardcoded-copy tests**

Export catalog keys in test builds and add:

```ts
it("keeps Russian and English catalogs in parity", () => {
	expect(Object.keys(RU).sort()).toEqual(Object.keys(EN).sort());
});

it("translates every key in both locales", () => {
	for (const key of Object.keys(EN) as TranslationKey[]) {
		expect(createTranslator("en")(key)).toBeTruthy();
		expect(createTranslator("ru")(key)).toBeTruthy();
	}
});
```

Search `src/ui` and `src/settings` for visible English/Russian literals; replace each with a typed key. CSS-generated decorative glyphs may remain only when `aria-hidden`.

- [ ] **Step 2: Simplify the global settings page**

Keep only language, global appearance defaults collapsed under `Defaults`, and the deck list. Each deck row shows enabled state, source count, last diagnostic summary, Edit, Duplicate, and Delete. Per-deck colors/layout live only in the editor.

Delete requires a named confirmation and moves no vault files.

- [ ] **Step 3: Audit semantic state in study and editor**

Add `aria-current` or `aria-selected` to the active deck/block/preset, `aria-pressed` to shuffle, labelled progress, `aria-live="polite"` for card position/save/reorder results, and descriptive labels for icon-only controls.

Ensure hidden sheets/listboxes use `hidden` or `inert`, not off-screen transforms alone, so closed controls leave the tab order and accessibility tree.

- [ ] **Step 4: Enforce touch, text, focus, contrast, and motion rules**

Under `(pointer: coarse)`, every button/input/option row is at least 44 px. Set control/body minimum to 14 px and auxiliary labels to 12 px. Keep focus outlines at least 2 px and independent of color. Add reduced-motion rules for progress, sheets, canvas moves, and lightbox.

- [ ] **Step 5: Test 30% text expansion in both locales**

Add a debug class in `preview/v2.html` that expands labels through fixture strings, not CSS scaling. Verify header, toolbar, bottom actions, listbox options, and confirmation footer wrap without overlap at 320×568 and 390×844.

- [ ] **Step 6: Run the accessibility regression pass and commit**

Run: `npx vitest run tests/i18n.test.ts && npm test && npm run lint && npx tsc --noEmit`  
Expected: PASS.

Playwright keyboard snapshot: closed sheets absent; opened sheet labelled as dialog; focus trapped; Escape closes; opener regains focus; listbox reports selected option.

```bash
git add src/i18n/index.ts tests/i18n.test.ts src/settings/settings-tab.ts src/ui/CardsModal.ts src/ui/editor styles.css preview/v2.html
git commit -m "feat: complete localized accessible editor ux"
```

---

### Task 14: Full verification, documentation, and vault handoff

**Files:**

- Modify: `README.md`
- Modify: `README.ru.md`
- Modify: `MEMORY_BANK/progress.md`
- Verify: `main.js`, `manifest.json`, `styles.css`

**Interfaces:**

- Consumes: the complete v2 plugin.
- Produces: verified build artifacts, user documentation, screenshots, and a deployable vault copy.

- [ ] **Step 1: Run the complete automated gate**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: every command exits 0; production `main.js` is regenerated by the build and contains no source map reference or runtime Node import.

- [ ] **Step 2: Run parser/data fixtures through the built behavior**

Verify these exact fixture classes: 1 column, 2 columns, 8 columns, two tables in one note, escaped pipe, Obsidian image with width, Markdown image, broken local image, mixed type, empty required field, empty optional field, 1,000 rows, and a renamed/missing selected table.

Expected: no crash, no table rewrite, explicit diagnostics, and only required-empty rows skipped.

- [ ] **Step 3: Run Playwright visual and accessibility checks**

Capture screenshot plus accessibility snapshot for study and editor at:

```text
1440 × 1000 desktop
768 × 1024 tablet portrait
390 × 844 phone
320 × 568 small phone
```

Repeat the 1440 viewport at 200% browser zoom and the phone viewport with reduced motion. Expected: no horizontal document overflow, no clipped menu/sheet, one card column on phones, persistent footer above safe area, readable text, visible focus, and all hidden controls absent from the snapshot.

- [ ] **Step 4: Test inside Obsidian dark and light themes**

Use the active Cupertino-style dark desktop and an Obsidian light theme. Verify file/table picker, Save/Cancel/dirty prompt, undo/redo, keyboard reorder, pointer reorder, mobile reorder controls, image zoom, missing image, long text, custom colors, and RU/EN switching.

- [ ] **Step 5: Update both READMEs and project progress**

Document: selecting a table, automatic type profile, arranging blocks, empty policies, images, phone behavior, keyboard shortcuts, migration, and the fact that source tables remain untouched. Keep English and Russian documents structurally equivalent.

Record v2 completion and verification commands in `MEMORY_BANK/progress.md` without changing historical entries.

- [ ] **Step 6: Deploy only after all checks pass**

Run: `npm run deploy`  
Expected: `main.js`, `manifest.json`, and `styles.css` copy to `~/Obsidian/.obsidian/plugins/table-cards/`.

Restart/reload the plugin and perform one final Dictionary deck navigation on desktop and phone.

- [ ] **Step 7: Commit the verified release state**

```bash
git add README.md README.ru.md MEMORY_BANK/progress.md main.js manifest.json styles.css
git commit -m "docs: document and verify table cards v2"
```
