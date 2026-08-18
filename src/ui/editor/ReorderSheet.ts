import { setIcon } from "obsidian";
import type { EditorAction, EditorState } from "../../editor/state";
import type { Translator } from "../../i18n";

export interface ReorderSheetContext {
	state: EditorState;
	t: Translator;
	dispatch: (action: EditorAction) => void;
}

function focusAction(blockId: string, direction: "up" | "down", announcement: string): void {
	window.setTimeout(() => {
		const button = document.querySelector<HTMLElement>(
			`[data-reorder-action="${blockId}-${direction}"]`,
		);
		button?.focus();
		const live = document.querySelector<HTMLElement>("[data-reorder-live]");
		live?.setText(announcement);
	}, 0);
}

export function renderReorderSheet(parent: HTMLElement, context: ReorderSheetContext): void {
	const live = parent.createDiv({
		cls: "tc-visually-hidden",
		attr: { "aria-live": "polite", "data-reorder-live": "true" },
	});
	live.setText("");
	const add = parent.createEl("button", {
		cls: "tc-reorder-add mod-cta",
		text: context.t("editor.addBlock"),
		attr: { type: "button" },
	});
	add.addEventListener("click", () => {
		context.dispatch({ type: "addBlock" });
		context.dispatch({ type: "openPanel", panel: "block" });
	});
	if (context.state.draft.blocks.length === 0) {
		parent.createDiv({ cls: "tc-field-empty", text: context.t("editor.reorder.empty") });
		return;
	}
	const list = parent.createEl("ol", { cls: "tc-reorder-list" });
	for (let index = 0; index < context.state.draft.blocks.length; index += 1) {
		const block = context.state.draft.blocks[index];
		if (!block) continue;
		const row = list.createEl("li", { cls: "tc-reorder-row" });
		row.createDiv({ cls: "tc-reorder-handle", text: "⠿", attr: { "aria-hidden": "true" } });
		const identity = row.createDiv({ cls: "tc-reorder-identity" });
		identity.createDiv({ cls: "tc-reorder-label", text: block.label || block.columns.join(" · ") });
		identity.createDiv({ cls: "tc-reorder-type", text: context.t(`editor.style.${block.kind}`) });
		const actions = row.createDiv({ cls: "tc-reorder-actions" });
		for (const direction of ["up", "down"] as const) {
			const target = direction === "up" ? index - 1 : index + 1;
			const label = context.t(`editor.reorder.${direction}`);
			const button = actions.createEl("button", {
				attr: {
					type: "button",
					"aria-label": `${label}: ${block.label || block.columns.join(" · ")}`,
					"data-reorder-action": `${block.id}-${direction}`,
				},
			});
			setIcon(button, direction === "up" ? "arrow-up" : "arrow-down");
			button.disabled = target < 0 || target >= context.state.draft.blocks.length;
			button.addEventListener("click", () => {
				context.dispatch({ type: "moveBlock", blockId: block.id, toIndex: target });
				focusAction(
					block.id,
					direction,
					`${context.t("editor.reorder.moved")} ${target + 1}`,
				);
			});
		}
		const remove = actions.createEl("button", {
			attr: {
				type: "button",
				"aria-label": `${context.t("editor.removeBlock")}: ${block.label || block.columns.join(" · ")}`,
			},
		});
		setIcon(remove, "trash-2");
		remove.addEventListener("click", () => context.dispatch({ type: "removeBlock", blockId: block.id }));
	}
}
