export function rangePercent(value: number, min: number, max: number): number {
	if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
	return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function paintRangeInput(input: HTMLInputElement): void {
	const min = Number(input.min || "0");
	const max = Number(input.max || "100");
	input.style.setProperty("--tc-range-pct", `${rangePercent(Number(input.value), min, max)}%`);
}
