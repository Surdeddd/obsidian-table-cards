import { setIcon, type App, type Component } from "obsidian";
import type { AppearanceSettings, DeckLoadResult, UiLocale } from "../../model";
import { formatUiNumber, type Translator } from "../../i18n";
import { representativeRowIndexes } from "../../editor/rows";
import {
	isDirty,
	type EditorAction,
	type EditorPanel,
	type EditorState,
} from "../../editor/state";
import { Sheet } from "./controls/Sheet";
import { renderCardCanvas } from "./CardCanvas";

export type PreviewDevice = "desktop" | "phone";

function focusableElements(root: HTMLElement): HTMLElement[] {
	return Array.from(
		root.querySelectorAll<HTMLElement>(
			'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
		),
	).filter((element) => element.getClientRects().length > 0 && element.getAttr("aria-hidden") !== "true");
}

export interface EditorShellContext {
	app: App;
	component: Component;
	state: EditorState;
	data: DeckLoadResult;
	loading: boolean;
	error: string | null;
	saving: boolean;
	previewDevice: PreviewDevice;
	locale: UiLocale;
	t: Translator;
	globalAppearance: AppearanceSettings;
	dispatch: (action: EditorAction) => void;
	onUndo: () => void;
	onRedo: () => void;
	onSave: () => void;
	onBack: () => void;
	onDevice: (device: PreviewDevice) => void;
	renderPanel?: (panel: Exclude<EditorPanel, null>, body: HTMLElement, footer: HTMLElement | null) => void;
}

function button(
	parent: HTMLElement,
	label: string,
	icon: string | null,
	onClick: () => void,
	className = "tc-editor-button",
): HTMLButtonElement {
	const element = parent.createEl("button", {
		cls: className,
		attr: { type: "button", "aria-label": label },
	});
	if (icon) setIcon(element, icon);
	if (!icon || className.includes("with-label")) element.createSpan({ text: label });
	element.addEventListener("click", onClick);
	return element;
}

export class EditorShell {
	private readonly root: HTMLElement;
	private sheet: Sheet | null = null;
	private renderVersion = 0;
	private restorePanelFocus: Exclude<EditorPanel, null> | null = null;
	private canvasCleanup: (() => void) | null = null;
	private activePanel: EditorPanel = null;

	constructor(root: HTMLElement) {
		this.root = root;
	}

	destroy(): void {
		this.renderVersion += 1;
		this.restorePanelFocus = null;
		this.activePanel = null;
		this.canvasCleanup?.();
		this.canvasCleanup = null;
		this.sheet?.destroy();
		this.sheet = null;
		this.root.empty();
	}

