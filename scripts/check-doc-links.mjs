import { access, readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const root = resolve(process.cwd());
const markdownFiles = ["README.md", "README.ru.md", "CHANGELOG.md"];
const accepted403 = new Map([
	[
		"https://help.quizlet.com/hc/en-us/articles/360029638892-Combining-study-sets",
		"Quizlet blocks curl; browser verification confirmed the current Help Center article",
	],
]);

async function collectMarkdown(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) await collectMarkdown(path);
		else if (entry.isFile() && entry.name.endsWith(".md")) markdownFiles.push(path.slice(root.length + 1));
	}
}

function destinations(markdown) {
	let fenced = false;
	const links = [];
	for (const line of markdown.split("\n")) {
		if (/^\s*```/.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		for (const match of line.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) links.push(match[1]);
	}
	return links;
}

function curlStatus(url) {
	return new Promise((resolveStatus, reject) => {
		const curl = spawn("curl", [
			"-L",
			"--max-time", "30",
			"--output", "/dev/null",
			"--silent",
			"--show-error",
			"--write-out", "%{http_code}",
			url,
		]);
		let output = "";
		let error = "";
		curl.stdout.on("data", (chunk) => { output += chunk; });
		curl.stderr.on("data", (chunk) => { error += chunk; });
		curl.on("error", reject);
		curl.on("close", (code) => {
			if (code !== 0) reject(new Error(error.trim() || `curl exited ${code}`));
			else resolveStatus(Number.parseInt(output, 10));
		});
	});
}

await collectMarkdown(join(root, "docs"));
const localLinks = new Map();
const externalLinks = new Set();
for (const file of markdownFiles) {
	const markdown = await readFile(join(root, file), "utf8");
	for (const destination of destinations(markdown)) {
		if (/^https?:\/\//.test(destination)) externalLinks.add(destination);
		else if (!destination.startsWith("#") && !destination.startsWith("mailto:")) {
			const path = decodeURIComponent(destination.split("#", 1)[0]);
			localLinks.set(`${file} -> ${destination}`, resolve(dirname(join(root, file)), path));
		}
	}
}

let failed = false;
for (const [label, path] of localLinks) {
	try {
		await access(path);
		process.stdout.write(`OK local ${label}\n`);
	} catch {
		failed = true;
		process.stderr.write(`FAIL local ${label}\n`);
	}
}
for (const url of Array.from(externalLinks).sort()) {
	try {
		const status = await curlStatus(url);
		if (status >= 200 && status < 400) process.stdout.write(`OK ${status} ${url}\n`);
		else if (status === 403 && accepted403.has(url)) {
			process.stdout.write(`EXCEPTION 403 ${url} — ${accepted403.get(url)}\n`);
		}
		else {
			failed = true;
			process.stderr.write(`FAIL ${status} ${url}\n`);
		}
	} catch (error) {
		failed = true;
		process.stderr.write(`FAIL curl ${url}: ${error instanceof Error ? error.message : String(error)}\n`);
	}
}

if (failed) process.exitCode = 1;
