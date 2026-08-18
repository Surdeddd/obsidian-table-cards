import type { LocaleMode, UiLocale } from "../model";

export type TranslationKey =
	| "command.open"
	| "ribbon.open"
	| "modal.close"
	| "modal.prev"
	| "modal.next"
	| "modal.shuffle"
	| "modal.shuffleOn"
	| "modal.empty"
	| "modal.deck"
	| "modal.progress"
	| "modal.image"
	| "modal.imageMissing"
	| "modal.imageZoom"
	| "modal.kicker"
	| "settings.language.name"
	| "settings.language.desc"
	| "settings.language.auto"
	| "settings.language.en"
	| "settings.language.ru"
	| "settings.defaults"
	| "settings.appearance.preset"
	| "settings.appearance.preset.obsidian"
	| "settings.appearance.preset.monochrome"
	| "settings.appearance.preset.custom"
	| "settings.appearance.heading"
	| "settings.appearance.desc"
	| "settings.appearance.overlay"
	| "settings.appearance.overlay.auto"
	| "settings.appearance.overlay.center"
	| "settings.appearance.overlay.full"
	| "settings.appearance.size"
	| "settings.appearance.size.compact"
	| "settings.appearance.size.comfort"
	| "settings.appearance.size.large"
	| "settings.appearance.border"
	| "settings.appearance.border.none"
	| "settings.appearance.border.thin"
	| "settings.appearance.border.solid"
	| "settings.appearance.borderWidth"
	| "settings.appearance.radius"
	| "settings.appearance.padding"
	| "settings.appearance.gap"
	| "settings.appearance.wordScale"
	| "settings.appearance.shadow"
	| "settings.appearance.twoColumn"
	| "settings.appearance.twoColumnFrom"
	| "settings.appearance.preview"
	| "settings.decks.heading"
	| "settings.decks.add"
	| "settings.deck.enabled"
	| "settings.deck.name"
	| "settings.deck.files"
	| "settings.deck.filesDesc"
	| "settings.deck.shuffle"
	| "settings.deck.delete"
	| "settings.deck.edit"
	| "settings.deck.deleteTitle"
	| "settings.deck.deleteDesc"
	| "settings.deck.cancel"
	| "settings.deck.copySuffix"
	| "settings.deck.duplicate"
	| "settings.deck.sources"
	| "settings.deck.blocks"
	| "settings.deck.warnings"
	| "editor.title"
	| "editor.backAction"
	| "editor.save"
	| "editor.saving"
	| "editor.saveError"
	| "editor.unsaved"
	| "editor.unsavedTitle"
	| "editor.unsavedDesc"
	| "editor.continue"
	| "editor.discard"
	| "editor.undo"
	| "editor.redo"
	| "editor.device.desktop"
	| "editor.device.phone"
	| "editor.fields"
	| "editor.cardStyle"
	| "editor.widthHalf"
	| "editor.widthFull"
	| "editor.move"
	| "editor.more"
	| "editor.loading"
	| "editor.loadError"
	| "editor.closePanel"
	| "editor.panel.fields"
	| "editor.panel.block"
	| "editor.panel.card"
	| "editor.panel.reorder"
	| "editor.panelPlaceholder"
	| "editor.summary.columns"
	| "editor.summary.rows"
	| "editor.summary.warnings"
	| "editor.source.heading"
	| "editor.source.file"
	| "editor.source.folder"
	| "editor.source.remove"
	| "editor.source.addFile"
	| "editor.source.addFolder"
	| "editor.source.pickFile"
	| "editor.source.pickFolder"
	| "editor.source.empty"
	| "editor.table.all"
	| "editor.table.label"
	| "editor.table.none"
	| "editor.table.missing"
	| "editor.table.repair"
	| "editor.column.use"
	| "editor.column.type"
	| "editor.column.confidence"
	| "editor.column.unique"
	| "editor.column.samples"
	| "editor.column.noSamples"
	| "editor.warning.mixed"
	| "editor.warning.mostlyEmpty"
	| "editor.warning.brokenImage"
	| "editor.type.text"
	| "editor.type.number"
	| "editor.type.date"
	| "editor.type.boolean"
	| "editor.type.tags"
	| "editor.type.link"
	| "editor.type.markdown"
	| "editor.type.image"
	| "editor.type.mixed"
	| "editor.autoLayout"
	| "editor.autoLayoutReplace"
	| "editor.autoLayoutConfirm"
	| "editor.row.choose"
	| "editor.row.first"
	| "editor.row.random"
	| "editor.row.longest"
	| "editor.row.mostEmpty"
	| "editor.reorder.up"
	| "editor.reorder.down"
	| "editor.reorder.moved"
	| "editor.reorder.empty"
	| "editor.inspector.columns"
	| "editor.inspector.type"
	| "editor.inspector.combine"
	| "editor.inspector.width"
	| "editor.inspector.visible"
	| "editor.inspector.showLabel"
	| "editor.inspector.mobile"
	| "editor.empty"
	| "editor.empty.hide"
	| "editor.empty.dash"
	| "editor.empty.custom"
	| "editor.empty.preserve"
	| "editor.empty.fallback"
	| "editor.empty.customText"
	| "editor.empty.tokens"
	| "editor.empty.required"
	| "editor.combine.all"
	| "editor.combine.first"
	| "editor.mobile.stack"
	| "editor.mobile.compact"
	| "editor.group.content"
	| "editor.group.layout"
	| "editor.group.typography"
	| "editor.group.appearance"
	| "editor.group.rules"
	| "editor.group.image"
	| "editor.height"
	| "editor.height.auto"
	| "editor.height.min"
	| "editor.height.fixed"
	| "editor.height.value"
	| "editor.overflow"
	| "editor.overflow.wrap"
	| "editor.overflow.shrink"
	| "editor.overflow.ellipsis"
	| "editor.overflow.scroll"
	| "editor.overflow.minFont"
	| "editor.overflow.lines"
	| "editor.align"
	| "editor.align.left"
	| "editor.align.center"
	| "editor.align.right"
	| "editor.appearance.inherit"
	| "editor.appearance.background"
	| "editor.appearance.text"
	| "editor.appearance.border"
	| "editor.image.fit"
	| "editor.image.contain"
	| "editor.image.cover"
	| "editor.image.aspect"
	| "editor.image.auto"
	| "editor.image.position"
	| "editor.image.top"
	| "editor.image.center"
	| "editor.image.bottom"
	| "editor.image.caption"
	| "editor.image.captionAlt"
	| "editor.image.captionColumn"
	| "editor.image.captionNone"
	| "editor.image.zoom"
	| "editor.resetBlock"
	| "editor.card.maxWidth"
	| "editor.card.window"
	| "editor.card.background"
	| "editor.card.primary"
	| "editor.card.secondary"
	| "editor.card.label"
	| "editor.card.accent"
	| "editor.card.borderColor"
	| "editor.resetCard"
	| "editor.color.invalid"
	| "editor.color.contrast"
	| "editor.color.aaa"
	| "editor.color.aa"
	| "editor.color.fail"
	| "editor.scan"
	| "editor.filesHint"
	| "editor.columns"
	| "editor.columnsHelp"
	| "editor.addColumn"
	| "editor.layout"
	| "editor.layoutHelp"
	| "editor.addBlock"
	| "editor.removeBlock"
	| "editor.dropColumns"
	| "editor.noColumns"
	| "editor.placeRest"
	| "editor.pickBlock"
	| "editor.label"
	| "editor.style.title"
	| "editor.style.chips"
	| "editor.style.text"
	| "editor.style.quote"
	| "editor.style.note"
	| "editor.style.image"
	| "editor.slot.main"
	| "editor.slot.side"
	| "editor.slot.full"
	| "notice.noCards"
	| "deck.new"
	| "preset.vocabulary"
	| "preset.vocabulary.desc"
	| "preset.phrases"
	| "preset.phrases.desc"
	| "preset.qa"
	| "preset.qa.desc"
	| "preset.gallery"
	| "preset.gallery.desc"
	| "preset.reference"
	| "preset.reference.desc"
	| "preset.universal"
	| "preset.universal.desc"
	| "preset.reason.header"
	| "preset.reason.type"
	| "preset.reason.image"
	| "preset.reason.coverage";

