import { describe, expect, it } from "vitest";
import {
	CATALOGS,
	EN,
	UI_LOCALES,
	createTranslator,
	formatUiNumber,
	resolveUiLocale,
	uiDirection,
	type TranslationKey,
} from "../src/i18n";
import * as i18nApi from "../src/i18n";

const TOKENS = /\{([a-zA-Z0-9_]+)\}/g;
const SHARED_TERMS = ["Obsidian", "Markdown", "Table Cards"] as const;
const TECHNICAL_IDENTICAL = new Set<TranslationKey>([
	"editor.type.markdown",
	"editor.color.aaa",
	"editor.color.aa",
]);
const LOCALE_IDENTICAL: Partial<Record<string, readonly TranslationKey[]>> = {
	es: ["preset.universal"],
	de: [
		"settings.appearance.preset",
		"settings.deck.name",
		"editor.panel.block",
		"editor.type.text",
		"editor.type.link",
		"editor.style.chips",
		"editor.style.text",
	],
	fr: [
		"modal.image",
		"settings.appearance.preset",
		"settings.appearance.preset.monochrome",
		"settings.deck.sources",
		"editor.column.unique",
		"editor.type.date",
		"editor.type.image",
		"editor.group.image",
		"editor.card.accent",
		"editor.style.image",
		"preset.phrases",
	],
	"pt-BR": ["editor.type.link", "editor.style.chips", "preset.universal"],
	it: ["editor.source.file"],
	pl: ["editor.source.folder", "editor.type.link"],
};

function tokens(value: string): string[] {
	return Array.from(value.matchAll(TOKENS), (match) => match[1] ?? "").sort();
}

