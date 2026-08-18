import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const screenshotRoot = join(process.cwd(), "docs/screenshots");
const accessibilityRoot = join(screenshotRoot, "a11y");

interface OpenedFixture {
	context: BrowserContext;
	page: Page;
	issues: string[];
	externalRequests: string[];
}

async function openFixture(
	browser: Browser,
	path: string,
	viewport: { width: number; height: number },
	coarse = false,
): Promise<OpenedFixture> {
	const context = await browser.newContext({
		viewport,
		hasTouch: coarse,
		isMobile: coarse,
		deviceScaleFactor: 1,
	});
	const page = await context.newPage();
	const issues: string[] = [];
	const externalRequests: string[] = [];
	page.on("console", (message) => {
		if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`);
	});
	page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.protocol !== "data:" && url.hostname !== "127.0.0.1") externalRequests.push(request.url());
	});
	await page.goto(path, { waitUntil: "networkidle" });
	await page.locator(".preview-root").waitFor({ state: "visible" });
	return { context, page, issues, externalRequests };
}

async function expectFixtureClean(fixture: OpenedFixture): Promise<void> {
	const { page, issues, externalRequests } = fixture;
	expect(issues, "console errors or warnings").toEqual([]);
	expect(externalRequests, "fixture network must stay local").toEqual([]);
	expect(await page.locator("select:visible").count(), "unexpected native select").toBe(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "horizontal document overflow").toBe(true);
	const unnamed = await page.locator("button:visible").evaluateAll((buttons) => buttons.flatMap((button) => {
		const name = button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "";
		return name ? [] : [button.outerHTML.slice(0, 180)];
	}));
	expect(unnamed, "visible buttons need accessible names").toEqual([]);
}

async function expectCoarseTargets(page: Page): Promise<void> {
	const undersized = await page.evaluate(() => {
		const raw = Array.from(document.querySelectorAll<HTMLElement>(
			'button, summary, input:not([type="checkbox"]):not([type="radio"]), label:has(input[type="checkbox"]), label:has(input[type="radio"])',
		));
		return raw.flatMap((element) => {
			if (element.closest(".preview-toolbar") || element.getClientRects().length === 0) return [];
			const rect = element.getBoundingClientRect();
			return rect.width + 0.5 < 44 || rect.height + 0.5 < 44
				? [{ tag: element.tagName, className: element.className, width: rect.width, height: rect.height }]
				: [];
		});
	});
	expect(undersized, "coarse-pointer targets below 44×44 CSS px").toEqual([]);
}

async function expectFooterSafe(page: Page): Promise<void> {
	const failures = await page.evaluate(() => {
		const selectors = ".tc-launcher-footer, .tc-setup-footer, .table-cards-footer, .tc-editor-block-toolbar, .tc-sheet-footer";
		return Array.from(document.querySelectorAll<HTMLElement>(selectors)).flatMap((footer) => {
			if (footer.getClientRects().length === 0) return [];
			const rect = footer.getBoundingClientRect();
			const padding = Number.parseFloat(getComputedStyle(footer).paddingBottom);
			return rect.bottom > window.innerHeight + 0.5 || padding < 8
				? [{ className: footer.className, bottom: rect.bottom, viewport: window.innerHeight, padding }]
				: [];
		});
	});
	expect(failures, "fixed footer must stay inside viewport with safe-area padding").toEqual([]);
}

async function capture(page: Page, name: string, withAccessibility = false): Promise<void> {
	await page.screenshot({ path: join(screenshotRoot, `${name}.png`), animations: "disabled" });
	if (!withAccessibility) return;
	const snapshot = await page.locator("main").ariaSnapshot();
	await writeFile(join(accessibilityRoot, `${name}.aria.txt`), `${snapshot}\n`, "utf8");
}

test.beforeAll(async () => {
	await mkdir(accessibilityRoot, { recursive: true });
});

test("desktop release fixtures and accessibility snapshots", async ({ browser }) => {
	const cases = [
		["/preview/launcher.html?state=general&capture=1", "launcher-desktop", true],
		["/preview/launcher.html?state=locked&capture=1", "launcher-locked-desktop", false],
		["/preview/launcher.html?state=selector&capture=1", "launcher-selector-desktop", true],
		["/preview/setup.html?state=data&capture=1", "setup-data-desktop", false],
		["/preview/setup.html?state=preset&capture=1", "setup-presets-desktop", true],
		["/preview/setup.html?state=finish&capture=1", "setup-finish-desktop", false],
		["/preview/v2.html?state=normal&capture=1", "study-desktop", true],
		["/preview/v2.html?state=browser&capture=1", "browser-desktop", true],
		["/preview/editor.html?panel=fields&capture=1", "editor-sources-desktop", false],
		["/preview/editor.html?panel=fields&route=tables&capture=1", "editor-tables-desktop", true],
	] as const;
	for (const [path, name, withAccessibility] of cases) {
		const fixture = await openFixture(browser, path, { width: 1440, height: 1000 });
		await expectFixtureClean(fixture);
		await expectFooterSafe(fixture.page);
		await capture(fixture.page, name, withAccessibility);
		await fixture.context.close();
	}
});

test("responsive matrix has no overflow and keeps coarse targets", async ({ browser }) => {
	const cases = [
		["/preview/setup.html?state=preset&capture=1", 768, 1024, false],
		["/preview/editor.html?panel=fields&route=tables&expanded=1&capture=1", 720, 500, false],
		["/preview/launcher.html?state=selector&capture=1", 390, 844, true],
		["/preview/v2.html?state=long&capture=1", 320, 568, true],
	] as const;
	for (const [path, width, height, coarse] of cases) {
		const fixture = await openFixture(browser, path, { width, height }, coarse);
		await expectFixtureClean(fixture);
		await expectFooterSafe(fixture.page);
		if (coarse) await expectCoarseTargets(fixture.page);
		if (width === 390) await capture(fixture.page, "launcher-mobile", true);
		if (width === 320) await capture(fixture.page, "study-long-320", false);
		await fixture.context.close();
	}
});

test("RTL chrome uses Arabic numbers while English content stays natural", async ({ browser }) => {
	const launcher = await openFixture(browser, "/preview/launcher.html?state=rtl&capture=1", { width: 1440, height: 1000 });
	await expectFixtureClean(launcher);
	const rtlLauncher = launcher.page.locator('.preview-root > [data-state="rtl"]');
	await expect(rtlLauncher).toHaveAttribute("dir", "rtl");
	await expect(rtlLauncher.locator(".tc-launcher-summary")).toContainText("٥٨٣");
	await expect(rtlLauncher.locator(".tc-launcher-deck-name")).toHaveAttribute("dir", "auto");
	await capture(launcher.page, "launcher-rtl-desktop", true);
	await launcher.context.close();

	const study = await openFixture(browser, "/preview/v2.html?state=rtl&capture=1", { width: 390, height: 844 }, true);
	await expectFixtureClean(study);
	await expectCoarseTargets(study.page);
	await expect(study.page.locator(".preview-study-modal")).toHaveAttribute("dir", "rtl");
	await expect(study.page.locator(".table-cards-counter")).toHaveText("١٨ / ٥٨٣");
	await expect(study.page.locator('[data-card="rtl"]')).toHaveAttribute("dir", "auto");
	await expect(study.page.locator('[data-card="rtl"] .preview-ltr-content').first()).toHaveCSS("direction", "ltr");
	await capture(study.page, "study-rtl-mobile", true);
	await study.context.close();
});

test("launcher selection, focus restoration, and exact-card browser interactions", async ({ browser }) => {
	const launcher = await openFixture(browser, "/preview/launcher.html?state=general&capture=1", { width: 1440, height: 1000 });
	const deckTrigger = launcher.page.locator('[data-open-layer="general-decks"]');
	await deckTrigger.click();
	await expect(launcher.page.locator("#general-decks")).toBeVisible();
	await launcher.page.keyboard.press("Escape");
	await expect(deckTrigger).toBeFocused();
	await launcher.context.close();

	const selection = await openFixture(browser, "/preview/launcher.html?state=selector&capture=1", { width: 1440, height: 1000 });
	await selection.page.locator("[data-clear-all]").click();
	await expect(selection.page.locator("[data-live-start]")).toBeDisabled();
	await expect(selection.page.locator("[data-live-summary]")).toHaveText("0 cards · 0 tables");
	await selection.page.locator('.preview-desktop-scope input[type="checkbox"]').first().check();
	await expect(selection.page.locator("[data-live-start]")).toBeEnabled();
	await selection.context.close();

	const study = await openFixture(browser, "/preview/v2.html?state=normal&capture=1", { width: 1440, height: 1000 });
	const search = study.page.locator("[data-open-browser]");
	await search.click();
	await expect(study.page.locator('[data-layer="browser"]')).toBeVisible();
	await study.page.keyboard.press("Escape");
	await expect(search).toBeFocused();
	const scope = study.page.locator("[data-open-scope]");
	await scope.click();
	await study.page.keyboard.press("Escape");
	await expect(scope).toBeFocused();
	await search.click();
	await study.page.locator("[data-exact-result]").click();
	await expect(study.page.locator('[data-layer="browser"]')).toBeHidden();
	await expect(study.page.locator('[data-card="normal"] .table-cards-word')).toHaveText("remain");
	await expect(search).toBeFocused();
	await expectFixtureClean(study);
	await study.context.close();
});

test("study keyboard, swipe, image zoom, editor route, and reduced motion", async ({ browser }) => {
	const study = await openFixture(browser, "/preview/v2.html?state=normal&capture=1", { width: 390, height: 844 }, true);
	await expect(study.page.locator(".table-cards-counter")).toHaveText("18 / 583");
	await study.page.keyboard.press("ArrowRight");
	await expect(study.page.locator(".table-cards-counter")).toHaveText("19 / 583");
	const stage = study.page.locator('[data-card="normal"]');
	const box = await stage.boundingBox();
	expect(box).not.toBeNull();
	if (box) {
		await study.page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
		await study.page.mouse.down();
		await study.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
		await study.page.mouse.up();
	}
	await expect(study.page.locator(".table-cards-counter")).toHaveText("20 / 583");
	await study.context.close();

	const image = await openFixture(browser, "/preview/v2.html?state=image&capture=1", { width: 390, height: 844 }, true);
	await image.page.locator("[data-open-lightbox]").click();
	await expect(image.page.locator('[data-layer="lightbox"]')).toBeVisible();
	await image.page.keyboard.press("Escape");
	await expect(image.page.locator("[data-open-lightbox]")).toBeFocused();
	await image.context.close();

	const editor = await openFixture(browser, "/preview/editor.html?capture=1", { width: 1440, height: 1000 });
	const fields = editor.page.locator('[data-open="fields"]');
	await fields.click();
	const choose = editor.page.locator("[data-choose-tables]");
	await choose.click();
	await expect(editor.page.locator(".tc-table-selection-back")).toBeFocused();
	await editor.page.locator("[data-back-sources]").click();
	await expect(choose).toBeFocused();
	await editor.page.keyboard.press("Escape");
	await expect(fields).toBeFocused();
	await editor.context.close();

	const reduced = await openFixture(browser, "/preview/setup.html?state=preset&capture=1", { width: 390, height: 844 }, true);
	await reduced.page.emulateMedia({ reducedMotion: "reduce" });
	const duration = await reduced.page.locator(".tc-setup-progress-track span").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
	expect(duration).toBeLessThanOrEqual(0.00001);
	await reduced.context.close();
});
