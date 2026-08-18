import { describe, expect, it } from "vitest";
import { EN, RU, createTranslator, resolveUiLocale, type TranslationKey } from "../src/i18n";

describe("localization", () => {
	it("keeps Russian and English catalogs in parity", () => {
		expect(Object.keys(RU).sort()).toEqual(Object.keys(EN).sort());
	});

	it("translates every declared key in both locales", () => {
		for (const key of Object.keys(EN) as TranslationKey[]) {
			expect(createTranslator("en")(key)).toBeTruthy();
			expect(createTranslator("ru")(key)).toBeTruthy();
		}
	});

	it("keeps an explicit v3 locale and falls back to English until its catalog exists", () => {
		expect(resolveUiLocale("de", "ru")).toBe("de");
		expect(createTranslator("de")("modal.close")).toBe(EN["modal.close"]);
	});
});
