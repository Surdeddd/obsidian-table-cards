import { setIcon, type App } from "obsidian";
import { autoLayout } from "../../layout";
import {
	newId,
	type ColumnDataType,
	type ColumnProfile,
	type DeckSource,
	type ParsedTable,
} from "../../model";
import { normalizeHeader } from "../../parse/tables";
import type { Translator } from "../../i18n";
import type { EditorAction, EditorState } from "../../editor/state";
import { Listbox } from "./controls/Listbox";
import { FolderPicker, MarkdownFilePicker } from "../sources/SourcePickers";
import { selectorMatchesTable, tableSelectedBySource, toggleSourceTable } from "../../deck/selectors";

const DATA_TYPES: ColumnDataType[] = [
	"text",
	"number",
	"date",
	"boolean",
	"tags",
	"link",
	"markdown",
	"image",
	"mixed",
];

export interface FieldsSheetContext {
	app: App;
	state: EditorState;
	tables: ParsedTable[];
	profiles: ColumnProfile[];
	rowCount: number;
	diagnostics: number;
	loading: boolean;
	t: Translator;
	dispatch: (action: EditorAction) => void;
}

function sourceTables(source: DeckSource, tables: ParsedTable[]): ParsedTable[] {
	if (source.kind === "file") return tables.filter((table) => table.sourcePath === source.path);
	const prefix = source.path.endsWith("/") ? source.path : `${source.path}/`;
	return tables.filter((table) => table.sourcePath.startsWith(prefix));
}

function columnEnabled(state: EditorState, header: string): boolean {
	const key = normalizeHeader(header);
	return state.draft.blocks.some((block) =>
		block.columns.some((column) => normalizeHeader(column) === key),
	);
}

function effectiveProfiles(state: EditorState, profiles: ColumnProfile[]): ColumnProfile[] {
	return profiles.map((profile) => ({
		...profile,
		inferredType:
			state.draft.columnTypes[normalizeHeader(profile.header)] ?? profile.inferredType,
	}));
}

function metric(parent: HTMLElement, value: number, label: string): void {
	const item = parent.createDiv({ cls: "tc-fields-metric" });
	item.createDiv({ cls: "tc-fields-metric-value", text: String(value) });
	item.createDiv({ cls: "tc-fields-metric-label", text: label });
}

function iconButton(
	parent: HTMLElement,
	label: string,
	icon: string,
	onClick: () => void,
): HTMLButtonElement {
	const button = parent.createEl("button", {
		cls: "tc-field-icon-button",
		attr: { type: "button", "aria-label": label },
	});
	setIcon(button, icon);
	button.addEventListener("click", onClick);
	return button;
}

function replaceSource(
	context: FieldsSheetContext,
	id: string,
	update: (source: DeckSource) => DeckSource,
): void {
	context.dispatch({
		type: "replaceSources",
		sources: context.state.draft.sources.map((source) => (source.id === id ? update(source) : source)),
	});
}

