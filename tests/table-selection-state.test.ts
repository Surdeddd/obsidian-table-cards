import { describe, expect, it } from "vitest";
import { createTranslator } from "../src/i18n";
import type { TableCatalogItem } from "../src/model";
import { disambiguateTableLabels } from "../src/ui/ScopePicker";
import { setupDirectionAttributes } from "../src/ui/setup/setup-a11y";
import { applySetupDirection } from "../src/ui/setup/setup-a11y";
import { renderFinishForm } from "../src/ui/setup/FinishForm";
import { createSetupState } from "../src/setup/state";
import {
	reconcileTableSelectionInteraction,
	stableTableSelectionKey,
} from "../src/ui/sources/table-selection-state";

describe("table selection interaction state", () => {
	it("uses the source path to distinguish identical selectors", () => {
		const selector = { headerSignature: "term", occurrence: 0 };
		expect(stableTableSelectionKey("Folder/a.md", selector))
			.not.toBe(stableTableSelectionKey("Folder/b.md", selector));
	});

	it("preserves query, expansion, scroll, and logical checkbox focus across rebuild", () => {
		const first = stableTableSelectionKey("Folder/a.md", { headerSignature: "term", occurrence: 0 });
		const second = stableTableSelectionKey("Folder/b.md", { headerSignature: "term", occurrence: 0 });
		const state = {
			query: "verbs",
			expandedKeys: [first, second],
			scrollTop: 184,
			focusedCheckboxKey: second,
		};
		expect(reconcileTableSelectionInteraction(state, new Set([first, second]))).toEqual(state);
		expect(reconcileTableSelectionInteraction(state, new Set([first]))).toEqual({
			query: "verbs",
			expandedKeys: [first],
			scrollTop: 184,
			focusedCheckboxKey: null,
		});
	});

	it("reuses the established label disambiguation for repeated same-file headings", () => {
		const base: Omit<TableCatalogItem, "key" | "selector" | "tableNumber"> = {
			sourcePath: "Folder/words.md",
			sourceIds: ["folder"],
			label: "Words",
			headingPath: ["Words"],
			headers: ["Term"],
			rowCount: 1,
		};
		const catalog: TableCatalogItem[] = [
			{ ...base, key: "one", selector: { headerSignature: "term", occurrence: 0 }, tableNumber: 1 },
			{ ...base, key: "two", selector: { headerSignature: "term", occurrence: 1 }, tableNumber: 2 },
		];
		const labels = disambiguateTableLabels(catalog, createTranslator("en"), "en");
		expect(labels.get("one")).toBe("Words · words.md · Table 1");
		expect(labels.get("two")).toBe("Words · words.md · Table 2");
	});
});

describe("setup direction attributes", () => {
	it("uses RTL for Arabic chrome and auto direction for user data", () => {
		expect(setupDirectionAttributes("ar")).toEqual({ lang: "ar", dir: "rtl", userDataDir: "auto" });
		expect(setupDirectionAttributes("en")).toEqual({ lang: "en", dir: "ltr", userDataDir: "auto" });
	});

	it("applies Arabic language and direction to detached modal chrome", () => {
		const attributes = new Map<string, string>();
		applySetupDirection({
			setAttr: (name: string, value: string) => attributes.set(name, value),
		} as unknown as HTMLElement, "ar");
		expect(Object.fromEntries(attributes)).toEqual({ lang: "ar", dir: "rtl" });
	});

	it("renders the user-authored deck name input with automatic direction", () => {
		interface CreateOptions {
			type?: string;
			attr?: Record<string, string>;
		}
		class FakeElement {
			readonly children: FakeElement[] = [];
			checked = false;
			value = "";

			constructor(readonly tag = "div", readonly options: CreateOptions = {}) {}

			createDiv(options: CreateOptions = {}): FakeElement {
				return this.createEl("div", options);
			}

			createSpan(options: CreateOptions = {}): FakeElement {
				return this.createEl("span", options);
			}

			createEl(tag: string, options: CreateOptions = {}): FakeElement {
				const child = new FakeElement(tag, options);
				this.children.push(child);
				return child;
			}

			addEventListener(): void {}
		}
		const parent = new FakeElement();
		renderFinishForm(parent as unknown as HTMLElement, {
			state: createSetupState(),
			t: createTranslator("en"),
			locale: "en",
			error: null,
			summary: "0 cards",
			onName: () => undefined,
			onIcon: () => undefined,
			onRibbon: () => undefined,
		});
		const inputs = parent.children.flatMap(function collect(node): FakeElement[] {
			return [node, ...node.children.flatMap(collect)];
		}).filter((node) => node.tag === "input");
		expect(inputs.find((input) => input.options.type === "text")?.options.attr?.dir).toBe("auto");
	});
});
