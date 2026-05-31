import { redirect } from "next/navigation";

/**
 * `Containers` was a second fleet listing that duplicated `Machines`. The
 * fleet now lives in one place: the Machines page (cards + spin-up) with the
 * old Containers analytics folded in via <FleetAnalytics>.
 */
export default function ContainersPage() {
	redirect("/dashboard/machines");
}