export const EN: Record<TranslationKey, string> = {
	"command.open": "Open cards",
	"ribbon.open": "Open cards",
	"modal.close": "Close",
	"modal.prev": "Previous",
	"modal.next": "Next",
	"modal.shuffle": "Shuffle",
	"modal.shuffleOn": "Shuffled",
	"modal.empty": "No cards in this deck. Check file paths and column names in the layout window.",
	"modal.deck": "Deck",
	"modal.progress": "Card position",
	"modal.image": "Image",
	"modal.imageMissing": "Image unavailable",
	"modal.imageZoom": "Open image",
	"modal.kicker": "Cards",
	"settings.language.name": "Language",
	"settings.language.desc": "Plugin interface language.",
	"settings.language.auto": "Auto (Obsidian)",
	"settings.language.en": "English",
	"settings.language.ru": "Русский",
	"settings.defaults": "Default appearance",
	"settings.appearance.preset": "Palette",
	"settings.appearance.preset.obsidian": "Obsidian theme",
	"settings.appearance.preset.monochrome": "Monochrome",
	"settings.appearance.preset.custom": "Custom",
	"settings.appearance.heading": "Look",
	"settings.appearance.desc": "Overlay, size, borders.",
	"settings.appearance.overlay": "Overlay",
	"settings.appearance.overlay.auto": "Auto — full on phone, centered on desktop",
	"settings.appearance.overlay.center": "Centered card",
	"settings.appearance.overlay.full": "Fullscreen",
	"settings.appearance.size": "Size preset",
	"settings.appearance.size.compact": "Compact",
	"settings.appearance.size.comfort": "Comfort",
	"settings.appearance.size.large": "Large",
	"settings.appearance.border": "Border",
	"settings.appearance.border.none": "None",
	"settings.appearance.border.thin": "Hairline",
	"settings.appearance.border.solid": "Solid",
	"settings.appearance.borderWidth": "Border width",
	"settings.appearance.radius": "Corner radius",
	"settings.appearance.padding": "Inner padding",
	"settings.appearance.gap": "Gap between blocks",
	"settings.appearance.wordScale": "Word size",
	"settings.appearance.shadow": "Card shadow",
	"settings.appearance.twoColumn": "Two columns on wide screens",
	"settings.appearance.twoColumnFrom": "Split from width",
	"settings.appearance.preview": "Preview",
	"settings.decks.heading": "Decks",
	"settings.decks.add": "Add deck",
	"settings.deck.enabled": "Enabled",
	"settings.deck.name": "Name",
	"settings.deck.files": "Files",
	"settings.deck.filesDesc": "One vault path per line.",
	"settings.deck.shuffle": "Shuffle by default",
	"settings.deck.delete": "Delete deck",
	"settings.deck.edit": "Edit layout",
	"settings.deck.deleteTitle": "Delete deck?",
	"settings.deck.deleteDesc": "This cannot be undone:",
	"settings.deck.cancel": "Cancel",
	"settings.deck.copySuffix": "copy",
	"settings.deck.duplicate": "Duplicate",
	"settings.deck.sources": "sources",
	"settings.deck.blocks": "blocks",
	"settings.deck.warnings": "warnings",
	"editor.title": "Card layout",
	"editor.backAction": "Back",
	"editor.save": "Save",
	"editor.saving": "Saving…",
	"editor.saveError": "Could not save the deck.",
	"editor.unsaved": "Unsaved changes",
	"editor.unsavedTitle": "Save changes?",
	"editor.unsavedDesc": "This deck has changes that have not been saved yet.",
	"editor.continue": "Continue editing",
	"editor.discard": "Discard",
	"editor.undo": "Undo",
	"editor.redo": "Redo",
	"editor.device.desktop": "Desktop preview",
	"editor.device.phone": "Phone preview",
	"editor.fields": "Fields",
	"editor.cardStyle": "Card style",
	"editor.widthHalf": "Half width",
	"editor.widthFull": "Full width",
	"editor.move": "Move",
	"editor.more": "More",
	"editor.loading": "Reading table data…",
	"editor.loadError": "Could not read table data.",
	"editor.closePanel": "Close panel",
	"editor.panel.fields": "Fields and data",
	"editor.panel.block": "Block",
	"editor.panel.card": "Card style",
	"editor.panel.reorder": "Reorder blocks",
	"editor.panelPlaceholder": "More controls are being prepared for this panel.",
	"editor.summary.columns": "columns",
	"editor.summary.rows": "rows",
	"editor.summary.warnings": "warnings",
	"editor.source.heading": "Data sources",
	"editor.source.file": "File",
	"editor.source.folder": "Folder",
	"editor.source.remove": "Remove source",
	"editor.source.addFile": "Add file",
	"editor.source.addFolder": "Add folder",
	"editor.source.pickFile": "Choose a note with a table",
	"editor.source.pickFolder": "Choose a folder",
	"editor.source.empty": "Add a note or folder to detect tables and columns.",
	"editor.table.all": "All tables",
	"editor.table.label": "Table",
	"editor.table.none": "No Markdown tables found.",
	"editor.table.missing": "The selected table has moved or its headers changed.",
	"editor.table.repair": "Show all tables",
	"editor.column.use": "Use in card",
	"editor.column.type": "Data type",
	"editor.column.confidence": "Confidence",
	"editor.column.unique": "Unique",
	"editor.column.samples": "Examples",
	"editor.column.noSamples": "No non-empty values.",
	"editor.warning.mixed": "Several data types found",
	"editor.warning.mostlyEmpty": "Mostly empty",
	"editor.warning.brokenImage": "Image file is missing",
	"editor.type.text": "Text",
	"editor.type.number": "Number",
	"editor.type.date": "Date",
	"editor.type.boolean": "Yes / no",
	"editor.type.tags": "Tags",
	"editor.type.link": "Link",
	"editor.type.markdown": "Markdown",
	"editor.type.image": "Image",
	"editor.type.mixed": "Mixed",
	"editor.autoLayout": "Create layout automatically",
	"editor.autoLayoutReplace": "Replace existing blocks:",
	"editor.autoLayoutConfirm": "Replace",
	"editor.row.choose": "Choose a preview row",
	"editor.row.first": "First row",
	"editor.row.random": "Random row",
	"editor.row.longest": "Longest content",
	"editor.row.mostEmpty": "Most empty",
	"editor.reorder.up": "Move up",
	"editor.reorder.down": "Move down",
	"editor.reorder.moved": "Moved to position",
	"editor.reorder.empty": "There are no blocks to reorder.",
	"editor.inspector.columns": "Columns",
	"editor.inspector.type": "Block type",
	"editor.inspector.combine": "Multiple columns",
	"editor.inspector.width": "Desktop width",
	"editor.inspector.visible": "Show block",
	"editor.inspector.showLabel": "Show label",
	"editor.inspector.mobile": "Phone density",
	"editor.empty": "When the cell is empty",
	"editor.empty.hide": "Hide the block",
	"editor.empty.dash": "Show a dash",
	"editor.empty.custom": "Custom text",
	"editor.empty.preserve": "Keep empty space",
	"editor.empty.fallback": "First non-empty column",
	"editor.empty.customText": "Text for an empty cell",
	"editor.empty.tokens": "Values treated as empty",
	"editor.empty.required": "Skip the row when empty",
	"editor.combine.all": "Show every value",
	"editor.combine.first": "First non-empty value",
	"editor.mobile.stack": "Comfortable",
	"editor.mobile.compact": "Compact",
	"editor.group.content": "Content",
	"editor.group.layout": "Size and overflow",
	"editor.group.typography": "Typography",
	"editor.group.appearance": "Colors and border",
	"editor.group.rules": "Empty-value rules",
	"editor.group.image": "Image",
	"editor.height": "Height",
	"editor.height.auto": "Fit content",
	"editor.height.min": "Minimum height",
	"editor.height.fixed": "Fixed height",
	"editor.height.value": "Height, px",
	"editor.overflow": "Long content",
	"editor.overflow.wrap": "Wrap onto new lines",
	"editor.overflow.shrink": "Shrink text",
	"editor.overflow.ellipsis": "Limit lines",
	"editor.overflow.scroll": "Scroll inside block",
	"editor.overflow.minFont": "Minimum font, px",
	"editor.overflow.lines": "Maximum lines",
	"editor.align": "Alignment",
	"editor.align.left": "Left",
	"editor.align.center": "Center",
	"editor.align.right": "Right",
	"editor.appearance.inherit": "Use card style",
	"editor.appearance.background": "Block background",
	"editor.appearance.text": "Block text",
	"editor.appearance.border": "Block border",
	"editor.image.fit": "Image fit",
	"editor.image.contain": "Fit without cropping",
	"editor.image.cover": "Fill and crop",
	"editor.image.aspect": "Aspect ratio",
	"editor.image.auto": "Automatic",
	"editor.image.position": "Crop focus",
	"editor.image.top": "Top",
	"editor.image.center": "Center",
	"editor.image.bottom": "Bottom",
	"editor.image.caption": "Caption",
	"editor.image.captionAlt": "Image description",
	"editor.image.captionColumn": "Column label",
	"editor.image.captionNone": "No caption",
	"editor.image.zoom": "Open image on tap",
	"editor.resetBlock": "Reset block",
	"editor.card.maxWidth": "Maximum card width",
	"editor.card.window": "Window background",
	"editor.card.background": "Card background",
	"editor.card.primary": "Primary text",
	"editor.card.secondary": "Secondary text",
	"editor.card.label": "Labels",
	"editor.card.accent": "Accent",
	"editor.card.borderColor": "Border color",
	"editor.resetCard": "Reset card style",
	"editor.color.invalid": "Use a six-digit hex color, for example #171717.",
	"editor.color.contrast": "Contrast",
	"editor.color.aaa": "AAA",
	"editor.color.aa": "AA",
	"editor.color.fail": "Below AA",
	"editor.scan": "Read columns",
	"editor.filesHint": "Paths to notes with tables. Then read columns and drag them onto blocks.",
	"editor.columns": "Table columns",
	"editor.columnsHelp": "Drag onto a block, or tap to add to the selected block.",
	"editor.addColumn": "Column name",
	"editor.layout": "Blocks",
	"editor.layoutHelp": "Drag blocks to reorder or move between front and back.",
	"editor.addBlock": "Add block",
	"editor.removeBlock": "Remove block",
	"editor.dropColumns": "Drop a column here",
	"editor.noColumns": "Read columns from the table first.",
	"editor.placeRest": "Place the rest on the back",
	"editor.pickBlock": "Select a block to change its look.",
	"editor.label": "Label",
	"editor.style.title": "Title",
	"editor.style.chips": "Chips",
	"editor.style.text": "Text",
	"editor.style.quote": "Quote",
	"editor.style.note": "Note",
	"editor.style.image": "Image",
	"editor.slot.main": "Left",
	"editor.slot.side": "Right",
	"editor.slot.full": "Full",
	"notice.noCards": "No cards found.",
	"deck.new": "New deck",
	"preset.vocabulary": "Vocabulary",
	"preset.vocabulary.desc": "Terms, translations, examples, notes, and images.",
	"preset.phrases": "Phrases",
	"preset.phrases.desc": "Phrases, translations, context, and notes.",
	"preset.qa": "Question and answer",
	"preset.qa.desc": "Questions, answers, explanations, and images.",
	"preset.gallery": "Gallery",
	"preset.gallery.desc": "Large images with titles, tags, and descriptions.",
	"preset.reference": "Reference",
	"preset.reference.desc": "A title with compact labeled properties.",
	"preset.universal": "Universal",
	"preset.universal.desc": "Every column in source order.",
	"preset.reason.header": "Column names match this layout",
	"preset.reason.type": "Detected data types fit this layout",
	"preset.reason.image": "Image content was detected",
	"preset.reason.coverage": "Most selected rows contain these fields",
};

