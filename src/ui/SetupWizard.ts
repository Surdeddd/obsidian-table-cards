import { Component, Modal, Platform, setIcon, type App } from "obsidian";
import { buildDeckDataFromScan, scanDeckSources } from "../deck/load";
import {
	formatUiNumber,
	type Translator,
} from "../i18n";
import {
	newId,
	type DeckLoadResult,
	type DeckSource,
	type ParsedTable,
	type PluginSettings,
	type UiLocale,
} from "../model";
import { createDeck } from "../settings/defaults";
import { resolveDeckAppearance } from "../settings/appearance";
import { SetupScanCache } from "../setup/scan-cache";
import { commitSetupSettings, SetupSaveLifecycle } from "../setup/save-lifecycle";
import {
	canAdvanceSetup,
	canFinishSetup,
	createSetupState,
	finishSetup,
	hasValidSetupRepresentative,
	reduceSetupState,
	type SetupState,
} from "../setup/state";
import { PRESETS, rankPresets } from "../setup/presets";
import { FolderPicker, MarkdownFilePicker } from "./sources/SourcePickers";
import { TableSelectionView } from "./sources/TableSelectionView";
import { renderFinishForm } from "./setup/FinishForm";
import { renderPresetChooser } from "./setup/PresetChooser";
import { SetupCloseConfirm } from "./setup/SetupCloseConfirm";
import { applySetupDirection } from "./setup/setup-a11y";
import { tableSelectedBySource } from "../deck/selectors";
import type { SettingsMutation } from "../settings/persistence";

export interface SetupWizardHost {
	settings: PluginSettings;
	updateSettings: (mutate: SettingsMutation) => Promise<void>;
	getTranslator: () => Translator;
	getLocale: () => UiLocale;
	onSetupSaved?: () => void;
	onSetupClosed?: () => void;
}

function sourceName(path: string): string {
	const name = path.split("/").filter(Boolean).at(-1) ?? path;
	return name.replace(/\.md$/i, "");
}

export class SetupWizard extends Modal {
	private readonly host: SetupWizardHost;
	private state: SetupState;
	private readonly scanCache: SetupScanCache;
	private readonly saveLifecycle = new SetupSaveLifecycle();
	private component: Component | null = null;
	private tableSelection: TableSelectionView | null = null;
	private activeSourceId: string | null = null;
	private loading = false;
	private error: string | null = null;
	private forceClose = false;
	private confirmOpen = false;
	private dataVersion = 0;
	private renderVersion = 0;
	private t!: Translator;
	private locale!: UiLocale;

	constructor(app: App, host: SetupWizardHost) {
		super(app);
		this.host = host;
		this.state = createSetupState(host.settings.decks.length);
		this.scanCache = new SetupScanCache(
			(sources) => scanDeckSources(this.app, sources, {
				untitledTableLabel: (number) => this.host.getTranslator()("table.untitled", {
					number: formatUiNumber(number, this.host.getLocale()),
				}),
			}),
			(sources, scan) => buildDeckDataFromScan(
				this.app,
				createDeck({ sources, blocks: [], columnTypes: {} }),
				scan,
			),
		);
	}

	onOpen(): void {
		this.t = this.host.getTranslator();
		this.locale = this.host.getLocale();
		this.component = new Component();
		this.component.load();
		this.modalEl.addClass("table-cards-setup");
		if (Platform.isMobile) this.modalEl.addClass("is-mobile");
		applySetupDirection(this.modalEl, this.locale);
		this.modalEl.setAttr("aria-label", this.t("setup.title"));
		this.titleEl.setText("");
		this.contentEl.empty();
		this.contentEl.addClass("tc-setup-shell");
		this.render();
	}

	close(): void {
		this.saveLifecycle.tryClose(() => this.closeWhenIdle());
	}

	private closeWhenIdle(): void {
		if (this.forceClose || !this.state.dirty) {
			super.close();
			return;
		}
		if (this.confirmOpen) return;
		this.confirmOpen = true;
		new SetupCloseConfirm(
			this.app,
			this.t,
			this.locale,
			() => { this.confirmOpen = false; },
			() => {
				this.state = createSetupState(this.host.settings.decks.length);
				this.closeImmediately();
			},
		).open();
	}

