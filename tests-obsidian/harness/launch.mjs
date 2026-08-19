import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

export const OBSIDIAN_BINARY =
	process.env.OBSIDIAN_APP ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";

export const CDP_PORT = Number(process.env.OBSIDIAN_CDP_PORT ?? 9333);

export async function obsidianAvailable() {
	try {
		await access(OBSIDIAN_BINARY);
		return true;
	} catch {
		return false;
	}
}

async function cdpReady(port) {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/json/version`);
		return response.ok;
	} catch {
		return false;
	}
}

export async function launchObsidian({ userDataPath }, port = CDP_PORT) {
	const child = spawn(
		OBSIDIAN_BINARY,
		[`--user-data-dir=${userDataPath}`, `--remote-debugging-port=${port}`],
		{ stdio: "ignore", detached: true },
	);
	child.unref();
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		if (await cdpReady(port)) return { pid: child.pid, port };
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Obsidian did not expose CDP on port ${port}`);
}

export function stopObsidian(pid) {
	if (!pid) return;
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		/* already gone */
	}
}
