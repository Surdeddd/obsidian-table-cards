import type { App, Component } from "obsidian";
import type { EditorAction, EditorState } from "../../editor/state";
import { resolveCard } from "../../layout/resolve";
import type { AppearanceSettings, DeckLoadResult } from "../../model";
import { applyAppearance, resolveDeckAppearance, shouldSplitEditor, widthFromPointer } from "../../settings/appearance";
import type { Translator } from "../../i18n";
import { renderCard } from "../CardView";
import type { PreviewDevice } from "./EditorShell";

export interface CardCanvasContext {
	app: App;
	component: Component;
	state: EditorState;
	data: DeckLoadResult;
	globalAppearance: AppearanceSettings;
	previewDevice: PreviewDevice;
	loading: boolean;
	error: string | null;
	t: Translator;
	isCurrent: () => boolean;
	dispatch: (action: EditorAction) => void;
}

function blockBox(stage: HTMLElement, blockId: string): HTMLElement | null {
	return Array.from(stage.querySelectorAll<HTMLElement>(".table-cards-box")).find(
		(box) => box.dataset.blockId === blockId,
	) ?? null;
}

function clearDropMarkers(stage: HTMLElement): void {
	for (const box of Array.from(stage.querySelectorAll<HTMLElement>(".table-cards-box"))) {
		box.classList.remove("is-drop-before", "is-drop-after", "is-dragging");
	}
}

function nearestDropTarget(
	stage: HTMLElement,
	x: number,
	y: number,
): { blockId: string; after: boolean } | null {
	let nearest: { blockId: string; after: boolean; distance: number } | null = null;
	for (const box of Array.from(stage.querySelectorAll<HTMLElement>(".table-cards-box"))) {
		const blockId = box.dataset.blockId;
		if (!blockId) continue;
		const rect = box.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const distance = Math.hypot(x - centerX, y - centerY);
		if (!nearest || distance < nearest.distance) {
			nearest = {
				blockId,
				after: y > centerY || (Math.abs(y - centerY) < rect.height / 4 && x > centerX),
				distance,
			};
		}
	}
	return nearest;
}

function attachReorderHandles(stage: HTMLElement, context: CardCanvasContext): void {
	if (context.previewDevice === "phone" || !window.matchMedia("(pointer: fine)").matches) return;
	for (const box of Array.from(stage.querySelectorAll<HTMLElement>(".table-cards-box"))) {
		const blockId = box.dataset.blockId;
		if (!blockId) continue;
		const handle = box.createDiv({
			cls: "tc-card-drag-handle",
			attr: { "aria-hidden": "true" },
		});
		handle.addEventListener("pointerdown", (start) => {
			if (start.button !== 0) return;
			start.preventDefault();
			handle.setPointerCapture(start.pointerId);
			box.classList.add("is-dragging");
			let target: { blockId: string; after: boolean } | null = null;
			let cancelled = false;

			const cleanup = (): void => {
				clearDropMarkers(stage);
				window.removeEventListener("keydown", onKeyDown);
				handle.removeEventListener("pointermove", onMove);
				handle.removeEventListener("pointerup", onPointerUp);
				handle.removeEventListener("pointercancel", onPointerCancel);
			};
			const onKeyDown = (event: KeyboardEvent): void => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
				cancelled = true;
				if (handle.hasPointerCapture(start.pointerId)) handle.releasePointerCapture(start.pointerId);
				cleanup();
			};
			const onMove = (move: PointerEvent): void => {
				if (!handle.hasPointerCapture(move.pointerId)) return;
				clearDropMarkers(stage);
				box.classList.add("is-dragging");
				target = nearestDropTarget(stage, move.clientX, move.clientY);
				const targetBox = target ? blockBox(stage, target.blockId) : null;
				if (targetBox && target) targetBox.classList.add(target.after ? "is-drop-after" : "is-drop-before");
			};
			const onPointerUp = (up: PointerEvent): void => {
				if (handle.hasPointerCapture(up.pointerId)) handle.releasePointerCapture(up.pointerId);
				cleanup();
				if (cancelled || !target || target.blockId === blockId) return;
				const drop = target;
				const fromIndex = context.state.draft.blocks.findIndex((block) => block.id === blockId);
				const targetIndex = context.state.draft.blocks.findIndex((block) => block.id === drop.blockId);
				if (fromIndex < 0 || targetIndex < 0) return;
				let toIndex = targetIndex + (drop.after ? 1 : 0);
				if (fromIndex < toIndex) toIndex -= 1;
				if (toIndex !== fromIndex) context.dispatch({ type: "moveBlock", blockId, toIndex });
			};
			const onPointerCancel = (): void => {
				cancelled = true;
				cleanup();
			};
			window.addEventListener("keydown", onKeyDown);
			handle.addEventListener("pointermove", onMove);
			handle.addEventListener("pointerup", onPointerUp);
			handle.addEventListener("pointercancel", onPointerCancel);
		});
	}
}

