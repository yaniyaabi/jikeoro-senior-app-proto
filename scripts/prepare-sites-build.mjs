import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDirectory = join(projectRoot, "dist");
const clientDirectory = join(distDirectory, "client");
const serverDirectory = join(distDirectory, "server");

await mkdir(clientDirectory, { recursive: true });

for (const entry of await readdir(distDirectory, { withFileTypes: true })) {
  if ([".openai", "client", "server"].includes(entry.name)) continue;
  await cp(join(distDirectory, entry.name), join(clientDirectory, entry.name), {
    recursive: true,
  });
}

const worker = `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
`;

await mkdir(serverDirectory, { recursive: true });
await writeFile(join(serverDirectory, "index.js"), worker, "utf8");