function renderSource(parent: HTMLElement, source: DeckSource, context: FieldsSheetContext): void {
	const card = parent.createDiv({ cls: "tc-source-card" });
	const header = card.createDiv({ cls: "tc-source-card-header" });
	const identity = header.createDiv({ cls: "tc-source-identity" });
	identity.createDiv({
		cls: "tc-source-kind",
		text: context.t(source.kind === "file" ? "editor.source.file" : "editor.source.folder"),
	});
	identity.createDiv({ cls: "tc-source-path", text: source.path });
	iconButton(header, context.t("editor.source.remove"), "trash-2", () => {
		context.dispatch({
			type: "replaceSources",
			sources: context.state.draft.sources.filter((item) => item.id !== source.id),
		});
	});

	const choices = card.createDiv({ cls: "tc-table-choices" });
	const all = choices.createEl("button", {
		cls: "tc-table-choice",
		text: context.t("editor.table.all"),
		attr: { type: "button", "aria-pressed": String(source.tables.mode === "all") },
	});
	all.addEventListener("click", () =>
		replaceSource(context, source.id, (item) => ({ ...item, tables: { mode: "all" } })),
	);

	const tables = sourceTables(source, context.tables);
	for (const table of tables) {
		const choice = choices.createEl("button", {
			cls: "tc-table-choice",
			attr: {
				type: "button",
				"aria-pressed": String(tableSelectedBySource(source, table)),
			},
		});
		choice.createSpan({ text: `${context.t("editor.table.label")} ${table.index + 1}` });
		choice.createSpan({ cls: "tc-table-choice-detail", text: table.headers.join(" · ") });
		choice.createSpan({
			cls: "tc-table-choice-count",
			text: `${table.rows.length} ${context.t("editor.summary.rows")}`,
		});
		choice.addEventListener("click", () =>
			replaceSource(context, source.id, (item) => toggleSourceTable(item, tables, table)),
		);
	}

	if (tables.length === 0 && !context.loading) {
		card.createDiv({ cls: "tc-field-empty", text: context.t("editor.table.none") });
	}
	if (
		source.tables.mode === "include" &&
		source.tables.selectors.some((selector) => !tables.some((table) => selectorMatchesTable(selector, table)))
	) {
		const repair = card.createDiv({ cls: "tc-field-warning" });
		repair.createSpan({ text: context.t("editor.table.missing") });
		const button = repair.createEl("button", {
			text: context.t("editor.table.repair"),
			attr: { type: "button" },
		});
		button.addEventListener("click", () =>
			replaceSource(context, source.id, (item) => ({ ...item, tables: { mode: "all" } })),
		);
	}
}

function renderProfile(parent: HTMLElement, profile: ColumnProfile, context: FieldsSheetContext): void {
	const details = parent.createEl("details", { cls: "tc-profile" });
	const summary = details.createEl("summary", { cls: "tc-profile-summary" });
	const use = summary.createEl("label", { cls: "tc-profile-use" });
	const checkbox = use.createEl("input", { type: "checkbox" });
	checkbox.checked = columnEnabled(context.state, profile.header);
	checkbox.setAttr("aria-label", `${context.t("editor.column.use")} ${profile.header}`);
	checkbox.addEventListener("click", (event) => event.stopPropagation());
	checkbox.addEventListener("change", () => {
		context.dispatch({ type: "setColumnEnabled", header: profile.header, enabled: checkbox.checked });
	});
	const identity = summary.createDiv({ cls: "tc-profile-identity" });
	identity.createDiv({ cls: "tc-profile-name", text: profile.header });
	identity.createDiv({
		cls: "tc-profile-fill",
		text: `${profile.nonEmpty} / ${profile.total}`,
	});
	summary.createSpan({
		cls: "tc-profile-type",
		text: context.t(`editor.type.${profile.inferredType}`),
	});
	for (const warning of profile.warnings) {
		summary.createSpan({
			cls: "tc-profile-warning-dot",
			attr: { role: "img", "aria-label": context.t(`editor.warning.${warning}`) },
		});
	}

	const body = details.createDiv({ cls: "tc-profile-body" });
	new Listbox(body, {
		id: `column-type-${normalizeHeader(profile.header).replace(/[^a-z0-9_-]/gi, "-")}`,
		label: context.t("editor.column.type"),
		value: profile.inferredType,
		options: DATA_TYPES.map((type) => ({ value: type, label: context.t(`editor.type.${type}`) })),
		searchable: true,
		onChange: (dataType) => context.dispatch({ type: "setColumnType", header: profile.header, dataType }),
	});

	const stats = body.createDiv({ cls: "tc-profile-stats" });
	stats.createSpan({
		text: `${context.t("editor.column.confidence")} ${Math.round(profile.confidence * 100)}%`,
	});
	stats.createSpan({ text: `${context.t("editor.column.unique")} ${profile.unique}` });

	if (profile.warnings.length > 0) {
		const warnings = body.createDiv({ cls: "tc-profile-warnings" });
		for (const warning of profile.warnings) {
			warnings.createSpan({ text: context.t(`editor.warning.${warning}`) });
		}
	}

	body.createDiv({ cls: "tc-profile-subtitle", text: context.t("editor.column.samples") });
	if (profile.samples.length === 0) {
		body.createDiv({ cls: "tc-field-empty", text: context.t("editor.column.noSamples") });
	} else {
		const samples = body.createEl("ul", { cls: "tc-profile-samples" });
		for (const sample of profile.samples) samples.createEl("li", { text: sample });
	}
}

