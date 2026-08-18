export interface ListboxOption<T extends string> {
	value: T;
	label: string;
	description?: string;
}

export interface ListboxOptions<T extends string> {
	id: string;
	label: string;
	value: T;
	options: Array<ListboxOption<T>>;
	searchable?: boolean;
	onChange: (value: T) => void;
}

export class Listbox<T extends string> {
	private readonly root: HTMLElement;
	private readonly trigger: HTMLButtonElement;
	private readonly options: ListboxOptions<T>;
	private popover: HTMLElement | null = null;
	private activeIndex = 0;
	private query = "";
	private queryTimer = 0;

	constructor(parent: HTMLElement, options: ListboxOptions<T>) {
		this.options = options;
		this.root = parent.createDiv({ cls: "tc-listbox" });
		this.root.createEl("label", { text: options.label, attr: { id: `${options.id}-label` } });
		this.trigger = this.root.createEl("button", {
			cls: "tc-listbox-trigger",
			attr: {
				type: "button",
				"aria-labelledby": `${options.id}-label ${options.id}-value`,
				"aria-haspopup": "listbox",
				"aria-expanded": "false",
				"aria-controls": `${options.id}-options`,
			},
		});
		this.trigger.createSpan({
			text: options.options.find((option) => option.value === options.value)?.label ?? options.value,
			attr: { id: `${options.id}-value` },
		});
		this.trigger.createSpan({ cls: "tc-listbox-chevron", text: "⌄", attr: { "aria-hidden": "true" } });
		this.trigger.addEventListener("click", () => (this.popover ? this.close() : this.open()));
		this.trigger.addEventListener("keydown", (event) => {
			if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
			event.preventDefault();
			this.open();
			this.move(event.key === "ArrowDown" ? 1 : -1);
		});
	}

	destroy(): void {
		window.clearTimeout(this.queryTimer);
		this.close(false);
	}

	private open(): void {
		if (this.popover) return;
		this.activeIndex = Math.max(
			0,
			this.options.options.findIndex((option) => option.value === this.options.value),
		);
		this.trigger.setAttr("aria-expanded", "true");
		this.popover = this.root.createDiv({ cls: "tc-listbox-popover" });
		if (this.options.searchable && this.options.options.length > 8) {
			const search = this.popover.createEl("input", {
				type: "search",
				cls: "tc-listbox-search",
				attr: { "aria-label": this.options.label, placeholder: this.options.label },
			});
			search.addEventListener("input", () => this.renderOptions(search.value));
		}
		this.renderOptions("");
		this.popover.addEventListener("keydown", this.onKeyDown);
		document.addEventListener("pointerdown", this.onOutsidePointerDown, true);
		window.setTimeout(() => this.focusActive(), 0);
	}

	private renderOptions(filter: string): void {
		if (!this.popover) return;
		this.popover.querySelector<HTMLElement>(".tc-listbox-options")?.remove();
		const query = filter.trim().toLocaleLowerCase();
		const visibleIndexes = this.options.options.flatMap((option, index) =>
			query && !option.label.toLocaleLowerCase().includes(query) ? [] : [index],
		);
		if (!visibleIndexes.includes(this.activeIndex)) this.activeIndex = visibleIndexes[0] ?? 0;
		const list = this.popover.createDiv({
			cls: "tc-listbox-options",
			attr: { id: `${this.options.id}-options`, role: "listbox", "aria-labelledby": `${this.options.id}-label` },
		});
		for (const [index, option] of this.options.options.entries()) {
			if (query && !option.label.toLocaleLowerCase().includes(query)) continue;
			const item = list.createEl("button", {
				cls: "tc-listbox-option",
				attr: {
					type: "button",
					role: "option",
					"aria-selected": String(option.value === this.options.value),
					"data-index": String(index),
					tabindex: index === this.activeIndex ? "0" : "-1",
				},
			});
			item.createSpan({ text: option.label });
			if (option.description) item.createSpan({ cls: "tc-listbox-description", text: option.description });
			item.addEventListener("click", () => this.select(option.value));
		}
	}

	private items(): HTMLButtonElement[] {
		return Array.from(this.popover?.querySelectorAll<HTMLButtonElement>(".tc-listbox-option") ?? []);
	}

	private focusActive(): void {
		const items = this.items();
		const exact = items.find((item) => Number(item.dataset.index) === this.activeIndex) ?? items[0];
		if (!exact) return;
		for (const item of items) item.tabIndex = -1;
		exact.tabIndex = 0;
		this.activeIndex = Number(exact.dataset.index);
		exact.focus();
	}

	private move(delta: number): void {
		const items = this.items();
		if (items.length === 0) return;
		const current = items.findIndex((item) => item === document.activeElement);
		const next = current < 0
			? delta > 0 ? 0 : items.length - 1
			: (current + delta + items.length) % items.length;
		for (const item of items) item.tabIndex = -1;
		const target = items[next];
		if (target) {
			target.tabIndex = 0;
			this.activeIndex = Number(target.dataset.index);
			target.focus();
		}
	}

	private select(value: T): void {
		this.close();
		this.options.onChange(value);
	}

	private close(restoreFocus = true): void {
		this.popover?.removeEventListener("keydown", this.onKeyDown);
		this.popover?.remove();
		this.popover = null;
		this.trigger.setAttr("aria-expanded", "false");
		document.removeEventListener("pointerdown", this.onOutsidePointerDown, true);
		if (restoreFocus) this.trigger.focus();
	}

	private readonly onOutsidePointerDown = (event: PointerEvent): void => {
		if (event.target instanceof Node && !this.root.contains(event.target)) this.close();
	};

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.close();
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			this.move(event.key === "ArrowDown" ? 1 : -1);
			return;
		}
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.stopPropagation();
			return;
		}
		const items = this.items();
		if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			event.stopPropagation();
			const target = event.key === "Home" ? items[0] : items.at(-1);
			if (target) {
				for (const item of items) item.tabIndex = -1;
				target.tabIndex = 0;
				this.activeIndex = Number(target.dataset.index);
				target.focus();
			}
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			const target = event.target;
			if (target instanceof HTMLButtonElement && target.dataset.index) {
				event.preventDefault();
				event.stopPropagation();
				const option = this.options.options[Number(target.dataset.index)];
				if (option) this.select(option.value);
			}
			return;
		}
		if (event.target instanceof HTMLInputElement) {
			if (event.key.length === 1) event.stopPropagation();
			return;
		}
		if (
			event.key.length !== 1 ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		) return;
		event.preventDefault();
		event.stopPropagation();
		window.clearTimeout(this.queryTimer);
		this.query += event.key.toLocaleLowerCase();
		const match = items.find((item) => item.textContent?.trim().toLocaleLowerCase().startsWith(this.query));
		match?.focus();
		this.queryTimer = window.setTimeout(() => {
			this.query = "";
		}, 500);
	};
}
