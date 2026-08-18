import type { TranslationKey } from "../i18n";
import { createBlock, type BlockKind, type Card, type CardBlock, type ColumnDataType, type ColumnProfile, type RibbonIcon } from "../model";
import { normalizeHeader } from "../parse/table-scanner";

export type PresetId = "vocabulary" | "phrases" | "qa" | "gallery" | "reference" | "universal";

export interface PresetDefinition {
	id: PresetId;
	nameKey: TranslationKey;
	descriptionKey: TranslationKey;
	icon: RibbonIcon;
	tieOrder: number;
}

export interface PresetScore {
	id: PresetId;
	score: number;
	reasons: TranslationKey[];
}

type Role = keyof typeof ROLE_ALIASES;
type SpecializedPresetId = Exclude<PresetId, "universal">;

const ROLE_ALIASES = {
	term: ["word", "term", "vocabulary", "слово", "термин", "лексема", "слово українською"],
	translation: ["translation", "meaning", "definition", "перевод", "значение", "переклад", "визначення"],
	pronunciation: ["ipa", "pronunciation", "transcription", "phonetic", "транскрипция", "произношение", "вимова"],
	phrase: ["phrase", "expression", "idiom", "фраза", "выражение", "вислів"],
	question: ["question", "prompt", "вопрос", "запитання"],
	answer: ["answer", "response", "ответ", "відповідь"],
	example: ["example", "sentence", "usage", "пример", "предложение", "приклад", "речення"],
	context: ["context", "situation", "literal", "контекст", "ситуация", "буквально"],
	note: ["note", "hint", "mnemonic", "comment", "explanation", "заметка", "подсказка", "мнемоника", "примечание", "объяснение", "нотатка", "пояснення"],
	image: ["image", "picture", "photo", "cover", "изображение", "картинка", "фото", "зображення"],
	title: ["title", "name", "heading", "название", "имя", "заголовок", "назва"],
	tags: ["tag", "tags", "label", "category", "тег", "теги", "категория", "мітка", "мітки"],
	description: ["description", "details", "описание", "детали", "опис", "подробиці"],
} as const;

const PRESET_ROLE_WEIGHTS: Record<SpecializedPresetId, Partial<Record<Role, number>>> = {
	vocabulary: { term: 5, translation: 4, pronunciation: 1, example: 2, note: 1, image: 1 },
	phrases: { phrase: 5, translation: 3, example: 2, context: 2, note: 1 },
	qa: { question: 5, answer: 5, note: 2, image: 1 },
	gallery: { image: 6, title: 3, tags: 2, description: 2 },
	reference: { title: 2, tags: 1 },
} as const;

export const PRESETS: readonly PresetDefinition[] = [
	{ id: "vocabulary", nameKey: "preset.vocabulary", descriptionKey: "preset.vocabulary.desc", icon: "languages", tieOrder: 2 },
	{ id: "phrases", nameKey: "preset.phrases", descriptionKey: "preset.phrases.desc", icon: "message-square-quote", tieOrder: 3 },
	{ id: "qa", nameKey: "preset.qa", descriptionKey: "preset.qa.desc", icon: "circle-help", tieOrder: 4 },
	{ id: "gallery", nameKey: "preset.gallery", descriptionKey: "preset.gallery.desc", icon: "image", tieOrder: 5 },
	{ id: "reference", nameKey: "preset.reference", descriptionKey: "preset.reference.desc", icon: "book-open", tieOrder: 1 },
	{ id: "universal", nameKey: "preset.universal", descriptionKey: "preset.universal.desc", icon: "layers-3", tieOrder: 0 },
] as const;

function isWordContinuation(value: string): boolean {
	return /[\p{L}\p{N}\p{M}\p{Pc}]/u.test(value);
}

function neighboringCodePoint(source: string, index: number, direction: "before" | "after"): string {
	if (direction === "before") return Array.from(source.slice(0, index)).at(-1) ?? "";
	return Array.from(source.slice(index))[0] ?? "";
}

function matchesAlias(header: string, alias: string): boolean {
	const normalizedAlias = normalizeHeader(alias);
	let start = header.indexOf(normalizedAlias);
	while (start >= 0) {
		const end = start + normalizedAlias.length;
		const before = neighboringCodePoint(header, start, "before");
		const after = neighboringCodePoint(header, end, "after");
		if (!isWordContinuation(before) && !isWordContinuation(after)) {
			return true;
		}
		start = header.indexOf(normalizedAlias, end);
	}
	return false;
}

function headerRoles(profile: ColumnProfile): Role[] {
	const header = normalizeHeader(profile.header);
	return (Object.keys(ROLE_ALIASES) as Role[]).filter((role) =>
		ROLE_ALIASES[role].some((alias) => matchesAlias(header, alias)),
	);
}

