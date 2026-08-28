import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");
test.skip(process.env["TABLE_CARDS_AUDIT"] !== "1", "Layout audit runs on request");

interface Viewport {
	name: string;
	width: number;
	height: number;
}

const VIEWPORTS: Viewport[] = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "laptop", width: 1280, height: 800 },
	{ name: "narrow-window", width: 900, height: 700 },
	{ name: "tablet-portrait", width: 820, height: 1180 },
	{ name: "tablet-landscape", width: 1180, height: 820 },
	{ name: "phone-portrait", width: 390, height: 844 },
	{ name: "phone-landscape", width: 844, height: 390 },
	{ name: "phone-small", width: 320, height: 568 },
];

const DECORATIONS = [
	".tc-sheet-scrim",
	".tc-sheet-handle",
	".tc-card-drag-handle",
	".tc-resize-handle",
	".tc-visually-hidden",
	".table-cards-progress-bar",
];

async function scan(page: Page, surface: string): Promise<string[]> {
	return page.evaluate((input: { surface: string; decorations: string[] }) => {
		const { surface, decorations } = input;
		const roots = Array.from(
			document.querySelectorAll<HTMLElement>(
				".modal.table-cards-modal, .modal.table-cards-editor, .modal.table-cards-setup",
			),
		);
		if (roots.length === 0) return [`${surface}: no plugin modal on screen`];
		const found: string[] = [];
		const say = (kind: string, element: Element, detail: string): void => {
			const name = `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0] || "?"}`;
			found.push(`${surface} · ${kind} · ${name} · ${detail}`);
		};
		const decorative = (element: Element): boolean =>
			decorations.some((selector) => element.matches(selector) || element.closest(selector) !== null);
		const shown = (element: HTMLElement): boolean => element.getClientRects().length > 0;
		const scrolls = (element: HTMLElement): boolean => {
			const style = getComputedStyle(element);
			return /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY);
		};
		const insideScroller = (element: HTMLElement, root: HTMLElement): boolean => {
			for (let node = element.parentElement; node && node !== root; node = node.parentElement) {
				if (scrolls(node)) return true;
			}
			return false;
		};

		for (const root of roots) {
			const bounds = root.getBoundingClientRect();
			const elements = Array.from(root.querySelectorAll<HTMLElement>("*")).filter(shown);

			for (const element of elements) {
				if (decorative(element)) continue;
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) continue;

				const clippedByScroller = insideScroller(element, root);
				if (!clippedByScroller && style.position !== "fixed" && !element.closest(".tc-listbox-popover")) {
					if (rect.right > bounds.right + 1 || rect.left < bounds.left - 1) {
						say("out-of-modal", element, `x ${Math.round(rect.left)}…${Math.round(rect.right)} vs ${Math.round(bounds.left)}…${Math.round(bounds.right)}`);
					}
					if (rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1 || rect.left < -1) {
						say("out-of-screen", element, `${Math.round(rect.left)}…${Math.round(rect.right)} / bottom ${Math.round(rect.bottom)}`);
					}
				}

				const hiddenX = style.overflowX === "hidden";
				const clipsText =
					hiddenX &&
					style.textOverflow !== "ellipsis" &&
					(element.textContent ?? "").trim().length > 0 &&
					element.scrollWidth > element.clientWidth + 1;
				if (clipsText) {
					say("clipped-text", element, `${element.scrollWidth} > ${element.clientWidth}`);
				}

				if ((style.overflowX === "auto" || style.overflowX === "scroll") && element.scrollWidth > element.clientWidth + 1) {
					if (element.getAttribute("data-overflow") !== "scroll") {
						say("scrolls-sideways", element, `${element.scrollWidth} > ${element.clientWidth}`);
					}
				}

				if (element.matches("button, summary") && !decorative(element)) {
					const name = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
					if (name.length === 0) say("unnamed-control", element, "no accessible name");
					if (rect.height < 24 || rect.width < 20) {
						say("tiny-control", element, `${Math.round(rect.width)}×${Math.round(rect.height)}`);
					}
				}
			}

			for (const parent of elements) {
				const children = Array.from(parent.children).filter(
					(child): child is HTMLElement => child instanceof HTMLElement && shown(child) && !decorative(child),
				);
				for (let left = 0; left < children.length; left += 1) {
					for (let right = left + 1; right < children.length; right += 1) {
						const a = children[left]!;
						const b = children[right]!;
						const aStyle = getComputedStyle(a);
						const bStyle = getComputedStyle(b);
						if (aStyle.position !== "static" && aStyle.position !== "relative") continue;
						if (bStyle.position !== "static" && bStyle.position !== "relative") continue;
						if (aStyle.display === "inline" || bStyle.display === "inline") continue;
						const one = a.getBoundingClientRect();
						const two = b.getBoundingClientRect();
						const across = Math.min(one.right, two.right) - Math.max(one.left, two.left);
						const down = Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top);
						if (across > 2 && down > 2) {
							say("siblings-overlap", a, `over ${b.tagName.toLowerCase()}.${String(b.className).split(" ")[0]} by ${Math.round(across)}×${Math.round(down)}`);
						}
					}
				}
			}

			for (const parent of elements) {
				if (getComputedStyle(parent).overflow !== "visible") continue;
				if (parent.tagName === "DETAILS") continue;
				const box = parent.getBoundingClientRect();
				for (const child of Array.from(parent.children)) {
					if (!(child instanceof HTMLElement) || !shown(child) || decorative(child)) continue;
					const childStyle = getComputedStyle(child);
					if (childStyle.position !== "static" && childStyle.position !== "relative") continue;
					const rect = child.getBoundingClientRect();
					const below = rect.bottom - box.bottom;
					const past = rect.right - box.right;
					if (below > 2 || past > 2) {
						say("content-escapes", child, `${Math.round(Math.max(below, past))}px out of ${parent.tagName.toLowerCase()}.${String(parent.className).split(" ")[0]}`);
					}
				}
			}
		}
		return found;
	}, { surface, decorations: DECORATIONS });
}

