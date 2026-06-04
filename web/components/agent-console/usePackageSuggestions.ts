"use client";

import { useEffect, useRef, useState } from "react";

import type { PackageSuggestion } from "@/lib/packages/types";

type SuggestResponse =
	| { ok: true; suggestions: PackageSuggestion[] }
	| { ok: false; error?: string };

export function usePackageSuggestions(input: {
	draft: string;
	machineId: string | null;
	sessionPackageIds: string[];
	disabled: boolean;
}): {
	topSuggestion: PackageSuggestion | null;
	loading: boolean;
} {
	const [topSuggestion, setTopSuggestion] = useState<PackageSuggestion | null>(null);
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (input.disabled || !input.machineId) {
			setTopSuggestion(null);
			return;
		}

		const draft = input.draft.trim();
		if (draft.length < 4) {
			setTopSuggestion(null);
			return;
		}

		const timer = setTimeout(() => {
			abortRef.current?.abort();
			const ctrl = new AbortController();
			abortRef.current = ctrl;

			const params = new URLSearchParams({
				draft,
				machineId: input.machineId!,
				session: input.sessionPackageIds.join(","),
			});

			setLoading(true);
			fetch(`/api/dashboard/packages/suggest?${params}`, { signal: ctrl.signal })
				.then((r) => r.json() as Promise<SuggestResponse>)
				.then((body) => {
					if (body.ok && body.suggestions.length > 0) {
						setTopSuggestion(body.suggestions[0] ?? null);
					} else {
						setTopSuggestion(null);
					}
				})
				.catch(() => {
					if (!ctrl.signal.aborted) setTopSuggestion(null);
				})
				.finally(() => {
					if (!ctrl.signal.aborted) setLoading(false);
				});
		}, 280);

		return () => {
			clearTimeout(timer);
			abortRef.current?.abort();
		};
	}, [input.draft, input.machineId, input.sessionPackageIds, input.disabled]);

	return { topSuggestion, loading };
}
