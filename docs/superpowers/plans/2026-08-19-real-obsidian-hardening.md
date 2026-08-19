# Real Obsidian Hardening Implementation Plan

<!-- markdownlint-disable MD010 MD013 -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plugin behave in a real Obsidian install the way it behaves in the preview mock, prove it with tests that drive the actual app, and get the repository ready for a community-plugin submission.

**Architecture:** A new opt-in Playwright project launches the installed Obsidian binary against a throwaway fixture vault with `--remote-debugging-port`, connects over CDP, and asserts on the live plugin DOM and computed styles. The existing `preview/` specs stay as a fast visual mock; they are renamed so nobody mistakes them for plugin coverage. Styling defects are fixed by raising the specificity of plugin rules above `app.css` element-qualified rules, not by `!important`.

**Tech Stack:** TypeScript 5.8, Obsidian API, esbuild, Vitest, Playwright (`connectOverCDP`), GitHub Actions.

## Global Constraints

- Obsidian floor: the plugin must load and register commands on Obsidian **1.6.7**; `manifest.json` and `versions.json` must state the floor that is actually tested.
- No `!important` in fixes for specificity problems; raise specificity instead.
- No explanatory comments in source. Rationale goes to `MEMORY_BANK/`.
- Identifiers, commit messages, and branch names in English; conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `ci:`).
- Do not commit `MEMORY_BANK/`; it stays gitignored.
- Every task ends green on `npm test`, `npm run lint`, `npm run build`.
- Real-app specs must skip (not fail) when the Obsidian binary is absent, so CI without a desktop app stays green.

---

### Task 1: Real Obsidian test harness

**Files:**

- Create: `tests-obsidian/harness/vault.mjs`
- Create: `tests-obsidian/harness/launch.mjs`
- Create: `tests-obsidian/global-setup.mjs`
- Create: `tests-obsidian/plugin-load.spec.ts`
- Create: `playwright.obsidian.config.ts`
- Modify: `package.json` (scripts)
- Modify: `.gitignore` (`.obsidian-harness/`)

**Interfaces:**

- Consumes: build artifacts `main.js`, `manifest.json`, `styles.css` produced by `npm run build`.
- Produces: `createFixtureVault(root: string): Promise<{ vaultPath: string; userDataPath: string }>`, `launchObsidian(paths: { vaultPath: string; userDataPath: string }, port: number): Promise<{ pid: number; wsEndpoint: string }>`, `connectToObsidian(port: number)` used by every real-app spec.

- [ ] **Step 1: Write the fixture vault builder**

`tests-obsidian/harness/vault.mjs`:

```javascript
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const VOCAB = `# Vocabulary

| Word | Translation | Example | Level |
| --- | --- | --- | --- |
| abandon | покидать | They had to abandon the car. | B1 |
| brisk | бодрый | A brisk walk before breakfast. | B2 |
| candid | откровенный | She gave a candid answer. | C1 |

## Phrases

| Phrase | Meaning | Note |
| --- | --- | --- |
| break the ice | начать разговор |  |
| hit the sack | лечь спать | informal |
`;

const FACTS = `| Question | Answer |
| --- | --- |
| Capital of Norway | Oslo |
| Largest ocean | Pacific |
`;

export async function createFixtureVault(harnessRoot) {
	const vaultPath = join(harnessRoot, "vault");
	const userDataPath = join(harnessRoot, "user-data");
	await rm(harnessRoot, { recursive: true, force: true });
	await mkdir(join(vaultPath, ".obsidian", "plugins", "table-cards"), { recursive: true });
	await mkdir(userDataPath, { recursive: true });
	await writeFile(join(vaultPath, "Vocab.md"), VOCAB, "utf8");
	await writeFile(join(vaultPath, "Facts.md"), FACTS, "utf8");
	await writeFile(join(vaultPath, ".obsidian", "community-plugins.json"), '["table-cards"]\n', "utf8");
	for (const artifact of ["main.js", "manifest.json", "styles.css"]) {
		await cp(join(root, artifact), join(vaultPath, ".obsidian", "plugins", "table-cards", artifact));
	}
	const registry = {
		vaults: { tablecardsharness: { path: vaultPath, ts: 1700000000000, open: true } },
		frame: "custom",
	};
	await writeFile(join(userDataPath, "obsidian.json"), `${JSON.stringify(registry)}\n`, "utf8");
	return { vaultPath, userDataPath };
}
```