const STEP = { timeout: 20_000 };

async function openSession(page: Page): Promise<void> {
	await closeOverlays(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage", STEP);
	await page.waitForTimeout(400);
}

async function visit(
	defects: string[],
	surface: string,
	step: () => Promise<string[]>,
): Promise<void> {
	try {
		defects.push(...(await step()));
	} catch (error) {
		defects.push(`${surface} · unreachable · ${error instanceof Error ? error.message.split("\n")[0] : "failed"}`);
	}
}

async function useLocale(page: Page, locale: string): Promise<void> {
	await page.evaluate((next) => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			(settings as { locale: string }).locale = next;
			return settings;
		});
	}, locale);
	await page.waitForTimeout(300);
}

async function walkSurfaces(page: Page, viewport: Viewport, tag = ""): Promise<string[]> {
	const defects: string[] = [];
	const at = (surface: string): string => `${viewport.name}${tag}/${surface}`;

	await visit(defects, at("session"), async () => {
		await openSession(page);
		return scan(page, at("session"));
	});

	await visit(defects, at("session-search"), async () => {
		await page.click("button.table-cards-search-btn", STEP);
		await page.waitForSelector(".tc-card-browser", STEP);
		await page.waitForTimeout(400);
		const found = await scan(page, at("session-search"));
		await page.keyboard.press("Escape");
		await page.waitForTimeout(300);
		return found;
	});

	await visit(defects, at("session-tables"), async () => {
		await page.click("button.table-cards-scope-btn", STEP);
		await page.waitForSelector(".tc-scope-picker", STEP);
		await page.waitForTimeout(400);
		return scan(page, at("session-tables"));
	});
	await closeOverlays(page);

	await visit(defects, at("editor"), async () => {
		await openEditor(page);
		await page.waitForTimeout(400);
		const found = await scan(page, at("editor"));
		await page.evaluate(() => {
			document.querySelector<HTMLElement>(".tc-editor-canvas-wrap .table-cards-box")?.click();
		});
		await page.waitForTimeout(300);
		return found;
	});

	for (const [surface, selector] of [
		["editor-block", ".tc-editor-block-toolbar button.is-block-type"],
		["editor-order", ".tc-editor-block-toolbar button.is-block-move"],
		["editor-card-style", ".tc-editor-canvas-bar button.tc-editor-button:last-child"],
		["editor-fields", ".tc-editor-canvas-bar button.tc-editor-button:first-child"],
	] as const) {
		await visit(defects, at(surface), async () => {
			const opener = page.locator(selector).first();
			if ((await opener.count()) === 0) return [];
			await opener.click(STEP);
			await page.waitForSelector(".tc-sheet", STEP);
			await page.waitForTimeout(400);
			const found = await scan(page, at(surface));
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);
			return found;
		});
	}
	await closeOverlays(page);

	await visit(defects, at("setup"), async () => {
		await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
		await page.waitForSelector(".table-cards-setup", STEP);
		await page.waitForTimeout(400);
		return scan(page, at("setup"));
	});
	await closeOverlays(page);

	return defects;
}

