"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { CustomLoadoutEntry } from "@/lib/user-config/schema";

type Tab = "paste" | "url" | "absorb";

type Props = {
	customSkills: CustomLoadoutEntry[];
	onAdded?: () => void;
};

type AddResult = {
	ok: boolean;
	skill?: { slug: string; name: string; path: string };
	installLog?: string;
	installOk?: boolean;
	error?: string;
};

export function AddSkillPanel({ customSkills, onAdded }: Props) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<Tab>("paste");
	const [pending, setPending] = useState(false);
	const [result, setResult] = useState<AddResult | null>(null);

	const [slug, setSlug] = useState("");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [content, setContent] = useState("");
	const [url, setUrl] = useState("");

	const resetForm = useCallback(() => {
		setSlug("");
		setName("");
		setDescription("");
		setContent("");
		setUrl("");
	}, []);

	const clearResult = useCallback(() => {
		setResult(null);
	}, []);

	const submit = useCallback(async () => {
		setPending(true);
		setResult(null);
		try {
			const res = await fetch("/api/dashboard/skills/add", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode: tab,
					slug: slug.trim() || undefined,
					name: name.trim() || undefined,
					description: description.trim() || undefined,
					content: tab === "paste" ? content : undefined,
					url: tab !== "paste" ? url.trim() : undefined,
				}),
			});
			const body = (await res.json()) as AddResult & { error?: string; phase?: string };
			if (!res.ok || body.ok === false) {
				setResult({ ok: false, error: body.error ?? `HTTP ${res.status}` });
				return;
			}
			setResult({
				ok: true,
				skill: body.skill,
				installLog: body.installLog,
				installOk: body.installOk,
			});
			resetForm();
			onAdded?.();
		} catch (err) {
			setResult({
				ok: false,
				error: err instanceof Error ? err.message : "request failed",
			});
		} finally {
			setPending(false);
		}
	}, [tab, slug, name, description, content, url, onAdded, resetForm]);

	return (
		<div className="space-y-4 px-6 pt-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<ReticleLabel>YOUR SKILLS</ReticleLabel>
					<p className="mt-1 max-w-[60ch] text-[12px] text-[var(--ret-text-dim)]">
						Paste a SKILL.md, import from a URL, or absorb a doc/article into a new skill on your machine.
						Bundled library skills sync from{" "}
						<code className="font-mono text-[11px]">knowledge/skills/</code>; yours live under{" "}
						<code className="font-mono text-[11px]">~/.agent-machines/skills/custom/</code>.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link
						href="/dashboard/registry"
						className="border border-[var(--ret-border)] px-3 py-1.5 font-mono text-[11px] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-purple)]/40 hover:text-[var(--ret-text)]"
					>
						browse registry
					</Link>
					<ReticleButton
						variant="primary"
						size="sm"
						onClick={() => {
							setOpen((v) => !v);
							if (open) {
								resetForm();
								clearResult();
							}
						}}
					>
						{open ? "close" : "+ add skill"}
					</ReticleButton>
				</div>
			</div>

			{customSkills.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{customSkills.map((skill) => (
						<ReticleBadge key={skill.id} variant="success">
							{skill.name}
						</ReticleBadge>
					))}
				</div>
			) : null}

			{open ? (
				<ReticleFrame>
					<div className="p-4">
						<div className="flex flex-wrap gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
							{(
								[
									["paste", "Paste SKILL.md"],
									["url", "Import URL"],
									["absorb", "Absorb link"],
								] as const
							).map(([id, label]) => (
								<button
									key={id}
									type="button"
									onClick={() => setTab(id)}
									className={cn(
										"px-3 py-1.5 font-mono text-[11px] transition-colors",
										tab === id
											? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
											: "bg-[var(--ret-bg)] text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]",
									)}
								>
									{label}
								</button>
							))}
						</div>

						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<label className="block">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									Slug (optional)
								</span>
								<input
									value={slug}
									onChange={(e) => setSlug(e.target.value)}
									placeholder="my-workflow"
									className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-2 font-mono text-[11px] text-[var(--ret-text)]"
								/>
							</label>
							<label className="block">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									Display name (optional)
								</span>
								<input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="My workflow"
									className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-2 font-mono text-[11px] text-[var(--ret-text)]"
								/>
							</label>
						</div>

						{tab === "paste" ? (
							<label className="mt-3 block">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									SKILL.md content
								</span>
								<textarea
									value={content}
									onChange={(e) => setContent(e.target.value)}
									rows={12}
									placeholder={"---\nname: my-skill\ndescription: When to use this skill\n---\n\n# Instructions\n..."}
									className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--ret-text)]"
								/>
							</label>
						) : (
							<label className="mt-3 block">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{tab === "url" ? "Skill URL" : "Page URL to absorb"}
								</span>
								<input
									type="url"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder={
										tab === "url"
											? "https://github.com/owner/repo or raw SKILL.md URL"
											: "https://docs.example.com/guide or blog post URL"
									}
									className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-2 font-mono text-[11px] text-[var(--ret-text)]"
								/>
								<p className="mt-1.5 text-[11px] text-[var(--ret-text-muted)]">
									{tab === "url"
										? "Imports an existing SKILL.md from GitHub or a direct markdown URL."
										: "Fetches the page, extracts text, and wraps it as a skill the agent can load on matching tasks."}
								</p>
							</label>
						)}

						<label className="mt-3 block">
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								Description override (optional)
							</span>
							<input
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="When the agent should load this skill"
								className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-2 font-mono text-[11px] text-[var(--ret-text)]"
							/>
						</label>

						<div className="mt-4 flex flex-wrap items-center gap-3">
							<ReticleButton
								variant="primary"
								size="sm"
								disabled={pending}
								onClick={() => void submit()}
							>
								{pending ? (
									<BrailleSpinner name="cascade" label="Installing" className="text-sm" />
								) : (
									"Install on machine"
								)}
							</ReticleButton>
						</div>

						{result ? (
							<div className="mt-4 space-y-2 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3">
								{result.ok ? (
									<>
										<ReticleBadge variant={result.installOk ? "success" : "warning"}>
											{result.installOk ? "installed" : "saved — machine offline"}
										</ReticleBadge>
										{result.skill ? (
											<p className="font-mono text-[11px] text-[var(--ret-text-dim)]">
												{result.skill.name} → {result.skill.path}
											</p>
										) : null}
									</>
								) : (
									<p className="font-mono text-[11px] text-[var(--ret-red)]">{result.error}</p>
								)}
								{result.installLog ? (
									<pre className="max-h-32 overflow-auto font-mono text-[10px] text-[var(--ret-text-muted)]">
										{result.installLog.trim()}
									</pre>
								) : null}
							</div>
						) : null}
					</div>
				</ReticleFrame>
			) : null}
		</div>
	);
}
