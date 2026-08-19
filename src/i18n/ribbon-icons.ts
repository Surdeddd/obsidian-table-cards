import type { RibbonIcon } from "../model";
import type { TranslationKey, Translator } from "./keys";

export const RIBBON_ICON_KEYS = {
	"gallery-horizontal": "ribbon.icon.gallery",
	languages: "ribbon.icon.languages",
	"message-square-quote": "ribbon.icon.quote",
	"circle-help": "ribbon.icon.help",
	image: "ribbon.icon.image",
	"book-open": "ribbon.icon.book",
	"layers-3": "ribbon.icon.layers",
	"graduation-cap": "ribbon.icon.graduation",
	brain: "ribbon.icon.brain",
	library: "ribbon.icon.library",
	"notebook-tabs": "ribbon.icon.notebook",
	"rows-3": "ribbon.icon.rows",
} satisfies Record<RibbonIcon, TranslationKey>;

export function ribbonIconLabel(t: Translator, icon: RibbonIcon): string {
	return t(RIBBON_ICON_KEYS[icon]);
}
