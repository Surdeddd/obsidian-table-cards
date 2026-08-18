export type SheetMode = "responsive" | "side" | "bottom";

export interface SheetOptions {
	id: string;
	title: string;
	mode: SheetMode;
	opener: HTMLElement | null;
	closeLabel: string;
	onClose: () => void;
	renderBody: (body: HTMLElement) => void;
	renderFooter?: (footer: HTMLElement) => void;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
	return Array.from(
		root.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
		),
	).filter(
		(element) =>
			!element.hidden &&
			element.getAttr("aria-hidden") !== "true" &&
			element.getClientRects().length > 0,
	);
}

export class Sheet {
	private readonly host: HTMLElement;
	private readonly options: SheetOptions;
	private root: HTMLElement | null = null;
	private dialog: HTMLElement | null = null;

	constructor(host: HTMLElement, options: SheetOptions) {
		this.host = host;
		this.options = options;
	}

	open(): void {
		this.destroy(false);
		this.root = this.host.createDiv({ cls: "tc-sheet-layer" });
		const scrim = this.root.createEl("button", {
			cls: "tc-sheet-scrim",
			attr: { type: "button", "aria-label": this.options.closeLabel },
		});
		scrim.addEventListener("click", () => this.close());
		this.dialog = this.root.createDiv({
			cls: "tc-sheet",
			attr: {
				role: "dialog",
				tabindex: "-1",
				"aria-modal": "true",
				"aria-labelledby": `${this.options.id}-title`,
				"data-mode": this.options.mode,
			},
		});
		this.dialog.addEventListener("keydown", this.onKeyDown);
		this.dialog.createDiv({ cls: "tc-sheet-handle", attr: { "aria-hidden": "true" } });
		const header = this.dialog.createDiv({ cls: "tc-sheet-header" });
		header.createEl("h2", { text: this.options.title, attr: { id: `${this.options.id}-title` } });
		const close = header.createEl("button", {
			cls: "tc-sheet-close",
			text: "×",
			attr: { type: "button", "aria-label": this.options.closeLabel },
		});
		close.addEventListener("click", () => this.close());
		const body = this.dialog.createDiv({ cls: "tc-sheet-body" });
		this.options.renderBody(body);
		if (this.options.renderFooter) {
			const footer = this.dialog.createDiv({ cls: "tc-sheet-footer" });
			this.options.renderFooter(footer);
		}
		window.setTimeout(() => (focusableElements(this.dialog ?? this.host)[0] ?? this.dialog)?.focus(), 0);
	}

	close(): void {
		this.destroy(true);
		this.options.onClose();
	}

	destroy(restoreFocus = false): void {
		this.dialog?.removeEventListener("keydown", this.onKeyDown);
		this.root?.remove();
		this.root = null;
		this.dialog = null;
		if (restoreFocus) this.options.opener?.focus();
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			event.preventDefault();
			this.close();
			return;
		}
		if (event.key !== "Tab" || !this.dialog) return;
		const items = focusableElements(this.dialog);
		if (items.length === 0) {
			event.preventDefault();
			this.dialog.focus();
			return;
		}
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	};
}
