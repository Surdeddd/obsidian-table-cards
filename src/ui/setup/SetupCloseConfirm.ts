import { Modal, type App } from "obsidian";
import type { Translator } from "../../i18n";

export class SetupCloseConfirm extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly t: Translator,
		private readonly onContinue: () => void,
		private readonly onDiscard: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.t("setup.closeTitle"));
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: this.t("setup.closeDescription") });
		const actions = this.contentEl.createDiv({ cls: "tc-confirm-actions" });
		this.action(actions, "setup.continue", false, this.onContinue);
		this.action(actions, "setup.discard", true, this.onDiscard);
	}

	onClose(): void {
		if (!this.resolved) this.onContinue();
	}

	private action(
		parent: HTMLElement,
		key: "setup.continue" | "setup.discard",
		warning: boolean,
		callback: () => void,
	): void {
		const button = parent.createEl("button", {
			cls: warning ? "mod-warning" : undefined,
			text: this.t(key),
			attr: { type: "button" },
		});
		button.addEventListener("click", () => {
			this.resolved = true;
			this.close();
			callback();
		});
	}
}
