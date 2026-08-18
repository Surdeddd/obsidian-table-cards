import { MarkdownRenderer, type App, type Component } from "obsidian";
import { resolveImageFile } from "../deck/load";
import type { AppearanceSettings, CardBlock, CellValue, ImageRef } from "../model";
import type { ResolvedBlock, ResolvedCard } from "../layout/resolve";
import type { Translator } from "../i18n";
import { ImageLightbox } from "./ImageLightbox";

export interface CardRenderOptions {
	selectedBlockId?: string | null;
	onSelectBlock?: (blockId: string) => void;
	interactiveImages?: boolean;
}

export interface CardRenderContext {
	app: App;
	component: Component;
	appearance: AppearanceSettings;
	t: Translator;
	sourceLabel?: string;
	isCurrent?: () => boolean;
	options?: CardRenderOptions;
}

function labelOf(block: CardBlock): string {
	return block.label || block.columns[0] || "";
}

function applyBlockAttributes(box: HTMLElement, block: CardBlock): void {
	box.dataset.blockId = block.id;
	box.dataset.kind = block.kind;
	box.dataset.width = block.width;
	box.dataset.mobile = block.mobile;
	box.dataset.overflow = block.overflow.mode;
	box.dataset.height = block.height.mode;
	box.style.setProperty("--tc-block-height", `${block.height.valuePx}px`);
	box.style.setProperty("--tc-min-font", `${block.overflow.minFontPx}px`);
	box.style.setProperty("--tc-max-lines", block.overflow.maxLines === null ? "none" : String(block.overflow.maxLines));
	if (block.appearance.align) box.dataset.align = block.appearance.align;
	if (!block.appearance.inherit) {
		if (block.appearance.background) box.style.setProperty("--tc-block-bg", block.appearance.background);
		if (block.appearance.text) box.style.setProperty("--tc-block-text", block.appearance.text);
		if (block.appearance.border) box.style.setProperty("--tc-block-border", block.appearance.border);
		if (block.appearance.borderWidth !== undefined) {
			box.style.setProperty("--tc-block-border-width", `${block.appearance.borderWidth}px`);
		}
		if (block.appearance.radius !== undefined) {
			box.style.setProperty("--tc-block-radius", `${block.appearance.radius}px`);
		}
	}
}

function makeSelectable(box: HTMLElement, block: CardBlock, context: CardRenderContext): void {
	const onSelect = context.options?.onSelectBlock;
	if (!onSelect) {
		return;
	}
	box.setAttr("role", "button");
	box.tabIndex = 0;
	box.setAttr("aria-pressed", String(context.options?.selectedBlockId === block.id));
	box.toggleClass("is-selected", context.options?.selectedBlockId === block.id);
	box.addEventListener("click", () => onSelect(block.id));
	box.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}
		event.preventDefault();
		onSelect(block.id);
	});
}

function shouldRenderMarkdown(value: CellValue): boolean {
	return value.detectedType === "markdown" || value.detectedType === "link";
}

async function renderValue(
	parent: HTMLElement,
	value: CellValue,
	card: ResolvedCard,
	context: CardRenderContext,
	className: string,
): Promise<void> {
	const host = parent.createDiv({ cls: className, attr: { dir: "auto" } });
	if (!shouldRenderMarkdown(value)) {
		host.setText(value.text);
		return;
	}
	await MarkdownRenderer.render(context.app, value.raw, host, card.card.origin.sourcePath, context.component);
}

function imageSource(context: CardRenderContext, card: ResolvedCard, image: ImageRef): string | null {
	if (image.external) {
		return image.source;
	}
	const file = resolveImageFile(context.app, card.card.origin.sourcePath, image);
	return file ? context.app.vault.getResourcePath(file) : null;
}

function renderMissingImage(parent: HTMLElement, image: ImageRef, context: CardRenderContext): void {
	const missing = parent.createDiv({ cls: "table-cards-image-missing" });
	missing.createSpan({ cls: "table-cards-image-missing-icon", text: "□", attr: { "aria-hidden": "true" } });
	const text = missing.createSpan({ cls: "table-cards-image-missing-text" });
	text.createSpan({ text: `${context.t("modal.imageMissing")}: ` });
	text.createSpan({ text: image.source, attr: { dir: "auto" } });
}

