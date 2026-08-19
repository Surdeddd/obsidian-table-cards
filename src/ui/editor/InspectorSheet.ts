import { createBlock, type AppearanceSettings, type BlockKind, type CardBlock, type ColumnProfile } from "../../model";
import type { BlockPatch, EditorAction, EditorPanel, EditorState } from "../../editor/state";
import type { Translator } from "../../i18n";
import { normalizeHeader } from "../../parse/tables";
import { applySizePreset, resolveDeckAppearance } from "../../settings/appearance";
import { ColorField } from "./controls/ColorField";
import { Listbox, type ListboxOption } from "./controls/Listbox";
import { paintRangeInput } from "./range";

export interface InspectorSheetContext {
	state: EditorState;
	panel: Exclude<EditorPanel, null | "fields" | "reorder">;
	profiles: ColumnProfile[];
	globalAppearance: AppearanceSettings;
	t: Translator;
	dispatch: (action: EditorAction) => void;
}

function field(parent: HTMLElement, label: string): HTMLElement {
	const root = parent.createDiv({ cls: "tc-inspector-field" });
	root.createDiv({ cls: "tc-inspector-field-label", text: label });
	return root;
}

function toggle(
	parent: HTMLElement,
	label: string,
	checked: boolean,
	onChange: (checked: boolean) => void,
): void {
	const control = parent.createEl("label", { cls: "tc-toggle-row" });
	control.createSpan({ text: label });
	const input = control.createEl("input", { type: "checkbox" });
	input.checked = checked;
	input.addEventListener("change", () => onChange(input.checked));
}

function textInput(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (value: string) => void,
): void {
	const root = field(parent, label);
	const input = root.createEl("input", {
		type: "text",
		attr: { value, "aria-label": label },
	});
	input.addEventListener("change", () => onChange(input.value));
}

function numberInput(
	parent: HTMLElement,
	label: string,
	value: number,
	min: number,
	max: number,
	onChange: (value: number) => void,
): void {
	const root = field(parent, label);
	const input = root.createEl("input", {
		type: "number",
		attr: {
			value: String(value),
			min: String(min),
			max: String(max),
			inputmode: "numeric",
			"aria-label": label,
		},
	});
	input.addEventListener("change", () => {
		const next = Math.max(min, Math.min(max, Number(input.value)));
		if (Number.isFinite(next)) onChange(next);
	});
}

function rangeInput(
	parent: HTMLElement,
	label: string,
	value: number,
	min: number,
	max: number,
	step: number,
	onChange: (value: number) => void,
): void {
	const root = field(parent, label);
	const line = root.createDiv({ cls: "tc-range-line" });
	const input = line.createEl("input", {
		type: "range",
		attr: {
			value: String(value),
			min: String(min),
			max: String(max),
			step: String(step),
			"aria-label": label,
		},
	});
	const output = line.createEl("output", { text: String(value) });
	paintRangeInput(input);
	input.addEventListener("input", () => {
		output.setText(input.value);
		paintRangeInput(input);
	});
	input.addEventListener("change", () => onChange(Number(input.value)));
}

function select<T extends string>(
	parent: HTMLElement,
	id: string,
	label: string,
	value: T,
	options: Array<ListboxOption<T>>,
	onChange: (value: T) => void,
): void {
	new Listbox(parent, { id, label, value, options, onChange });
}

let expandedGroup: string | null = null;

export function resetInspectorGroups(): void {
	expandedGroup = null;
}

function accordion(parent: HTMLElement, title: string, render: (body: HTMLElement) => void): void {
	const details = parent.createEl("details", { cls: "tc-inspector-group", attr: { name: "tc-inspector-group" } });
	details.createEl("summary", { text: title });
	const body = details.createDiv({ cls: "tc-inspector-group-body" });
	render(body);
	if (expandedGroup === title) details.open = true;
	details.addEventListener("toggle", () => {
		if (!details.open) {
			if (expandedGroup === title) expandedGroup = null;
			return;
		}
		expandedGroup = title;
		for (const other of Array.from(parent.querySelectorAll<HTMLDetailsElement>(".tc-inspector-group"))) {
			if (other !== details) other.open = false;
		}
	});
}

