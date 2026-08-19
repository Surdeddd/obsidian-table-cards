import type { UiLocale } from "../../model";
import type { TranslationCatalog } from "../keys";
import { AR } from "./ar";
import { DE } from "./de";
import { EN } from "./en";
import { ES } from "./es";
import { FR } from "./fr";
import { HI } from "./hi";
import { IT } from "./it";
import { JA } from "./ja";
import { KO } from "./ko";
import { PL } from "./pl";
import { PT_BR } from "./pt-BR";
import { RU } from "./ru";
import { TR } from "./tr";
import { UK } from "./uk";
import { ZH_CN } from "./zh-CN";
import { ZH_TW } from "./zh-TW";

export { AR, DE, EN, ES, FR, HI, IT, JA, KO, PL, PT_BR, RU, TR, UK, ZH_CN, ZH_TW };

export const CATALOGS = {
	en: EN,
	ru: RU,
	uk: UK,
	es: ES,
	de: DE,
	fr: FR,
	"pt-BR": PT_BR,
	it: IT,
	pl: PL,
	tr: TR,
	"zh-CN": ZH_CN,
	"zh-TW": ZH_TW,
	ja: JA,
	ko: KO,
	ar: AR,
	hi: HI,
} satisfies Record<UiLocale, TranslationCatalog>;