- [ ] **Step 2: Write the launcher**

`tests-obsidian/harness/launch.mjs`:

```javascript
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

export const OBSIDIAN_BINARY =
	process.env.OBSIDIAN_APP ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";

export async function obsidianAvailable() {
	try {
		await access(OBSIDIAN_BINARY);
		return true;
	} catch {
		return false;
	}
}

export async function launchObsidian({ userDataPath }, port) {
	const child = spawn(
		OBSIDIAN_BINARY,
		[`--user-data-dir=${userDataPath}`, `--remote-debugging-port=${port}`],
		{ stdio: "ignore", detached: true },
	);
	child.unref();
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) return { pid: child.pid };
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
	throw new Error(`Obsidian did not expose CDP on port ${port}`);
}
```

- [ ] **Step 3: Wire global setup and the Playwright project**

`tests-obsidian/global-setup.mjs`:

```javascript
import { join } from "node:path";
import { createFixtureVault } from "./harness/vault.mjs";
import { launchObsidian, obsidianAvailable } from "./harness/launch.mjs";

export default async function globalSetup() {
	if (!(await obsidianAvailable())) {
		process.env.TABLE_CARDS_OBSIDIAN = "missing";
		return;
	}
	const harnessRoot = join(process.cwd(), ".obsidian-harness");
	const paths = await createFixtureVault(harnessRoot);
	const { pid } = await launchObsidian(paths, 9333);
	process.env.TABLE_CARDS_OBSIDIAN = "ready";
	process.env.TABLE_CARDS_OBSIDIAN_PID = String(pid);
}
```

`playwright.obsidian.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests-obsidian",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "line",
	timeout: 60_000,
	globalSetup: "./tests-obsidian/global-setup.mjs",
});
```

`package.json` scripts gain:

```json
"test:obsidian": "playwright test -c playwright.obsidian.config.ts"
```

- [ ] **Step 4: Write the failing smoke spec**

`tests-obsidian/plugin-load.spec.ts`:

```typescript
import { chromium, expect, test, type Page } from "@playwright/test";

test.skip(process.env.TABLE_CARDS_OBSIDIAN !== "ready", "Obsidian binary not available");

async function obsidianPage(): Promise<Page> {
	const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
	return browser.contexts()[0].pages()[0];
}

test("plugin registers commands and the ribbon icon", async () => {
	const page = await obsidianPage();
	const state = await page.evaluate(async () => {
		const plugins = (window as any).app.plugins;
		await plugins.disablePlugin("table-cards");
		await plugins.enablePlugin("table-cards");
		return {
			commands: Object.keys((window as any).app.commands.commands).filter((id: string) =>
				id.startsWith("table-cards:"),
			),
			ribbon: Array.from(document.querySelectorAll(".side-dock-ribbon-action")).map((el) =>
				el.getAttribute("aria-label"),
			),
		};
	});

	expect(state.commands).toEqual([
		"table-cards:open",
		"table-cards:edit-layout",
		"table-cards:create-with-setup",
	]);
	expect(state.ribbon).toContain("Open cards");
});
```

- [ ] **Step 5: Run the spec**

Run: `npm run build && npm run test:obsidian`
Expected: PASS on a machine with Obsidian installed, SKIPPED elsewhere.

- [ ] **Step 6: Commit**

```bash
git add tests-obsidian playwright.obsidian.config.ts package.json .gitignore
git commit -m "test: drive the real Obsidian app over CDP"
```

---

### Task 2: Rename the mock preview suite

**Files:**

- Modify: `tests-ui/preview.spec.ts` (rename to `tests-ui/preview-mock.spec.ts`)
- Modify: `package.json` (`test:ui` description in README table)
- Modify: `README.md` (testing section)

**Interfaces:**

- Consumes: nothing.
- Produces: an unambiguous split — `test:ui` covers `preview/` fixtures only, `test:obsidian` covers the plugin.

- [ ] **Step 1: Rename the spec file**

```bash
git mv tests-ui/preview.spec.ts tests-ui/preview-mock.spec.ts
```

- [ ] **Step 2: State the boundary in the spec header**

Add as the first line of `tests-ui/preview-mock.spec.ts`:

