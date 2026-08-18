export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffleItems<T>(items: T[], seed: number): T[] {
	const next = mulberry32(seed);
	const result = items.slice();
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		const current = result[i];
		const swap = result[j];
		if (current === undefined || swap === undefined) {
			continue;
		}
		result[i] = swap;
		result[j] = current;
	}
	return result;
}

export function wrapIndex(index: number, length: number): number {
	if (length <= 0) {
		return 0;
	}
	return ((index % length) + length) % length;
}
