import { Platform, setIcon } from "obsidian";
import { formatUiNumber, type Translator } from "../i18n";
import type { Deck, DeckLoadResult, PluginSettings, StudyScope, UiLocale } from "../model";
import { describeDiagnostics } from "../deck/diagnostics";
import { repairScope } from "../deck/table-identity";
import {
	canStartSession,
	createLauncherState,
	launcherCards,
	reduceLauncherState,
	selectedTableCount,
	selectedTableKeys,
	type DeckOpenRequest,
	type LauncherState,
} from "../session/launcher-state";
import { isDeckUnavailableError } from "../session/settings-intents";
import { shouldAutoStart } from "../session/launcher-state";
import { Listbox } from "./editor/controls/Listbox";
import { ScopePicker } from "./ScopePicker";

export interface SessionLauncherOptions {
	decks: Deck[];
	request: DeckOpenRequest;
	settings: PluginSettings;
	t: Translator;
	locale: UiLocale;
	loadDeck: (deck: Deck) => Promise<DeckLoadResult>;
	onStart: (selection: { deck: Deck; result: DeckLoadResult; scope: StudyScope }) => Promise<void>;
	onClose: () => void;
}

export type LauncherFocusTarget = "deck" | "retry" | "close" | "scope" | "primary" | "status";

const FOCUS_FALLBACKS: Record<LauncherState["phase"], LauncherFocusTarget[]> = {
	loading: ["status", "deck", "close"],
	choose: ["primary", "scope", "deck", "close"],
	error: ["retry", "status", "deck", "close"],
};

const FOCUS_SELECTORS: Record<LauncherFocusTarget, string> = {
	deck: ".tc-launcher-deck .tc-listbox-trigger",
	retry: ".tc-launcher-state.is-error button:not([disabled])",
	close: ".tc-launcher-close",
	scope: ".tc-scope-trigger",
	primary: ".tc-launcher-start:not([disabled])",
	status: '.tc-launcher-state[tabindex="-1"]',
};

export function launcherFocusOrder(
	intent: LauncherFocusTarget,
	phase: LauncherState["phase"],
): LauncherFocusTarget[] {
	return Array.from(new Set([intent, ...FOCUS_FALLBACKS[phase]]));
}

export function launcherFocusIntent(
	current: LauncherFocusTarget | null,
	pending: LauncherFocusTarget | null,
): LauncherFocusTarget | null {
	return current ?? pending;
}

export function scopeForLauncherContext(state: LauncherState, settings: PluginSettings): StudyScope {
	return state.initialScope ?? (state.deckId ? settings.perDeck[state.deckId]?.scope : null) ?? { mode: "all" };
}

export class SessionLauncher {
	private readonly options: SessionLauncherOptions;
	private state: LauncherState;
	private root: HTMLElement;
	private deckPicker: Listbox<string> | null = null;
	private scopePicker: ScopePicker | null = null;
	private summaryEl: HTMLElement | null = null;
	private messageEl: HTMLElement | null = null;
	private startButton: HTMLButtonElement | null = null;
	private scopeButton: HTMLButtonElement | null = null;
	private missingScopeCount = 0;
	private starting = false;
	private saveFailed = false;
	private destroyed = false;
	private focusVersion = 0;
	private pendingFocusIntent: LauncherFocusTarget | null = null;

	constructor(parent: HTMLElement, options: SessionLauncherOptions) {
		this.options = options;
		const request = options.request.deckId || options.request.deckOverride
			? options.request
			: { ...options.request, deckId: options.settings.lastDeckId ?? undefined };
		this.state = createLauncherState(options.decks, request);
		this.root = parent.createDiv({ cls: "tc-launcher" });
		this.render();
		if (this.state.deck) void this.loadSelectedDeck();
	}

	destroy(): void {
		this.destroyed = true;
		this.focusVersion += 1;
		this.pendingFocusIntent = null;
		this.deckPicker?.destroy();
		this.deckPicker = null;
		this.scopePicker?.destroy();
		this.scopePicker = null;
		this.root.remove();
	}

