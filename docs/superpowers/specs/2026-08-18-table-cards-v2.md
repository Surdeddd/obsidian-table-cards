# Table Cards v2 — Product and UX Specification

<!-- markdownlint-disable MD010 MD013 -->

Date: 2026-08-18  
Status: proposed  
Supersedes for v2: `2026-08-18-table-cards-design.md`

## Acceptance spec

1. A study card renders every enabled block immediately; v2 has no front/back or reveal interaction.
2. A deck can target one specific Markdown table or all matching tables in one or more vault files/folders, without rewriting vault content.
3. Before layout editing, every column is profiled as text, number, date, boolean, tags, link, Markdown, image, or mixed, with fill rate, samples, warnings, and a manual override.
4. Obsidian embeds (`![[image.png]]`, size aliases included) and Markdown images render as images with alt text, missing-image state, contain/cover, aspect ratio, and optional tap-to-zoom.
5. Each block owns an explicit empty-value policy: hide, dash, custom text, preserve space, or first non-empty fallback; required empty blocks skip the row and report the skipped count.
6. Blocks are ordered, desktop half/full width, always one-column on phone, and support auto/min/fixed height plus wrap, shrink, ellipsis, or internal-scroll overflow.
7. The editor is canvas-first: only source, card, or selected-block controls are visible at one time; detailed controls live in one side sheet on desktop and one bottom sheet on phone.
8. Editing uses a draft with immediate preview, undo/redo, explicit Save/Cancel, dirty-state protection, and no settings write on each pointer move or keystroke.
9. Russian and English cover every user-facing string; keyboard, screen reader, reduced motion, contrast, focus, and touch targets meet WCAG 2.1 AA and the 44 px mobile target convention.
10. Existing v1 settings migrate without data loss, the plugin stays offline and theme-native, and all behavior is covered by unit tests plus Playwright desktop/mobile snapshots.

## Product boundaries

### In scope

- Arbitrary Markdown tables with one or more columns.
- Multiple tables per note with an explicit table selector.
- Local vault images and Markdown image syntax.
- Per-deck layout and appearance with global defaults.
- Desktop, tablet, and Obsidian mobile.
- RU, EN, and automatic locale selection.
- Visual layout editing, pointer reordering, and keyboard reordering.

### Out of scope

- Editing source table cells from the card.
- Spaced repetition algorithms.
- OCR, AI classification, TTS, sync, or network services.
- Free-form absolute positioning; layout remains an ordered responsive grid.
- Arbitrary HTML from table cells.

## Core data model

```ts
export type ColumnDataType =
	| "text"
	| "number"
	| "date"
	| "boolean"
	| "tags"
	| "link"
	| "markdown"
	| "image"
	| "mixed";

export type BlockKind = "title" | "text" | "chips" | "quote" | "note" | "image";
export type BlockWidth = "half" | "full";
export type MobilePresentation = "stack" | "compact";
export type OverflowMode = "wrap" | "shrink" | "ellipsis" | "scroll";
export type EmptyValueMode = "hide" | "dash" | "custom" | "preserve" | "fallback";

export interface TableSelector {
	headerSignature: string;
	occurrence: number;
}

export interface DeckSource {
	id: string;
	kind: "file" | "folder";
	path: string;
	table: { mode: "all" } | { mode: "single"; selector: TableSelector };
}

export interface EmptyValuePolicy {
	mode: EmptyValueMode;
	customText: string;
	emptyTokens: string[];
	required: boolean;
}

export interface BlockOverflow {
	mode: OverflowMode;
	minFontPx: number;
	maxLines: number | null;
}

export interface BlockHeight {
	mode: "auto" | "min" | "fixed";
	valuePx: number;
}

export interface BlockAppearanceOverride {
	inherit: boolean;
	background?: string;
	text?: string;
	border?: string;
	borderWidth?: number;
	radius?: number;
	align?: "left" | "center" | "right";
}

export interface CardBlock {
	id: string;
	kind: BlockKind;
	columns: string[];
	visible: boolean;
	showLabel: boolean;
	label: string;
	combine: "all" | "firstNonEmpty";
	width: BlockWidth;
	mobile: MobilePresentation;
	height: BlockHeight;
	overflow: BlockOverflow;
	empty: EmptyValuePolicy;
	image: {
		fit: "contain" | "cover";
		aspect: "auto" | "1:1" | "4:3" | "16:9";
		position: "top" | "center" | "bottom";
		caption: "alt" | "column" | "none";
		zoom: boolean;
	};
	appearance: BlockAppearanceOverride;
}

export interface AppearanceSettings {
	preset: "obsidian" | "monochrome" | "custom";
	overlay: "auto" | "center" | "full";
	size: "compact" | "comfort" | "large";
	windowBackground: string;
	cardBackground: string;
	primaryText: string;
	secondaryText: string;
	labelText: string;
	accent: string;
	borderColor: string;
	radius: number;
	border: "none" | "thin" | "solid";
	borderWidth: number;
	padding: number;
	gap: number;
	wordScale: number;
	cardShadow: boolean;
	twoColumn: boolean;
	twoColumnFrom: number;
	maxWidth: number;
}

export interface Deck {
	id: string;
	name: string;
	enabled: boolean;
	sources: DeckSource[];
	blocks: CardBlock[];
	columnTypes: Record<string, ColumnDataType>;
	appearance?: Partial<AppearanceSettings>;
	shuffleDefault: boolean;
}
```