function blockOptions(t: Translator): Array<ListboxOption<BlockKind>> {
	return (["title", "text", "chips", "quote", "note", "image"] as BlockKind[]).map((value) => ({
		value,
		label: t(`editor.style.${value}`),
	}));
}

function patchBlock(context: InspectorSheetContext, block: CardBlock, patch: BlockPatch): void {
	context.dispatch({ type: "patchBlock", blockId: block.id, patch });
}

function renderColumns(parent: HTMLElement, block: CardBlock, context: InspectorSheetContext): void {
	const root = field(parent, context.t("editor.inspector.columns"));
	const profiles = new Map(context.profiles.map((profile) => [normalizeHeader(profile.header), profile.header]));
	for (const column of block.columns) profiles.set(normalizeHeader(column), column);
	for (const [key, header] of profiles) {
		const row = root.createEl("label", { cls: "tc-column-option" });
		const input = row.createEl("input", { type: "checkbox" });
		input.checked = block.columns.some((column) => normalizeHeader(column) === key);
		row.createSpan({ text: header });
		input.addEventListener("change", () => {
			const columns = input.checked
				? [...block.columns, header]
				: block.columns.filter((column) => normalizeHeader(column) !== key);
			patchBlock(context, block, { columns });
		});
	}
}

function renderEmptyControls(parent: HTMLElement, block: CardBlock, context: InspectorSheetContext): void {
	select(parent, `${block.id}-empty`, context.t("editor.empty"), block.empty.mode, [
		{ value: "hide", label: context.t("editor.empty.hide") },
		{ value: "dash", label: context.t("editor.empty.dash") },
		{ value: "custom", label: context.t("editor.empty.custom") },
		{ value: "preserve", label: context.t("editor.empty.preserve") },
		{ value: "fallback", label: context.t("editor.empty.fallback") },
	], (mode) => patchBlock(context, block, { empty: { mode } }));
	if (block.empty.mode === "custom") {
		textInput(parent, context.t("editor.empty.customText"), block.empty.customText, (customText) =>
			patchBlock(context, block, { empty: { customText } }),
		);
	}
	textInput(parent, context.t("editor.empty.tokens"), block.empty.emptyTokens.join(", "), (value) =>
		patchBlock(context, block, {
			empty: { emptyTokens: value.split(",").map((token) => token.trim()) },
		}),
	);
	toggle(parent, context.t("editor.empty.required"), block.empty.required, (required) =>
		patchBlock(context, block, { empty: { required } }),
	);
}

