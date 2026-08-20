export function metaSeparator(parent: HTMLElement): void {
	parent.createSpan({ cls: "tc-meta-dot", text: "·", attr: { "aria-hidden": "true" } });
}
