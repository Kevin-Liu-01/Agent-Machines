import { redirect } from "next/navigation";
import { listPresets } from "@/lib/dashboard/presets";
import { presetDestination } from "@/lib/onboarding/preset-selection";

export const dynamic = "force-dynamic";

export default async function WorkersPage({ searchParams }: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	redirect(presetDestination("/dashboard/agents", listPresets(), (await searchParams).preset));
}
