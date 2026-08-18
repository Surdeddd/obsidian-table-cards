import { describe, expect, it, vi } from "vitest";
import TableCardsPlugin from "../src/main";
import type { Deck, PluginSettings, RibbonIcon } from "../src/model";
import { createDeck, mergeDeck } from "../src/settings/defaults";
import { moveDeck } from "../src/settings/settings-tab";
import { RibbonDecks, ribbonSpecs } from "../src/ui/RibbonDecks";

function deck(
	id: string,
	options: { enabled?: boolean; visible?: boolean; icon?: RibbonIcon } = {},
): Deck {
	return createDeck({
		id,
		name: id,
		enabled: options.enabled ?? true,
		ribbon: { visible: options.visible ?? false, icon: options.icon ?? "layers-3" },
	});
}

describe("deck ribbon buttons", () => {
	it("returns one descriptor per enabled visible deck in deck order", () => {
		expect(ribbonSpecs([
			deck("hidden", { enabled: true, visible: false }),
			deck("verbs", { enabled: true, visible: true, icon: "languages" }),
			deck("disabled", { enabled: false, visible: true }),
			deck("phrases", { enabled: true, visible: true, icon: "message-square-quote" }),
		])).toEqual([
			{ deckId: "verbs", title: "verbs", icon: "languages" },
			{ deckId: "phrases", title: "phrases", icon: "message-square-quote" },
		]);
	});

	it("normalizes a deleted or invalid icon through deck migration", () => {
		expect(mergeDeck({ id: "x", name: "X", ribbon: { visible: true, icon: "not-real" } }).ribbon.icon)
			.toBe("layers-3");
	});

	it("removes stale elements and keeps callbacks locked to exact deck ids", () => {
		const removed: string[] = [];
		const opened: string[] = [];
		const callbacks: Array<() => void> = [];
		const controller = new RibbonDecks({
			add: (_icon, title, callback) => {
				callbacks.push(() => callback({} as MouseEvent));
				return { remove: () => removed.push(title) } as HTMLElement;
			},
			openDeck: (deckId) => opened.push(deckId),
		});
		controller.sync([deck("verbs", { visible: true }), deck("phrases", { visible: true })]);
		callbacks[1]?.();
		controller.sync([deck("verbs", { visible: true })]);
		expect(opened).toEqual(["phrases"]);
		expect(removed).toEqual(["verbs", "phrases"]);
	});

	it("destroys every current button exactly once and is idempotent", () => {
		const removed: string[] = [];
		const controller = new RibbonDecks({
			add: (_icon, title) => ({ remove: () => removed.push(title) }) as HTMLElement,
			openDeck: () => undefined,
		});
		controller.sync([deck("verbs", { visible: true })]);
		controller.destroy();
		controller.destroy();

		expect(removed).toEqual(["verbs"]);
	});

	it("synchronizes ribbons only after a successful central settings save", async () => {
		const previous = { decks: [deck("previous", { visible: true })] } as PluginSettings;
		const next = { ...previous, decks: [deck("next", { visible: true })] };
		const saveData = vi.fn(async () => undefined);
		const sync = vi.fn();
		const plugin = Object.assign(Object.create(TableCardsPlugin.prototype), {
			settings: previous,
			saveData,
			ribbonDecks: { sync },
		}) as TableCardsPlugin;

		await plugin.saveSettings(next);

		expect(saveData).toHaveBeenCalledWith(next);
		expect(plugin.settings).toBe(next);
		expect(sync).toHaveBeenCalledWith(next.decks);
	});

	it("does not publish or reconcile a candidate after a failed central save", async () => {
		const previous = { decks: [deck("previous", { visible: true })] } as PluginSettings;
		const next = { ...previous, decks: [deck("next", { visible: true })] };
		const sync = vi.fn();
		const plugin = Object.assign(Object.create(TableCardsPlugin.prototype), {
			settings: previous,
			saveData: vi.fn(async () => { throw new Error("disk full"); }),
			ribbonDecks: { sync },
		}) as TableCardsPlugin;

		await expect(plugin.saveSettings(next)).rejects.toThrow("disk full");
		expect(plugin.settings).toBe(previous);
		expect(sync).not.toHaveBeenCalled();
	});

	it("moves decks only within the persisted order boundaries", () => {
		const decks = [deck("first"), deck("second"), deck("third")];
		expect(moveDeck(decks, "first", -1)).toBe(false);
		expect(moveDeck(decks, "third", 1)).toBe(false);
		expect(moveDeck(decks, "second", 1)).toBe(true);
		expect(decks.map((item) => item.id)).toEqual(["first", "third", "second"]);
	});

	it("keeps a disabled deck's stored ribbon preference without publishing it", () => {
		const disabled = deck("paused", { enabled: false, visible: true });

		expect(disabled.ribbon.visible).toBe(true);
		expect(ribbonSpecs([disabled])).toEqual([]);
	});
});