const SEMANTIC_GLOSSARY = {
	ru: ["Колода", "Карточки", "Таблица", "Если ячейка пустая", "Первая строка", "столбцов", "Блок", "Метки", "По одному пути к заметке в хранилище на строку.", "Рамка", "Применить", "Снять выбор", "Найти таблицы", "Сохранить"],
	uk: ["Колода", "Картки", "Таблиця", "Якщо клітинка порожня", "Перший рядок", "стовпців", "Блок", "Мітки", "По одному шляху до нотатки у сховищі на рядок.", "Рамка", "Застосувати", "Зняти вибір", "Знайти таблиці", "Зберегти"],
	es: ["Mazo", "Tarjetas", "Tabla", "Cuando la celda esté vacía", "Primera fila", "columnas", "Bloque", "Etiquetas", "Una ruta de nota de la bóveda por línea.", "Borde", "Aplicar", "Borrar selección", "Buscar tablas", "Guardar"],
	de: ["Stapel", "Karten", "Tabelle", "Wenn die Zelle leer ist", "Erste Zeile", "Spalten", "Block", "Chips", "Ein Notizpfad im Vault pro Zeile.", "Rahmen", "Übernehmen", "Auswahl aufheben", "Tabellen durchsuchen", "Speichern"],
	fr: ["Paquet", "Cartes", "Tableau", "Lorsque la cellule est vide", "Première ligne", "colonnes", "Bloc", "Pastilles", "Un chemin de note du coffre Obsidian par ligne.", "Bordure", "Appliquer", "Tout désélectionner", "Rechercher des tableaux", "Enregistrer"],
	"pt-BR": ["Baralho", "Cartões", "Tabela", "Quando a célula estiver vazia", "Primeira linha", "colunas", "Bloco", "Chips", "Um caminho de nota no cofre por linha.", "Borda", "Aplicar", "Limpar seleção", "Pesquisar tabelas", "Salvar"],
	it: ["Mazzo", "Carte", "Tabella", "Quando la cella è vuota", "Prima riga", "colonne", "Blocco", "Chip", "Un percorso di nota nel vault per riga.", "Bordo", "Applica", "Deseleziona tutto", "Cerca tabelle", "Salva"],
	pl: ["Talia", "Karty", "Tabela", "Gdy komórka jest pusta", "Pierwszy wiersz", "kolumn", "Blok", "Znaczniki", "Jedna ścieżka do notatki w skarbcu Obsidian na wiersz.", "Obramowanie", "Zastosuj", "Wyczyść wybór", "Szukaj tabel", "Zapisz"],
	tr: ["Deste", "Kartlar", "Tablo", "Hücre boş olduğunda", "İlk satır", "sütun", "Blok", "Etiket çipleri", "Her satıra kasadaki bir not yolu.", "Kenarlık", "Uygula", "Seçimi temizle", "Tablolarda ara", "Kaydet"],
	"zh-CN": ["卡组", "卡片", "表格", "单元格为空时", "第一行", "列", "区块", "标签", "每行一个仓库内的笔记路径。", "边框", "应用", "清除选择", "搜索表格", "保存"],
	"zh-TW": ["牌組", "卡片", "表格", "儲存格為空時", "第一列", "欄", "區塊", "標籤", "每行輸入一個儲存庫內的筆記路徑。", "邊框", "套用", "清除選取", "搜尋表格", "儲存"],
	ja: ["デッキ", "カード", "表", "セルが空の場合", "最初の行", "列", "ブロック", "タグ", "1 行に 1 つ、保管庫内のノートのパスを入力します。", "境界線", "適用", "選択を解除", "表を検索", "保存"],
	ko: ["덱", "카드", "표", "셀이 비어 있을 때", "첫 번째 행", "열", "블록", "태그", "한 줄에 보관소의 노트 경로 하나씩 입력합니다.", "테두리", "적용", "선택 해제", "표 검색", "저장"],
	ar: ["حزمة", "بطاقات", "جدول", "عندما تكون الخلية فارغة", "الصف الأول", "أعمدة", "كتلة", "وسوم", "مسار ملاحظة واحد داخل الخزنة في كل سطر.", "حدود", "تطبيق", "إلغاء التحديد", "البحث في الجداول", "حفظ"],
	hi: ["डेक", "कार्ड", "तालिका", "जब सेल खाली हो", "पहली पंक्ति", "कॉलम", "ब्लॉक", "टैग", "हर पंक्ति में वॉल्ट के एक नोट का पथ।", "बॉर्डर", "लागू करें", "चयन हटाएँ", "तालिकाएँ खोजें", "सहेजें"],
} as const;

const SEMANTIC_KEYS = [
	"modal.deck",
	"modal.kicker",
	"editor.table.label",
	"editor.empty",
	"editor.row.first",
	"editor.summary.columns",
	"editor.panel.block",
	"editor.style.chips",
	"settings.deck.filesDesc",
	"settings.appearance.border",
	"scope.apply",
	"scope.clear",
	"scope.search",
	"editor.save",
] as const satisfies readonly TranslationKey[];