`Deck.blocks` order is the visual order. Desktop CSS grid auto-places half-width blocks and lets full-width blocks span both columns. Phone always uses one column; `mobile` changes density, never hides data.

`face` and `column: main | side | full` are migration-only v1 fields. They do not remain in the v2 runtime model.

## Parsed tables and cells

```ts
export interface ImageRef {
	source: string;
	alt: string;
	width?: number;
	height?: number;
	external: boolean;
}

export interface CellValue {
	raw: string;
	text: string;
	detectedType: ColumnDataType;
	images: ImageRef[];
}

export interface ParsedTable {
	index: number;
	selector: TableSelector;
	headers: string[];
	rows: Array<Record<string, CellValue>>;
	sourcePath: string;
}

export interface ColumnProfile {
	header: string;
	inferredType: ColumnDataType;
	confidence: number;
	total: number;
	nonEmpty: number;
	unique: number;
	samples: string[];
	warnings: Array<"mixed" | "mostlyEmpty" | "brokenImage">;
}

export interface Card {
	cells: Record<string, CellValue>;
	headers: string[];
	sourcePath: string;
	tableSelector: TableSelector;
	rowIndex: number;
}

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

The table scanner must not split escaped pipes, pipes inside Obsidian wikilinks/embeds, or pipes inside Markdown link/image destinations. Raw Markdown is preserved; plain text is derived separately.

Table identity is `normalized header signature + occurrence among tables with that signature`. If a saved table is missing, the deck is not silently redirected to another table; the editor displays a repair action.

## Type profiling

- Ignore configured empty tokens before detection.
- Image wins when every non-empty sample is an image or image-only Markdown.
- Boolean accepts `true/false`, `yes/no`, `да/нет`, and checkbox forms.
- Number requires locale-independent finite numeric syntax.
- Date requires an ISO-like unambiguous date; ambiguous `01/02/03` stays text.
- Tags require repeated token/list structure, not merely one `#` character.
- Link includes wikilinks and Markdown links that are not image-only.
- Markdown requires supported inline/block syntax after excluding links/images.
- Mixed is returned when no dominant supported type reaches `0.8` confidence.
- The stored per-deck override always wins over inference.

Profiling is informational and never mutates table data.

## Empty and invalid values

- `required: true` with no resolved value skips the complete row.
- The loader returns diagnostics with source, table, row number, and reason.
- `fallback` uses the first non-empty configured column.
- `all` renders every non-empty configured column in order.
- Missing optional images use the block empty policy; broken image files render an inline missing-image state with source name.
- Empty tokens default to `""`, `-`, `—`, `n/a`, `null`; decks may override the list.

## Study experience

- All enabled blocks are present from first paint.
- Header: deck picker, position, close.
- Body: one independently scrolling card surface.
- Footer: previous, shuffle, next; stays fixed above safe-area inset.
- Arrow keys move between cards; `S` toggles shuffle; Escape closes. Space and Enter do not reveal anything.
- Horizontal swipe changes card only when it is clearly horizontal and does not start on a horizontally scrollable block.
- Switching card resets internal block scroll positions.
- Desktop uses two columns at the configured container breakpoint; phone stays one column.
- Short content is content-height and vertically balanced without pinning the last block to the bottom.

## Image experience

- Default: `contain`, auto aspect, centered, no crop.
- `cover` exposes top/center/bottom focal position.
- Alt text comes from Markdown alt text, then file basename, then localized `Image` fallback.
- Tap-to-zoom opens an accessible dialog with close button, Escape, focus trap, and pinch/browser zoom support.
- Lazy loading is allowed; navigation must not wait for decoding.
- Remote Markdown images use the standard image URL only; the plugin makes no separate network request.

## Editor information architecture

### First setup

1. Select file or folder.
2. Select one table or all matching tables.
3. Scan and show `columns · rows · warnings`.
4. Apply automatic layout.
5. Open the canvas editor.

