# Table Cards

<!-- markdownlint-disable MD013 -->

Turn Markdown tables into clean, all-visible study cards inside Obsidian. The plugin is offline, does not modify source notes, and uses the same responsive deck on desktop and mobile.

## Study

1. Enable **Table Cards** in **Settings → Community plugins**.
2. Run **Open cards** or use the ribbon button.
3. Pick a deck, then move with the buttons, arrow keys, or a horizontal swipe. Press `S` to toggle shuffle.

Every enabled block is visible immediately—there is no front/back reveal. Long content can wrap, shrink, truncate, or scroll inside its block. The footer stays fixed while the card itself scrolls.

## Visual editor

Open **Settings → Table Cards → Edit layout**.

- **Fields** — add a note or folder, choose one table or all tables, inspect detected column types, fill rates, samples, and warnings.
- **Automatic layout** — creates a sensible ordered grid without overwriting a custom layout until confirmed.
- **Canvas** — select a block directly on the rendered card. Drag it on desktop or use **Move up / Move down** on touch and keyboard; add and remove blocks from the order sheet.
- **Block** — choose its columns, type, label, desktop width, phone density, height, overflow, empty-cell behavior, image options, colors, border, and alignment.
- **Card style** — use Obsidian, monochrome, or custom colors; adjust spacing, type scale, radius, border, shadow, and maximum width.

Changes stay in a local draft until **Save**. Undo/redo is available from the header or `Cmd/Ctrl+Z`; `Cmd/Ctrl+S` saves. Closing with edits offers Save, Discard, or Continue editing.

## Data and empty cells

Columns are detected as text, number, date, boolean, tags, link, Markdown, image, or mixed. Detection is informational and can be overridden per deck.

Each block decides what an empty cell means:

- hide the block;
- show a dash;
- show custom text;
- preserve empty space;
- use the first non-empty configured column;
- skip the complete row when the block is required.

The default empty tokens are an empty string, `-`, `—`, `n/a`, and `null`.

## Images

Both Obsidian embeds such as `![[image.png|300x200]]` and Markdown images are supported. Image blocks provide contain/cover, aspect ratio, crop focus, captions, missing-file state, and optional tap-to-zoom. Local images resolve through the vault; remote Markdown image URLs are passed directly to the standard image element.

## Responsive behavior

Desktop can use ordered half/full-width blocks. Phone always uses one column, safe-area spacing, 44 px controls, and bottom sheets that keep the canvas visible. The editor includes dedicated desktop and phone previews.

## Migration

Existing v1 decks, file/folder sources, block order, visibility, and progress migrate automatically to schema v2. Source Markdown tables are never rewritten.

## Development

```bash
npm install
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run deploy
```

Static study and editor fixtures live in `preview/v2.html` and `preview/editor.html`.
