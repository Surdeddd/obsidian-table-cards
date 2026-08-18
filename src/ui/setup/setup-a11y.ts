import { uiDirection } from "../../i18n";
import type { UiLocale } from "../../model";

export interface SetupDirectionAttributes {
	lang: UiLocale;
	dir: "ltr" | "rtl";
	userDataDir: "auto";
}

export function setupDirectionAttributes(locale: UiLocale): SetupDirectionAttributes {
	return { lang: locale, dir: uiDirection(locale), userDataDir: "auto" };
}

export function applySetupDirection(target: HTMLElement, locale: UiLocale): void {
	const { lang, dir } = setupDirectionAttributes(locale);
	target.setAttr("lang", lang);
	target.setAttr("dir", dir);
}
