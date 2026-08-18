# Table Cards — design

<!-- markdownlint-disable MD013 MD040 -->

Date: 2026-08-18
Repo: `~/Projects/Personal/obsidian-table-cards`
Plugin id: `table-cards`
Vault install: `~/Obsidian/.obsidian/plugins/table-cards/`

## Goal

Fullscreen study overlay inside Obsidian. One command opens cards parsed from markdown tables. Same product on phone, tablet, and desktop — layout follows the overlay width, not “if mobile then dumbed down”.

Default decks: Maxim’s English `Dictionary.md` and `Phrases.md`. Any other table works through a column map.

## Success

- Phone: one tap → overlay covers the app → swipe / tap to learn without chrome fighting the card.
- Desktop: overlay is a large study surface, not a tiny settings dialog. Keyboard is enough: reveal, next, prev, close.
- Narrow desktop window and iPad portrait use the phone stack. Wide desktop and iPad landscape use two columns when the back is revealed.
- Theme follows Obsidian (Minimal / dark / light) via CSS variables. No hardcoded brand palette.
- Tables are never rewritten. Progress lives in plugin `data.json`.
- Offline. No network. `isDesktopOnly: false`.

## Non-goals (v1)

- Spaced repetition (SM-2 / FSRS). Hook later via `data.json`, not vault columns.
- Editing the dictionary from the card.
- Anki / sync / TTS / images / cloze.
- Community catalog submission. Repo is publish-shaped; first PR to `obsidian-releases` is a later task.

## Product

### Open

- Command `table-cards:open` — “Open cards”.
- Ribbon icon (left drawer on mobile).
- Optional: command `table-cards:open-deck` with a deck picker if more than one deck is enabled.

User pins `Open cards` to the mobile toolbar via Commander (already installed). Plugin does not depend on Commander.

### Overlay

One custom `Modal` subclass, CSS class `table-cards-modal`.

Chrome:

```
[ deck ▾ ]                    12 / 583                    [ × ]
┌─────────────────────────────────────────────────────────┐
│                         CARD                            │
└─────────────────────────────────────────────────────────┘
[  ← prev  ]              [ shuffle ]              [ next → ]
```

- Header and footer stay put. Only the card body scrolls when tip/example is long.
- Close: X, overlay tap on desktop, Android back, Escape.
- Empty deck: short message + link-like hint to Settings, not a blank screen.

### Card faces (same content as HermesWidgets)

Hidden (self-check):

- Front: `word` (largest type)
- Sub: IPA then RuPron, if present
- Hint: “tap to reveal” / “click to reveal” / “space to reveal” — string depends on input, not on OS. Coarse pointer → tap. Fine pointer → click. Keyboard focus → space.

Revealed:

- Translation
- Example
- Example translation
- Memory tip in a distinct panel (lightbulb treatment like the widget)

Tap / click on the card toggles reveal. Changing card resets reveal to hidden.

### Adaptive layout

Layout is driven by the **overlay content width** (ResizeObserver or container queries on `.table-cards-modal`), not by `Platform.isMobile` alone. `isMobile` only changes chrome (fullscreen vs centered) and default gesture set.

| Overlay width | Frame | Card |
| --- | --- | --- |
| `< 560px` | edge-to-edge, `100dvh`, safe-area insets | one column, word-first, big type, stacked details |
| `560–839px` | tablet / narrow window: almost full, 16–24px inset | one column, more air, still stacked |
| `≥ 840px` | centered study surface, max 920px, height `min(820px, 86vh)` | hidden: one column centered. revealed: two columns — word+pron left, details right (widget XL) |

Rules:

- Minimum tap/click target 44×44px. Footer buttons stretch. No hover-only actions.
- `@media (pointer: coarse)` increases hit areas and swipe affinity. Fine pointer shows hover on buttons.
- Vertical swipe / overflow scroll on the card body never starts a deck change. Horizontal swipe (coarse pointer, `|dx| > 56` and `|dx| > 1.5 * |dy|`) goes next/prev.
- Swipe does not fight Obsidian’s own page swipe: overlay captures touch while open (`touch-action: pan-y` on the body, horizontal handled in JS).
- Long words scale down (`min(1, available)`), never overflow the card.
- Safe area: `padding-top: env(safe-area-inset-top)` etc. Footer sits above the home indicator.
- Desktop modal is not the default Obsidian 400px dialog. Class overrides width/height/padding. Mobile uses `mod-sidebar-layout`-style full bleed (no dimmed “card floating in a sea of vault”).

### Input map

| Action | Touch | Mouse | Keyboard |
| --- | --- | --- | --- |
| Reveal / hide | tap card | click card | Space, Enter |
| Next | swipe left, footer | footer, click | ArrowRight, L, J |
| Prev | swipe right, footer | footer, click | ArrowLeft, H, K |
| Shuffle toggle | footer | footer | S |
| Close | X, system back | X, click dim | Escape |
| Switch deck | header select | header select | D opens deck list |

No hidden gestures. Every gesture has a visible control.

### Motion