async function walkLauncher(page: Page, tag: string): Promise<string[]> {
	const defects: string[] = [];
	const pinned = await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			settings: { lastDeckId: string | null };
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		const previous = plugin.settings.lastDeckId;
		return plugin.updateSettings((settings) => {
			(settings as { lastDeckId: string | null }).lastDeckId = null;
			return settings;
		}).then(() => previous);
	});
	await visit(defects, `${tag}/launcher`, async () => {
		await closeOverlays(page);
		await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
		await page.waitForSelector(".modal.table-cards-modal", STEP);
		await page.waitForTimeout(500);
		const showsLauncher = await page.evaluate(() => document.querySelector(".tc-launcher") !== null);
		return showsLauncher ? scan(page, `${tag}/launcher`) : [];
	});
	await closeOverlays(page);
	await page.evaluate((deckId) => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			(settings as { lastDeckId: string | null }).lastDeckId = deckId;
			return settings;
		});
	}, pinned);
	await page.waitForTimeout(300);
	return defects;
}

const CORE = ["desktop", "phone-portrait", "phone-landscape"];

async function readyDeck(page: Page): Promise<void> {
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as { decks: Array<{ name: string; sources: Array<{ tables: { mode: string } }> }> };
			const deck = typed.decks.find((item) => item.name === "Vocab") ?? typed.decks[0];
			if (!deck) return typed;
			for (const source of deck.sources) source.tables = { mode: "all" };
			return typed;
		});
	});
}

test("no layout defect on the core viewports", async () => {
	test.setTimeout(600_000);
	const page = await obsidianPage();
	await readyDeck(page);

	const defects: string[] = [];
	defects.push(...(await walkLauncher(page, "desktop")));
	for (const viewport of VIEWPORTS.filter((item) => CORE.includes(item.name))) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.waitForTimeout(300);
		defects.push(...(await walkSurfaces(page, viewport)));
	}
	await page.setViewportSize({ width: 1440, height: 900 });

	expect(defects).toEqual([]);
});

test("no layout defect on any supported viewport or locale", async () => {
	test.setTimeout(2_400_000);
	const page = await obsidianPage();
	await readyDeck(page);

	const defects: string[] = [];
	try {
		defects.push(...(await walkLauncher(page, "desktop")));
		for (const viewport of VIEWPORTS) {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await page.waitForTimeout(300);
			defects.push(...(await walkSurfaces(page, viewport)));
		}

		await useLocale(page, "ar");
		await page.setViewportSize({ width: 1440, height: 900 });
		defects.push(...(await walkLauncher(page, "desktop-rtl")));
		for (const viewport of VIEWPORTS.filter((item) => CORE.includes(item.name))) {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await page.waitForTimeout(300);
			defects.push(...(await walkSurfaces(page, viewport, "-rtl")));
		}
	} finally {
		await useLocale(page, "auto");
		await page.setViewportSize({ width: 1440, height: 900 });
	}

	expect(defects).toEqual([]);
});