function attachResizeHandles(stage: HTMLElement, context: CardCanvasContext): void {
	if (context.previewDevice === "phone" || !window.matchMedia("(pointer: fine)").matches) return;
	const blockId = context.state.selectedBlockId;
	if (!blockId) return;
	const box = blockBox(stage, blockId);
	const block = context.state.draft.blocks.find((item) => item.id === blockId);
	if (!box || !block) return;

	const width = box.createDiv({ cls: "tc-resize-handle is-width", attr: { "aria-hidden": "true" } });
	width.addEventListener("pointerdown", (start) => {
		if (start.button !== 0) return;
		start.preventDefault();
		width.setPointerCapture(start.pointerId);
		const originLeft = box.getBoundingClientRect().left;
		let next = block.width;
		const cleanup = (): void => {
			delete box.dataset.previewWidth;
			window.removeEventListener("keydown", onKeyDown);
			width.removeEventListener("pointermove", onMove);
			width.removeEventListener("pointerup", onPointerUp);
			width.removeEventListener("pointercancel", onPointerCancel);
		};
		const cancel = (): void => {
			if (width.hasPointerCapture(start.pointerId)) width.releasePointerCapture(start.pointerId);
			cleanup();
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			cancel();
		};
		const onMove = (move: PointerEvent): void => {
			if (!width.hasPointerCapture(move.pointerId)) return;
			const stageRect = stage.getBoundingClientRect();
			next = widthFromPointer(move.clientX, originLeft, stageRect.width);
			box.dataset.previewWidth = next;
			stage.classList.toggle("is-single-column", false);
		};
		const onPointerUp = (up: PointerEvent): void => {
			if (width.hasPointerCapture(up.pointerId)) width.releasePointerCapture(up.pointerId);
			cleanup();
			if (next !== block.width) context.dispatch({ type: "setBlockWidth", blockId, width: next });
		};
		const onPointerCancel = (): void => cleanup();
		window.addEventListener("keydown", onKeyDown);
		width.addEventListener("pointermove", onMove);
		width.addEventListener("pointerup", onPointerUp);
		width.addEventListener("pointercancel", onPointerCancel);
	});

	const height = box.createDiv({ cls: "tc-resize-handle is-height", attr: { "aria-hidden": "true" } });
	height.addEventListener("dblclick", () => {
		context.dispatch({ type: "patchBlock", blockId, patch: { height: { mode: "auto" } } });
	});
	height.addEventListener("pointerdown", (start) => {
		if (start.button !== 0) return;
		start.preventDefault();
		height.setPointerCapture(start.pointerId);
		const initial = box.getBoundingClientRect().height;
		let value = initial;
		const cleanup = (): void => {
			box.style.removeProperty("height");
			window.removeEventListener("keydown", onKeyDown);
			height.removeEventListener("pointermove", onMove);
			height.removeEventListener("pointerup", onPointerUp);
			height.removeEventListener("pointercancel", onPointerCancel);
		};
		const cancel = (): void => {
			if (height.hasPointerCapture(start.pointerId)) height.releasePointerCapture(start.pointerId);
			cleanup();
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			cancel();
		};
		const onMove = (move: PointerEvent): void => {
			if (!height.hasPointerCapture(move.pointerId)) return;
			value = Math.round(Math.max(48, Math.min(480, initial + move.clientY - start.clientY)));
			box.style.height = `${value}px`;
		};
		const onPointerUp = (up: PointerEvent): void => {
			if (height.hasPointerCapture(up.pointerId)) height.releasePointerCapture(up.pointerId);
			cleanup();
			if (Math.abs(value - initial) >= 4) {
				context.dispatch({ type: "patchBlock", blockId, patch: { height: { mode: "fixed", valuePx: value } } });
			}
		};
		const onPointerCancel = (): void => cleanup();
		window.addEventListener("keydown", onKeyDown);
		height.addEventListener("pointermove", onMove);
		height.addEventListener("pointerup", onPointerUp);
		height.addEventListener("pointercancel", onPointerCancel);
	});
}

export function renderCardCanvas(parent: HTMLElement, context: CardCanvasContext): () => void {
	if (context.loading) parent.createDiv({ cls: "tc-editor-status", text: context.t("editor.loading") });
	else if (context.error) parent.createDiv({ cls: "tc-editor-status is-error", text: context.error });
	const preview = parent.createDiv({ cls: `tc-editor-preview is-${context.previewDevice}` });
	const appearance = resolveDeckAppearance(context.globalAppearance, context.state.draft.appearance);
	applyAppearance(preview, appearance, context.previewDevice === "phone");
	const stage = preview.createDiv({ cls: "table-cards-stage" });
	const updateColumns = (): void => {
		stage.toggleClass(
			"is-single-column",
			context.previewDevice === "phone" || !shouldSplitEditor(stage.clientWidth, appearance),
		);
	};
	updateColumns();
	const observer = new ResizeObserver(updateColumns);
	observer.observe(stage);
	const row = context.data.cards[context.state.previewRow] ?? null;
	const resolved = row ? resolveCard(row, context.state.draft.blocks) : null;
	void renderCard(stage, resolved, {
		app: context.app,
		component: context.component,
		appearance,
		t: context.t,
		isCurrent: context.isCurrent,
		options: {
			selectedBlockId: context.state.selectedBlockId,
			onSelectBlock: (blockId) => context.dispatch({ type: "selectBlock", blockId }),
			interactiveImages: false,
		},
	}).then(() => {
		if (!context.isCurrent()) return;
		attachReorderHandles(stage, context);
		attachResizeHandles(stage, context);
	});
	return () => observer.disconnect();
}
