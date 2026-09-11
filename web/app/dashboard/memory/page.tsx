import { redirect } from "next/navigation";

export default function LegacyWorkspacePage() {
	redirect("/dashboard/agents?tab=memory");
}
