/** Native coding CLIs execute on the Worker; they have no HTTP agent gateway. */
export function runtimeUsesGateway(agent: string | null | undefined): boolean {
	return agent === "hermes" || agent === "openclaw";
}