	onClose(): void {
		this.dataVersion += 1;
		this.renderVersion += 1;
		this.scanCache.invalidate();
		this.tableSelection?.destroy();
		this.tableSelection = null;
		this.component?.unload();
		this.component = null;
		this.contentEl.empty();
		this.host.onSetupClosed?.();
	}

	private closeImmediately(): void {
		this.forceClose = true;
		super.close();
	}

	private dispatch(action: Parameters<typeof reduceSetupState>[1], render = true): void {
		this.state = reduceSetupState(this.state, action);
		if (render) this.render();
	}

	private render(): void {
		if (!this.component) return;
		const version = ++this.renderVersion;
		this.tableSelection?.destroy();
		this.tableSelection = null;
		this.contentEl.empty();

		const root = this.contentEl.createDiv({ cls: "tc-setup" });
		applySetupDirection(root, this.locale);
		this.renderHeader(root);
		const body = root.createDiv({ cls: "tc-setup-body" });
		if (this.state.step === "data") this.renderDataStep(body);
		else if (this.state.step === "preset") this.renderPresetStep(body, version);
		else this.renderFinishStep(body);
		this.renderFooter(root);
	}

	private renderHeader(parent: HTMLElement): void {
		const header = parent.createEl("header", { cls: "tc-setup-header" });
		const copy = header.createDiv({ cls: "tc-setup-heading" });
		copy.createDiv({ cls: "tc-setup-kicker", text: this.t("modal.kicker") });
		copy.createEl("h1", { text: this.t("setup.title") });
		const close = header.createEl("button", {
			cls: "tc-setup-close",
			attr: { type: "button", "aria-label": this.t("modal.close") },
		});
		setIcon(close, "x");
		close.disabled = this.saveLifecycle.saving;
		close.addEventListener("click", () => this.close());

		const stepNumber = this.state.step === "data" ? 1 : this.state.step === "preset" ? 2 : 3;
		const progress = parent.createDiv({ cls: "tc-setup-progress" });
		progress.createDiv({
			cls: "tc-setup-progress-label",
			text: this.t("setup.step", {
				current: formatUiNumber(stepNumber, this.locale),
				total: formatUiNumber(3, this.locale),
			}),
		});
		const track = progress.createDiv({ cls: "tc-setup-progress-track", attr: { "aria-hidden": "true" } });
		for (let index = 1; index <= 3; index += 1) {
			track.createSpan({ cls: index <= stepNumber ? "is-complete" : "" });
		}
	}

	private stepIntro(parent: HTMLElement, title: string, description: string): void {
		const intro = parent.createDiv({ cls: "tc-setup-intro" });
		intro.createEl("h2", { text: title });
		intro.createEl("p", { text: description });
	}

	private renderDataStep(parent: HTMLElement): void {
		this.stepIntro(parent, this.t("setup.dataTitle"), this.t("setup.dataDescription"));
		if (this.activeSourceId) {
			const source = this.state.sources.find((item) => item.id === this.activeSourceId);
			if (source) {
				this.tableSelection = new TableSelectionView(parent, {
					source,
					tables: this.availableTables(),
					t: this.t,
					onChange: (next) => {
						this.replaceSource(next);
						void this.refreshData("selector");
					},
					onBack: () => {
						this.activeSourceId = null;
						this.render();
					},
				});
				this.renderDataStatus(parent);
				return;
			}
			this.activeSourceId = null;
		}

		const actions = parent.createDiv({ cls: "tc-setup-source-actions" });
		const addFile = actions.createEl("button", {
			text: this.t("editor.source.addFile"),
			attr: { type: "button" },
		});
		addFile.addEventListener("click", () => this.pickFile());
		const addFolder = actions.createEl("button", {
			text: this.t("editor.source.addFolder"),
			attr: { type: "button" },
		});
		addFolder.addEventListener("click", () => this.pickFolder());

		if (this.state.sources.length === 0) {
			parent.createDiv({ cls: "tc-setup-empty", text: this.t("setup.noSources") });
		} else {
			const list = parent.createDiv({ cls: "tc-setup-sources" });
			for (const source of this.state.sources) this.renderSourceCard(list, source);
		}
		this.renderDataStatus(parent);
	}