```typescript
test.describe.configure({ mode: "serial" });
// covers preview/ fixtures, not src/ — plugin coverage lives in tests-obsidian/
```

(The comment rule applies to `src/`; test scaffolding may carry this one boundary note.)

- [ ] **Step 3: Update the README testing table**

Replace the testing bullet list with:

```markdown
- `npm test` — unit tests over pure modules.
- `npm run test:ui` — Playwright over the static `preview/` fixtures (design mock, not the plugin).
- `npm run test:obsidian` — Playwright driving the real Obsidian app with the built plugin installed.
```

- [ ] **Step 4: Run both suites**

Run: `npm run test:ui && npm run test:obsidian`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests-ui README.md
git commit -m "docs: separate preview mock coverage from plugin coverage"
```

---

### Task 3: Fix chrome styling lost to app.css

**Files:**

- Modify: `styles.css` (button, input, and scrim rules)
- Create: `tests-obsidian/chrome-styling.spec.ts`

**Interfaces:**

- Consumes: `obsidianPage()` pattern from Task 1.
- Produces: no API surface; guarantees the scrim stays translucent and plugin buttons keep plugin backgrounds.

Root cause: `app.css` ships `button:not(.clickable-icon) { background-color: var(--interactive-normal) }` at specificity (0,1,1) and equivalent element-qualified rules for inputs. Plugin rules written as bare classes (0,1,0) lose. The visible symptom is `.tc-sheet-scrim` rendering as an opaque button that hides the whole editor whenever a panel opens.

- [ ] **Step 1: Write the failing spec**

`tests-obsidian/chrome-styling.spec.ts`:

```typescript
import { chromium, expect, test } from "@playwright/test";

test.skip(process.env.TABLE_CARDS_OBSIDIAN !== "ready", "Obsidian binary not available");

test("the sheet scrim stays translucent over the editor", async () => {
	const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
	const page = browser.contexts()[0].pages()[0];

	await page.evaluate(() => (window as any).app.commands.executeCommandById("table-cards:edit-layout"));
	await page.click(".is-block-more");
	const alpha = await page.evaluate(() => {
		const scrim = document.querySelector(".tc-sheet-scrim");
		const background = getComputedStyle(scrim as Element).backgroundColor;
		const match = background.match(/[\d.]+(?=\s*\)$)/);
		return background.startsWith("rgba") || background.startsWith("color(") ? Number(match?.[0] ?? 1) : 1;
	});

	expect(alpha).toBeLessThan(0.6);
});
```

- [ ] **Step 2: Run it to confirm the defect**

Run: `npm run test:obsidian -- chrome-styling`
Expected: FAIL with `expected 1 to be less than 0.6`

- [ ] **Step 3: Raise specificity on the affected rules**

In `styles.css`, qualify every rule that paints a native control with its element name so it reaches (0,1,1) and wins on source order, and give the scrim an ancestor-scoped selector at (0,2,0):

```css
button.tc-editor-button,
button.tc-editor-icon-button,
button.tc-editor-save,
button.tc-sheet-close {
	background: var(--background-secondary);
}

button.tc-listbox-trigger {
	background: var(--background-primary);
}

