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
	optionDirection?: "auto";
	onChange: (value: T) => void;
}

let openListboxToken: object | null = null;
let openListboxDismiss: (() => void) | null = null;

export function closeOpenListbox(): boolean {
	const dismiss = openListboxDismiss;
	if (!dismiss) return false;
	dismiss();
	return true;
}

export class Listbox<T extends string> {
	private readonly root: HTMLElement;
	private readonly trigger: HTMLButtonElement;
	private readonly options: ListboxOptions<T>;
	private readonly token = {};
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
			attr: {
				id: `${options.id}-value`,
				...(options.optionDirection ? { dir: options.optionDirection } : {}),
			},
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
		this.hostDocument().defaultView?.clearTimeout(this.queryTimer);
		this.close(false);
	}

	private hostDocument(): Document {
		return this.root.ownerDocument;
	}

	private open(): void {
		if (this.popover) return;
		closeOpenListbox();
		openListboxToken = this.token;
		openListboxDismiss = () => this.close();
		this.activeIndex = Math.max(
			0,
			this.options.options.findIndex((option) => option.value === this.options.value),
		);
		this.trigger.setAttr("aria-expanded", "true");
		this.root.classList.add("is-open");
		this.popover = this.mountPopover();
		if (this.options.searchable && this.options.options.length > 8) {
			const search = this.popover.createEl("input", {
				type: "search",
				cls: "tc-listbox-search",
				attr: { "aria-label": this.options.label, placeholder: this.options.label },
			});
			search.addEventListener("input", () => this.renderOptions(search.value));
		}
		this.renderOptions("");
		this.placePopover();
		this.popover.addEventListener("keydown", this.onKeyDown);
		const scope = this.hostDocument();
		scope.addEventListener("pointerdown", this.onOutsidePointerDown, true);
		scope.defaultView?.addEventListener("resize", this.placePopover);
		scope.addEventListener("scroll", this.placePopover, true);
		scope.defaultView?.setTimeout(() => this.focusActive(), 0);
	}

	private mountPopover(): HTMLElement {
		const popover = this.root.createDiv({ cls: "tc-listbox-popover" });
		(this.trigger.ownerDocument.body ?? this.trigger.doc.body).append(popover);
		return popover;
	}

	private readonly placePopover = (): void => {
		if (!this.popover) return;
		const view = this.hostDocument().defaultView ?? window;
		const mobile = view.matchMedia("(max-width: 700px)").matches;
		this.popover.classList.toggle("is-mobile-sheet", mobile);
		if (mobile) {
			this.popover.removeAttribute("style");
			return;
		}
		const rect = this.trigger.getBoundingClientRect();
		const gutter = 8;
		const width = Math.min(Math.max(rect.width, 260), view.innerWidth - gutter * 2);
		const left = Math.min(Math.max(gutter, rect.left), view.innerWidth - width - gutter);
		const spaceBelow = view.innerHeight - rect.bottom - gutter;
		const spaceAbove = rect.top - gutter;
		const flip = spaceBelow < 168 && spaceAbove > spaceBelow;
		const maxHeight = Math.max(96, Math.min(360, flip ? spaceAbove : spaceBelow));
		const top = flip ? Math.max(gutter, rect.top - maxHeight - 5) : rect.bottom + 5;
		this.popover.classList.toggle("is-above", flip);
		Object.assign(this.popover.style, {
			position: "fixed",
			top: `${top}px`,
			left: `${left}px`,
			width: `${width}px`,
			right: "auto",
			bottom: "auto",
			maxHeight: `${maxHeight}px`,
			zIndex: "10000",
		});
	};

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
			item.createSpan({
				text: option.label,
				attr: this.options.optionDirection ? { dir: this.options.optionDirection } : undefined,
			});
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
		const scope = this.popover?.ownerDocument ?? document;
		const current = items.findIndex((item) => item === scope.activeElement);
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
		if (openListboxToken === this.token) {
			openListboxToken = null;
			openListboxDismiss = null;
		}
		this.popover?.removeEventListener("keydown", this.onKeyDown);
		this.popover?.remove();
		this.popover = null;
		this.root.classList.remove("is-open");
		this.trigger.setAttr("aria-expanded", "false");
		const scope = this.hostDocument();
		scope.removeEventListener("pointerdown", this.onOutsidePointerDown, true);
		scope.defaultView?.removeEventListener("resize", this.placePopover);
		scope.removeEventListener("scroll", this.placePopover, true);
		if (restoreFocus) this.trigger.focus();
	}

	private readonly onOutsidePointerDown = (event: PointerEvent): void => {
		const target = event.target as Node | null;
		if (!target || typeof target.nodeType !== "number") return;
		if (this.root.contains(target) || this.popover?.contains(target)) return;
		this.close();
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
