import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.TABLE_CARDS_PREVIEW_PORT ?? "4173", 10);
/** @type {Record<string, string>} */
const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
};

createServer(async (request, response) => {
	try {
		const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
		let target = resolve(root, `.${pathname}`);
		if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Path outside preview root");
		const metadata = await stat(target);
		if (metadata.isDirectory()) target = resolve(target, "index.html");
		response.writeHead(200, {
			"Cache-Control": "no-store",
			"Content-Type": contentTypes[extname(target)] ?? "application/octet-stream",
			"X-Table-Cards-Preview-Root": root,
		});
		createReadStream(target).pipe(response);
	} catch {
		response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		response.end("Not found");
	}
}).listen(port, "127.0.0.1", () => {
	process.stdout.write(`Table Cards preview: http://127.0.0.1:${port}/preview/\n`);
});