	private renderSourceCard(parent: HTMLElement, source: DeckSource): void {
		const card = parent.createDiv({ cls: "tc-setup-source-card" });
		const identity = card.createDiv({ cls: "tc-setup-source-identity" });
		identity.createDiv({
			cls: "tc-source-kind",
			text: this.t(source.kind === "file" ? "editor.source.file" : "editor.source.folder"),
		});
		identity.createDiv({ cls: "tc-source-path", text: source.path, attr: { dir: "auto" } });
		identity.createDiv({ cls: "tc-setup-source-summary", text: this.sourceSummary(source) });
		const actions = card.createDiv({ cls: "tc-setup-source-card-actions" });
		const tables = actions.createEl("button", {
			text: this.t("editor.source.chooseTables"),
			attr: { type: "button" },
		});
		tables.disabled = this.loading || this.sourceTables(source).length === 0;
		tables.addEventListener("click", () => {
			this.activeSourceId = source.id;
			this.render();
		});
		const remove = actions.createEl("button", {
			cls: "tc-setup-source-remove",
			attr: { type: "button", "aria-label": this.t("editor.source.remove") },
		});
		setIcon(remove, "trash-2");
		remove.addEventListener("click", () => {
			this.dispatch({
				type: "replaceSources",
				sources: this.state.sources.filter((item) => item.id !== source.id),
			}, false);
			void this.refreshData();
		});
	}

	private renderDataStatus(parent: HTMLElement): void {
		const status = parent.createDiv({ cls: "tc-setup-status", attr: { "aria-live": "polite" } });
		this.renderDataStatusContent(status);
	}

	private renderDataStatusContent(status: HTMLElement): void {
		if (this.loading) {
			status.addClass("is-loading");
			status.setText(this.t("editor.loading"));
			return;
		}
		if (this.error) {
			status.addClass("is-error");
			status.setText(this.error);
			const retry = status.createEl("button", { text: this.t("launcher.retry"), attr: { type: "button" } });
			retry.addEventListener("click", () => void this.refreshData());
			return;
		}
		const result = this.state.result;
		if (!result || this.state.sources.length === 0) return;
		if (this.availableTables().length === 0) status.setText(this.t("setup.noTables"));
		else if (result.cards.length === 0) status.setText(this.t("setup.noCards"));
		else {
			status.addClass("has-data");
			status.createDiv({ cls: "tc-setup-status-summary", text: this.scanSummary(result) });
			const types = status.createDiv({ cls: "tc-setup-detected-types" });
			types.createDiv({ cls: "tc-setup-detected-title", text: this.t("setup.detectedTypes") });
			const values = types.createDiv({ cls: "tc-setup-detected-values" });
			for (const profile of result.profiles) {
				const item = values.createDiv({ cls: "tc-setup-detected-type" });
				item.createSpan({ text: profile.header, attr: { dir: "auto" } });
				item.createSpan({ text: this.t(`editor.type.${profile.inferredType}`) });
			}
			const warnings = result.diagnostics.length + result.profiles.reduce(
				(total, profile) => total + profile.warnings.length,
				0,
			);
			if (warnings > 0) {
				status.createDiv({
					cls: "tc-setup-warning-count",
					text: this.t("launcher.warnings", { count: formatUiNumber(warnings, this.locale) }),
				});
			}
		}
	}

	private updateDataStatus(): void {
		const status = this.contentEl.querySelector<HTMLElement>(".tc-setup-status");
		if (!status) return;
		status.empty();
		status.className = "tc-setup-status";
		this.renderDataStatusContent(status);
	}

	private updateFooterEligibility(): void {
		const primary = this.contentEl.querySelector<HTMLButtonElement>(".tc-setup-footer .mod-cta");
		if (!primary) return;
		primary.disabled = this.loading || !canAdvanceSetup(this.state);
	}

