import type { StudyScope, TableCatalogItem } from "../model";
import { normalizeVaultPath } from "./selectors";

export interface TableIdentity {
	path: string | null;
	signature: string;
	occurrence: number;
}

export interface RepairedScope {
	scope: StudyScope;
	missing: number;
}

const MIN_OVERLAP = 0.5;

function tokens(signature: string): Set<string> {
	return new Set(signature.split("\u001f").filter(Boolean));
}

function overlap(left: Set<string>, right: Set<string>): number {
	if (left.size === 0 || right.size === 0) return 0;
	let shared = 0;
	for (const token of left) if (right.has(token)) shared += 1;
	return shared / (left.size + right.size - shared);
}

function samePath(candidate: string | null, target: string | null): boolean {
	if (target === null) return true;
	if (candidate === null) return false;
	return normalizeVaultPath(candidate) === normalizeVaultPath(target);
}

function exactIndex(target: TableIdentity, live: readonly TableIdentity[], taken: Set<number>): number | null {
	for (let index = 0; index < live.length; index += 1) {
		const candidate = live[index];
		if (!candidate || taken.has(index)) continue;
		if (
			candidate.signature === target.signature &&
			candidate.occurrence === target.occurrence &&
			samePath(candidate.path, target.path)
		) {
			return index;
		}
	}
	return null;
}

function similarIndex(target: TableIdentity, live: readonly TableIdentity[], taken: Set<number>): number | null {
	const wanted = tokens(target.signature);
	let best = -1;
	let bestScore = 0;
	let tied = false;
	for (let index = 0; index < live.length; index += 1) {
		const candidate = live[index];
		if (!candidate || taken.has(index) || !samePath(candidate.path, target.path)) continue;
		const score = overlap(wanted, tokens(candidate.signature));
		if (score > bestScore) {
			best = index;
			bestScore = score;
			tied = false;
		} else if (score === bestScore && best >= 0) {
			tied = true;
		}
	}
	return bestScore >= MIN_OVERLAP && !tied ? best : null;
}

export function matchStaleTables(
	targets: readonly TableIdentity[],
	live: readonly TableIdentity[],
): (number | null)[] {
	const taken = new Set<number>();
	const matches: (number | null)[] = targets.map(() => null);
	targets.forEach((target, position) => {
		const exact = exactIndex(target, live, taken);
		if (exact === null) return;
		taken.add(exact);
		matches[position] = exact;
	});
	targets.forEach((target, position) => {
		if (matches[position] !== null) return;
		const similar = similarIndex(target, live, taken);
		if (similar === null) return;
		taken.add(similar);
		matches[position] = similar;
	});
	return matches;
}

export function parseTableKey(key: string): TableIdentity | null {
	const parts = key.split("\u0000");
	if (parts.length !== 3) return null;
	const occurrence = Number.parseInt(parts[2] ?? "", 10);
	if (!Number.isFinite(occurrence)) return null;
	return { path: parts[0] ?? "", signature: parts[1] ?? "", occurrence };
}

export function repairScope(scope: StudyScope, catalog: readonly TableCatalogItem[]): RepairedScope {
	if (scope.mode !== "tables") return { scope, missing: 0 };

	const live = catalog.map((item) => ({
		path: item.sourcePath,
		signature: item.selector.headerSignature,
		occurrence: item.selector.occurrence,
	}));
	const parsed = scope.tableKeys.map((key) => parseTableKey(key));
	const targets = parsed.filter((identity): identity is TableIdentity => identity !== null);
	const matches = matchStaleTables(targets, live);

	const keys: string[] = [];
	let missing = parsed.length - targets.length;
	matches.forEach((index) => {
		const item = index === null ? undefined : catalog[index];
		if (!item) {
			missing += 1;
			return;
		}
		if (!keys.includes(item.key)) keys.push(item.key);
	});
	if (keys.length === scope.tableKeys.length && keys.every((key, position) => key === scope.tableKeys[position])) {
		return { scope, missing };
	}
	return { scope: { mode: "tables", tableKeys: keys }, missing };
}