- Card change: 180ms translate, reduce-motion → instant.
- Reveal: 160ms fade/expand, reduce-motion → instant.
- No bounce/parallax.

## Extensibility

A **deck** is a named mapping, not an English-specific type.

```ts
type CardField = "word" | "ipa" | "rupron" | "translation" | "example" | "exampleRu" | "tip";

interface Deck {
  id: string;
  name: string;
  enabled: boolean;
  files: string[];          // vault-relative paths
  folders: string[];        // all `*.md` in folder, non-recursive v1
  columns: Partial<Record<CardField, string[]>>; // header aliases, first match wins
  shuffleDefault: boolean;
}
```

Built-in presets (user can edit/disable):

1. `dictionary` → `30_Areas/English/Dictionary/Dictionary.md`
   - word: Words, Word, Слово
   - ipa: Transcription, IPA, Транскрипция
   - rupron: RuPron, Произношение
   - translation: Translation, Перевод
   - example: Examples, Example, Пример
   - exampleRu: Ex Translation, Перевод примера
   - tip: Memory Tip, Mnemonic, Мнемоника, Подсказка
2. `phrases` → `30_Areas/English/Dictionary/Phrases.md`
   - word: Phrase, Phrases, Фраза
   - ipa / rupron: same aliases. If the table has no RuPron column, Transcription is treated as RuPron (same rule as `feed-native-widgets.py`).
   - tip also matches «Что буквально»

Unknown columns are ignored. A table without a resolvable `word` column contributes zero cards (notice in settings, not a crash).

v1 settings UI: list of decks, enable, paths, alias textareas. No visual column mapper yet.

## Parser

Pure functions, no Obsidian import — unit-tested.

Input: markdown string. Output: `Card[]`.

1. Keep lines that start with `|`.
2. Split cells on `|`, trim, strip wrapping `**`.
3. Skip separator rows (`---` / `:---:`).
4. First remaining row is header. Resolve aliases (lowercase, strip `*` `` ` ``).
5. Each following row → card. Empty word → skip.
6. Clean cell: collapse whitespace, strip leftover `*` `` ` ``, keep meaning.
7. If tip equals translation (case-insensitive), drop tip (widget rule).
8. Do not shorten tip in the plugin (widget shortens for 155pt height; overlay can scroll).

Several tables in one file: parse each independently, concatenate.

Frontmatter and prose around tables are ignored.

## State

`data.json`:

```ts
interface PluginData {
  decks: Deck[];
  locale: "auto" | "en" | "ru";
  lastDeckId: string | null;
  perDeck: Record<string, { index: number; shuffle: boolean; seed: number }>;
}
```

- Index is remembered per deck across opens.
- Shuffle uses a stored seed so order is stable until the user toggles shuffle again.
- Vault files are not modified.

Reload cards when the overlay opens (read current file text). No background vault crawl on `onload`.

## Architecture

Mirror `ai-refiner`: TypeScript, esbuild, vitest, eslint, `src/` split, deploy script.

```
src/
  main.ts                 # onload / onunload only
  settings/               # types, defaults, tab
  i18n/                   # en.ts, ru.ts, resolve(locale)
  parse/                  # table → Card
  deck/                   # resolve files, merge cards, shuffle
  ui/
    CardsModal.ts         # overlay lifecycle, keys, resize
    CardView.ts           # face / revealed DOM
    gestures.ts           # swipe
  commands.ts
styles.css                # tokens from --obsidian vars, breakpoints
```

`main.ts` stays small. No Node/Electron APIs.

## i18n

Two catalogs, never `"english / русский"` in one literal. `auto` uses Obsidian `getLanguage()`; `ru*` → ru, else en.

## Verification (before “done”)

- `npm test` — parser, aliases, phrases-without-rupron, tip-dedup, shuffle determinism.
- `npm run lint` + `tsc --noEmit`.
- `npm run build` → `main.js` + `manifest.json` + `styles.css`.
- Deploy to Maxim’s vault.
- Manual: desktop 1440 and 1100×700 window; DevTools iPhone 390 and iPad 768/1024. Confirm targets, swipe, keyboard, two-column at ≥840, theme variables on dark+light.
- If Playwright against a static HTML mock of the overlay is cheap, use it for the two widths. Live Obsidian mobile is still a human pass.

## Failure modes

| Case | Behavior |
| --- | --- |
| File missing | deck empty, settings shows path in red |
| No word column | skip table, count stays 0 for that file |
| All decks empty | overlay opens with empty state |
| Huge table (1k+ rows) | parse on open is fine; do not render all DOM nodes — one card in the DOM |
| Plugin unload with overlay open | modal closes, listeners gone via `register*` |
| Reduced motion | skip transforms |

## Community shape

- `manifest.json`: id `table-cards`, name `Table Cards`, author Maxim Kravtsov, `isDesktopOnly: false`.
- README.md + README.ru.md.
- LICENSE (0-BSD like ai-refiner, or MIT — pick MIT for catalog familiarity).
- No telemetry, no remote code, no `eval`.
- Release artifacts: `main.js`, `manifest.json`, `styles.css`.
