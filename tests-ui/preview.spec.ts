import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const screenshotRoot = join(process.cwd(), ".preview-shots");
const accessibilityRoot = join(process.cwd(), "docs/a11y");

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

async function expectTabWrap(page: Page, rootSelector: string): Promise<void> {
	const root = page.locator(rootSelector);
	const focusable = root.locator([
		"button:not([disabled]):visible",
		"input:not([disabled]):visible",
		"summary:visible",
		"[href]:visible",
		'[tabindex]:not([tabindex="-1"]):visible',
	].join(", "));
	const count = await focusable.count();
	expect(count, `${rootSelector} needs a focusable control`).toBeGreaterThan(0);
	const first = focusable.first();
	const last = focusable.last();
	await last.focus();
	await page.keyboard.press("Tab");
	await expect(first, `Tab wraps inside ${rootSelector}`).toBeFocused();
	await first.focus();
	await page.keyboard.press("Shift+Tab");
	await expect(last, `Shift+Tab wraps inside ${rootSelector}`).toBeFocused();
}

async function expectFaintTextContrast(page: Page): Promise<void> {
	const result = await page.evaluate(() => {
		const parse = (value: string): [number, number, number, number] => {
			const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
			return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
		};
		const luminance = ([red, green, blue]: [number, number, number, number]) => {
			const linear = [red, green, blue].map((channel) => {
				const normalized = channel / 255;
				return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
		};
		const contrast = (foreground: [number, number, number, number], background: [number, number, number, number]) => {
			const light = Math.max(luminance(foreground), luminance(background));
			const dark = Math.min(luminance(foreground), luminance(background));
			return (light + 0.05) / (dark + 0.05);
		};
		const faint = getComputedStyle(document.documentElement).getPropertyValue("--text-faint").trim();
		const probe = document.createElement("span");
		probe.style.color = faint;
		document.body.append(probe);
		const faintColor = getComputedStyle(probe).color;
		probe.remove();
		const samples = Array.from(document.querySelectorAll<HTMLElement>("main *")).flatMap((element) => {
			const style = getComputedStyle(element);
			if (element.getClientRects().length === 0 || style.color !== faintColor || Number.parseFloat(style.fontSize) > 11.1) return [];
			let background = element;
			let backgroundColor = parse(style.backgroundColor);
			while (backgroundColor[3] < 1 && background.parentElement) {
				background = background.parentElement;
				backgroundColor = parse(getComputedStyle(background).backgroundColor);
			}
			return [{
				selector: element.className || element.tagName,
				fontSize: style.fontSize,
				foreground: style.color,
				background: getComputedStyle(background).backgroundColor,
				ratio: contrast(parse(style.color), backgroundColor),
			}];
		});
		return { samples, failures: samples.filter((sample) => sample.ratio < 4.5) };
	});
	expect(result.samples.length, "representative 10–11px faint text samples").toBeGreaterThan(0);
	expect(result.failures, "faint text must reach 4.5:1 on every sampled background").toEqual([]);
}

async function expectSelectorRowsUnclipped(page: Page, rootSelector: string): Promise<void> {
	const clipped = await page.locator(rootSelector).evaluate((root) => {
		const viewport = root.querySelector(".tc-scope-groups")?.getBoundingClientRect();
		if (!viewport) return [{ text: "missing groups viewport", top: 0, bottom: 0 }];
		return Array.from(root.querySelectorAll<HTMLElement>(".tc-scope-group-header, .tc-scope-row")).flatMap((element) => {
			const rect = element.getBoundingClientRect();
			return rect.top + 0.5 < viewport.top || rect.bottom > viewport.bottom + 0.5
				? [{ text: element.textContent?.trim().slice(0, 80) ?? "", top: rect.top, bottom: rect.bottom }]
				: [];
		});
	});
	expect(clipped, "retained selector capture must not contain partially clipped headers or rows").toEqual([]);
}

async function capture(page: Page, name: string, ariaContains?: string, verifyStable = false): Promise<void> {
	const first = await page.screenshot({ animations: "disabled" });
	if (verifyStable) {
		const second = await page.screenshot({ animations: "disabled" });
		expect(second.equals(first), `${name} must be pixel-stable across consecutive captures`).toBe(true);
	}
	await writeFile(join(screenshotRoot, `${name}.png`), first);
	if (!ariaContains) return;
	const snapshot = await page.locator("main").ariaSnapshot();
	expect(snapshot.trim().length, `${name} accessibility snapshot is nonblank`).toBeGreaterThan(20);
	expect(snapshot, `${name} accessibility snapshot describes the captured state`).toContain(ariaContains);
	await writeFile(join(accessibilityRoot, `${name}.aria.txt`), `${snapshot}\n`, "utf8");
}

test.beforeAll(async () => {
	await mkdir(screenshotRoot, { recursive: true });
	await mkdir(accessibilityRoot, { recursive: true });
});

test("preview server identifies this worktree", async ({ request }) => {
	const response = await request.get("/preview/launcher.html");
	expect(response.headers()["x-table-cards-preview-root"]).toBe(process.cwd());
});

test("desktop release fixtures and accessibility snapshots", async ({ browser }) => {
	const cases = [
		["/preview/launcher.html?state=general&capture=1", "launcher-desktop", "Choose a study session"],
		["/preview/launcher.html?state=locked&capture=1", "launcher-locked-desktop", "412 cards · 1 table"],
		["/preview/launcher.html?state=selector&capture=1", "launcher-selector-desktop", "Search tables"],
		["/preview/setup.html?state=data&capture=1", "setup-data-desktop", "Choose your data"],
		["/preview/setup.html?state=preset&capture=1", "setup-presets-desktop", "Card layouts"],
		["/preview/setup.html?state=finish&capture=1", "setup-finish-desktop", "Deck name"],
		["/preview/v2.html?state=normal&capture=1", "study-desktop", "Progress"],
		["/preview/v2.html?state=browser&capture=1", "browser-desktop", "Browse cards"],
		["/preview/editor.html?panel=fields&capture=1", "editor-sources-desktop", "Источники данных"],
		["/preview/editor.html?panel=fields&route=tables&capture=1", "editor-tables-desktop", "Поиск таблиц"],
	] as const;
	for (const [path, name, ariaContains] of cases) {
		const fixture = await openFixture(browser, path, { width: 1440, height: 1000 });
		await expectFixtureClean(fixture);
		await expectFooterSafe(fixture.page);
		if (name === "launcher-selector-desktop") {
			await fixture.page.locator('[data-selector-root="desktop"] .tc-scope-search').focus();
			await expect(fixture.page.locator('[data-selector-root="desktop"] .tc-scope-search')).toBeFocused();
			await expectSelectorRowsUnclipped(fixture.page, '[data-selector-root="desktop"]');
		}
		await capture(fixture.page, name, ariaContains);
		await fixture.context.close();
	}
});

test("responsive matrix has no overflow and keeps coarse targets", async ({ browser }) => {
	const cases = [
		["/preview/setup.html?state=preset&capture=1", 768, 1024, false],
		["/preview/editor.html?panel=fields&route=tables&expanded=1&capture=1", 720, 500, false],
		["/preview/launcher.html?state=general&capture=1", 390, 844, true],
		["/preview/launcher.html?state=selector&capture=1", 390, 844, true],
		["/preview/setup.html?state=data&capture=1", 390, 844, true],
		["/preview/setup.html?state=preset&capture=1", 390, 844, true],
		["/preview/setup.html?state=finish&capture=1", 390, 844, true],
		["/preview/v2.html?state=normal&capture=1", 390, 844, true],
		["/preview/v2.html?state=long&capture=1", 320, 568, true],
		["/preview/v2.html?state=image&capture=1", 390, 844, true],
		["/preview/v2.html?state=rtl&capture=1", 390, 844, true],
		["/preview/editor.html?panel=fields&capture=1", 390, 844, true],
		["/preview/editor.html?panel=fields&route=tables&capture=1", 390, 844, true],
	] as const;
	for (const [path, width, height, coarse] of cases) {
		const fixture = await openFixture(browser, path, { width, height }, coarse);
		await expectFixtureClean(fixture);
		await expectFooterSafe(fixture.page);
		if (coarse) await expectCoarseTargets(fixture.page);
		if (path.includes("launcher.html?state=selector")) await capture(fixture.page, "launcher-mobile", "Choose tables");
		if (width === 320) await capture(fixture.page, "study-long-320");
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
	await capture(launcher.page, "launcher-rtl-desktop", "اختيار جلسة دراسة");
	await launcher.context.close();

	const study = await openFixture(browser, "/preview/v2.html?state=rtl&capture=1", { width: 390, height: 844 }, true);
	await expectFixtureClean(study);
	await expectCoarseTargets(study.page);
	await expect(study.page.locator(".preview-study-modal")).toHaveAttribute("dir", "rtl");
	await expect(study.page.locator(".table-cards-counter")).toHaveText("١٨ / ٥٨٣");
	await expect(study.page.locator(".table-cards-counter")).toHaveAttribute("aria-label", "التقدم");
	await expect(study.page.locator(".table-cards-progress")).toHaveAttribute("aria-label", "التقدم");
	await expect(study.page.locator(".table-cards-progress")).toHaveAttribute("aria-valuetext", "١٨ من ٥٨٣");
	await expect(study.page.getByRole("button", { name: "البحث في البطاقات" })).toBeVisible();
	await expect(study.page.getByRole("button", { name: "خلط البطاقات" })).toBeVisible();
	await expect(study.page.getByRole("button", { name: "إغلاق" })).toBeVisible();
	await expect(study.page.locator('[data-card="rtl"]')).toHaveAttribute("dir", "auto");
	await expect(study.page.locator('[data-card="rtl"] .preview-ltr-content').first()).toHaveCSS("direction", "ltr");
	await study.page.getByRole("button", { name: "البحث في البطاقات" }).click();
	await expect(study.page.getByRole("dialog", { name: "تصفح البطاقات" })).toBeVisible();
	await expect(study.page.getByRole("searchbox", { name: "البحث في البطاقات" })).toBeVisible();
	await expect(study.page.getByRole("dialog", { name: "تصفح البطاقات" }).getByRole("button", { name: "إغلاق المتصفح" })).toBeVisible();
	const rtlBrowserSnapshot = await study.page.locator("main").ariaSnapshot();
	expect(rtlBrowserSnapshot.trim().length, "Arabic browser accessibility snapshot is nonblank").toBeGreaterThan(20);
	expect(rtlBrowserSnapshot, "Arabic browser accessibility snapshot describes localized search").toContain("البحث في البطاقات");
	await writeFile(join(accessibilityRoot, "study-rtl-browser-mobile.aria.txt"), `${rtlBrowserSnapshot}\n`, "utf8");
	await study.page.keyboard.press("Escape");
	await expect(study.page.getByRole("button", { name: "البحث في البطاقات" })).toBeFocused();
	await capture(study.page, "study-rtl-mobile", "التقدم", true);
	await study.context.close();
});

test("locked launcher edits canonical grouped scope and restores its opener", async ({ browser }) => {
	const launcher = await openFixture(browser, "/preview/launcher.html?state=locked&capture=1", { width: 1440, height: 1000 });
	const panel = launcher.page.locator('[data-state="locked"]');
	const opener = panel.locator('[data-scope-open="locked"]');
	await opener.click();
	const picker = panel.locator('[data-selector-root="locked"]');
	await expect(picker).toBeVisible();
	await expect(picker.locator(".tc-scope-search")).toBeFocused();
	await expect(picker.locator('.tc-scope-row input[type="checkbox"]')).toHaveCount(4);
	await expect(picker.locator(".tc-scope-group-count").first()).toHaveText("1 / 2");
	await expect(picker.locator(".tc-scope-group-count").last()).toHaveText("0 / 2");
	await picker.locator(".tc-scope-group").first().locator("[data-group-toggle]").click();
	await expect(panel.locator("[data-live-summary]")).toHaveText("508 cards · 2 tables");
	await expect(panel.locator("[data-live-start]")).toHaveText("Open cards: 508");
	await picker.locator("[data-apply]").click();
	await expect(picker).toBeHidden();
	await expect(opener).toHaveAttribute("aria-expanded", "false");
	await expect(opener).toBeFocused();
	await launcher.context.close();
});

test("general and desktop grouped selectors update exact counts and restore their opener", async ({ browser }) => {
	const launcher = await openFixture(browser, "/preview/launcher.html?state=general&capture=1", { width: 1440, height: 1000 });
	const general = launcher.page.locator('[data-state="general"]');
	const generalTrigger = general.locator('[data-scope-open="general"]');
	await generalTrigger.click();
	const generalPicker = general.locator('[data-selector-root="general"]');
	await expect(generalPicker).toBeVisible();
	await expect(generalPicker.locator(".tc-scope-search")).toBeFocused();
	await generalPicker.locator(".tc-scope-group").first().locator("[data-group-toggle]").click();
	await expect(generalPicker.locator(".tc-scope-group-count").first()).toHaveText("0 / 2");
	await expect(general.locator("[data-live-summary]")).toHaveText("75 cards · 1 table");
	await generalPicker.locator(".tc-scope-group").first().locator("[data-group-toggle]").click();
	await expect(general.locator("[data-live-summary]")).toHaveText("583 cards · 3 tables");
	await generalPicker.locator("[data-apply]").click();
	await expect(generalPicker).toBeHidden();
	await expect(generalTrigger).toBeFocused();
	await launcher.context.close();

	const selection = await openFixture(browser, "/preview/launcher.html?state=selector&capture=1", { width: 1440, height: 1000 });
	const selectorPanel = selection.page.locator('[data-state="selector"]');
	const desktopPicker = selectorPanel.locator('[data-selector-root="desktop"]');
	await desktopPicker.locator(".tc-scope-group").last().locator("[data-group-toggle]").click();
	await expect(desktopPicker.locator(".tc-scope-group-count").last()).toHaveText("2 / 2");
	await expect(selectorPanel.locator("[data-live-summary]")).toHaveText("604 cards · 4 tables");
	await desktopPicker.locator("[data-clear-all]").click();
	await expect(selectorPanel.locator("[data-live-start]")).toBeDisabled();
	await expect(selectorPanel.locator("[data-live-summary]")).toHaveText("0 cards · 0 tables");
	await desktopPicker.locator(".tc-scope-group").first().locator("[data-group-toggle]").click();
	await expect(selectorPanel.locator("[data-live-start]")).toBeEnabled();
	await expect(selectorPanel.locator("[data-live-summary]")).toHaveText("508 cards · 2 tables");
	const selectorTrigger = selectorPanel.locator('[data-scope-open="selector"]');
	await desktopPicker.locator("[data-apply]").click();
	await expect(desktopPicker).toBeHidden();
	await expect(selectorTrigger).toBeFocused();
	await selection.context.close();
});

test("mobile grouped selector clears, reselects, applies, and restores focus", async ({ browser }) => {
	const selection = await openFixture(browser, "/preview/launcher.html?state=selector&capture=1", { width: 390, height: 844 }, true);
	const panel = selection.page.locator('[data-state="selector"]');
	const mobile = panel.locator('[data-selector-root="mobile"]');
	const footer = panel.locator(".preview-mobile-scope > .tc-sheet > .tc-sheet-footer");
	await expect(footer).toBeVisible();
	const footerBox = await footer.boundingBox();
	expect(footerBox).not.toBeNull();
	expect(Math.abs(844 - ((footerBox?.y ?? 0) + (footerBox?.height ?? 0))), "mobile sheet footer hugs the safe-area edge").toBeLessThanOrEqual(32);
	await expect(mobile.locator('.tc-scope-group').nth(1).locator('input[type="checkbox"]')).toHaveCount(2);
	await expect(mobile.locator(".tc-scope-group-count").nth(1)).toHaveText("1 / 2");
	await mobile.locator("[data-clear-all]").click();
	await expect(panel.locator("[data-live-summary]")).toHaveText("0 cards · 0 tables");
	await expect(panel.locator("[data-live-start]")).toBeDisabled();
	await mobile.locator(".tc-scope-group").nth(1).locator("[data-group-toggle]").click();
	await expect(mobile.locator(".tc-scope-group-count").nth(1)).toHaveText("2 / 2");
	await expect(panel.locator("[data-live-summary]")).toHaveText("96 cards · 2 tables");
	await expect(panel.locator("[data-live-start]")).toBeEnabled();
	const opener = panel.locator('[data-scope-open="selector"]');
	await mobile.locator("[data-apply]").click();
	await expect(panel.locator(".preview-mobile-scope")).toBeHidden();
	await expect(opener).toBeFocused();
	await selection.context.close();
});

test("exact browser result opens a different row with matching source context", async ({ browser }) => {
	const study = await openFixture(browser, "/preview/v2.html?state=normal&capture=1", { width: 1440, height: 1000 });
	const search = study.page.locator("[data-open-browser]");
	await expect(study.page.locator('[data-card="normal"] .table-cards-word')).toHaveText("remain");
	await expect(study.page.locator(".table-cards-counter")).toHaveText("18 / 583");
	await expect(study.page.locator('[data-card="normal"] .table-cards-source-table')).toHaveText("Vocabulary · Core");
	await search.click();
	await study.page.locator("[data-exact-result]").click();
	await expect(study.page.locator('[data-layer="browser"]')).toBeHidden();
	await expect(study.page.locator('[data-card="normal"] .table-cards-word')).toHaveText("Please remain seated");
	await expect(study.page.locator(".table-cards-counter")).toHaveText("41 / 583");
	await expect(study.page.locator('[data-card="normal"] .table-cards-source-table')).toHaveText("Phrases for travel");
	await expect(study.page.locator('[data-card="normal"] .table-cards-source-file')).toHaveText("Travel.md");
	await expect(search).toBeFocused();
	await expectFixtureClean(study);
	await study.context.close();
});

test("Arabic locale survives exact browser selection independently of card state", async ({ browser }) => {
	const study = await openFixture(browser, "/preview/v2.html?state=rtl&capture=1", { width: 390, height: 844 }, true);
	const modal = study.page.locator(".preview-study-modal");
	const search = study.page.getByRole("button", { name: "البحث في البطاقات" });
	await search.click();
	await study.page.locator("[data-exact-result]").click();
	await expect(study.page.locator('[data-layer="browser"]')).toBeHidden();
	await expect(modal).toHaveAttribute("lang", "ar");
	await expect(modal).toHaveAttribute("dir", "rtl");
	await expect(study.page.locator('[data-card="normal"]')).toBeVisible();
	await expect(study.page.locator('[data-card="normal"] .table-cards-word')).toHaveText("Please remain seated");
	await expect(study.page.locator(".table-cards-counter")).toHaveText("٤١ / ٥٨٣");
	await expect(study.page.locator(".table-cards-counter")).toHaveAttribute("aria-label", "التقدم");
	await expect(study.page.locator(".table-cards-progress")).toHaveAttribute("aria-valuetext", "٤١ من ٥٨٣");
	await expect(study.page.locator('[data-card="normal"] .table-cards-source-table')).toHaveText("Phrases for travel");
	await expect(study.page.locator('[data-card="normal"] .table-cards-source-file')).toHaveText("Travel.md");
	await expect(study.page.getByRole("button", { name: "خلط البطاقات" })).toBeVisible();
	await expect(search).toBeFocused();
	await study.context.close();
});

test("setup Back preserves the draft and dirty close layers confirm, continue, and discard", async ({ browser }) => {
	const setup = await openFixture(browser, "/preview/setup.html?state=data", { width: 1440, height: 1000 });
	const data = setup.page.locator('.preview-root > [data-state="data"]');
	const preset = setup.page.locator('.preview-root > [data-state="preset"]');
	await data.locator('[data-next="preset"]').click();
	const gallery = preset.getByRole("button", { name: /Gallery/ });
	await gallery.click();
	await preset.getByRole("button", { name: "Back" }).click();
	await expect(data).toBeVisible();
	await expect(preset).toBeHidden();
	await data.locator('[data-next="preset"]').click();
	await expect(gallery).toHaveAttribute("aria-pressed", "true");
	await expect(setup.page.locator("[data-preview-title]")).toHaveText("lighthouse");

	const close = preset.getByRole("button", { name: "Close" });
	await setup.page.keyboard.press("Escape");
	const confirm = setup.page.getByRole("dialog", { name: "Discard setup?" });
	await expect(confirm).toBeVisible();
	await expect(confirm.getByRole("button", { name: "Continue setup" })).toBeFocused();
	await expectTabWrap(setup.page, '[data-setup-confirm] [role="dialog"]');
	await setup.page.keyboard.press("Escape");
	await expect(confirm).toBeHidden();
	await expect(preset).toBeVisible();
	await expect(close).toBeFocused();

	await close.click();
	await confirm.getByRole("button", { name: "Continue setup" }).click();
	await expect(confirm).toBeHidden();
	await expect(close).toBeFocused();
	await expect(gallery).toHaveAttribute("aria-pressed", "true");

	await close.click();
	await confirm.getByRole("button", { name: "Discard setup" }).click();
	await expect(setup.page.locator('.preview-root > [data-state]:visible')).toHaveCount(0);
	await expect(setup.page.locator("[data-setup-dismissed]")).toBeVisible();
	await setup.page.locator('.preview-toolbar [data-state="preset"]').click();
	await expect(preset.getByRole("button", { name: /Vocabulary/ })).toHaveAttribute("aria-pressed", "true");
	await expect(setup.page.locator("[data-preview-title]")).toHaveText("remain");
	await setup.context.close();
});

test("base and nested dialogs trap Tab in both directions", async ({ browser }) => {
	const launcher = await openFixture(browser, "/preview/launcher.html?state=general&capture=1", { width: 1440, height: 1000 });
	await expectTabWrap(launcher.page, '[data-state="general"]');
	await launcher.context.close();
	const setup = await openFixture(browser, "/preview/setup.html?state=data&capture=1", { width: 1440, height: 1000 });
	await expectTabWrap(setup.page, '[data-state="data"]');
	await setup.context.close();
	const editor = await openFixture(browser, "/preview/editor.html?capture=1", { width: 1440, height: 1000 });
	await expectTabWrap(editor.page, ".table-cards-editor");
	await editor.context.close();
	const study = await openFixture(browser, "/preview/v2.html?state=normal&capture=1", { width: 1440, height: 1000 });
	await expectTabWrap(study.page, ".preview-study-modal");
	await study.page.locator("[data-open-browser]").click();
	await expectTabWrap(study.page, '[data-layer="browser"] [role="dialog"]');
	await study.page.keyboard.press("Escape");
	await study.page.locator("[data-open-scope]").click();
	await expectTabWrap(study.page, '[data-layer="scope"] [role="dialog"]');
	await study.context.close();
	const lightbox = await openFixture(browser, "/preview/v2.html?state=image&capture=1", { width: 1440, height: 1000 });
	await lightbox.page.locator("[data-open-lightbox]").click();
	await expectTabWrap(lightbox.page, '[data-layer="lightbox"] [role="dialog"]');
	await lightbox.context.close();
	const mobile = await openFixture(browser, "/preview/launcher.html?state=selector&capture=1", { width: 390, height: 844 }, true);
	await expectTabWrap(mobile.page, ".preview-mobile-scope > [role=dialog]");
	await mobile.context.close();
});

test("requested states are visible and state actions have observable outcomes", async ({ browser }) => {
	test.slow();
	for (const state of ["general", "locked", "selector", "empty", "loading", "error", "browser", "rtl"]) {
		const fixture = await openFixture(browser, `/preview/launcher.html?state=${state}&capture=1`, { width: 1440, height: 1000 });
		const panel = fixture.page.locator(`.preview-root > [data-state="${state}"]`);
		await expect(panel).toBeVisible();
		expect((await panel.innerText()).trim().length, `${state} launcher state is nonblank`).toBeGreaterThan(20);
		if (state === "empty") await expect(panel.locator(".tc-launcher-start")).toBeDisabled();
		if (state === "loading") await expect(panel.locator('[aria-busy="true"]')).toBeVisible();
		if (state === "error") {
			await panel.locator("[data-retry]").click();
			await expect(fixture.page.locator('.preview-root > [data-state="loading"]')).toBeVisible();
		}
		await fixture.context.close();
	}
	for (const state of ["data", "preset", "finish"]) {
		const fixture = await openFixture(browser, `/preview/setup.html?state=${state}&capture=1`, { width: 1440, height: 1000 });
		const panel = fixture.page.locator(`.preview-root > [data-state="${state}"]`);
		await expect(panel).toBeVisible();
		expect((await panel.innerText()).trim().length, `${state} setup state is nonblank`).toBeGreaterThan(20);
		await fixture.context.close();
	}
	for (const state of ["launcher", "normal", "long", "empty", "image", "browser", "rtl"]) {
		const fixture = await openFixture(browser, `/preview/v2.html?state=${state}&capture=1`, { width: 1440, height: 1000 });
		const view = fixture.page.locator(`[data-view="${state === "launcher" ? "launcher" : "study"}"]`);
		await expect(view).toBeVisible();
		expect((await view.innerText()).trim().length, `${state} study state is nonblank`).toBeGreaterThan(20);
		if (state === "empty") await expect(view.locator('[data-card="empty"]')).toBeVisible();
		if (state === "browser") await expect(fixture.page.locator('[data-layer="browser"]')).toBeVisible();
		await fixture.context.close();
	}

	const setup = await openFixture(browser, "/preview/setup.html?state=data&capture=1", { width: 1440, height: 1000 });
	await setup.page.locator('[data-state="data"] [data-next="preset"]').click();
	await expect(setup.page.locator('.preview-root > [data-state="preset"]')).toBeVisible();
	const gallery = setup.page.getByRole("button", { name: /Gallery/ });
	await gallery.click();
	await expect(gallery).toHaveAttribute("aria-pressed", "true");
	await expect(setup.page.locator('[data-preview-title]')).toHaveText("lighthouse");
	await setup.page.locator('[data-state="preset"] [data-next="finish"]').click();
	await expect(setup.page.locator('.preview-root > [data-state="finish"]')).toBeVisible();
	const languageIcon = setup.page.getByRole("button", { name: "Languages" });
	await languageIcon.click();
	await expect(languageIcon).toHaveAttribute("aria-pressed", "true");
	await setup.page.locator("[data-create-deck]").click();
	await expect(setup.page.locator("[data-created]")).toContainText("English · Dictionary");
	await setup.context.close();
});

test("representative faint labels meet 4.5 to 1 contrast", async ({ browser }) => {
	for (const path of [
		"/preview/launcher.html?state=selector&capture=1",
		"/preview/setup.html?state=preset&capture=1",
		"/preview/v2.html?state=normal&capture=1",
		"/preview/editor.html?panel=fields&capture=1",
	]) {
		const fixture = await openFixture(browser, path, { width: 1440, height: 1000 });
		await expectFaintTextContrast(fixture.page);
		await fixture.context.close();
	}
});

test("study keyboard, swipe, image zoom, editor route, and reduced motion", async ({ browser }) => {
	const study = await openFixture(browser, "/preview/v2.html?state=normal&capture=1", { width: 390, height: 844 }, true);
	await expect(study.page.locator(".table-cards-counter")).toHaveText("18 / 583");
	await study.page.keyboard.press("ArrowRight");
	await expect(study.page.locator(".table-cards-counter")).toHaveText("19 / 583");
	await study.page.keyboard.press("s");
	await expect(study.page.locator("[data-shuffle]")).toHaveAttribute("aria-pressed", "true");
	const scope = study.page.locator("[data-open-scope]");
	await scope.click();
	await study.page.locator('[data-layer="scope"] [data-apply]').click();
	await expect(study.page.locator('[data-layer="scope"]')).toBeHidden();
	await expect(scope).toBeFocused();
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

	const image = await openFixture(browser, "/preview/v2.html?state=image&capture=1", { width: 1440, height: 1000 });
	const sourceImage = image.page.locator("[data-open-lightbox] img");
	const source = await sourceImage.getAttribute("src");
	const sourceBox = await sourceImage.boundingBox();
	await image.page.locator("[data-open-lightbox]").click();
	await expect(image.page.locator('[data-layer="lightbox"]')).toBeVisible();
	const lightboxImage = image.page.locator('[data-layer="lightbox"] img');
	await expect(lightboxImage).toHaveAttribute("src", source ?? "");
	const lightboxBox = await lightboxImage.boundingBox();
	expect(lightboxBox?.width ?? 0).toBeGreaterThan(sourceBox?.width ?? Number.POSITIVE_INFINITY);
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