function inferredRoles(profile: ColumnProfile): Role[] {
	if (profile.inferredType === "image") return ["image"];
	if (profile.inferredType === "tags") return ["tags"];
	return [];
}

function rolesFor(profile: ColumnProfile): Role[] {
	return Array.from(new Set([...headerRoles(profile), ...inferredRoles(profile)]));
}

function isUnused(profile: ColumnProfile, used: Set<string>): boolean {
	return !used.has(normalizeHeader(profile.header));
}

export function takeHeader(
	profiles: ColumnProfile[],
	used: Set<string>,
	roles: readonly Role[],
	inferredType?: ColumnDataType,
): string | undefined {
	const profile = profiles.find((candidate) =>
		isUnused(candidate, used) &&
		(rolesFor(candidate).some((role) => roles.includes(role)) || candidate.inferredType === inferredType),
	);
	if (!profile) return undefined;
	used.add(normalizeHeader(profile.header));
	return profile.header;
}

export function remainingProfiles(profiles: ColumnProfile[], used: Set<string>): ColumnProfile[] {
	return profiles.filter((profile) => isUnused(profile, used));
}

function takeHeaders(profiles: ColumnProfile[], used: Set<string>, roles: readonly Role[]): string[] {
	const headers: string[] = [];
	for (const profile of profiles) {
		if (!isUnused(profile, used) || !rolesFor(profile).some((role) => roles.includes(role))) continue;
		used.add(normalizeHeader(profile.header));
		headers.push(profile.header);
	}
	return headers;
}

function fillRate(profile: ColumnProfile): number {
	return profile.nonEmpty / Math.max(profile.total, 1);
}

function roundScore(score: number): number {
	return Math.round(score * 1000) / 1000;
}

interface ScoreEvidence {
	headerRoles: Set<Role>;
	inferredRoles: Set<Role>;
}

function meanFillRate(profiles: ColumnProfile[]): number {
	return profiles.length ? profiles.reduce((sum, profile) => sum + fillRate(profile), 0) / profiles.length : 0;
}

function scoreEvidence(
	profiles: ColumnProfile[],
	weights: Partial<Record<Role, number>>,
): ScoreEvidence {
	const evidence: ScoreEvidence = { headerRoles: new Set(), inferredRoles: new Set() };
	for (const profile of profiles) {
		for (const role of headerRoles(profile)) {
			if (weights[role]) evidence.headerRoles.add(role);
		}
		for (const role of inferredRoles(profile)) {
			if (weights[role]) evidence.inferredRoles.add(role);
		}
	}
	return evidence;
}

function scoreReasons(evidence: ScoreEvidence, rawScore: number, meanFill: number): TranslationKey[] {
	const reasons: TranslationKey[] = [];
	if (evidence.headerRoles.size > 0) reasons.push("preset.reason.header");
	if (evidence.inferredRoles.size > 0) reasons.push("preset.reason.type");
	if (evidence.inferredRoles.has("image")) reasons.push("preset.reason.image");
	if (rawScore > 0 && meanFill >= 0.75) reasons.push("preset.reason.coverage");
	return reasons;
}

export function scorePreset(id: PresetId, profiles: ColumnProfile[]): PresetScore {
	if (id === "universal") {
		return { id, score: 1, reasons: [] };
	}

	const weights = PRESET_ROLE_WEIGHTS[id];
	const evidence = scoreEvidence(profiles, weights);
	const matchedRoles = new Set([...evidence.headerRoles, ...evidence.inferredRoles]);
	const rawScore = Array.from(matchedRoles).reduce((sum, role) => sum + (weights[role] ?? 0), 0)
		+ (id === "reference" ? Math.min(4, Math.max(0, profiles.length - 2)) : 0);
	const meanFill = meanFillRate(profiles);
	return {
		id,
		score: roundScore(rawScore * (0.75 + 0.25 * meanFill)),
		reasons: scoreReasons(evidence, rawScore, meanFill),
	};
}

export function rankPresets(profiles: ColumnProfile[]): PresetScore[] {
	const scored = PRESETS.filter((preset) => preset.id !== "universal").map((preset) => scorePreset(preset.id, profiles));
	const highestSpecialized = Math.max(0, ...scored.map((preset) => preset.score));
	const universal = scorePreset("universal", profiles);
	if (highestSpecialized < 3) universal.score = roundScore(highestSpecialized + 0.001);
	return [...scored, universal].sort((left, right) => {
		if (right.score !== left.score) return right.score - left.score;
		return PRESETS.find((preset) => preset.id === left.id)!.tieOrder - PRESETS.find((preset) => preset.id === right.id)!.tieOrder;
	});
}

