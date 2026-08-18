import { Component, Modal, type App } from "obsidian";
import type { Deck, DeckLoadResult, ParsedTable, PluginSettings } from "../../model";
import type { Translator } from "../../i18n";
import { cloneJson } from "../../model";
import { loadDeckData, scanDeckTables } from "../../deck/load";
import { autoLayout } from "../../layout";
import {
	createEditorState,
	isDirty,
	reduceEditorState,
	redo,
	undo,
	type EditorAction,
	type EditorState,
} from "../../editor/state";
import { EditorShell, type PreviewDevice } from "./EditorShell";
import { renderFieldsSheet } from "./FieldsSheet";
import { renderReorderSheet } from "./ReorderSheet";
import { renderInspectorSheet } from "./InspectorSheet";

export interface EditorHost {
	settings: PluginSettings;
	saveSettings: () => Promise<void>;
	getTranslator: () => Translator;
	onDeckSaved?: () => void;
}

const EMPTY_DATA: DeckLoadResult = { cards: [], tables: [], profiles: [], diagnostics: [] };

function isTextEditing(event: KeyboardEvent): boolean {
	const target = event.target;
	return (
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLInputElement && !["button", "checkbox", "color", "radio", "range"].includes(target.type)) ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

interface DirtyConfirmActions {
	onSave: () => Promise<void>;
	onDiscard: () => void;
	onContinue: () => void;
}

class DirtyConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly t: Translator,
		private readonly actions: DirtyConfirmActions,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.t("editor.unsavedTitle"));
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: this.t("editor.unsavedDesc") });
		const actions = this.contentEl.createDiv({ cls: "tc-confirm-actions" });
		const keep = actions.createEl("button", { text: this.t("editor.continue"), attr: { type: "button" } });
		keep.addEventListener("click", () => {
			this.resolved = true;
			this.close();
			this.actions.onContinue();
		});
		const discard = actions.createEl("button", {
			text: this.t("editor.discard"),
			cls: "mod-warning",
			attr: { type: "button" },
		});
		discard.addEventListener("click", () => {
			this.resolved = true;
			this.close();
			this.actions.onDiscard();
		});
		const save = actions.createEl("button", {
			text: this.t("editor.save"),
			cls: "mod-cta",
			attr: { type: "button" },
		});
		save.addEventListener("click", () => {
			this.resolved = true;
			save.disabled = true;
			void this.actions.onSave().then(
				() => this.close(),
				() => {
					this.resolved = false;
					save.disabled = false;
				},
			);
		});
	}

	onClose(): void {
		if (!this.resolved) this.actions.onContinue();
	}
}

export class DeckEditorModal extends Modal {
	private readonly host: EditorHost;
	private readonly persistedId: string;
	private state: EditorState;
	private data: DeckLoadResult = EMPTY_DATA;
	private availableTables: ParsedTable[] = [];
	private shell: EditorShell | null = null;
	private loading = false;
	private saving = false;
	private error: string | null = null;
	private previewDevice: PreviewDevice = "desktop";
	private forceClose = false;
	private confirmOpen = false;
	private loadVersion = 0;
	private component: Component | null = null;

	constructor(app: App, host: EditorHost, deck: Deck) {
		super(app);
		this.host = host;
		this.persistedId = deck.id;
		this.state = createEditorState(deck);
	}

	async onOpen(): Promise<void> {
		this.component = new Component();
		this.component.load();
		if (this.state.draft.sources.length === 0) {
			this.state = reduceEditorState(this.state, { type: "openPanel", panel: "fields" });
		}
		this.modalEl.addClass("table-cards-editor");
		this.titleEl.setText("");
		this.contentEl.empty();
		this.contentEl.addClass("table-cards-editor-body");
		this.shell = new EditorShell(this.contentEl);
		this.registerShortcuts();
		this.render();
		await this.refreshData();
	}

	private registerShortcuts(): void {
		this.scope.register(["Mod"], "s", () => {
			const active = this.contentEl.ownerDocument.activeElement;
			if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
			void this.save().catch(() => undefined);
			return false;
		});
		this.scope.register(["Mod"], "z", (event) => {
			if (isTextEditing(event)) return;
			this.state = undo(this.state);
			this.render();
			return false;
		});
		const redoDraft = (event: KeyboardEvent): false | undefined => {
			if (isTextEditing(event)) return;
			this.state = redo(this.state);
			this.render();
			return false;
		};
		this.scope.register(["Mod", "Shift"], "z", redoDraft);
		this.scope.register(["Mod"], "y", redoDraft);
	}

