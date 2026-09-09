/**
 * Artifact persistence on the user's active machine.
 */

import { Buffer } from "node:buffer";
import { execOnMachine } from "@/lib/dashboard/exec";
import { artifactInventoryCommand } from "./artifact-inventory";

import {
	ensureAppDataLayout,
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
	sourcePath?: string;
	runKey?: string;
	sha256?: string;
};

function artifactsDir(ctx: MachineStorageContext): string {
	return `${ctx.appDataRoot}/artifacts`;
}

function safeName(name: string): string {
	const base = name
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
	return base.length > 0 ? base : "artifact";
}

function safeId(id: string): string {
	if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error("invalid artifact id");
	return id;
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

async function inventory<T>(ctx: MachineStorageContext, action: "list" | "read" | "delete", id?: string): Promise<T> {
	if (id !== undefined) safeId(id);
	const result = await execOnMachine(artifactInventoryCommand({ root: ctx.appDataRoot, action, id }), { machineId: ctx.machineId, timeoutMs: 20_000 });
	if (result.exitCode !== 0) throw new Error(`Artifact ${action} failed: ${result.stderr.slice(-500) || `exit ${result.exitCode}`}`);
	return JSON.parse(result.stdout) as T;
}

export async function listArtifactInventory(ctx: MachineStorageContext): Promise<{ artifacts: ArtifactRef[]; warnings: string[] }> {
	return inventory(ctx, "list");
}

export async function listArtifacts(ctx: MachineStorageContext): Promise<ArtifactRef[]> {
	return (await listArtifactInventory(ctx)).artifacts;
}

export async function loadArtifactBytes(
	id: string,
	ctx: MachineStorageContext,
): Promise<{ ref: ArtifactRef; bytes: Buffer } | null> {
	const result = await inventory<{ found: false } | { found: true; ref: ArtifactRef; body: string }>(ctx, "read", id);
	return result.found ? { ref: result.ref, bytes: Buffer.from(result.body, "base64") } : null;
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
	return ref;
}

export async function deleteArtifact(
	id: string,
	ctx: MachineStorageContext,
): Promise<void> {
	await inventory(ctx, "delete", id);
}