	private renderPresetStep(parent: HTMLElement, version: number): void {
		this.stepIntro(parent, this.t("setup.presetTitle"), this.t("setup.presetDescription"));
		const result = this.state.result;
		if (!result || !this.component) return;
		renderPresetChooser(parent, {
			app: this.app,
			component: this.component,
			result,
			selectedId: this.state.presetId,
			appearance: resolveDeckAppearance(this.host.settings.appearance),
			t: this.t,
			isCurrent: () => version === this.renderVersion,
			onSelect: (presetId, icon) => {
				this.dispatch({ type: "selectPreset", presetId }, false);
				this.dispatch({ type: "setRibbonIcon", icon });
			},
		});
		if (this.state.presetId && !hasValidSetupRepresentative(this.state)) {
			parent.createDiv({ cls: "tc-setup-status is-error", text: this.t("setup.noCards"), attr: { role: "status" } });
		}
	}

	private renderFinishStep(parent: HTMLElement): void {
		this.stepIntro(parent, this.t("setup.finishTitle"), this.t("setup.finishDescription"));
		if (!this.state.result) return;
		renderFinishForm(parent, {
			state: this.state,
			t: this.t,
			locale: this.locale,
			error: this.error,
			summary: this.scanSummary(this.state.result),
			onName: (name) => {
				this.dispatch({ type: "setDeckName", name }, false);
			const finish = this.contentEl.querySelector<HTMLButtonElement>(".tc-setup-footer .mod-cta");
			if (finish) finish.disabled = this.saveLifecycle.saving || !canFinishSetup(this.state);
			},
			onIcon: (icon) => this.dispatch({ type: "setRibbonIcon", icon }),
			onRibbon: (visible) => this.dispatch({ type: "setRibbonVisible", visible }),
		});
	}

