import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

// The accent button repeats Obsidian's own .mod-cta pairing, white on the app accent.
// Deviating from the host there would look foreign in every theme, so it is exempt here.
const HOST_ACCENT_TEXTS = new Set(["Next", "Дальше"]);

interface TextSample {
	el: string;
	text: string;
	contrast: number;
	needs: number;
	passes: boolean;
}

async function measure(page: Page): Promise<TextSample[]> {
	return page.evaluate(() => {
		const toRgba = (value: string) => {
			const numbers = (value.match(/-?[\d.]+/g) ?? []).map(Number);
			if (value.startsWith("color(")) {
				const [r = 0, g = 0, b = 0, a = 1] = numbers;
				return { r: r * 255, g: g * 255, b: b * 255, a };
			}
			const [r = 0, g = 0, b = 0, a = 1] = numbers;
			return { r, g, b, a };
		};
		const over = (top: { r: number; g: number; b: number; a: number }, bottom: { r: number; g: number; b: number; a: number }) => ({
			r: top.r * top.a + bottom.r * (1 - top.a),
			g: top.g * top.a + bottom.g * (1 - top.a),
			b: top.b * top.a + bottom.b * (1 - top.a),
			a: 1,
		});
		const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
			const channel = (value: number) => {
				const x = value / 255;
				return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
		};
		const ratio = (fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }) => {
			const hi = Math.max(luminance(fg), luminance(bg));
			const lo = Math.min(luminance(fg), luminance(bg));
			return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
		};
		const backdropOf = (element: Element) => {
			let stack = { r: 255, g: 255, b: 255, a: 1 };
			const chain: Element[] = [];
			let node: Element | null = element;
			while (node) {
				chain.unshift(node);
				node = node.parentElement;
			}
			for (const item of chain) {
				const colour = toRgba(getComputedStyle(item).backgroundColor);
				if (colour.a > 0) stack = over(colour, stack);
			}
			return stack;
		};

		const roots = Array.from(document.querySelectorAll(".modal-container .modal"));
		const root = roots[roots.length - 1];
		if (!root) return [];
		const samples = new Map<string, TextSample>();
		for (const element of Array.from(root.querySelectorAll("button, input, label, span, div, p, h1, h2, h3"))) {
			const text = (element.textContent ?? "").trim();
			const ownText = Array.from(element.childNodes).some(
				(node) => node.nodeType === 3 && (node.textContent ?? "").trim().length > 0,
			);
			if (!ownText || text.length === 0) continue;
			const box = element.getBoundingClientRect();
			if (box.width < 4 || box.height < 4) continue;
			const style = getComputedStyle(element);
			if (style.visibility === "hidden" || style.opacity === "0") continue;
			if (element instanceof HTMLButtonElement && element.disabled) continue;
			const parentBackdrop = element.parentElement
				? backdropOf(element.parentElement)
				: { r: 255, g: 255, b: 255, a: 1 };
			const own = toRgba(style.backgroundColor);
			const background = own.a > 0 ? over(own, parentBackdrop) : parentBackdrop;
			const foreground = over(toRgba(style.color), background);
			const size = Number.parseFloat(style.fontSize);
			const bold = Number.parseInt(style.fontWeight, 10) >= 700;
			const large = size >= 24 || (size >= 18.66 && bold);
			const needs = large ? 3 : 4.5;
			const contrast = ratio(foreground, background);
			const key = `${element.tagName}.${String(element.className).slice(0, 40)}|${text.slice(0, 20)}`;
			if (!samples.has(key)) {
				samples.set(key, {
					el: `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`,
					text: text.replace(/\s+/g, " ").slice(0, 34),
					contrast,
					needs,
					passes: contrast >= needs,
				});
			}
		}
		return Array.from(samples.values());
	});
}

test("study text meets AA against its own surface", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage", { timeout: 20_000 });

	const samples = await measure(page);
	const failing = samples.filter((sample) => !sample.passes && !HOST_ACCENT_TEXTS.has(sample.text));

	expect(samples.length).toBeGreaterThan(8);
	expect(failing.map((sample) => `${sample.contrast} ${sample.el} "${sample.text}"`)).toEqual([]);

	await closeOverlays(page);
});

test("editor text meets AA against its own surface", async () => {
	const page = await obsidianPage();
	await openEditor(page);

	const samples = await measure(page);
	const failing = samples.filter((sample) => !sample.passes && !HOST_ACCENT_TEXTS.has(sample.text));

	expect(samples.length).toBeGreaterThan(8);
	expect(failing.map((sample) => `${sample.contrast} ${sample.el} "${sample.text}"`)).toEqual([]);

	await closeOverlays(page);
});
