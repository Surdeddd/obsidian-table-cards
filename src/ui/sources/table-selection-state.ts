import type { TableSelector } from "../../model";
import { tableKey } from "../../deck/catalog";

export interface TableSelectionInteraction {
	query: string;
	expandedKeys: string[];
	scrollTop: number;
	focusedCheckboxKey: string | null;
}

export function stableTableSelectionKey(sourcePath: string, selector: TableSelector): string {
	return tableKey(sourcePath, selector);
}

export function reconcileTableSelectionInteraction(
	state: TableSelectionInteraction,
	liveKeys: ReadonlySet<string>,
): TableSelectionInteraction {
	return {
		...state,
		expandedKeys: state.expandedKeys.filter((key) => liveKeys.has(key)),
		focusedCheckboxKey: state.focusedCheckboxKey && liveKeys.has(state.focusedCheckboxKey)
			? state.focusedCheckboxKey
			: null,
	};
}