function renderBlockInspector(parent: HTMLElement, footer: HTMLElement, context: InspectorSheetContext): void {
	const block = context.state.draft.blocks.find((item) => item.id === context.state.selectedBlockId);
	if (!block) {
		parent.createDiv({ cls: "tc-field-empty", text: context.t("editor.pickBlock") });
		return;
	}
	const common = parent.createDiv({ cls: "tc-inspector-common" });
	select(common, `${block.id}-kind`, context.t("editor.inspector.type"), block.kind, blockOptions(context.t), (kind) =>
		patchBlock(context, block, { kind }),
	);
	renderColumns(common, block, context);
	const move = common.createEl("button", {
		cls: "tc-inspector-move",
		text: context.t("editor.move"),
		attr: { type: "button" },
	});
	move.addEventListener("click", () => context.dispatch({ type: "openPanel", panel: "reorder" }));

	accordion(parent, context.t("editor.group.content"), (body) => {
		textInput(body, context.t("editor.label"), block.label, (label) => patchBlock(context, block, { label }));
		select(body, `${block.id}-combine`, context.t("editor.inspector.combine"), block.combine, [
			{ value: "all", label: context.t("editor.combine.all") },
			{ value: "firstNonEmpty", label: context.t("editor.combine.first") },
		], (combine) => patchBlock(context, block, { combine }));
		toggle(body, context.t("editor.inspector.visible"), block.visible, (visible) => patchBlock(context, block, { visible }));
		toggle(body, context.t("editor.inspector.showLabel"), block.showLabel, (showLabel) => patchBlock(context, block, { showLabel }));
		select(body, `${block.id}-mobile`, context.t("editor.inspector.mobile"), block.mobile, [
			{ value: "stack", label: context.t("editor.mobile.stack") },
			{ value: "compact", label: context.t("editor.mobile.compact") },
		], (mobile) => patchBlock(context, block, { mobile }));
	});

	accordion(parent, context.t("editor.group.layout"), (body) => {
		select(body, `${block.id}-width`, context.t("editor.inspector.width"), block.width, [
			{ value: "half", label: context.t("editor.widthHalf") },
			{ value: "full", label: context.t("editor.widthFull") },
		], (width) => patchBlock(context, block, { width }));
		select(body, `${block.id}-height`, context.t("editor.height"), block.height.mode, [
			{ value: "auto", label: context.t("editor.height.auto") },
			{ value: "min", label: context.t("editor.height.min") },
			{ value: "fixed", label: context.t("editor.height.fixed") },
		], (mode) => patchBlock(context, block, { height: { mode } }));
		if (block.height.mode !== "auto") {
			rangeInput(body, context.t("editor.height.value"), block.height.valuePx, 48, 480, 4, (valuePx) =>
				patchBlock(context, block, { height: { valuePx } }),
			);
		}
		select(body, `${block.id}-overflow`, context.t("editor.overflow"), block.overflow.mode, [
			{ value: "wrap", label: context.t("editor.overflow.wrap") },
			{ value: "shrink", label: context.t("editor.overflow.shrink") },
			{ value: "ellipsis", label: context.t("editor.overflow.ellipsis") },
			{ value: "scroll", label: context.t("editor.overflow.scroll") },
		], (mode) => patchBlock(context, block, { overflow: { mode } }));
		if (block.overflow.mode === "shrink") {
			numberInput(body, context.t("editor.overflow.minFont"), block.overflow.minFontPx, 10, 40, (minFontPx) =>
				patchBlock(context, block, { overflow: { minFontPx } }),
			);
		}
		if (block.overflow.mode === "ellipsis") {
			numberInput(body, context.t("editor.overflow.lines"), block.overflow.maxLines ?? 3, 1, 20, (maxLines) =>
				patchBlock(context, block, { overflow: { maxLines } }),
			);
		}
	});

	accordion(parent, context.t("editor.group.typography"), (body) => {
		select(body, `${block.id}-align`, context.t("editor.align"), block.appearance.align ?? "left", [
			{ value: "left", label: context.t("editor.align.left") },
			{ value: "center", label: context.t("editor.align.center") },
			{ value: "right", label: context.t("editor.align.right") },
		], (align) => patchBlock(context, block, { appearance: { align } }));
	});

	accordion(parent, context.t("editor.group.appearance"), (body) => {
		toggle(body, context.t("editor.appearance.inherit"), block.appearance.inherit, (inherit) =>
			patchBlock(context, block, { appearance: { inherit } }),
		);
		if (!block.appearance.inherit) {
			const card = resolveDeckAppearance(context.globalAppearance, context.state.draft.appearance);
			const background = block.appearance.background ?? card.cardBackground;
			const text = block.appearance.text ?? card.primaryText;
			new ColorField(body, {
				id: `${block.id}-background`, label: context.t("editor.appearance.background"), value: background,
				t: context.t, onChange: (value) => patchBlock(context, block, { appearance: { background: value } }),
			});
			new ColorField(body, {
				id: `${block.id}-text`, label: context.t("editor.appearance.text"), value: text, against: background,
				t: context.t, onChange: (value) => patchBlock(context, block, { appearance: { text: value } }),
			});
			new ColorField(body, {
				id: `${block.id}-border`, label: context.t("editor.appearance.border"), value: block.appearance.border ?? card.borderColor,
				t: context.t, onChange: (value) => patchBlock(context, block, { appearance: { border: value } }),
			});
			rangeInput(body, context.t("settings.appearance.borderWidth"), block.appearance.borderWidth ?? 1, 0, 8, 1, (borderWidth) =>
				patchBlock(context, block, { appearance: { borderWidth } }),
			);
			rangeInput(body, context.t("settings.appearance.radius"), block.appearance.radius ?? 12, 0, 48, 1, (radius) =>
				patchBlock(context, block, { appearance: { radius } }),
			);
		}
	});

	accordion(parent, context.t("editor.group.rules"), (body) => renderEmptyControls(body, block, context));
	if (block.kind === "image") {
		accordion(parent, context.t("editor.group.image"), (body) => {
			select(body, `${block.id}-fit`, context.t("editor.image.fit"), block.image.fit, [
				{ value: "contain", label: context.t("editor.image.contain") },
				{ value: "cover", label: context.t("editor.image.cover") },
			], (fit) => patchBlock(context, block, { image: { fit } }));
			select(body, `${block.id}-aspect`, context.t("editor.image.aspect"), block.image.aspect, [
				{ value: "auto", label: context.t("editor.image.auto") },
				{ value: "1:1", label: "1:1" },
				{ value: "4:3", label: "4:3" },
				{ value: "16:9", label: "16:9" },
			], (aspect) => patchBlock(context, block, { image: { aspect } }));
			select(body, `${block.id}-position`, context.t("editor.image.position"), block.image.position, [
				{ value: "top", label: context.t("editor.image.top") },
				{ value: "center", label: context.t("editor.image.center") },
				{ value: "bottom", label: context.t("editor.image.bottom") },
			], (position) => patchBlock(context, block, { image: { position } }));
			select(body, `${block.id}-caption`, context.t("editor.image.caption"), block.image.caption, [
				{ value: "alt", label: context.t("editor.image.captionAlt") },
				{ value: "column", label: context.t("editor.image.captionColumn") },
				{ value: "none", label: context.t("editor.image.captionNone") },
			], (caption) => patchBlock(context, block, { image: { caption } }));
			toggle(body, context.t("editor.image.zoom"), block.image.zoom, (zoom) => patchBlock(context, block, { image: { zoom } }));
		});
	}

	const reset = footer.createEl("button", { text: context.t("editor.resetBlock"), attr: { type: "button" } });
	reset.addEventListener("click", () => {
		const replacement = createBlock({ id: block.id, kind: block.kind, columns: block.columns });
		context.dispatch({
			type: "replaceBlocks",
			blocks: context.state.draft.blocks.map((item) => (item.id === block.id ? replacement : item)),
		});
	});
	const remove = footer.createEl("button", {
		cls: "mod-warning",
		text: context.t("editor.removeBlock"),
		attr: { type: "button" },
	});
	remove.addEventListener("click", () => context.dispatch({ type: "removeBlock", blockId: block.id }));
}