function renderImage(
	parent: HTMLElement,
	block: CardBlock,
	card: ResolvedCard,
	ref: ImageRef,
	context: CardRenderContext,
): void {
	const source = imageSource(context, card, ref);
	if (!source) {
		renderMissingImage(parent, ref, context);
		return;
	}
	const figure = parent.createEl("figure", { cls: "table-cards-image-figure" });
	figure.dataset.fit = block.image.fit;
	figure.dataset.aspect = block.image.aspect;
	figure.dataset.position = block.image.position;
	const zoomButton = block.image.zoom && context.options?.interactiveImages !== false
		? figure.createEl("button", {
				cls: "table-cards-image-button",
				attr: { "aria-label": `${context.t("modal.imageZoom")}: ${ref.alt || context.t("modal.image")}` },
			})
		: null;
	const imageHost = zoomButton ?? figure;
	const image = imageHost.createEl("img", {
		cls: "table-cards-image",
		attr: {
			src: source,
			alt: ref.alt || context.t("modal.image"),
			loading: "lazy",
			decoding: "async",
		},
	});
	if (ref.width) image.setAttr("width", String(ref.width));
	if (ref.height) image.setAttr("height", String(ref.height));
	image.addEventListener("error", () => {
		if (context.isCurrent && !context.isCurrent()) {
			return;
		}
		figure.empty();
		renderMissingImage(figure, ref, context);
	});
	if (zoomButton) {
		zoomButton.addEventListener("click", (event) => {
			event.stopPropagation();
			new ImageLightbox(context.app, {
				source,
				alt: ref.alt || context.t("modal.image"),
				closeLabel: context.t("modal.close"),
				opener: zoomButton,
			}).open();
		});
	}
	if (block.image.caption !== "none") {
		figure.createEl("figcaption", {
			text:
				block.image.caption === "column"
					? labelOf(block) || ref.alt || context.t("modal.image")
					: ref.alt || context.t("modal.image"),
			cls: "table-cards-image-caption",
			attr: { dir: "auto" },
		});
	}
}

async function renderTextBlock(
	box: HTMLElement,
	resolved: ResolvedBlock,
	card: ResolvedCard,
	context: CardRenderContext,
): Promise<void> {
	const { block, values } = resolved;
	if (block.kind === "chips") {
		const row = box.createDiv({ cls: "table-cards-pron" });
		for (const value of values) {
			row.createSpan({ cls: "table-cards-chip", text: value.text, attr: { dir: "auto" } });
		}
		return;
	}
	if (block.kind === "note") {
		const note = box.createDiv({ cls: "table-cards-tip" });
		note.createSpan({ cls: "table-cards-tip-mark", text: "✦", attr: { "aria-hidden": "true" } });
		const body = note.createDiv({ cls: "table-cards-tip-text" });
		for (const value of values) {
			await renderValue(body, value, card, context, "table-cards-value");
			if (context.isCurrent && !context.isCurrent()) return;
		}
		return;
	}
	const className =
		block.kind === "title"
			? "table-cards-word"
			: block.kind === "quote"
				? "table-cards-example"
				: "table-cards-translation";
	for (const value of values) {
		await renderValue(box, value, card, context, className);
		if (context.isCurrent && !context.isCurrent()) return;
	}
}

function fileBasename(path: string): string {
	return (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
}

function renderSource(root: HTMLElement, card: ResolvedCard, context: CardRenderContext): void {
	const source = root.createDiv({ cls: "table-cards-source-meta" });
	source.createSpan({
		cls: "table-cards-source-table",
		text: context.sourceLabel ?? card.card.origin.tableLabel,
		attr: { dir: "auto" },
	});
	source.createSpan({ cls: "table-cards-source-separator", text: "·", attr: { "aria-hidden": "true" } });
	source.createSpan({
		cls: "table-cards-source-file",
		text: fileBasename(card.card.origin.sourcePath),
		attr: { dir: "auto" },
	});
}

export async function renderCard(
	root: HTMLElement,
	card: ResolvedCard | null,
	context: CardRenderContext,
): Promise<void> {
	root.empty();
	if (!card) {
		const empty = root.createDiv({ cls: "table-cards-empty" });
		empty.createDiv({ cls: "table-cards-empty-kicker", text: context.t("modal.kicker") });
		empty.createDiv({ text: context.t("modal.empty") });
		return;
	}
	for (const resolved of card.blocks) {
		if (!resolved.visible) {
			continue;
		}
		const { block } = resolved;
		const box = root.createDiv({ cls: "table-cards-box" });
		applyBlockAttributes(box, block);
		if (resolved.placeholder) box.dataset.empty = block.empty.mode;
		makeSelectable(box, block, context);
		const label = labelOf(block);
		if (block.showLabel && label) {
			box.createDiv({ cls: "table-cards-label", text: label, attr: { dir: "auto" } });
		}
		if (block.kind === "image") {
			const refs = resolved.values.flatMap((value) => value.images);
			if (refs.length === 0) {
				for (const value of resolved.values) {
					await renderValue(box, value, card, context, "table-cards-translation");
				}
			} else {
				for (const ref of refs) renderImage(box, block, card, ref, context);
			}
		} else {
			await renderTextBlock(box, resolved, card, context);
		}
		if (context.isCurrent && !context.isCurrent()) {
			return;
		}
	}
	renderSource(root, card, context);
}