	close(): void {
		if (this.forceClose || !isDirty(this.state)) {
			super.close();
			return;
		}
		if (this.confirmOpen) return;
		this.confirmOpen = true;
		new DirtyConfirmModal(this.app, this.host.getTranslator(), {
			onSave: async () => {
				await this.save();
				this.closeImmediately();
			},
			onDiscard: () => {
				this.closeImmediately();
			},
			onContinue: () => {
				this.confirmOpen = false;
			},
		}).open();
	}

	private closeImmediately(): void {
		this.forceClose = true;
		super.close();
	}

	onClose(): void {
		this.loadVersion += 1;
		this.component?.unload();
		this.component = null;
		this.shell?.destroy();
		this.shell = null;
		this.contentEl.empty();
	}

	private dispatch(action: EditorAction): void {
		this.state = reduceEditorState(this.state, action);
		this.render();
		if (action.type === "replaceSources") void this.refreshData();
	}

	private async refreshData(): Promise<void> {
		const version = ++this.loadVersion;
		this.loading = true;
		this.error = null;
		this.render();
		try {
			const [result, availableTables] = await Promise.all([
				loadDeckData(this.app, this.state.draft),
				scanDeckTables(this.app, this.state.draft.sources),
			]);
			if (version !== this.loadVersion) return;
			this.data = result;
			this.availableTables = availableTables;
			if (this.state.draft.blocks.length === 0 && result.profiles.length > 0) {
				this.state = reduceEditorState(this.state, {
					type: "replaceBlocks",
					blocks: autoLayout(result.profiles),
				});
			}
			if (this.state.previewRow >= result.cards.length) {
				this.state = reduceEditorState(this.state, {
					type: "setPreviewRow",
					index: Math.max(0, result.cards.length - 1),
				});
			}
		} catch (error) {
			if (version !== this.loadVersion) return;
			this.error = error instanceof Error ? error.message : this.host.getTranslator()("editor.loadError");
		} finally {
			if (version === this.loadVersion) {
				this.loading = false;
				this.render();
			}
		}
	}

	private async save(): Promise<void> {
		if (this.saving || !isDirty(this.state)) return;
		const index = this.host.settings.decks.findIndex((deck) => deck.id === this.persistedId);
		if (index < 0) return;
		this.saving = true;
		this.error = null;
		this.render();
		const previous = this.host.settings.decks[index];
		try {
			const saved = cloneJson(this.state.draft);
			this.host.settings.decks[index] = saved;
			await this.host.saveSettings();
			this.state = createEditorState(saved);
		} catch (error) {
			if (previous) this.host.settings.decks[index] = previous;
			this.error = error instanceof Error ? error.message : this.host.getTranslator()("editor.saveError");
			throw error;
		} finally {
			this.saving = false;
			this.render();
		}
		this.host.onDeckSaved?.();
	}

	private render(): void {
		if (!this.component) return;
		this.shell?.render({
			app: this.app,
			component: this.component,
			state: this.state,
			data: this.data,
			loading: this.loading,
			error: this.error,
			saving: this.saving,
			previewDevice: this.previewDevice,
			t: this.host.getTranslator(),
			globalAppearance: this.host.settings.appearance,
			dispatch: (action) => this.dispatch(action),
			onUndo: () => {
				this.state = undo(this.state);
				this.render();
			},
			onRedo: () => {
				this.state = redo(this.state);
				this.render();
			},
			onSave: () => void this.save().catch(() => undefined),
			onBack: () => this.close(),
			onDevice: (device) => {
				this.previewDevice = device;
				this.render();
			},
			renderPanel: (panel, body, footer) => {
				if (panel === "fields") {
					renderFieldsSheet(body, {
						app: this.app,
						state: this.state,
						tables: this.availableTables,
						profiles: this.data.profiles,
						rowCount: this.data.cards.length,
						diagnostics: this.data.diagnostics.length,
						loading: this.loading,
						t: this.host.getTranslator(),
						dispatch: (action) => this.dispatch(action),
					});
				} else if (panel === "reorder") {
					renderReorderSheet(body, {
						state: this.state,
						t: this.host.getTranslator(),
						dispatch: (action) => this.dispatch(action),
					});
				} else if (footer) {
					renderInspectorSheet(body, footer, {
						state: this.state,
						panel,
						profiles: this.data.profiles,
						globalAppearance: this.host.settings.appearance,
						t: this.host.getTranslator(),
						dispatch: (action) => this.dispatch(action),
					});
				}
			},
		});
	}
}
