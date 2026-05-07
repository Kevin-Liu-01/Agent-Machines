import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { findSkill, listSkills } from "@/lib/dashboard/skills";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
	return listSkills().map((s) => ({ slug: s.slug }));
}

export default async function SkillDetailPage({
	params,
}: {
	params: Promise<Params>;
}) {
	const { slug } = await params;
	const skill = findSkill(slug);
	if (!skill) notFound();

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`SKILL -- ${skill.category.toUpperCase()}`}
				title={skill.slug}
				description={skill.description}
				right={
					<ReticleButton as="a" href="/dashboard/skills" variant="ghost" size="sm">
						<span aria-hidden>{"<-"}</span>
						<span className="ml-1.5">All skills</span>
					</ReticleButton>
				}
			/>
			<div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_220px]">
				<article className="prose-msg max-w-none rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-6 md:p-8">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>
						{skill.body}
					</ReactMarkdown>
				</article>
				<aside className="flex flex-col gap-4">
					<MetaBlock title="metadata">
						<MetaRow label="version" value={skill.version || "--"} />
						<MetaRow label="bytes" value={`${skill.bytes}`} />
						<MetaRow label="category" value={skill.category} />
					</MetaBlock>
					{skill.tags.length > 0 ? (
						<MetaBlock title="tags">
							<div className="flex flex-wrap gap-1.5">
								{skill.tags.map((t) => (
									<span
										key={t}
										className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ret-text-dim)]"
									>
										{t}
									</span>
								))}
							</div>
						</MetaBlock>
					) : null}
					{skill.related.length > 0 ? (
						<MetaBlock title="related skills">
							<ul className="flex flex-col gap-1">
								{skill.related.map((slug) => (
									<li key={slug}>
										<Link
											href={`/dashboard/skills/${slug}`}
											className="font-mono text-[11px] text-[var(--ret-purple)] hover:underline"
										>
											{slug}
										</Link>
									</li>
								))}
							</ul>
						</MetaBlock>
					) : null}
				</aside>
			</div>
		</div>
	);
}

function MetaBlock({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4">
			<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
				{title}
			</p>
			<div className="mt-3 space-y-2 text-sm">{children}</div>
		</div>
	);
}

function MetaRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-2 font-mono text-[11px]">
			<span className="text-[var(--ret-text-muted)]">{label}</span>
			<span className="text-[var(--ret-text-dim)]">{value}</span>
		</div>
	);
}
