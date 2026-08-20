import { formatUiNumber, type Translator } from "../i18n";
import type { DeckDiagnostic, UiLocale } from "../model";

export interface DiagnosticReport {
	messages: string[];
	unexplained: number;
}

export function describeDiagnostics(
	diagnostics: readonly DeckDiagnostic[],
	t: Translator,
	locale: UiLocale,
): DiagnosticReport {
	const missingSources: string[] = [];
	let tableMissing = 0;
	let requiredEmpty = 0;
	let brokenImage = 0;
	let unexplained = 0;

	for (const diagnostic of diagnostics) {
		switch (diagnostic.code) {
			case "sourceMissing":
				if (!missingSources.includes(diagnostic.sourcePath)) missingSources.push(diagnostic.sourcePath);
				break;
			case "tableMissing":
				tableMissing += 1;
				break;
			case "requiredEmpty":
				requiredEmpty += 1;
				break;
			case "brokenImage":
				brokenImage += 1;
				break;
			default:
				unexplained += 1;
		}
	}

	const messages = missingSources.map((path) => t("diagnostic.sourceMissing", { path }));
	if (tableMissing > 0) messages.push(t("diagnostic.tableMissing"));
	if (requiredEmpty > 0) {
		messages.push(t("diagnostic.requiredEmpty", { count: formatUiNumber(requiredEmpty, locale) }));
	}
	if (brokenImage > 0) {
		messages.push(t("diagnostic.brokenImage", { count: formatUiNumber(brokenImage, locale) }));
	}
	return { messages, unexplained };
}
