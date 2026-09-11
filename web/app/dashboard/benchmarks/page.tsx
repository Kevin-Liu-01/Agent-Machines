import { redirect } from "next/navigation";

export default function LegacyWorkspacePage() {
	redirect("/dashboard/usage?tab=benchmarks");
}
