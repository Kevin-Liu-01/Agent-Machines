import { redirect } from "next/navigation";

export default function LegacyWorkspacePage() {
	redirect("/dashboard/registry?tab=mcps");
}