function inferredKind(profile: ColumnProfile): BlockKind {
	if (profile.inferredType === "image") return "image";
	if (profile.inferredType === "tags" || profile.inferredType === "boolean") return "chips";
	return "text";
}

function newPresetBlock(presetId: PresetId, index: number, kind: BlockKind, columns: string[], width: "half" | "full" = "full", showLabel = kind !== "title" && kind !== "chips"): CardBlock {
	return createBlock({
		id: `block-${presetId}-${index + 1}`,
		kind,
		columns,
		width,
		showLabel,
		label: showLabel ? (columns[0] ?? "") : "",
		empty: { mode: "hide", customText: "", emptyTokens: ["", "-", "—", "n/a", "null"], required: kind === "title" },
	});
}

function addBlock(blocks: CardBlock[], presetId: PresetId, kind: BlockKind, columns: Array<string | undefined>, width?: "half" | "full", showLabel?: boolean): void {
	const present = columns.filter((header): header is string => Boolean(header));
	if (present.length > 0) blocks.push(newPresetBlock(presetId, blocks.length, kind, present, width, showLabel));
}

function addRemaining(blocks: CardBlock[], presetId: PresetId, profiles: ColumnProfile[], used: Set<string>, width: "half" | "full" = "full"): void {
	for (const profile of remainingProfiles(profiles, used)) {
		used.add(normalizeHeader(profile.header));
		addBlock(blocks, presetId, inferredKind(profile), [profile.header], width, true);
	}
}

function titleFor(profiles: ColumnProfile[], used: Set<string>, roles: readonly Role[]): string | undefined {
	return takeHeader(profiles, used, roles);
}

export function blocksForPreset(id: PresetId, profiles: ColumnProfile[], _representative?: Card): CardBlock[] {
	const used = new Set<string>();
	const blocks: CardBlock[] = [];

	switch (id) {
		case "vocabulary":
			addBlock(blocks, id, "title", [titleFor(profiles, used, ["term", "title"])], "half");
			addBlock(blocks, id, "text", [takeHeader(profiles, used, ["translation"])]);
			addBlock(blocks, id, "chips", takeHeaders(profiles, used, ["pronunciation", "tags"]), "half");
			addBlock(blocks, id, "quote", [takeHeader(profiles, used, ["example"])]);
			addBlock(blocks, id, "note", [takeHeader(profiles, used, ["note"])]);
			addBlock(blocks, id, "image", [takeHeader(profiles, used, ["image"], "image")]);
			addRemaining(blocks, id, profiles, used);
			break;
		case "phrases":
			addBlock(blocks, id, "title", [titleFor(profiles, used, ["phrase", "title"])], "half");
			addBlock(blocks, id, "text", [takeHeader(profiles, used, ["translation"])]);
			addBlock(blocks, id, "quote", [takeHeader(profiles, used, ["context", "example"])]);
			addBlock(blocks, id, "note", [takeHeader(profiles, used, ["note"])]);
			addRemaining(blocks, id, profiles, used);
			break;
		case "qa":
			addBlock(blocks, id, "title", [titleFor(profiles, used, ["question", "title"])], "half");
			addBlock(blocks, id, "text", [takeHeader(profiles, used, ["answer"])]);
			addBlock(blocks, id, "note", [takeHeader(profiles, used, ["note"])]);
			addBlock(blocks, id, "image", [takeHeader(profiles, used, ["image"], "image")]);
			addRemaining(blocks, id, profiles, used);
			break;
		case "gallery":
			addBlock(blocks, id, "image", [takeHeader(profiles, used, ["image"], "image")]);
			addBlock(blocks, id, "title", [titleFor(profiles, used, ["title", "term"])], "half");
			addBlock(blocks, id, "chips", takeHeaders(profiles, used, ["tags"]), "half");
			addBlock(blocks, id, "text", [takeHeader(profiles, used, ["description"])]);
			addRemaining(blocks, id, profiles, used);
			break;
		case "reference":
			addBlock(blocks, id, "title", [titleFor(profiles, used, ["title", "term"])], "full");
			addRemaining(blocks, id, profiles, used, "half");
			break;
		case "universal": {
			const title = titleFor(profiles, used, ["title", "term", "question", "phrase"])
				?? profiles.find((profile) => isUnused(profile, used) && profile.inferredType !== "image")?.header;
			if (title && !used.has(normalizeHeader(title))) used.add(normalizeHeader(title));
			addBlock(blocks, id, "title", [title], "half");
			addRemaining(blocks, id, profiles, used);
			break;
		}
	}

	return blocks;
}
