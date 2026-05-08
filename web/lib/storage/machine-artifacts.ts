/**
 * Artifact persistence on the user's active Dedalus machine.
 *
 * Layout on the VM:
 *   ~/.agent-machines/artifacts/_index.json    -- ArtifactRef[] (newest first)
 *   ~/.agent-machines/artifacts/<id>/_meta.json -- ArtifactRef
 *   ~/.agent-machines/artifacts/<id>/<filename> -- raw bytes
 *
 * Downloads stream through `/api/dashboard/artifacts/[id]/download`,
 * which fetches the bytes via the execution API and pipes them back
 * to the browser. There's no public CDN URL like Vercel Blob gave us;
 * artifacts are private to the user's machine and only the signed-in
 * owner can fetch them.
 */

import { Buffer } from "node:buffer";

import {
	APP_DATA_ROOT,
	deletePath,
	ensureAppDataLayout,
	readBytes,
	readJsonFile,
	writeFile,
	writeJsonFile,
} from "./machine-fs";

export type ArtifactRef = {
	id: string;
	name: string;
	mime: string;
	bytes: number;
	chatId: string | null;
	createdAt: string;
};

const ARTIFACTS_DIR = `${APP_DATA_ROOT}/artifacts`;
const ARTIFACTS_INDEX = `${ARTIFACTS_DIR}/_index.json`;

function safeName(name: string): string {
	const base = name
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
	return base.length > 0 ? base : "artifact";
}

function safeId(id: string): string {
	const v = id.replace(/[^a-zA-Z0-9_-]/g, "");
	if (v.length === 0) throw new Error("invalid artifact id");
	return v;
}

function artifactDir(id: string): string {
	return `${ARTIFACTS_DIR}/${safeId(id)}`;
}

function artifactMeta(id: string): string {
	return `${artifactDir(id)}/_meta.json`;
}

function artifactPath(id: string, name: string): string {
	return `${artifactDir(id)}/${safeName(name)}`;
}

export async function listArtifacts(): Promise<ArtifactRef[]> {
	const index = await readJsonFile<ArtifactRef[]>(ARTIFACTS_INDEX);
	if (index && Array.isArray(index)) {
		return [...index].sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt),
		);
	}
	return [];
}

export async function loadArtifactBytes(
	id: string,
): Promise<{ ref: ArtifactRef; bytes: Buffer } | null> {
	const ref = await readJsonFile<ArtifactRef>(artifactMeta(id));
	if (!ref) return null;
	const bytes = await readBytes(artifactPath(id, ref.name));
	if (!bytes) return null;
	return { ref, bytes };
}

export async function saveArtifact(args: {
	id: string;
	name: string;
	mime: string;
	body: Buffer;
	chatId?: string;
}): Promise<ArtifactRef> {
	await ensureAppDataLayout();
	const ref: ArtifactRef = {
		id: safeId(args.id),
		name: args.name,
		mime: args.mime,
		bytes: args.body.byteLength,
		chatId: args.chatId ?? null,
		createdAt: new Date().toISOString(),
	};
	await writeFile(artifactPath(ref.id, ref.name), args.body);
	await writeJsonFile(artifactMeta(ref.id), ref);
	const existing = (await listArtifacts()).filter((a) => a.id !== ref.id);
	await writeJsonFile(ARTIFACTS_INDEX, [ref, ...existing]);
	return ref;
}

export async function deleteArtifact(id: string): Promise<void> {
	await deletePath(artifactDir(id));
	const existing = (await listArtifacts()).filter((a) => a.id !== id);
	await writeJsonFile(ARTIFACTS_INDEX, existing);
}
