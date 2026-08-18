import { Notice } from "obsidian";
import type { Translator } from "../i18n";

export interface SettingsUpdateFeedback {
	update: () => Promise<void>;
	refresh: () => void;
	t: Translator;
	onSuccess?: () => void;
}

export async function runSettingsUpdate(feedback: SettingsUpdateFeedback): Promise<void> {
	let saved = false;
	try {
		await feedback.update();
		saved = true;
	} catch {
		new Notice(feedback.t("settings.saveError"));
	}
	feedback.refresh();
	if (saved) feedback.onSuccess?.();
}
