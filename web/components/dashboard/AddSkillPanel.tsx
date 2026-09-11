"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
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
	const submittingRef = useRef(false);

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

	const submit = useCallback(async () => {
		if (submittingRef.current || !(tab === "paste" ? content.trim() : url.trim())) return;
		submittingRef.current = true;
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
			if (!res.ok || body.ok !== true) {
				setResult({ ok: false, error: body.error ?? (!res.ok ? `HTTP ${res.status}` : "The server did not confirm the skill was saved.") });
				return;
			}
			setResult({
				ok: true,
				skill: body.skill,
				installLog: body.installLog,
				installOk: body.installOk,
			});
			// Account metadata does not contain the pasted instructions. Keep the
			// full draft until the server confirms the machine file was installed.
			if (body.installOk === true) resetForm();
			onAdded?.();
		} catch (err) {
			setResult({
				ok: false,
				error: err instanceof Error ? err.message : "request failed",
			});
		} finally {
			submittingRef.current = false;
			setPending(false);
		}
	}, [tab, slug, name, description, content, url, onAdded, resetForm]);

	return (
		<div className={cn("space-y-4 px-[var(--dashboard-gutter,20px)] pt-6")}>
			<div className={cn("flex flex-wrap items-center justify-between gap-3")}>
				<div>
					<h2 className={cn("text-lg font-medium")}>Custom skills</h2>
					<p className={cn("mt-1 max-w-[78ch] text-sm leading-6 text-[var(--ret-text-muted)]")}>
						Paste instructions or import a link. Installation requires your selected machine to be running. Account metadata is saved first; pasted instructions are not stored in account settings.
					</p>
				</div>
				<div className={cn("flex flex-wrap gap-2")}>
					<Link
						href="/dashboard/registry"
						aria-disabled={pending || undefined}
						tabIndex={pending ? -1 : undefined}
						onClick={(event) => { if (submittingRef.current) event.preventDefault(); }}
						className={cn("rounded-md border border-[var(--ret-border)] px-3 py-1.5 text-sm text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-purple)]/40 hover:text-[var(--ret-text)] aria-disabled:cursor-wait aria-disabled:opacity-50")}
					>
						Browse registry
					</Link>
					<ReticleButton
						variant="primary"
						size="sm"
						disabled={pending}
						aria-expanded={open}
						aria-controls="add-custom-skill-form"
						onClick={() => {
							if (submittingRef.current) return;
							setOpen((v) => !v);
						}}
					>
						{open ? "Close" : "Add skill"}
					</ReticleButton>
				</div>
			</div>

			{customSkills.length > 0 ? (
				<div aria-label="Saved skill metadata" className={cn("flex flex-wrap gap-2")}>
					{customSkills.map((skill) => (
						<ReticleBadge key={skill.id}>
							{skill.name}
						</ReticleBadge>
					))}
				</div>
			) : null}

			{open ? (
				<ReticleFrame>
					<fieldset id="add-custom-skill-form" disabled={pending} aria-busy={pending} aria-label="Add a custom skill" className={cn("min-w-0 p-4")}>
						<div className={cn("flex flex-wrap gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]")}>
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
									disabled={pending}
									aria-pressed={tab === id}
									onClick={() => {
										if (submittingRef.current) return;
										setTab(id);
										setResult(null);
									}}
									className={cn(
										"px-3 py-1.5 font-mono text-[13px] transition-colors",
										tab === id
											? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
											: "bg-[var(--ret-bg)] text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]",
									)}
								>
									{label}
								</button>
							))}
						</div>

						<div className={cn("mt-4 grid gap-3 md:grid-cols-2")}>
							<label className={cn("block")}>
								<span className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
									Slug (optional)
								</span>
								<input
									value={slug}
									onChange={(e) => setSlug(e.target.value)}
									placeholder="my-workflow"
									className={cn("mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] min-h-11 rounded-md px-3 py-2 text-base text-[var(--ret-text)]")}
								/>
							</label>
							<label className={cn("block")}>
								<span className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
									Display name (optional)
								</span>
								<input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="My workflow"
									className={cn("mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] min-h-11 rounded-md px-3 py-2 text-base text-[var(--ret-text)]")}
								/>
							</label>
						</div>

						{tab === "paste" ? (
							<label className={cn("mt-3 block")}>
								<span className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
									SKILL.md content
								</span>
								<textarea
									value={content}
									onChange={(e) => setContent(e.target.value)}
									rows={12}
									placeholder={"---\nname: my-skill\ndescription: When to use this skill\n---\n\n# Instructions\n..."}
									className={cn("mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 font-mono text-sm leading-relaxed text-[var(--ret-text)]")}
								/>
							</label>
						) : (
							<label className={cn("mt-3 block")}>
								<span className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
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
									className={cn("mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] min-h-11 rounded-md px-3 py-2 text-base text-[var(--ret-text)]")}
								/>
								<p className={cn("mt-1.5 text-sm text-[var(--ret-text-muted)]")}>
									{tab === "url"
										? "Imports an existing SKILL.md from GitHub or a direct markdown URL."
										: "Fetches the page, extracts text, and wraps it as a skill the agent can load on matching tasks."}
								</p>
							</label>
						)}

						<label className={cn("mt-3 block")}>
							<span className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
								Description override (optional)
							</span>
							<input
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="When the agent should load this skill"
								className={cn("mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] min-h-11 rounded-md px-3 py-2 text-base text-[var(--ret-text)]")}
							/>
						</label>

						<div className={cn("mt-4 flex flex-wrap items-center gap-3")}>
							<ReticleButton
								variant="primary"
								size="sm"
								disabled={pending || !(tab === "paste" ? content.trim() : url.trim())}
								onClick={() => void submit()}
							>
								{pending ? (
									<BrailleSpinner name="cascade" label="Saving and installing" className={cn("text-sm")} />
								) : (
									"Save and install"
								)}
							</ReticleButton>
						</div>

						{result ? (
							<div role={result.ok ? "status" : "alert"} aria-live="polite" className={cn("mt-4 space-y-3 rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4")}>
								{result.ok ? (
									<>
										<ReticleBadge variant={result.installOk === true ? "success" : "warning"}>
											{result.installOk === true ? "Installed on machine" : "Metadata saved · not installed"}
										</ReticleBadge>
										{result.installOk !== true ? <p className={cn("text-sm leading-6 text-[var(--ret-text-muted)]")}>Your input is still here. Start or select a running machine, resolve any error below, then submit again. Nothing is queued for automatic installation.</p> : null}
										{result.skill ? (
											<p className={cn("font-mono text-sm text-[var(--ret-text-dim)]")}>
												{result.skill.name} · {result.installOk === true ? "Installed path" : "Intended path"}: {result.skill.path}
											</p>
										) : null}
									</>
								) : (
									<><p className={cn("text-sm text-[var(--ret-red)]")}>{result.error}</p><p className={cn("text-sm leading-6 text-[var(--ret-text-muted)]")}>The result could not be confirmed. Your input is still here; check the account and machine before retrying.</p></>
								)}
								{result.installLog ? (
									<pre className={cn("max-h-32 overflow-auto font-mono text-sm text-[var(--ret-text-muted)]")}>
										{result.installLog.trim()}
									</pre>
								) : null}
							</div>
						) : null}
					</fieldset>
				</ReticleFrame>
			) : null}
		</div>
	);
}
