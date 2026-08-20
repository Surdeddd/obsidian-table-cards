import type { DeckSource } from "../model";
import { normalizeVaultPath } from "./selectors";

function movedPath(path: string, from: string, to: string): string | null {
	const current = normalizeVaultPath(path);
	if (current === from) return to;
	return current.startsWith(`${from}/`) ? `${to}${current.slice(from.length)}` : null;
}

export function renamedDeckSources(
	sources: readonly DeckSource[],
	oldPath: string,
	newPath: string,
): DeckSource[] | null {
	const from = normalizeVaultPath(oldPath);
	const to = normalizeVaultPath(newPath);
	if (!from || !to || from === to) return null;

	let changed = false;
	const next = sources.map((source) => {
		const moved = movedPath(source.path, from, to);
		if (moved === null) return source;
		changed = true;
		return { ...source, path: moved };
	});
	return changed ? next : null;
}