export const RU: Record<TranslationKey, string> = {
	"command.open": "Открыть карточки",
	"ribbon.open": "Открыть карточки",
	"modal.close": "Закрыть",
	"modal.prev": "Назад",
	"modal.next": "Дальше",
	"modal.shuffle": "Перемешать",
	"modal.shuffleOn": "Перемешано",
	"modal.empty": "В колоде нет карточек. Проверь файлы и столбцы в окне раскладки.",
	"modal.deck": "Колода",
	"modal.progress": "Позиция карточки",
	"modal.image": "Изображение",
	"modal.imageMissing": "Изображение недоступно",
	"modal.imageZoom": "Открыть изображение",
	"modal.kicker": "Карточки",
	"settings.language.name": "Язык",
	"settings.language.desc": "Язык интерфейса плагина.",
	"settings.language.auto": "Авто (Obsidian)",
	"settings.language.en": "English",
	"settings.language.ru": "Русский",
	"settings.defaults": "Вид по умолчанию",
	"settings.appearance.preset": "Палитра",
	"settings.appearance.preset.obsidian": "Тема Obsidian",
	"settings.appearance.preset.monochrome": "Монохром",
	"settings.appearance.preset.custom": "Своя",
	"settings.appearance.heading": "Вид",
	"settings.appearance.desc": "Окно, размер, рамки.",
	"settings.appearance.overlay": "Окно",
	"settings.appearance.overlay.auto": "Авто — на весь экран на телефоне, по центру на компьютере",
	"settings.appearance.overlay.center": "Карточка по центру",
	"settings.appearance.overlay.full": "На весь экран",
	"settings.appearance.size": "Размер",
	"settings.appearance.size.compact": "Компакт",
	"settings.appearance.size.comfort": "Удобный",
	"settings.appearance.size.large": "Крупный",
	"settings.appearance.border": "Рамка",
	"settings.appearance.border.none": "Нет",
	"settings.appearance.border.thin": "Тонкая",
	"settings.appearance.border.solid": "Плотная",
	"settings.appearance.borderWidth": "Толщина рамки",
	"settings.appearance.radius": "Скругление",
	"settings.appearance.padding": "Внутренние поля",
	"settings.appearance.gap": "Расстояние между блоками",
	"settings.appearance.wordScale": "Размер слова",
	"settings.appearance.shadow": "Тень карточки",
	"settings.appearance.twoColumn": "Две колонки на широком экране",
	"settings.appearance.twoColumnFrom": "Делить начиная с ширины",
	"settings.appearance.preview": "Превью",
	"settings.decks.heading": "Колоды",
	"settings.decks.add": "Добавить колоду",
	"settings.deck.enabled": "Включена",
	"settings.deck.name": "Название",
	"settings.deck.files": "Файлы",
	"settings.deck.filesDesc": "По одному пути в vault на строку.",
	"settings.deck.shuffle": "Сразу перемешивать",
	"settings.deck.delete": "Удалить колоду",
	"settings.deck.edit": "Раскладка",
	"settings.deck.deleteTitle": "Удалить колоду?",
	"settings.deck.deleteDesc": "Это нельзя отменить:",
	"settings.deck.cancel": "Отмена",
	"settings.deck.copySuffix": "копия",
	"settings.deck.duplicate": "Дублировать",
	"settings.deck.sources": "источников",
	"settings.deck.blocks": "блоков",
	"settings.deck.warnings": "предупреждений",
	"editor.title": "Раскладка карточки",
	"editor.backAction": "Назад",
	"editor.save": "Сохранить",
	"editor.saving": "Сохранение…",
	"editor.saveError": "Не удалось сохранить колоду.",
	"editor.unsaved": "Есть изменения",
	"editor.unsavedTitle": "Сохранить изменения?",
	"editor.unsavedDesc": "В этой колоде остались несохранённые изменения.",
	"editor.continue": "Продолжить редактирование",
	"editor.discard": "Не сохранять",
	"editor.undo": "Отменить",
	"editor.redo": "Повторить",
	"editor.device.desktop": "Превью на компьютере",
	"editor.device.phone": "Превью на телефоне",
	"editor.fields": "Поля",
	"editor.cardStyle": "Стиль карточки",
	"editor.widthHalf": "Половина ширины",
	"editor.widthFull": "Вся ширина",
	"editor.move": "Переместить",
	"editor.more": "Ещё",
	"editor.loading": "Читаю данные таблицы…",
	"editor.loadError": "Не удалось прочитать данные таблицы.",
	"editor.closePanel": "Закрыть панель",
	"editor.panel.fields": "Поля и данные",
	"editor.panel.block": "Блок",
	"editor.panel.card": "Стиль карточки",
	"editor.panel.reorder": "Порядок блоков",
	"editor.panelPlaceholder": "Дополнительные настройки этой панели ещё загружаются.",
	"editor.summary.columns": "столбцов",
	"editor.summary.rows": "строк",
	"editor.summary.warnings": "предупреждений",
	"editor.source.heading": "Источники данных",
	"editor.source.file": "Файл",
	"editor.source.folder": "Папка",
	"editor.source.remove": "Удалить источник",
	"editor.source.addFile": "Добавить файл",
	"editor.source.addFolder": "Добавить папку",
	"editor.source.pickFile": "Выбери заметку с таблицей",
	"editor.source.pickFolder": "Выбери папку",
	"editor.source.empty": "Добавь заметку или папку — я определю таблицы и типы столбцов.",
	"editor.table.all": "Все таблицы",
	"editor.table.label": "Таблица",
	"editor.table.none": "Markdown-таблицы не найдены.",
	"editor.table.missing": "Выбранная таблица перемещена или её заголовки изменились.",
	"editor.table.repair": "Показать все таблицы",
	"editor.column.use": "Показывать в карточке",
	"editor.column.type": "Тип данных",
	"editor.column.confidence": "Уверенность",
	"editor.column.unique": "Уникальных",
	"editor.column.samples": "Примеры",
	"editor.column.noSamples": "Нет заполненных значений.",
	"editor.warning.mixed": "Встречаются разные типы данных",
	"editor.warning.mostlyEmpty": "Большинство ячеек пустые",
	"editor.warning.brokenImage": "Файл изображения не найден",
	"editor.type.text": "Текст",
	"editor.type.number": "Число",
	"editor.type.date": "Дата",
	"editor.type.boolean": "Да / нет",
	"editor.type.tags": "Теги",
	"editor.type.link": "Ссылка",
	"editor.type.markdown": "Markdown",
	"editor.type.image": "Изображение",
	"editor.type.mixed": "Смешанный",
	"editor.autoLayout": "Собрать раскладку автоматически",
	"editor.autoLayoutReplace": "Будут заменены блоки:",
	"editor.autoLayoutConfirm": "Заменить",
	"editor.row.choose": "Выбрать строку для превью",
	"editor.row.first": "Первая строка",
	"editor.row.random": "Случайная строка",
	"editor.row.longest": "Самый длинный текст",
	"editor.row.mostEmpty": "Больше всего пустых полей",
	"editor.reorder.up": "Поднять",
	"editor.reorder.down": "Опустить",
	"editor.reorder.moved": "Новая позиция",
	"editor.reorder.empty": "Перемещать пока нечего.",
	"editor.inspector.columns": "Столбцы",
	"editor.inspector.type": "Тип блока",
	"editor.inspector.combine": "Несколько столбцов",
	"editor.inspector.width": "Ширина на пк",
	"editor.inspector.visible": "Показывать блок",
	"editor.inspector.showLabel": "Показывать подпись",
	"editor.inspector.mobile": "Плотность на телефоне",
	"editor.empty": "Если ячейка пустая",
	"editor.empty.hide": "Скрыть блок",
	"editor.empty.dash": "Показать тире",
	"editor.empty.custom": "Свой текст",
	"editor.empty.preserve": "Оставить пустое место",
	"editor.empty.fallback": "Первый непустой столбец",
	"editor.empty.customText": "Текст для пустой ячейки",
	"editor.empty.tokens": "Что считать пустым",
	"editor.empty.required": "Пропускать строку, если пусто",
	"editor.combine.all": "Показывать все значения",
	"editor.combine.first": "Первое непустое значение",
	"editor.mobile.stack": "Удобно",
	"editor.mobile.compact": "Компактно",
	"editor.group.content": "Содержимое",
	"editor.group.layout": "Размер и переполнение",
	"editor.group.typography": "Текст",
	"editor.group.appearance": "Цвета и рамка",
	"editor.group.rules": "Правила пустых значений",
	"editor.group.image": "Изображение",
	"editor.height": "Высота",
	"editor.height.auto": "По содержимому",
	"editor.height.min": "Минимальная высота",
	"editor.height.fixed": "Фиксированная высота",
	"editor.height.value": "Высота, px",
	"editor.overflow": "Длинный текст",
	"editor.overflow.wrap": "Переносить строки",
	"editor.overflow.shrink": "Уменьшать текст",
	"editor.overflow.ellipsis": "Ограничить строки",
	"editor.overflow.scroll": "Скролл внутри блока",
	"editor.overflow.minFont": "Минимальный шрифт, px",
	"editor.overflow.lines": "Максимум строк",
	"editor.align": "Выравнивание",
	"editor.align.left": "Слева",
	"editor.align.center": "По центру",
	"editor.align.right": "Справа",
	"editor.appearance.inherit": "Использовать стиль карточки",
	"editor.appearance.background": "Фон блока",
	"editor.appearance.text": "Текст блока",
	"editor.appearance.border": "Рамка блока",
	"editor.image.fit": "Размещение изображения",
	"editor.image.contain": "Целиком, без обрезки",
	"editor.image.cover": "Заполнить с обрезкой",
	"editor.image.aspect": "Соотношение сторон",
	"editor.image.auto": "Автоматически",
	"editor.image.position": "Фокус обрезки",
	"editor.image.top": "Сверху",
	"editor.image.center": "По центру",
	"editor.image.bottom": "Снизу",
	"editor.image.caption": "Подпись",
	"editor.image.captionAlt": "Описание изображения",
	"editor.image.captionColumn": "Название столбца",
	"editor.image.captionNone": "Без подписи",
	"editor.image.zoom": "Открывать изображение по нажатию",
	"editor.resetBlock": "Сбросить блок",
	"editor.card.maxWidth": "Максимальная ширина карточки",
	"editor.card.window": "Фон окна",
	"editor.card.background": "Фон карточки",
	"editor.card.primary": "Основной текст",
	"editor.card.secondary": "Дополнительный текст",
	"editor.card.label": "Подписи",
	"editor.card.accent": "Акцент",
	"editor.card.borderColor": "Цвет рамки",
	"editor.resetCard": "Сбросить стиль карточки",
	"editor.color.invalid": "Нужен hex-цвет из шести цифр, например #171717.",
	"editor.color.contrast": "Контраст",
	"editor.color.aaa": "AAA",
	"editor.color.aa": "AA",
	"editor.color.fail": "Ниже AA",
	"editor.scan": "Считать столбцы",
	"editor.filesHint": "Пути к заметкам с таблицами. Потом считай столбцы и перетащи на блоки.",
	"editor.columns": "Столбцы таблицы",
	"editor.columnsHelp": "Перетащи на блок или нажми — попадёт в выбранный блок.",
	"editor.addColumn": "Имя столбца",
	"editor.layout": "Блоки",
	"editor.layoutHelp": "Тащи блоки, чтобы поменять порядок или лицо/оборот.",
	"editor.addBlock": "Добавить блок",
	"editor.removeBlock": "Удалить блок",
	"editor.dropColumns": "Брось столбец сюда",
	"editor.noColumns": "Сначала считай столбцы из таблицы.",
	"editor.placeRest": "Остальные — на оборот",
	"editor.pickBlock": "Выбери блок, чтобы сменить вид.",
	"editor.label": "Подпись",
	"editor.style.title": "Заголовок",
	"editor.style.chips": "Чипы",
	"editor.style.text": "Текст",
	"editor.style.quote": "Цитата",
	"editor.style.note": "Заметка",
	"editor.style.image": "Изображение",
	"editor.slot.main": "Слева",
	"editor.slot.side": "Справа",
	"editor.slot.full": "Во всю",
	"notice.noCards": "Карточек нет.",
	"deck.new": "Новая колода",
	"preset.vocabulary": "Словарь",
	"preset.vocabulary.desc": "Слова, переводы, примеры, заметки и изображения.",
	"preset.phrases": "Фразы",
	"preset.phrases.desc": "Фразы, переводы, контекст и заметки.",
	"preset.qa": "Вопрос и ответ",
	"preset.qa.desc": "Вопросы, ответы, пояснения и изображения.",
	"preset.gallery": "Галерея",
	"preset.gallery.desc": "Большие изображения с названиями, тегами и описаниями.",
	"preset.reference": "Справочник",
	"preset.reference.desc": "Название и компактные поля с подписями.",
	"preset.universal": "Универсальный",
	"preset.universal.desc": "Все столбцы в исходном порядке.",
	"preset.reason.header": "Названия столбцов подходят для этой раскладки",
	"preset.reason.type": "Определённые типы данных подходят для этой раскладки",
	"preset.reason.image": "Найдены изображения",
	"preset.reason.coverage": "Большинство выбранных строк заполнено",
};

const CATALOGS: Partial<Record<UiLocale, Record<TranslationKey, string>>> = { en: EN, ru: RU };

export function resolveUiLocale(mode: LocaleMode, obsidianLanguage: string): UiLocale {
	if (mode !== "auto") {
		return mode;
	}
	return obsidianLanguage.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export type Translator = (key: TranslationKey) => string;

export function createTranslator(locale: UiLocale): Translator {
	const catalog = CATALOGS[locale] ?? EN;
	return (key) => catalog[key];
}