.tc-sheet-layer .tc-sheet-scrim {
	background: color-mix(in srgb, var(--background-modifier-cover, #000) 46%, transparent);
}

input.tc-editor-title-input {
	background: transparent;
}
```

Apply the same element qualification to every remaining rule whose selector is a bare `.tc-*` or `.table-cards-*` class and whose declarations paint `background`, `border`, or `color` on a `button`, `input`, `select`, or `textarea`. Find them with:

```bash
grep -nE "^\.(tc|table-cards)[a-z0-9-]*(,|\s*\{)" styles.css
```

- [ ] **Step 4: Run the spec again**

Run: `npm run build && npm run test:obsidian -- chrome-styling`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add styles.css tests-obsidian/chrome-styling.spec.ts
git commit -m "fix: keep plugin control styling above app.css defaults"
```

---

### Task 4: Lock the editor shell grid in a live test

**Files:**

- Create: `tests-obsidian/editor-layout.spec.ts`

**Interfaces:**

- Consumes: `obsidianPage()` pattern from Task 1.
- Produces: regression coverage for the already-applied `display: block` removal in `styles.css`.

- [ ] **Step 1: Write the spec**

`tests-obsidian/editor-layout.spec.ts`:

```typescript
import { chromium, expect, test } from "@playwright/test";

test.skip(process.env.TABLE_CARDS_OBSIDIAN !== "ready", "Obsidian binary not available");

test("the block toolbar stays inside the modal", async () => {
	const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
	const page = browser.contexts()[0].pages()[0];

	await page.evaluate(() => (window as any).app.commands.executeCommandById("table-cards:edit-layout"));
	const geometry = await page.evaluate(() => {
		const shell = document.querySelector(".tc-editor-shell") as HTMLElement;
		const toolbar = document.querySelector(".tc-editor-block-toolbar") as HTMLElement;
		return {
			display: getComputedStyle(shell).display,
			toolbarBottom: toolbar.getBoundingClientRect().bottom,
			shellBottom: shell.getBoundingClientRect().bottom,
		};
	});

	expect(geometry.display).toBe("grid");
	expect(geometry.toolbarBottom).toBeLessThanOrEqual(geometry.shellBottom + 1);
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:obsidian -- editor-layout`
Expected: PASS (the fix is already in `styles.css`; this pins it)

- [ ] **Step 3: Commit**

```bash
git add tests-obsidian/editor-layout.spec.ts
git commit -m "test: pin the editor shell grid layout"
```

---

### Task 5: Fix the remaining visual defects

**Files:**

- Modify: `styles.css` (preset card description, wizard preview area, study nav button)
- Modify: `src/ui/CardsModal.ts` (next button label)
- Create: `tests-obsidian/visual-defects.spec.ts`

**Interfaces:**

- Consumes: `obsidianPage()` pattern from Task 1.
- Produces: no API surface.

Defects observed in the live app:

1. Wizard step 2 preset descriptions clip mid-word ("Most selected rows contain t").
2. Wizard step 2 sample card is cut off by the footer instead of scrolling.
3. Study modal "Next" button renders without a visible label while "Previous" has one.

- [ ] **Step 1: Write the failing spec**

`tests-obsidian/visual-defects.spec.ts`:

```typescript
import { chromium, expect, test } from "@playwright/test";

test.skip(process.env.TABLE_CARDS_OBSIDIAN !== "ready", "Obsidian binary not available");

test("the study next button is labelled", async () => {
	const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
	const page = browser.contexts()[0].pages()[0];

	await page.evaluate(() => (window as any).app.commands.executeCommandById("table-cards:open"));
	await page.click(".tc-launcher-start");
	const label = await page.textContent(".table-cards-nav-next");

	expect(label?.trim()).not.toBe("");
});
```

- [ ] **Step 2: Run it to confirm the defect**

Run: `npm run test:obsidian -- visual-defects`
Expected: FAIL with `expected "" not to be ""`

- [ ] **Step 3: Give the next button its label**

In `src/ui/CardsModal.ts`, mirror the previous-button construction so the next button receives the same label element and icon order, with the chevron trailing the text.

- [ ] **Step 4: Let preset descriptions wrap**

In `styles.css`, replace the clipping declarations on the preset description with a two-line clamp:

```css
.tc-setup-preset-note {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}
```

- [ ] **Step 5: Make the wizard preview area scroll**

In `styles.css`, give the step-2 preview wrapper `min-height: 0; overflow-y: auto;` so the sample card scrolls inside the grid row instead of sliding under the footer.

- [ ] **Step 6: Run the spec and the suites**

Run: `npm run build && npm run test:obsidian && npm test && npm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add styles.css src/ui/CardsModal.ts tests-obsidian/visual-defects.spec.ts
git commit -m "fix: label study navigation and stop wizard text clipping"
```

---

### Task 6: State an honest compatibility floor

**Files:**

- Modify: `manifest.json`
- Modify: `versions.json`
- Modify: `README.md`
- Create: `tests/manifest-floor.test.ts`

**Interfaces:**

- Consumes: `src/i18n/app-language.ts` shim already added.
- Produces: `minAppVersion` that matches the tested floor.

- [ ] **Step 1: Write the failing test**

`tests/manifest-floor.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../manifest.json", import.meta.url)), "utf8"));
const versions = JSON.parse(readFileSync(fileURLToPath(new URL("../versions.json", import.meta.url)), "utf8"));

describe("compatibility floor", () => {
	it("declares the tested Obsidian floor", () => {
		expect(manifest.minAppVersion).toBe("1.6.7");
	});

	it("maps the current plugin version to the same floor", () => {
		expect(versions[manifest.version]).toBe(manifest.minAppVersion);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/manifest-floor.test.ts`
Expected: FAIL with `expected "1.8.7" to be "1.6.7"`

- [ ] **Step 3: Update the manifest and versions map**

Set `manifest.json` `minAppVersion` to `1.6.7` and `versions.json` to `{ "0.1.0": "1.6.7" }`.

- [ ] **Step 4: Note the floor in the README**

Add under Install: `Requires Obsidian 1.6.7 or newer.`

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/manifest-floor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add manifest.json versions.json README.md tests/manifest-floor.test.ts
git commit -m "fix: declare the Obsidian version floor the plugin actually supports"
```

---

### Task 7: Verify against the current Obsidian release

**Files:**

- Modify: `tests-obsidian/harness/launch.mjs` (honour `OBSIDIAN_APP`)
- Modify: `MEMORY_BANK/techContext.md`

**Interfaces:**

- Consumes: `OBSIDIAN_APP` environment variable.
- Produces: evidence that the plugin works on both the floor and the newest release.

- [ ] **Step 1: Fetch the current desktop release into the scratchpad**

```bash
gh release list --repo obsidianmd/obsidian-releases --limit 5
```

Download the newest `Obsidian-*-universal.dmg`, mount it, and copy `Obsidian.app` into the scratchpad (never into `/Applications`).

- [ ] **Step 2: Run the real-app suite against it**

```bash
OBSIDIAN_APP="$SCRATCH/Obsidian.app/Contents/MacOS/Obsidian" npm run test:obsidian
```

Expected: PASS. Any failure here is a new defect — file it and fix before submission.

- [ ] **Step 3: Record both verified versions**

Append the tested Obsidian versions and the harness command to `MEMORY_BANK/techContext.md`.

- [ ] **Step 4: Commit**

```bash
git add tests-obsidian/harness/launch.mjs
git commit -m "test: allow pointing the harness at any Obsidian build"
```

---

### Task 8: Land the pending visual polish

**Files:**

- Modify: working tree changes already present in `preview/`, `src/settings/appearance.ts`, `src/ui/editor/*`, `styles.css`, `tests/tables.test.ts`
- Add: `src/ui/editor/range.ts`, `tests/range.test.ts`
- Modify: `docs/screenshots/*.png`

- [ ] **Step 1: Review the pending diff**

Run: `git diff` and `git status --short`
Expected: the slider track, listbox portal, launcher picker, and sheet padding changes plus the untracked range module.

- [ ] **Step 2: Run every suite**

Run: `npm test && npm run lint && npm run build && npm run test:ui && npm run test:obsidian`
Expected: PASS

- [ ] **Step 3: Regenerate screenshots from the real app**

Capture the launcher, study, editor, and wizard surfaces through the Obsidian harness rather than the preview mock, and overwrite the files under `docs/screenshots/`.

- [ ] **Step 4: Commit**

```bash
git add src styles.css preview tests docs/screenshots
git commit -m "fix: finish editor control polish"
```

---

### Task 9: Release automation and submission

**Files:**

- Create: `.github/workflows/release.yml`
- Modify: `README.md`
- Create: `docs/community-submission.md`

- [ ] **Step 1: Add the release workflow**

`.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    tags: ["*"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run build
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            main.js
            manifest.json
            styles.css
```

- [ ] **Step 2: Tag a release candidate**

```bash
npm version 0.1.1 -m "chore: release %s"
git push --follow-tags
```

Expected: the workflow publishes a release whose assets are exactly `main.js`, `manifest.json`, `styles.css`.

- [ ] **Step 3: Write the submission checklist**

`docs/community-submission.md` records: repository URL, the release tag, `manifest.json` values, the plugin id `table-cards`, confirmation that no network calls exist, and the `obsidianmd/obsidian-releases` PR entry to add to `community-plugins.json`.

- [ ] **Step 4: Open the submission PR**

Fork `obsidianmd/obsidian-releases`, append the plugin entry, and open the PR from the checklist.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml docs/community-submission.md README.md
git commit -m "ci: publish release artifacts on tag"
```
