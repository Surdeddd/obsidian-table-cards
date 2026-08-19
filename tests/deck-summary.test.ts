import { describe, expect, it } from "vitest";
import { CATALOGS, createTranslator, UI_LOCALES } from "../src/i18n";

const COUNT_KEYS = ["settings.deck.sources", "settings.deck.blocks", "settings.deck.warnings"] as const;

describe("deck summary counts", () => {
	it("labels the count instead of pinning a number to a plural noun", () => {
		for (const locale of UI_LOCALES) {
			for (const key of COUNT_KEYS) {
				expect(CATALOGS[locale][key], `${locale} ${key}`).toContain("{count}");
			}
		}
	});

	it("reads correctly for one and for many", () => {
		const t = createTranslator("en");

		expect(t("settings.deck.sources", { count: 1 })).toBe("Sources: 1");
		expect(t("settings.deck.blocks", { count: 7 })).toBe("Blocks: 7");
		expect(t("settings.deck.warnings", { count: 3 })).toBe("Warnings: 3");
	});

	it("keeps the russian label in the nominative", () => {
		const t = createTranslator("ru");

		expect(t("settings.deck.sources", { count: 1 })).toBe("Источники: 1");
	});
});