describe("localization", () => {
	it.each([
		["uk-UA", "uk"],
		["pt-PT", "pt-BR"],
		["pt-BR", "pt-BR"],
		["zh-Hans", "zh-CN"],
		["zh-Hant", "zh-TW"],
		["zh-Hans-TW", "zh-CN"],
		["zh-Hant-CN", "zh-TW"],
		["zh-HK", "zh-TW"],
		["ar-EG", "ar"],
		["xx-ZZ", "en"],
	] as const)("maps %s to %s", (input, expected) => {
		expect(resolveUiLocale("auto", input)).toBe(expected);
	});

	it("keeps an explicit supported locale", () => {
		expect(resolveUiLocale("de", "ru")).toBe("de");
	});

	it("keeps all sixteen catalogs in exact parity", () => {
		const expected = Object.keys(CATALOGS.en).sort();
		expect(UI_LOCALES).toHaveLength(16);
		for (const locale of UI_LOCALES) {
			expect(Object.keys(CATALOGS[locale]).sort()).toEqual(expected);
			expect(Object.values(CATALOGS[locale]).every((value) => value.trim().length > 0)).toBe(true);
		}
	});

	it("preserves every interpolation token across catalogs", () => {
		for (const key of Object.keys(EN) as TranslationKey[]) {
			for (const locale of UI_LOCALES) {
				expect(tokens(CATALOGS[locale][key]), `${locale}:${key}`).toEqual(tokens(EN[key]));
			}
		}
	});

	it("uses the reviewed UI glossary in every non-English locale", () => {
		for (const [locale, values] of Object.entries(SEMANTIC_GLOSSARY)) {
			for (const [index, key] of SEMANTIC_KEYS.entries()) {
				expect(CATALOGS[locale as keyof typeof SEMANTIC_GLOSSARY][key], `${locale}:${key}`).toBe(values[index]);
			}
		}
	});

	it("preserves brand and technical terms without transport artifacts", () => {
		for (const key of Object.keys(EN) as TranslationKey[]) {
			for (const locale of UI_LOCALES) {
				const value = CATALOGS[locale][key];
				expect(value, `${locale}:${key}`).not.toMatch(/XQZ|QZX\d+XZQ/);
				for (const term of SHARED_TERMS) {
					if (EN[key].includes(term)) expect(value, `${locale}:${key}`).toContain(term);
				}
			}
		}
	});

	it("has no obvious English sentence fallbacks", () => {
		for (const locale of UI_LOCALES.filter((item) => item !== "en")) {
			const allowed = new Set<TranslationKey>([...TECHNICAL_IDENTICAL, ...(LOCALE_IDENTICAL[locale] ?? [])]);
			const unexpected = (Object.keys(EN) as TranslationKey[]).filter((key) =>
				CATALOGS[locale][key] === EN[key]
					&& !key.startsWith("settings.language.")
					&& !allowed.has(key),
			);
			expect(unexpected, locale).toEqual([]);
		}
	});

	it("interpolates values in the active catalog", () => {
		expect(createTranslator("ru")("launcher.open", { count: "583" })).toBe("Открыть карточки: 583");
		expect(createTranslator("en")("launcher.summary", { cards: "3", tables: "2" }))
			.toBe("3 cards · 2 tables");
	});

	it("leaves missing interpolation variables visible", () => {
		expect(createTranslator("en")("launcher.summary", { cards: 3 })).toBe("3 cards · {tables} tables");
	});

	it("scopes RTL to Arabic only", () => {
		expect(uiDirection("ar")).toBe("rtl");
		for (const locale of UI_LOCALES.filter((item) => item !== "ar")) {
			expect(uiDirection(locale)).toBe("ltr");
		}
	});

	it("applies locale direction to plugin chrome and auto direction to user data", () => {
		type AttributeWriter = (target: { setAttr: (name: string, value: string) => void }, locale?: "ar") => void;
		const api = i18nApi as typeof i18nApi & {
			applyUiChromeDirection?: AttributeWriter;
			applyUserDataDirection?: AttributeWriter;
		};
		expect(typeof api.applyUiChromeDirection).toBe("function");
		expect(typeof api.applyUserDataDirection).toBe("function");
		const chrome: Record<string, string> = {};
		const userData: Record<string, string> = {};
		api.applyUiChromeDirection?.({ setAttr: (name, value) => chrome[name] = value }, "ar");
		api.applyUserDataDirection?.({ setAttr: (name, value) => userData[name] = value });

		expect(chrome).toEqual({ lang: "ar", dir: "rtl" });
		expect(userData).toEqual({ dir: "auto" });
	});

	it("formats visible numbers with the active locale", () => {
		expect(formatUiNumber(12_345, "de")).toBe(new Intl.NumberFormat("de").format(12_345));
		expect(formatUiNumber(12_345, "hi")).toBe(new Intl.NumberFormat("hi").format(12_345));
	});
});
