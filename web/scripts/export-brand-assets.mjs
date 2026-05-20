/**
 * Export Agent Machines logo PNGs from SVG + cloud/nyx background plates.
 * Mirrors the dedalus-logo / dedalus-ring-* asset layout.
 *
 *   pnpm --dir web export-brand
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND = path.resolve(__dirname, "../public/brand");
const APP = path.resolve(__dirname, "../app");
const PUBLIC = path.resolve(__dirname, "../public");

const LOGO_SIZE = 1024;
const RING_SIZE = 512;
/** Fraction of canvas width/height for the mark on cloud/nyx composites. */
const MARK_SCALE = 1;

const ASSETS = [
	{ svg: "agent-machines-mark-dark.svg", out: "agent-machines-mark.png" },
	{ svg: "agent-machines-mark.svg", out: "agent-machines-mark-light.png" },
];

const COMPOSITES = [
	{
		bg: "bg-cloud-lines.png",
		svg: "agent-machines-mark-dark.svg",
		out: "agent-machines-logo.png",
	},
	{
		bg: "bg-nyx-lines.png",
		svg: "agent-machines-mark.svg",
		out: "agent-machines-logo-dark.png",
	},
	{
		bg: "bg-cloud-lines.png",
		svg: "agent-machines-mark-dark.svg",
		out: "agent-machines-ring-cloud.png",
		size: RING_SIZE,
	},
	{
		bg: "bg-nyx-lines.png",
		svg: "agent-machines-mark.svg",
		out: "agent-machines-ring-nyx.png",
		size: RING_SIZE,
	},
	{
		bg: "bg-nyx-waves.png",
		svg: "agent-machines-mark.svg",
		out: "agent-machines-icon-nyx-waves.png",
		size: RING_SIZE,
	},
];

async function rasterizeSvg(svgPath, size) {
	const svg = readFileSync(svgPath);
	return sharp(svg, { density: 400 })
		.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
}

async function writeTransparent(svgName, outName) {
	const svgPath = path.join(BRAND, svgName);
	const outPath = path.join(BRAND, outName);
	const buf = await rasterizeSvg(svgPath, LOGO_SIZE);
	writeFileSync(outPath, buf);
	console.log(`wrote ${outName} (${LOGO_SIZE}px)`);
}

async function writeComposite({ bg, svg, out, size = LOGO_SIZE }) {
	const bgPath = path.join(BRAND, bg);
	const svgPath = path.join(BRAND, svg);
	const outPath = path.join(BRAND, out);
	const markSize = Math.round(size * MARK_SCALE);
	const mark = await rasterizeSvg(svgPath, markSize);
	const left = Math.round((size - markSize) / 2);
	const top = Math.round((size - markSize) / 2);
	const buf = await sharp(bgPath)
		.resize(size, size, { fit: "cover", position: "center" })
		.composite([{ input: mark, left, top }])
		.png()
		.toBuffer();
	writeFileSync(outPath, buf);
	console.log(`wrote ${out} (${size}px, ${bg} + ${svg})`);
}

/** Favicon bundle from mark + bg-nyx-waves (browser tab + Apple touch). */
async function writeFavicons() {
	const iconWaves = path.join(BRAND, "agent-machines-icon-nyx-waves.png");
	const source = sharp(iconWaves);
	await source.clone().png().toFile(path.join(APP, "icon.png"));
	await source.clone().resize(180, 180).png().toFile(path.join(APP, "apple-icon.png"));
	const [fav16, fav32] = await Promise.all([
		source.clone().resize(16, 16).png().toBuffer(),
		source.clone().resize(32, 32).png().toBuffer(),
	]);
	writeFileSync(path.join(PUBLIC, "favicon.ico"), await toIco([fav16, fav32]));
	console.log(
		"wrote app/icon.png, app/apple-icon.png, public/favicon.ico (from icon-nyx-waves)",
	);
}

async function main() {
	for (const { svg, out } of ASSETS) {
		await writeTransparent(svg, out);
	}
	for (const spec of COMPOSITES) {
		await writeComposite(spec);
	}
	await writeFavicons();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
