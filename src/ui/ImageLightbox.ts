import { Modal, setIcon, type App } from "obsidian";

export interface ImageLightboxOptions {
	source: string;
	alt: string;
	closeLabel: string;
	opener?: HTMLElement | null;
}

export class ImageLightbox extends Modal {
	private readonly options: ImageLightboxOptions;

	constructor(app: App, options: ImageLightboxOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		this.modalEl.addClass("table-cards-lightbox");
		this.titleEl.setText(this.options.alt);
		this.contentEl.empty();
		const figure = this.contentEl.createEl("figure", { cls: "table-cards-lightbox-figure" });
		figure.createEl("img", {
			cls: "table-cards-lightbox-image",
			attr: { src: this.options.source, alt: this.options.alt },
		});
		const close = this.contentEl.createEl("button", {
			cls: "table-cards-lightbox-close",
			attr: { "aria-label": this.options.closeLabel },
		});
		setIcon(close, "x");
		close.addEventListener("click", () => this.close());
		window.setTimeout(() => close.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
		this.options.opener?.focus();
	}
}