export function renderFieldsSheet(parent: HTMLElement, context: FieldsSheetContext): void {
	const profiles = effectiveProfiles(context.state, context.profiles);
	const warningCount = profiles.reduce((total, profile) => total + profile.warnings.length, 0) + context.diagnostics;
	const summary = parent.createDiv({ cls: "tc-fields-summary" });
	metric(summary, profiles.length, context.t("editor.summary.columns"));
	metric(summary, context.rowCount, context.t("editor.summary.rows"));
	metric(summary, warningCount, context.t("editor.summary.warnings"));

	const sourceHeader = parent.createDiv({ cls: "tc-field-section-header" });
	sourceHeader.createEl("h3", { text: context.t("editor.source.heading") });
	const sourceActions = sourceHeader.createDiv({ cls: "tc-field-actions" });
	const addFile = sourceActions.createEl("button", {
		text: context.t("editor.source.addFile"),
		attr: { type: "button" },
	});
	addFile.addEventListener("click", () => {
		new MarkdownFilePicker(context.app, context.t("editor.source.pickFile"), (file) => {
			if (context.state.draft.sources.some((source) => source.kind === "file" && source.path === file.path)) return;
			context.dispatch({
				type: "replaceSources",
				sources: [
					...context.state.draft.sources,
					{ id: newId("source"), kind: "file", path: file.path, tables: { mode: "all" } },
				],
			});
		}).open();
	});
	const addFolder = sourceActions.createEl("button", {
		text: context.t("editor.source.addFolder"),
		attr: { type: "button" },
	});
	addFolder.addEventListener("click", () => {
		new FolderPicker(context.app, context.t("editor.source.pickFolder"), (folder) => {
			if (context.state.draft.sources.some((source) => source.kind === "folder" && source.path === folder.path)) return;
			context.dispatch({
				type: "replaceSources",
				sources: [
					...context.state.draft.sources,
					{ id: newId("source"), kind: "folder", path: folder.path, tables: { mode: "all" } },
				],
			});
		}).open();
	});

	if (context.state.draft.sources.length === 0) {
		parent.createDiv({ cls: "tc-field-empty", text: context.t("editor.source.empty") });
	} else {
		for (const source of context.state.draft.sources) renderSource(parent, source, context);
	}

	const columnsHeader = parent.createDiv({ cls: "tc-field-section-header" });
	columnsHeader.createEl("h3", { text: context.t("editor.columns") });
	if (context.loading) {
		parent.createDiv({ cls: "tc-field-empty", text: context.t("editor.loading") });
	} else if (profiles.length === 0) {
		parent.createDiv({ cls: "tc-field-empty", text: context.t("editor.noColumns") });
	} else {
		const list = parent.createDiv({ cls: "tc-profile-list" });
		for (const profile of profiles) renderProfile(list, profile, context);
	}

	const layout = parent.createDiv({ cls: "tc-auto-layout" });
	const apply = layout.createEl("button", {
		cls: "mod-cta",
		text: context.t("editor.autoLayout"),
		attr: { type: "button" },
	});
	apply.disabled = profiles.length === 0;
	const confirmation = layout.createDiv({
		cls: "tc-auto-layout-confirm",
		attr: { "aria-live": "polite" },
	});
	confirmation.hidden = true;
	const useLayout = (): void => {
		context.dispatch({ type: "replaceBlocks", blocks: autoLayout(profiles) });
	};
	confirmation.createDiv({
		text: `${context.t("editor.autoLayoutReplace")} ${context.state.draft.blocks.length}`,
	});
	const confirmActions = confirmation.createDiv({ cls: "tc-field-actions" });
	const cancel = confirmActions.createEl("button", {
		text: context.t("settings.deck.cancel"),
		attr: { type: "button" },
	});
	cancel.addEventListener("click", () => {
		confirmation.hidden = true;
	});
	const confirm = confirmActions.createEl("button", {
		cls: "mod-warning",
		text: context.t("editor.autoLayoutConfirm"),
		attr: { type: "button" },
	});
	confirm.addEventListener("click", useLayout);
	apply.addEventListener("click", () => {
		if (context.state.draft.blocks.length === 0) {
			useLayout();
			return;
		}
		confirmation.hidden = false;
		confirm.focus();
	});
}