	render(context: EditorShellContext): void {
		const samePanel = this.activePanel !== null && this.activePanel === context.state.activePanel;
		const previousFocusRoot = this.activePanel ? this.root.querySelector<HTMLElement>(".tc-sheet") : this.root;
		const previousFocusable = previousFocusRoot ? focusableElements(previousFocusRoot) : [];
		const focusedIndex =
			samePanel && previousFocusRoot
				? previousFocusable.indexOf(previousFocusRoot.ownerDocument.activeElement as HTMLElement)
				: -1;
		const previousScroll = samePanel
			? (this.root.querySelector<HTMLElement>(".tc-sheet-body")?.scrollTop ?? null)
			: null;
		const version = ++this.renderVersion;
		this.canvasCleanup?.();
		this.canvasCleanup = null;
		this.sheet?.destroy();
		this.sheet = null;
		this.root.empty();
		this.root.addClass("tc-editor-shell");
		this.root.toggleClass("is-sheet-open", context.state.activePanel !== null);

		const header = this.root.createEl("header", { cls: "tc-editor-header" });
		button(header, context.t("editor.backAction"), "arrow-left", context.onBack, "tc-editor-icon-button is-editor-back");
		const title = header.createDiv({ cls: "tc-editor-title" });
		const titleInput = title.createEl("input", {
			type: "text",
			cls: "tc-editor-title-input",
			attr: {
				value: context.state.draft.name,
				"aria-label": context.t("settings.deck.name"),
				dir: "auto",
				spellcheck: "false",
				autocomplete: "off",
			},
		});
		const commitName = (): void => {
			const name = titleInput.value.trim();
			if (!name || name === context.state.draft.name) {
				titleInput.value = context.state.draft.name;
				return;
			}
			context.dispatch({ type: "setDeckName", name });
		};
		titleInput.addEventListener("change", commitName);
		titleInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") titleInput.blur();
			else if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				titleInput.value = context.state.draft.name;
				titleInput.blur();
			}
		});
		if (isDirty(context.state)) title.createDiv({ cls: "tc-editor-dirty", text: context.t("editor.unsaved") });
		const history = header.createDiv({ cls: "tc-editor-history" });
		const undo = button(history, context.t("editor.undo"), "undo-2", context.onUndo, "tc-editor-icon-button");
		undo.disabled = context.state.past.length === 0;
		const redo = button(history, context.t("editor.redo"), "redo-2", context.onRedo, "tc-editor-icon-button");
		redo.disabled = context.state.future.length === 0;
		const device = header.createDiv({ cls: "tc-editor-device" });
		for (const option of ["desktop", "phone"] as PreviewDevice[]) {
			const control = button(
				device,
				context.t(`editor.device.${option}`),
				option === "desktop" ? "monitor" : "smartphone",
				() => context.onDevice(option),
				"tc-editor-icon-button",
			);
			control.setAttr("aria-pressed", String(context.previewDevice === option));
		}
		const save = button(header, context.saving ? context.t("editor.saving") : context.t("editor.save"), null, context.onSave, "tc-editor-save with-label");
		save.disabled = context.saving || !isDirty(context.state);

		const canvasBar = this.root.createDiv({ cls: "tc-editor-canvas-bar" });
		const warningCount =
			context.data.diagnostics.length +
			context.data.profiles.reduce((total, profile) => total + profile.warnings.length, 0);
		const fieldsLabel = `${context.t("editor.fields")} · ${formatUiNumber(context.data.profiles.length, context.locale)}`;
		const fields = button(
			canvasBar,
			fieldsLabel,
			"table-properties",
			() => context.dispatch({ type: "openPanel", panel: "fields" }),
			"tc-editor-button with-label",
		);
		if (warningCount > 0) {
			const note = context.t("launcher.warnings", { count: formatUiNumber(warningCount, context.locale) });
			fields.createSpan({ cls: "tc-profile-warning-dot", attr: { role: "img", "aria-label": note } });
			fields.setAttr("aria-label", `${fieldsLabel} · ${note}`);
		}
		const rows = canvasBar.createDiv({ cls: "tc-editor-row-nav" });
		const rowCount = context.data.cards.length;
		const currentRow = rowCount === 0 ? 0 : Math.min(context.state.previewRow, rowCount - 1);
		const previous = button(rows, context.t("editor.row.previous"), "chevron-left", () => context.dispatch({ type: "setPreviewRow", index: Math.max(0, currentRow - 1) }), "tc-editor-icon-button");
		previous.disabled = currentRow <= 0;
		const rowPicker = rows.createEl("details", { cls: "tc-editor-row-picker" });
		const currentRowLabel = formatUiNumber(rowCount === 0 ? 0 : currentRow + 1, context.locale);
		const rowCountLabel = formatUiNumber(rowCount, context.locale);
		rowPicker
			.createEl("summary", {
				attr: {
					"aria-label": `${context.t("editor.row.choose")}: ${currentRowLabel} / ${rowCountLabel}`,
				},
			})
			.createSpan({ cls: "tc-figure-pair", text: `${currentRowLabel} / ${rowCountLabel}` });
		const rowMenu = rowPicker.createDiv({ cls: "tc-editor-row-menu" });
		const representative = representativeRowIndexes(context.data.cards);
		const rowChoices = [
			["first", representative.first],
			["random", rowCount === 0 ? 0 : Math.floor(Math.random() * rowCount)],
			["longest", representative.longest],
			["mostEmpty", representative.mostEmpty],
		] as const;
		for (const [label, index] of rowChoices) {
			const choice = rowMenu.createEl("button", {
				text: context.t(`editor.row.${label}`),
				attr: { type: "button" },
			});
			choice.disabled = rowCount === 0;
			choice.addEventListener("click", () => context.dispatch({ type: "setPreviewRow", index }));
		}
		const next = button(rows, context.t("editor.row.next"), "chevron-right", () => context.dispatch({ type: "setPreviewRow", index: Math.min(Math.max(0, rowCount - 1), currentRow + 1) }), "tc-editor-icon-button");
		next.disabled = rowCount === 0 || currentRow >= rowCount - 1;
		const cardStyle = button(
			canvasBar,
			context.t("editor.cardStyle"),
			"palette",
			() => context.dispatch({ type: "openPanel", panel: "card" }),
			"tc-editor-button with-label",
		);

		const canvasWrap = this.root.createDiv({ cls: "tc-editor-canvas-wrap" });
		this.canvasCleanup = renderCardCanvas(canvasWrap, {
			app: context.app,
			component: context.component,
			state: context.state,
			data: context.data,
			globalAppearance: context.globalAppearance,
			previewDevice: context.previewDevice,
			loading: context.loading,
			error: context.error,
			t: context.t,
			isCurrent: () => version === this.renderVersion,
			dispatch: context.dispatch,
		});

		const selected = context.state.draft.blocks.find((block) => block.id === context.state.selectedBlockId);
		let blockOpener: HTMLElement | null = null;
		let reorderOpener: HTMLElement | null = null;
		if (selected) {
			const toolbar = this.root.createDiv({ cls: "tc-editor-block-toolbar" });
			blockOpener = button(toolbar, context.t(`editor.style.${selected.kind}`), "sliders-horizontal", () => context.dispatch({ type: "openPanel", panel: "block" }), "tc-editor-button with-label is-block-type");
			const widthToggle = button(
				toolbar,
				context.t("editor.widthHalf"),
				"arrow-left-right",
				() => context.dispatch({ type: "setBlockWidth", blockId: selected.id, width: selected.width === "half" ? "full" : "half" }),
				"tc-editor-button with-label is-block-width",
			);
			widthToggle.setAttr("aria-pressed", String(selected.width === "half"));
			reorderOpener = button(toolbar, context.t("editor.layout"), "list", () => context.dispatch({ type: "openPanel", panel: "reorder" }), "tc-editor-button with-label is-block-move");
		}

		if (context.state.activePanel) {
			const panel = context.state.activePanel;
			const opener = panel === "fields" ? fields : panel === "card" ? cardStyle : panel === "reorder" ? reorderOpener : blockOpener;
			let panelBody: HTMLElement | null = null;
			this.sheet = new Sheet(this.root, {
				id: `tc-${panel}-sheet`,
				title: context.t(`editor.panel.${panel}`),
				mode: "responsive",
				opener,
				closeLabel: context.t("editor.closePanel"),
				onClose: () => {
					this.restorePanelFocus = panel;
					context.dispatch({ type: "openPanel", panel: null });
				},
				renderBody: (body) => {
					panelBody = body;
					if (!context.renderPanel) body.createDiv({ cls: "tc-editor-status", text: context.t("editor.panelPlaceholder") });
				},
				renderFooter: (footer) => {
					if (context.renderPanel && panelBody) context.renderPanel(panel, panelBody, footer);
				},
			});
			this.sheet.open();
		} else if (this.restorePanelFocus) {
			const panel = this.restorePanelFocus;
			this.restorePanelFocus = null;
			const target = panel === "fields" ? fields : panel === "card" ? cardStyle : panel === "reorder" ? reorderOpener : blockOpener;
			window.setTimeout(() => target?.focus(), 0);
		}
		this.activePanel = context.state.activePanel;
		if (focusedIndex >= 0 || previousScroll !== null) {
			window.setTimeout(() => {
				if (focusedIndex >= 0) {
					const focusRoot = context.state.activePanel
						? this.root.querySelector<HTMLElement>(".tc-sheet")
						: this.root;
					const items = focusRoot ? focusableElements(focusRoot) : [];
					items[Math.min(focusedIndex, Math.max(0, items.length - 1))]?.focus({ preventScroll: true });
				}
				if (previousScroll !== null) {
					const body = this.root.querySelector<HTMLElement>(".tc-sheet-body");
					if (body) body.scrollTop = previousScroll;
				}
			}, 0);
		}
	}
}