Only warnings are expanded initially. Full samples and type overrides open from a column row.

### Desktop

- Header: Back, deck title/dirty state, Undo, Redo, preview device, Save.
- Canvas: true-size card preview and row navigator.
- Persistent entry points: Fields and Card style.
- Selected block toolbar: Type, Width, Move, More.
- One modal layer at a time: fields sheet or properties sheet.
- Properties sheet has Block/Card tabs; each uses accordions with one expanded group.

### Phone

- Full-screen editor with safe-area support.
- Header: Back, title/dirty state, Save.
- Canvas remains visible.
- Bottom actions: Fields, Block, Card.
- Detailed controls use one bottom sheet with a drag indicator, title, close, scroll body, and sticky footer.
- Type and deck pickers use a bottom sheet, not anchored popovers.
- No resize handles. Width/height use segmented or select controls.
- Reorder mode uses large rows, drag handles, and Move up/Move down buttons.

### Progressive disclosure

Default block controls: type, width, order, label, empty behavior. Typography, colors, fixed height, line clamp, image crop, and mobile density are advanced.

Card colors begin with three presets: Obsidian, monochrome, custom. Individual color inputs appear only for custom. Contrast is calculated for primary, secondary, label, and each block override.

## Editor state and persistence

- The modal clones the persisted deck into a draft.
- Every editor command is a pure action recorded in a bounded history of 100 states.
- Pointer resize previews locally and commits one history action on pointer-up.
- Save replaces the stored deck and calls `saveSettings()` once.
- Cancel/back closes immediately when clean; when dirty it offers Discard, Continue editing, Save.
- Column rescan merges by normalized header, preserves matching overrides, and reports removed mappings.

## Custom controls and accessibility

- Sheets use `role="dialog"`, `aria-modal="true"`, a labelled heading, initial focus, focus trap, Escape, and focus restoration.
- Listboxes use `aria-expanded`, `aria-controls`, `role="option"`, `aria-selected`, roving focus, arrows, Home/End, Enter, and Escape.
- Toggles and selection controls are native inputs or expose equivalent name, role, and state.
- Drag has keyboard Move up/Move down alternatives and screen-reader announcements.
- No interactive target is smaller than 44×44 CSS px on coarse pointers.
- Body/control text is at least 14 px; auxiliary labels are at least 12 px.
- Text contrast is at least 4.5:1, large text and non-text boundaries at least 3:1.
- Focus is visible independently of color.
- Motion is disabled under `prefers-reduced-motion: reduce`.

## Localization

- `UiLocale` remains `en | ru`; `LocaleMode` remains `auto | en | ru`.
- Every visible label, status, error, empty state, image fallback, and accessibility name is a typed translation key.
- Tests assert catalog key parity and render critical controls in both locales.
- Layout is tested with a 30% text expansion fixture.

## Migration

- Add `schemaVersion: 2` to plugin settings.
- Convert `files` and `folders` to `sources` with `table.mode = "all"`.
- Sort old blocks by original array order, discard `face`, map `column === "full"` to `width: "full"`, and map `main/side` to `half`.
- Map `style` to `kind`; preserve columns, visibility, and labels.
- Move global appearance into global defaults; each deck starts with no override.
- Migration is pure, idempotent, and retains a clone of unknown future keys only where explicitly supported.

## Failure states

| Failure | User-visible result |
| --- | --- |
| File/folder missing | Source row shows error and Repair; other sources still load. |
| Selected table missing | Deck reports the missing signature; no silent fallback. |
| Duplicate/empty headers | Table warning; generated stable display names; user must confirm before Save. |
| Required cell empty | Row skipped; summary gives count and first affected rows. |
| Mixed column | Warning and manual type picker; text rendering remains safe default. |
| Broken image | Inline placeholder with filename and accessible error text. |
| No valid cards | Explanatory empty state with Open editor action. |
| Settings migration fails | Keep original loaded data in memory, use safe defaults, show localized notice; do not overwrite until Save. |

## Verification contract

- Unit: parser, image syntax, table identity, profiler, empty policies, migration, reducer/history, layout resolution, locale parity.
- Static: ESLint and TypeScript clean; production build succeeds.
- Browser: Playwright snapshots and screenshots at 1440×1000, 768×1024, 390×844, and 320×568; keyboard-only editor flow; 200% zoom; reduced motion.
- Manual Obsidian: dark/light Cupertino or active theme, desktop and phone, real vault images, missing image, long word, 1-column table, 2-column table, 8-column table, multiple tables, empty required cell.
- No source Markdown file changes during any test.
