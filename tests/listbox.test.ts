import { describe, expect, it } from "vitest";
import { Listbox } from "../src/ui/editor/controls/Listbox";

interface FakeButton {
	dataset: { index: string };
	tabIndex: number;
	focus: () => void;
}

interface ListboxHarness {
	activeIndex: number;
	items: () => FakeButton[];
	move: (delta: number) => void;
	options: {
		id: string;
		label: string;
		value: string;
		options: Array<{ value: string; label: string }>;
		optionDirection?: "auto";
	};
	popover: FakePopover;
	renderOptions: (filter: string) => void;
}

class FakeList {
	readonly buttons: FakeButton[] = [];
	readonly spans: Array<{ text?: string; attr?: Record<string, string> }> = [];

	createEl(_tag: string, options: { attr: Record<string, string> }): FakeButton & {
		createSpan: (options: { text?: string; attr?: Record<string, string> }) => void;
		addEventListener: () => void;
	} {
		const button = {
			dataset: { index: options.attr["data-index"] ?? "" },
			tabIndex: Number(options.attr.tabindex),
			focus: () => undefined,
			createSpan: (spanOptions) => {
				this.spans.push(spanOptions);
			},
			addEventListener: () => undefined,
		};
		this.buttons.push(button);
		return button;
	}
}

class FakePopover {
	list: FakeList | null = null;

	querySelector(): null {
		return null;
	}

	createDiv(): FakeList {
		this.list = new FakeList();
		return this.list;
	}
}

class FakeTrigger {
	readonly spans: Array<{ text?: string; attr?: Record<string, string> }> = [];

	createSpan(options: { text?: string; attr?: Record<string, string> }): void {
		this.spans.push(options);
	}

	addEventListener(): void {}
}

class FakeConstructorRoot {
	readonly trigger = new FakeTrigger();

	createEl(): FakeTrigger {
		return this.trigger;
	}
}

class FakeParent {
	readonly root = new FakeConstructorRoot();

	createDiv(): FakeConstructorRoot {
		return this.root;
	}
}

describe("Listbox keyboard state", () => {
	it("moves ArrowDown to the first visible item when focus is outside the list", () => {
		const documentState: { activeElement: FakeButton | null } = { activeElement: null };
		Object.defineProperty(globalThis, "document", { value: documentState, configurable: true });
		const buttons = ["2", "5"].map((index): FakeButton => {
			const button: FakeButton = {
				dataset: { index },
				tabIndex: -1,
				focus: () => {
					documentState.activeElement = button;
				},
			};
			return button;
		});
		const listbox = Object.create(Listbox.prototype) as ListboxHarness;
		listbox.activeIndex = 2;
		listbox.items = () => buttons;

		listbox.move(1);

		expect(documentState.activeElement).toBe(buttons[0]);
		expect(listbox.activeIndex).toBe(2);
	});

	it("normalizes the active index when filtering hides the active option", () => {
		const listbox = Object.create(Listbox.prototype) as ListboxHarness;
		listbox.activeIndex = 0;
		listbox.options = {
			id: "test",
			label: "Test",
			value: "alpha",
			onChange: () => undefined,
			options: [
				{ value: "alpha", label: "Alpha" },
				{ value: "beta", label: "Beta" },
				{ value: "gamma", label: "Gamma" },
			],
		} as ListboxHarness["options"];
		listbox.popover = new FakePopover();

		listbox.renderOptions("gam");

		expect(listbox.activeIndex).toBe(2);
		expect(listbox.popover.list?.buttons.map((button) => button.tabIndex)).toEqual([0]);
	});

	it("marks user-authored option labels with automatic bidi direction", () => {
		const listbox = Object.create(Listbox.prototype) as ListboxHarness;
		listbox.activeIndex = 0;
		listbox.options = {
			id: "decks",
			label: "Deck",
			value: "arabic",
			onChange: () => undefined,
			optionDirection: "auto",
			options: [{ value: "arabic", label: "English العربية" }],
		} as ListboxHarness["options"];
		listbox.popover = new FakePopover();

		listbox.renderOptions("");

		expect(listbox.popover.list?.spans[0]?.attr?.dir).toBe("auto");
	});

	it("marks the current user-authored value without changing the listbox label", () => {
		const parent = new FakeParent();
		new Listbox(parent as unknown as HTMLElement, {
			id: "decks",
			label: "Deck",
			value: "arabic",
			optionDirection: "auto",
			options: [{ value: "arabic", label: "English العربية" }],
			onChange: () => undefined,
		});

		expect(parent.root.trigger.spans[0]?.attr).toEqual({ id: "decks-value", dir: "auto" });
	});
});