function renderCardInspector(parent: HTMLElement, footer: HTMLElement, context: InspectorSheetContext): void {
	const appearance = resolveDeckAppearance(context.globalAppearance, context.state.draft.appearance);
	const presets = parent.createDiv({ cls: "tc-preset-grid" });
	for (const preset of ["obsidian", "monochrome", "custom"] as const) {
		const button = presets.createEl("button", {
			text: context.t(`settings.appearance.preset.${preset}`),
			attr: { type: "button", "aria-pressed": String(appearance.preset === preset) },
		});
		button.addEventListener("click", () => context.dispatch({ type: "patchAppearance", patch: { preset } }));
	}
	select(parent, "card-size", context.t("settings.appearance.size"), appearance.size, [
		{ value: "compact", label: context.t("settings.appearance.size.compact") },
		{ value: "comfort", label: context.t("settings.appearance.size.comfort") },
		{ value: "large", label: context.t("settings.appearance.size.large") },
	], (size) => {
		const next = { ...appearance };
		applySizePreset(next, size);
		context.dispatch({
			type: "patchAppearance",
			patch: {
				size,
				padding: next.padding,
				gap: next.gap,
				wordScale: next.wordScale,
				radius: next.radius,
				maxWidth: next.maxWidth,
			},
		});
	});
	select(parent, "card-overlay", context.t("settings.appearance.overlay"), appearance.overlay, [
		{ value: "auto", label: context.t("settings.appearance.overlay.auto") },
		{ value: "center", label: context.t("settings.appearance.overlay.center") },
		{ value: "full", label: context.t("settings.appearance.overlay.full") },
	], (overlay) => context.dispatch({ type: "patchAppearance", patch: { overlay } }));
	rangeInput(parent, context.t("settings.appearance.padding"), appearance.padding, 8, 56, 1, (padding) =>
		context.dispatch({ type: "patchAppearance", patch: { padding } }),
	);
	rangeInput(parent, context.t("settings.appearance.gap"), appearance.gap, 4, 40, 1, (gap) =>
		context.dispatch({ type: "patchAppearance", patch: { gap } }),
	);
	rangeInput(parent, context.t("settings.appearance.wordScale"), appearance.wordScale, 0.7, 1.8, 0.05, (wordScale) =>
		context.dispatch({ type: "patchAppearance", patch: { wordScale } }),
	);
	rangeInput(parent, context.t("settings.appearance.radius"), appearance.radius, 0, 48, 1, (radius) =>
		context.dispatch({ type: "patchAppearance", patch: { radius } }),
	);
	select(parent, "card-border", context.t("settings.appearance.border"), appearance.border, [
		{ value: "none", label: context.t("settings.appearance.border.none") },
		{ value: "thin", label: context.t("settings.appearance.border.thin") },
		{ value: "solid", label: context.t("settings.appearance.border.solid") },
	], (border) => context.dispatch({ type: "patchAppearance", patch: { border } }));
	if (appearance.border === "solid") {
		rangeInput(parent, context.t("settings.appearance.borderWidth"), appearance.borderWidth, 1, 8, 1, (borderWidth) =>
			context.dispatch({ type: "patchAppearance", patch: { borderWidth } }),
		);
	}
	toggle(parent, context.t("settings.appearance.shadow"), appearance.cardShadow, (cardShadow) =>
		context.dispatch({ type: "patchAppearance", patch: { cardShadow } }),
	);
	rangeInput(parent, context.t("editor.card.maxWidth"), appearance.maxWidth, 320, 1400, 20, (maxWidth) =>
		context.dispatch({ type: "patchAppearance", patch: { maxWidth } }),
	);
	toggle(parent, context.t("settings.appearance.twoColumn"), appearance.twoColumn, (twoColumn) =>
		context.dispatch({ type: "patchAppearance", patch: { twoColumn } }),
	);
	if (appearance.twoColumn) {
		rangeInput(parent, context.t("settings.appearance.twoColumnFrom"), appearance.twoColumnFrom, 520, 1400, 20, (twoColumnFrom) =>
			context.dispatch({ type: "patchAppearance", patch: { twoColumnFrom } }),
		);
	}
	if (appearance.preset === "custom") {
		const colors = parent.createDiv({ cls: "tc-card-colors" });
		const colorFields: Array<[keyof AppearanceSettings, string, string | undefined]> = [
			["windowBackground", context.t("editor.card.window"), undefined],
			["cardBackground", context.t("editor.card.background"), undefined],
			["primaryText", context.t("editor.card.primary"), appearance.cardBackground],
			["secondaryText", context.t("editor.card.secondary"), appearance.cardBackground],
			["labelText", context.t("editor.card.label"), appearance.cardBackground],
			["accent", context.t("editor.card.accent"), appearance.cardBackground],
			["borderColor", context.t("editor.card.borderColor"), appearance.cardBackground],
		];
		for (const [key, label, against] of colorFields) {
			new ColorField(colors, {
				id: `card-${key}`,
				label,
				value: String(appearance[key]),
				against,
				t: context.t,
				onChange: (value) => context.dispatch({ type: "patchAppearance", patch: { [key]: value } }),
			});
		}
	}
	const reset = footer.createEl("button", { text: context.t("editor.resetCard"), attr: { type: "button" } });
	reset.addEventListener("click", () =>
		context.dispatch({ type: "replaceDraft", deck: { ...context.state.draft, appearance: undefined } }),
	);
}

export function renderInspectorSheet(
	parent: HTMLElement,
	footer: HTMLElement,
	context: InspectorSheetContext,
): void {
	if (context.panel === "block") renderBlockInspector(parent, footer, context);
	else renderCardInspector(parent, footer, context);
}
