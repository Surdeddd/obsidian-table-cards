import { Component, Modal, type App } from "obsidian";
import type { Deck, DeckLoadResult, ParsedTable, PluginSettings, UiLocale } from "../../model";
import {
	applyUiChromeDirection,
	formatUiNumber,
	type Translator,
} from "../../i18n";
import { cloneJson } from "../../model";
import { buildDeckDataFromScan, scanDeckSources } from "../../deck/load";
import type { DeckScanResult } from "../../deck/catalog";
import { autoLayout } from "../../layout";
import { EditorScanCache, editorSourceTopologyKey } from "../../editor/scan-cache";
import { mergeEditorDeck } from "../../editor/settings-save";
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
import { FieldsSheet } from "./FieldsSheet";
import { renderReorderSheet } from "./ReorderSheet";
import { renderInspectorSheet, resetInspectorGroups } from "./InspectorSheet";
import { closeOpenListbox } from "./controls/Listbox";
import type { SettingsMutation } from "../../settings/persistence";

export interface EditorHost {
	settings: PluginSettings;
	updateSettings: (mutate: SettingsMutation) => Promise<void>;
	getTranslator: () => Translator;
	getLocale: () => UiLocale;
	onDeckSaved?: () => void;
	onOpenDraftSession?: (deck: Deck, table: ParsedTable) => void;
}

const EMPTY_DATA: DeckLoadResult = { cards: [], tables: [], catalog: [], profiles: [], diagnostics: [] };

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
		private readonly locale: UiLocale,
		private readonly actions: DirtyConfirmActions,
	) {
		super(app);
	}

	onOpen(): void {
		applyUiChromeDirection(this.modalEl, this.locale);
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
	private scan: DeckScanResult | null = null;
	private dataTopology = "";
	private readonly scanCache: EditorScanCache;
	private readonly fieldsSheet = new FieldsSheet();
	private shell: EditorShell | null = null;
	private loading = false;
	private saving = false;
	private error: string | null = null;
	private previewDevice: PreviewDevice = "desktop";
	private forceClose = false;
	private confirmOpen = false;
	private skipLayerClose = false;
	private loadVersion = 0;
	private component: Component | null = null;

	constructor(app: App, host: EditorHost, deck: Deck) {
		super(app);
		this.host = host;
		this.persistedId = deck.id;
		this.state = createEditorState(deck);
		this.scanCache = new EditorScanCache(
			(sources) => scanDeckSources(this.app, sources, {
				untitledTableLabel: (number) => this.host.getTranslator()("table.untitled", {
					number: formatUiNumber(number, this.host.getLocale()),
				}),
			}),
			(draft, scan) => buildDeckDataFromScan(this.app, draft, scan),
		);
	}

	async onOpen(): Promise<void> {
		this.component = new Component();
		this.component.load();
		resetInspectorGroups();
		if (this.state.draft.sources.length === 0) {
			this.state = reduceEditorState(this.state, { type: "openPanel", panel: "fields" });
		}
		this.modalEl.addClass("table-cards-editor");
		applyUiChromeDirection(this.modalEl, this.host.getLocale());
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
			this.replaceState(undo(this.state));
			return false;
		});
		const redoDraft = (event: KeyboardEvent): false | undefined => {
			if (isTextEditing(event)) return;
			this.replaceState(redo(this.state));
			return false;
		};
		this.scope.register(["Mod", "Shift"], "z", redoDraft);
		this.scope.register(["Mod"], "y", redoDraft);
	}

	requestExit(): void {
		this.skipLayerClose = true;
		try {
			this.close();
		} finally {
			this.skipLayerClose = false;
		}
	}

	close(): void {
		if (!this.forceClose && !this.skipLayerClose) {
			if (closeOpenListbox()) return;
			if (this.state.activePanel) {
				this.dispatch({ type: "openPanel", panel: null });
				return;
			}
		}
		if (this.forceClose || !isDirty(this.state)) {
			super.close();
			return;
		}
		if (this.confirmOpen) return;
		this.confirmOpen = true;
		new DirtyConfirmModal(this.app, this.host.getTranslator(), this.host.getLocale(), {
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
		this.scanCache.invalidate();
		this.fieldsSheet.destroy();
		this.component?.unload();
		this.component = null;
		this.shell?.destroy();
		this.shell = null;
		this.contentEl.empty();
	}

	private dispatch(action: EditorAction): void {
		this.replaceState(reduceEditorState(this.state, action));
	}

	private replaceState(next: EditorState): void {
		const draftChanged = next.draft !== this.state.draft;
		this.state = next;
		this.render();
		if (draftChanged) void this.refreshData();
	}

	private async refreshData(): Promise<void> {
		const version = ++this.loadVersion;
		const topology = editorSourceTopologyKey(this.state.draft.sources);
		const topologyChanged = topology !== this.dataTopology;
		if (topologyChanged) {
			this.dataTopology = topology;
			this.data = EMPTY_DATA;
			this.scan = null;
		}
		this.loading = topologyChanged || this.scan === null;
		this.error = null;
		if (this.loading) this.render();
		try {
			const loaded = await this.scanCache.load(this.state.draft);
			if (loaded.status === "stale" || version !== this.loadVersion) return;
			const result = loaded.result;
			this.data = result;
			this.scan = loaded.scan;
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
			this.scanCache.invalidate();
			this.scan = null;
			this.data = EMPTY_DATA;
			this.dataTopology = "";
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
		if (!this.host.settings.decks.some((deck) => deck.id === this.persistedId)) return;
		this.saving = true;
		this.error = null;
		this.render();
		try {
			const saved = cloneJson(this.state.draft);
			const missingMessage = this.host.getTranslator()("editor.saveError");
			await this.host.updateSettings((settings) => {
				const index = settings.decks.findIndex((deck) => deck.id === this.persistedId);
				if (index < 0) throw new Error(missingMessage);
				settings.decks[index] = mergeEditorDeck(settings.decks[index]!, saved);
			});
			this.state = createEditorState(saved);
		} catch (error) {
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
			locale: this.host.getLocale(),
			t: this.host.getTranslator(),
			globalAppearance: this.host.settings.appearance,
			dispatch: (action) => this.dispatch(action),
			onUndo: () => {
				this.replaceState(undo(this.state));
			},
			onRedo: () => {
				this.replaceState(redo(this.state));
			},
			onSave: () => void this.save().catch(() => undefined),
			onBack: () => this.requestExit(),
			onDevice: (device) => {
				this.previewDevice = device;
				this.render();
			},
			renderPanel: (panel, body, footer) => {
				if (panel === "fields") {
					this.fieldsSheet.render(body, {
						app: this.app,
						state: this.state,
						scan: this.scan,
						profiles: this.data.profiles,
						rowCount: this.data.cards.length,
						diagnostics: this.data.diagnostics,
						loading: this.loading,
						locale: this.host.getLocale(),
						t: this.host.getTranslator(),
						dispatch: (action) => this.dispatch(action),
						onOpenTable: (table) => this.host.onOpenDraftSession?.(this.state.draft, table),
					});
				} else if (panel === "reorder") {
					renderReorderSheet(body, {
						state: this.state,
						locale: this.host.getLocale(),
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
