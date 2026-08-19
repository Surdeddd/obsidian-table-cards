import { stopObsidian } from "./harness/launch.mjs";

export default function globalTeardown(): void {
	const pid = Number(process.env["TABLE_CARDS_OBSIDIAN_PID"] ?? "");
	if (Number.isFinite(pid) && pid > 0) stopObsidian(pid);
}
