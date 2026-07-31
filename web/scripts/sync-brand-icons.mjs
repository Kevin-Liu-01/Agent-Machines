import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const iconDir = path.join(webRoot, "public", "brand", "thesvg");
const manifestPath = path.join(iconDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

for (const icon of manifest.icons) {
  const source = `${manifest.source}/icons/${icon.slug}/${icon.variant}.svg`;
  const response = await fetch(source, {
    headers: { "user-agent": "agent-machines-icon-sync/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${source}: ${response.status}`);
  }
  const svg = await response.text();
  if (!svg.trimStart().startsWith("<svg") && !svg.trimStart().startsWith("<?xml")) {
    throw new Error(`Unexpected icon response for ${source}`);
  }
  await writeFile(path.join(iconDir, icon.file), svg.endsWith("\n") ? svg : `${svg}\n`);
  console.log(`synced ${icon.slug}/${icon.variant} -> ${icon.file}`);
}
