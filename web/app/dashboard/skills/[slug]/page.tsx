import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ArrowLeft } from "@/components/ui/icons";
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
				artSlug="skills"
				kicker={`Skill · ${skill.category}`}
				title={skill.slug}
				description={skill.description}
				right={
					<ReticleButton as="a" href="/dashboard/skills" variant="ghost" size="sm">
						<ArrowLeft className="size-4" aria-hidden="true" />
						<span className="ml-1.5">All skills</span>
					</ReticleButton>
				}
			/>
			<div className="grid gap-6 px-[var(--dashboard-gutter,20px)] py-6 lg:grid-cols-[minmax(0,1fr)_220px]">
				<article className="prose-msg min-w-0 max-w-none overflow-x-auto rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5 md:p-8">
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
										className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-1 text-xs text-[var(--ret-text-dim)]"
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
											className="block py-1 text-sm text-[var(--ret-purple)] hover:underline"
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
	children: ReactNode;
}) {
	return (
		<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4">
			<p className="text-sm font-medium text-[var(--ret-text-muted)] first-letter:uppercase">
				{title}
			</p>
			<div className="mt-3 space-y-2 text-sm">{children}</div>
		</div>
	);
}

function MetaRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-2 text-sm">
			<span className="text-[var(--ret-text-muted)] first-letter:uppercase">{label}</span>
			<span className="text-[var(--ret-text-dim)]">{value}</span>
		</div>
	);
}