	private render(): void {
		const focusIntent = launcherFocusIntent(this.currentFocusTarget(), this.pendingFocusIntent);
		this.deckPicker?.destroy();
		this.deckPicker = null;
		this.scopePicker?.destroy();
		this.scopePicker = null;
		this.summaryEl = null;
		this.messageEl = null;
		this.startButton = null;
		this.scopeButton = null;
		this.root.empty();

		const header = this.root.createDiv({ cls: "tc-launcher-header" });
		const heading = header.createDiv({ cls: "tc-launcher-heading" });
		heading.createDiv({ cls: "tc-launcher-kicker", text: this.options.t("modal.kicker") });
		heading.createEl("h1", { text: this.options.t("launcher.title") });
		const close = header.createEl("button", {
			cls: "tc-launcher-close",
			attr: { type: "button", "aria-label": this.options.t("modal.close") },
		});
		setIcon(close, "x");
		close.addEventListener("click", this.options.onClose);

		const body = this.root.createDiv({ cls: "tc-launcher-body" });
		this.renderDeck(body);
		if (this.state.phase === "loading") this.renderLoading(body);
		else if (this.state.phase === "error") this.renderError(body);
		else this.renderChoice(body);
		this.restoreFocus(focusIntent);
	}

	private renderDeck(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: "tc-launcher-deck" });
		if (this.state.lockedDeck) {
			section.createDiv({ cls: "tc-launcher-label", text: this.options.t("modal.deck") });
			section.createDiv({
				cls: "tc-launcher-deck-name",
				text: this.state.deck?.name ?? this.state.deckId ?? "",
				attr: { dir: "auto" },
			});
			return;
		}
		if (!this.state.deck) return;
		this.deckPicker = new Listbox(section, {
			id: "tc-launcher-deck",
			label: this.options.t("modal.deck"),
			value: this.state.deck.id,
			options: this.state.decks.map((deck) => ({ value: deck.id, label: deck.name })),
			searchable: this.state.decks.length > 8,
			optionDirection: "auto",
			onChange: (deckId) => this.selectDeck(deckId),
		});
	}

	private renderLoading(parent: HTMLElement): void {
		const loading = parent.createDiv({
			cls: "tc-launcher-state is-loading",
			attr: { "aria-live": "polite", "aria-busy": "true", tabindex: "-1" },
		});
		loading.createDiv({ cls: "tc-launcher-state-title", text: this.options.t("launcher.loading") });
		const skeleton = loading.createDiv({ cls: "tc-launcher-skeleton", attr: { "aria-hidden": "true" } });
		for (let index = 0; index < 3; index += 1) {
			const row = skeleton.createDiv({ cls: "tc-launcher-skeleton-row" });
			row.createSpan();
			row.createSpan();
		}
		this.renderFooter(parent, true);
	}

	private renderError(parent: HTMLElement): void {
		const error = parent.createDiv({
			cls: "tc-launcher-state is-error",
			attr: { role: "alert", tabindex: "-1" },
		});
		const key = this.state.error?.code === "deckUnavailable" ? "launcher.deckUnavailable" : "launcher.loadFailed";
		error.createDiv({ cls: "tc-launcher-state-title", text: this.options.t(key) });
		const contextScope = scopeForLauncherContext(this.state, this.options.settings);
		error.createDiv({
			cls: "tc-launcher-error-scope",
			text: contextScope.mode === "all"
				? this.options.t("scope.all")
				: this.options.t("scope.count", {
					count: formatUiNumber(contextScope.tableKeys.length, this.options.locale),
				}),
		});
		const retry = error.createEl("button", {
			text: this.options.t("launcher.retry"),
			attr: { type: "button", disabled: this.state.deck ? null : "true" },
		});
		retry.addEventListener("click", () => void this.loadSelectedDeck());
		this.renderFooter(parent, true);
	}

	private renderChoice(parent: HTMLElement): void {
		if (!this.state.result) return;
		const scope = parent.createDiv({ cls: "tc-launcher-scope" });
		this.scopeButton = scope.createEl("button", {
			cls: "tc-scope-trigger",
			attr: {
				type: "button",
				"aria-expanded": "false",
			},
		});
		this.updateScopeButton();
		this.scopeButton.addEventListener("click", () => this.toggleScopePicker(scope));
		this.messageEl = parent.createDiv({ cls: "tc-launcher-messages", attr: { "aria-live": "polite" } });
		this.renderFooter(parent, false);
		this.updateSelectionSummary();
	}

	private renderFooter(parent: HTMLElement, disabled: boolean): void {
		const footer = parent.createDiv({ cls: "tc-launcher-footer" });
		this.summaryEl = footer.createDiv({ cls: "tc-launcher-summary", attr: { "aria-live": "polite" } });
		this.startButton = footer.createEl("button", {
			cls: "tc-launcher-start mod-cta",
			attr: { type: "button", disabled: disabled ? "true" : null },
		});
		this.startButton.addEventListener("click", () => void this.start());
		this.updateSelectionSummary();
	}

	private updateSelectionSummary(): void {
		const cards = launcherCards(this.state).length;
		const tables = selectedTableCount(this.state);
		this.summaryEl?.setText(this.options.t("launcher.summary", {
			cards: formatUiNumber(cards, this.options.locale),
			tables: formatUiNumber(tables, this.options.locale),
		}));
		if (this.startButton) {
			this.startButton.setText(this.options.t("launcher.open", {
				count: formatUiNumber(cards, this.options.locale),
			}));
			this.startButton.disabled = this.starting || !canStartSession(this.state);
		}
		this.updateScopeButton();
		if (!this.messageEl) return;
		this.messageEl.empty();
		if (this.saveFailed) {
			this.messageEl.createDiv({ cls: "tc-launcher-error", text: this.options.t("launcher.saveFailed") });
		}
		const report = describeDiagnostics(
			this.state.result?.diagnostics ?? [],
			this.options.t,
			this.options.locale,
		);
		if (report.messages.length === 0) {
			if (tables === 0) {
				this.messageEl.createDiv({ cls: "tc-launcher-hint", text: this.options.t("launcher.selectAtLeastOne") });
			} else if (cards === 0) {
				this.messageEl.createDiv({ cls: "tc-launcher-hint", text: this.options.t("launcher.noValidCards") });
			}
		}
		if (this.missingScopeCount > 0) {
			this.messageEl.createDiv({ cls: "tc-launcher-warning", text: this.options.t("scope.missing", {
				count: formatUiNumber(this.missingScopeCount, this.options.locale),
			}) });
		}
		for (const message of report.messages.slice(0, 3)) {
			this.messageEl.createDiv({ cls: "tc-launcher-warning", text: message, attr: { dir: "auto" } });
		}
		const rest = Math.max(0, report.messages.length - 3) + report.unexplained;
		if (rest > 0) {
			this.messageEl.createDiv({ cls: "tc-launcher-warning", text: this.options.t("launcher.warnings", {
				count: formatUiNumber(rest, this.options.locale),
			}) });
		}
	}

	private updateScopeButton(): void {
		if (!this.scopeButton) return;
		this.scopeButton.empty();
		this.scopeButton.createSpan({ cls: "tc-scope-trigger-label", text: this.options.t("scope.label") });
		const value = this.scopeButton.createSpan({ cls: "tc-scope-trigger-value", attr: { dir: "auto" } });
		const selected = selectedTableKeys(this.state);
		if (this.state.scope.mode === "all") value.setText(this.options.t("scope.all"));
		else if (selected.length === 1) {
			value.setText(this.state.result?.catalog.find((table) => table.key === selected[0])?.label ?? this.options.t("scope.count", {
				count: formatUiNumber(1, this.options.locale),
			}));
		} else {
			value.setText(this.options.t("scope.count", { count: formatUiNumber(selected.length, this.options.locale) }));
		}
		this.scopeButton.createSpan({ cls: "tc-scope-trigger-chevron", text: "⌄", attr: { "aria-hidden": "true" } });
	}

	private toggleScopePicker(host: HTMLElement): void {
		if (this.scopePicker) {
			this.closeScopePicker();
			return;
		}
		if (!this.state.result) return;
		this.scopeButton?.setAttr("aria-expanded", "true");
		this.scopePicker = new ScopePicker(Platform.isMobile ? this.root : host, {
			catalog: this.state.result.catalog,
			scope: this.state.scope,
			t: this.options.t,
			mobile: Platform.isMobile,
			onChange: (scope) => {
				this.state = reduceLauncherState(this.state, { type: "replaceScope", scope });
				this.saveFailed = false;
				this.updateSelectionSummary();
			},
			onClose: () => this.closeScopePicker(),
		});
	}

	private closeScopePicker(): void {
		this.scopePicker?.destroy();
		this.scopePicker = null;
		this.scopeButton?.setAttr("aria-expanded", "false");
		this.scopeButton?.focus();
	}

	private selectDeck(deckId: string): void {
		const next = reduceLauncherState(this.state, { type: "selectDeck", deckId });
		if (next === this.state) return;
		this.missingScopeCount = 0;
		this.saveFailed = false;
		this.state = next;
		void this.loadSelectedDeck();
	}

	private async loadSelectedDeck(): Promise<void> {
		const deck = this.state.deck;
		if (!deck || this.destroyed) return;
		const requestId = this.state.requestId + 1;
		const loading = reduceLauncherState(this.state, { type: "loading", deckId: deck.id, requestId });
		this.saveFailed = false;
		if (!this.commitState(loading)) return;
		try {
			const result = await this.options.loadDeck(deck);
			if (this.destroyed) return;
			const stored = this.options.settings.perDeck[deck.id]?.scope ?? { mode: "all" };
			const savedScope = repairScope(stored, result.catalog).scope;
			if (this.state.phase === "loading" && this.state.deckId === deck.id && this.state.requestId === requestId) {
				const requestedScope = scopeForLauncherContext(this.state, this.options.settings);
				this.missingScopeCount = repairScope(requestedScope, result.catalog).missing;
			}
			const next = reduceLauncherState(this.state, {
				type: "loaded",
				deckId: deck.id,
				requestId,
				result,
				savedScope,
			});
			if (!this.commitState(next)) return;
			const hasLastDeck = Boolean(this.options.settings.lastDeckId) && this.options.request.chooseDeck !== true;
			if (shouldAutoStart(this.state, { hasLastDeck })) {
				void this.start();
			}
		} catch (error) {
			const next = reduceLauncherState(this.state, {
				type: "failed",
				deckId: deck.id,
				requestId,
				detail: error instanceof Error ? error.message : undefined,
			});
			if (!this.commitState(next)) return;
		}
	}

	private commitState(next: LauncherState): boolean {
		if (next === this.state) return false;
		this.state = next;
		this.render();
		return true;
	}

	private currentFocusTarget(): LauncherFocusTarget | null {
		if (typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)) return null;
		const active = document.activeElement;
		if (!this.root.contains(active)) return null;
		if (active.closest(".tc-launcher-deck")) return "deck";
		if (active.closest(".tc-launcher-state.is-error button")) return "retry";
		if (active.closest(".tc-launcher-close")) return "close";
		if (active.closest(".tc-scope-trigger, .tc-scope-picker, .tc-sheet")) return "scope";
		if (active.closest(".tc-launcher-start")) return "primary";
		return "status";
	}

	private restoreFocus(intent: LauncherFocusTarget | null): void {
		const version = ++this.focusVersion;
		this.pendingFocusIntent = intent;
		if (!intent) return;
		window.setTimeout(() => {
			if (this.destroyed || version !== this.focusVersion) return;
			for (const target of launcherFocusOrder(intent, this.state.phase)) {
				const element = this.root.querySelector<HTMLElement>(FOCUS_SELECTORS[target]);
				if (!element) continue;
				element.focus();
				this.pendingFocusIntent = null;
				return;
			}
		}, 0);
	}

	private async start(): Promise<void> {
		if (this.starting || !canStartSession(this.state) || !this.state.deck || !this.state.result) return;
		this.starting = true;
		this.saveFailed = false;
		this.updateSelectionSummary();
		try {
			await this.options.onStart({ deck: this.state.deck, result: this.state.result, scope: this.state.scope });
		} catch (error) {
			if (this.destroyed) return;
			this.starting = false;
			if (isDeckUnavailableError(error)) {
				this.saveFailed = false;
				this.commitState(reduceLauncherState(this.state, {
					type: "unavailable",
					deckId: this.state.deck.id,
				}));
				return;
			}
			this.saveFailed = true;
			this.updateSelectionSummary();
		}
	}
}
