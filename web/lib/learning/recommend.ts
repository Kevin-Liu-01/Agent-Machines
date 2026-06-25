/**
 * Greedy routing recommendation for an interactive provision (exploit).
 *
 * Returns the best feasible arm under the active policy, or null if none is
 * feasible. Optional `constraints` pin axes the caller has already fixed so the
 * recommendation stays a coherent single arm (the provision route uses this for
 * autoRoute -- it must never mix caller-fixed axes with recommendation axes from
 * a different arm). task_class is omitted at provision time -> global posteriors.
 */

import { enumerateFeasibleArms } from "@/lib/learning/arms";
import { bestArm, type ArmScore } from "@/lib/learning/bandit";
import { readActivePolicy } from "@/lib/learning/policy";
import { DEFAULT_WEIGHTS } from "@/lib/learning/reward";
import { emptyArtifact } from "@/lib/learning/types";
import type { AgentKind, ProviderKind, UserConfig } from "@/lib/user-config/schema";

export type ArmConstraints = {
	runtime?: AgentKind;
	substrate?: ProviderKind;
	model?: string;
	routerId?: string | null;
};

export async function recommendArm(
	config: UserConfig,
	constraints?: ArmConstraints,
): Promise<ArmScore | null> {
	let arms = enumerateFeasibleArms(config);
	if (constraints) {
		arms = arms.filter(
			(a) =>
				(constraints.runtime === undefined || a.runtime === constraints.runtime) &&
				(constraints.substrate === undefined || a.substrate === constraints.substrate) &&
				(constraints.model === undefined || a.model === constraints.model) &&
				(constraints.routerId === undefined || a.routerId === constraints.routerId),
		);
	}
	if (arms.length === 0) return null;
	const policy = await readActivePolicy().catch(() => null);
	return bestArm(
		arms,
		policy?.artifact ?? emptyArtifact(),
		policy?.weights ?? DEFAULT_WEIGHTS,
		null,
	);
}
