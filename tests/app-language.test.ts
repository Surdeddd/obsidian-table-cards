import { describe, expect, it } from "vitest";
import { readAppLanguage } from "../src/i18n/app-language";

describe("readAppLanguage", () => {
	it("prefers the Obsidian API when the running app provides it", () => {
		expect(
			readAppLanguage({
				apiLanguage: () => "ru",
				storage: { getItem: () => "de" },
				navigatorLanguage: "fr",
			}),
		).toBe("ru");
	});

	it("falls back to stored language when the app predates getLanguage", () => {
		expect(
			readAppLanguage({
				apiLanguage: undefined,
				storage: { getItem: (key) => (key === "language" ? "uk" : null) },
				navigatorLanguage: "fr",
			}),
		).toBe("uk");
	});

	it("falls back when the API throws", () => {
		expect(
			readAppLanguage({
				apiLanguage: () => {
					throw new TypeError("getLanguage is not a function");
				},
				storage: { getItem: () => "pl" },
			}),
		).toBe("pl");
	});

	it("ignores an empty stored language and uses the moment locale", () => {
		expect(
			readAppLanguage({
				storage: { getItem: () => "" },
				momentLocale: () => "ja",
				navigatorLanguage: "fr",
			}),
		).toBe("ja");
	});

	it("uses the navigator language when nothing else is available", () => {
		expect(readAppLanguage({ storage: null, navigatorLanguage: "pt-BR" })).toBe("pt-BR");
	});

	it("returns english when every source is missing", () => {
		expect(readAppLanguage({})).toBe("en");
	});

	it("survives a storage implementation that throws", () => {
		expect(
			readAppLanguage({
				storage: {
					getItem: () => {
						throw new Error("denied");
					},
				},
				navigatorLanguage: "it",
			}),
		).toBe("it");
	});
});
