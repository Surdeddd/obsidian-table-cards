import { autoLayout } from "../../layout";
import { formatUiNumber, type Translator } from "../../i18n";
import {
	type ColumnDataType,
	type ColumnProfile,
	type UiLocale,
} from "../../model";
import { normalizeHeader } from "../../parse/tables";
import type { EditorAction, EditorState } from "../../editor/state";
import { Listbox } from "./controls/Listbox";

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

export interface ProfilesSectionContext {
	state: EditorState;
	profiles: ColumnProfile[];
	loading: boolean;
	locale: UiLocale;
	t: Translator;
	dispatch: (action: EditorAction) => void;
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

function renderProfile(
	parent: HTMLElement,
	profile: ColumnProfile,
	context: ProfilesSectionContext,
): void {
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
	identity.createDiv({ cls: "tc-profile-name", text: profile.header, attr: { dir: "auto" } });
	identity.createDiv({
		cls: "tc-profile-fill",
		text: `${formatUiNumber(profile.nonEmpty, context.locale)} / ${formatUiNumber(profile.total, context.locale)}`,
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
		text: `${context.t("editor.column.confidence")} ${formatUiNumber(Math.round(profile.confidence * 100), context.locale)}%`,
	});
	stats.createSpan({
		text: `${context.t("editor.column.unique")} ${formatUiNumber(profile.unique, context.locale)}`,
	});

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
		const samples = body.createEl("ul", { cls: "tc-profile-samples", attr: { dir: "auto" } });
		for (const sample of profile.samples) samples.createEl("li", { text: sample });
	}
}

export function renderProfilesSection(parent: HTMLElement, context: ProfilesSectionContext): void {
	const profiles = effectiveProfiles(context.state, context.profiles);
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
		text: `${context.t("editor.autoLayoutReplace")} ${formatUiNumber(context.state.draft.blocks.length, context.locale)}`,
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
