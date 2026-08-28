import type { RibbonIcon } from "../model";
import type { TranslationKey, Translator } from "./keys";

export const RIBBON_ICON_KEYS = {
	"gallery-horizontal": "ribbon.icon.gallery",
	languages: "ribbon.icon.languages",
	image: "ribbon.icon.image",
	"book-open": "ribbon.icon.book",
	"layers-3": "ribbon.icon.layers",
	"graduation-cap": "ribbon.icon.graduation",
	brain: "ribbon.icon.brain",
	library: "ribbon.icon.library",
} satisfies Record<RibbonIcon, TranslationKey>;

export function ribbonIconLabel(t: Translator, icon: RibbonIcon): string {
	return t(RIBBON_ICON_KEYS[icon]);
}