	private renderFooter(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: "tc-setup-footer" });
		if (this.state.step !== "data") {
			const back = footer.createEl("button", {
				text: this.t("editor.backAction"),
				attr: { type: "button" },
			});
			back.disabled = this.saveLifecycle.saving;
			back.addEventListener("click", () => this.dispatch({ type: "back" }));
		}
		const primary = footer.createEl("button", {
			cls: "mod-cta",
			text: this.state.step === "finish"
				? (this.saveLifecycle.saving ? this.t("setup.finishing") : this.t("setup.finish"))
				: this.t("setup.next"),
			attr: { type: "button" },
		});
		if (this.state.step === "data") {
			primary.disabled = this.loading || !canAdvanceSetup(this.state);
			primary.addEventListener("click", () => this.goToPreset());
		} else if (this.state.step === "preset") {
			primary.disabled = !canAdvanceSetup(this.state);
			primary.addEventListener("click", () => this.goToFinish());
		} else {
			primary.disabled = this.saveLifecycle.saving || !canFinishSetup(this.state);
			primary.addEventListener("click", () => void this.finish());
		}
	}

	private goToPreset(): void {
		if (!this.state.result) return;
		if (!this.state.presetId) {
			const recommended = rankPresets(this.state.result.profiles)[0]?.id;
			const preset = PRESETS.find((item) => item.id === recommended);
			if (recommended) this.dispatch({ type: "selectPreset", presetId: recommended }, false);
			if (preset) this.dispatch({ type: "setRibbonIcon", icon: preset.icon }, false);
		}
		this.dispatch({ type: "next" });
	}

	private goToFinish(): void {
		if (!this.state.deckName.trim()) {
			const suggested = sourceName(this.state.sources[0]?.path ?? "") || this.t("deck.new");
			this.dispatch({ type: "setDeckName", name: suggested }, false);
		}
		this.dispatch({ type: "next" });
	}

	private pickFile(): void {
		new MarkdownFilePicker(this.app, this.t("editor.source.pickFile"), (file) => {
			if (this.state.sources.some((source) => source.kind === "file" && source.path === file.path)) return;
			this.dispatch({
				type: "replaceSources",
				sources: [...this.state.sources, { id: newId("source"), kind: "file", path: file.path, tables: { mode: "all" } }],
			}, false);
			void this.refreshData();
		}).open();
	}

	private pickFolder(): void {
		new FolderPicker(this.app, this.t("editor.source.pickFolder"), (folder) => {
			if (this.state.sources.some((source) => source.kind === "folder" && source.path === folder.path)) return;
			this.dispatch({
				type: "replaceSources",
				sources: [...this.state.sources, { id: newId("source"), kind: "folder", path: folder.path, tables: { mode: "all" } }],
			}, false);
			void this.refreshData();
		}).open();
	}

	private replaceSource(next: DeckSource): void {
		this.dispatch({
			type: "replaceSources",
			sources: this.state.sources.map((source) => source.id === next.id ? next : source),
		}, false);
	}

	private availableTables(): ParsedTable[] {
		return this.state.scan?.tables.map((item) => item.table) ?? [];
	}

	private sourceTables(source: DeckSource): ParsedTable[] {
		return this.state.scan?.tables
			.filter((item) => item.sourceIds.includes(source.id))
			.map((item) => item.table) ?? [];
	}

	private sourceSummary(source: DeckSource): string {
		const tables = this.sourceTables(source);
		const selected = source.tables.mode === "all"
			? tables.length
			: tables.filter((table) => tableSelectedBySource(source, table)).length;
		if (source.tables.mode === "all") {
			return this.t("editor.source.summaryAll", { count: formatUiNumber(tables.length, this.locale) });
		}
		if (selected === 0) return this.t("editor.source.summaryNone");
		return this.t("editor.source.summarySome", {
			selected: formatUiNumber(selected, this.locale),
			total: formatUiNumber(tables.length, this.locale),
		});
	}

	private scanSummary(result: DeckLoadResult): string {
		return this.t("setup.scanSummary", {
			cards: formatUiNumber(result.cards.length, this.locale),
			tables: formatUiNumber(result.catalog.length, this.locale),
			fields: formatUiNumber(result.profiles.length, this.locale),
		});
	}

	private async refreshData(mode: "topology" | "selector" = "topology"): Promise<void> {
		const version = ++this.dataVersion;
		this.error = null;
		if (this.state.sources.length === 0) {
			this.scanCache.invalidate();
			this.loading = false;
			this.dispatch({ type: "loadStarted", preserveScan: false });
			return;
		}
		const preserveView = mode === "selector" && this.tableSelection !== null && this.activeSourceId !== null;
		this.state = reduceSetupState(this.state, { type: "loadStarted", preserveScan: mode === "selector" });
		this.loading = true;
		if (preserveView) {
			this.tableSelection?.setLoading(true);
			this.updateDataStatus();
			this.updateFooterEligibility();
		} else {
			this.render();
		}
		try {
			const loaded = await this.scanCache.load(this.state.sources);
			if (loaded.status === "stale" || version !== this.dataVersion) return;
			this.state = reduceSetupState(this.state, {
				type: "replaceResult",
				result: loaded.result,
				scan: loaded.scan,
			});
		} catch {
			if (version !== this.dataVersion) return;
			this.scanCache.invalidate();
			this.state = reduceSetupState(this.state, { type: "loadFailed" });
			this.error = this.t("editor.loadError");
		} finally {
			if (version === this.dataVersion) {
				this.loading = false;
				const source = this.state.sources.find((item) => item.id === this.activeSourceId);
				if (preserveView && !this.error && this.tableSelection && source) {
					this.tableSelection.update(source, this.availableTables());
					this.tableSelection.setLoading(false);
					this.updateDataStatus();
					this.updateFooterEligibility();
				} else {
					this.render();
				}
			}
		}
	}

	private async finish(): Promise<void> {
		if (this.saveLifecycle.saving || this.confirmOpen || !canFinishSetup(this.state)) return;
		this.error = null;
		const state = this.state;
		const profiles = state.result?.profiles ?? [];
		const finishOptions = {
			deckId: newId("deck"),
			seed: Date.now(),
		};
		const saving = commitSetupSettings(this.host, (settings) => {
			const next = finishSetup(settings, state, profiles, finishOptions);
			settings.setupVersion = next.setupVersion;
			settings.lastDeckId = next.lastDeckId;
			settings.decks = next.decks;
			settings.perDeck = next.perDeck;
		}, this.saveLifecycle);
		this.render();
		try {
			await saving;
			this.host.onSetupSaved?.();
			this.state = createSetupState(this.host.settings.decks.length);
			this.closeImmediately();
		} catch {
			this.error = this.t("setup.saveError");
			this.render();
		}
	}
}
