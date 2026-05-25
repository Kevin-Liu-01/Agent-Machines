/**
 * Artifact persistence on the user's active machine.
 */

import { Buffer } from "node:buffer";

import {
	deletePath,
	ensureAppDataLayout,
	readBytes,
	readJsonFile,
	writeFile,
	writeJsonFile,
	type MachineStorageContext,
} from "./machine-fs";

export type ArtifactRef = {
	id: string;
	name: string;
	mime: string;
	bytes: number;
	chatId: string | null;
	createdAt: string;
};

function artifactsDir(ctx: MachineStorageContext): string {
	return `${ctx.appDataRoot}/artifacts`;
}

function artifactsIndex(ctx: MachineStorageContext): string {
	return `${artifactsDir(ctx)}/_index.json`;
}

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

function artifactDir(id: string, ctx: MachineStorageContext): string {
	return `${artifactsDir(ctx)}/${safeId(id)}`;
}

function artifactMeta(id: string, ctx: MachineStorageContext): string {
	return `${artifactDir(id, ctx)}/_meta.json`;
}

function artifactPath(id: string, name: string, ctx: MachineStorageContext): string {
	return `${artifactDir(id, ctx)}/${safeName(name)}`;
}

export async function listArtifacts(ctx: MachineStorageContext): Promise<ArtifactRef[]> {
	const index = await readJsonFile<ArtifactRef[]>(artifactsIndex(ctx), ctx);
	if (index && Array.isArray(index)) {
		return [...index].sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt),
		);
	}
	return [];
}

export async function loadArtifactBytes(
	id: string,
	ctx: MachineStorageContext,
): Promise<{ ref: ArtifactRef; bytes: Buffer } | null> {
	const ref = await readJsonFile<ArtifactRef>(artifactMeta(id, ctx), ctx);
	if (!ref) return null;
	const bytes = await readBytes(artifactPath(id, ref.name, ctx), ctx);
	if (!bytes) return null;
	return { ref, bytes };
}

export async function saveArtifact(
	args: {
		id: string;
		name: string;
		mime: string;
		body: Buffer;
		chatId?: string;
	},
	ctx: MachineStorageContext,
): Promise<ArtifactRef> {
	await ensureAppDataLayout(ctx);
	const ref: ArtifactRef = {
		id: safeId(args.id),
		name: args.name,
		mime: args.mime,
		bytes: args.body.byteLength,
		chatId: args.chatId ?? null,
		createdAt: new Date().toISOString(),
	};
	await writeFile(artifactPath(ref.id, ref.name, ctx), args.body, ctx);
	await writeJsonFile(artifactMeta(ref.id, ctx), ref, ctx);
	const existing = (await listArtifacts(ctx)).filter((a) => a.id !== ref.id);
	await writeJsonFile(artifactsIndex(ctx), [ref, ...existing], ctx);
	return ref;
}

export async function deleteArtifact(
	id: string,
	ctx: MachineStorageContext,
): Promise<void> {
	await deletePath(artifactDir(id, ctx), ctx);
	const existing = (await listArtifacts(ctx)).filter((a) => a.id !== id);
	await writeJsonFile(artifactsIndex(ctx), existing, ctx);
}
