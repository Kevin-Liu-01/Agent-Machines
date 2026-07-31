/**
 * User-space Node.js runtime bootstrap for sandboxes.
 *
 * Sandbox base images ship whatever Node they ship (E2B base: v20.9.0,
 * Vercel: node24, Sprites: varies) while harness CLIs pin hard engine
 * ranges (Claude Code >= 22, OpenClaw >= 22.22.3/24.15). Rather than
 * depend on image choice or sudo, harnesses source a private Node under
 * ~/.agent-machines/node and prefix PATH. npm -g then also installs into
 * that prefix, so agent CLIs ride along without touching the system.
 *
 * Shell style: single-line if-blocks only (multiline if/fi joined with
 * && is a known postmortem bug class); .tar.gz over .xz so tar never
 * needs xz support.
 */

export const AM_NODE_DIR = "$HOME/.agent-machines/node";
/** Where harness packages are installed (local tree, never `npm -g`). */
export const AM_PKG_DIR = "$HOME/.agent-machines/pkgs";
const AM_BIN_PATHS = `${AM_NODE_DIR}/bin:${AM_PKG_DIR}/node_modules/.bin`;
export const AM_NODE_PATH_PREFIX = `PATH="${AM_BIN_PATHS}:$PATH"`;

// 24.18.1 satisfies every harness engine range in one bootstrap:
// claude-code >= 22, openclaw >= 24.15 < 25.
const NODE_VERSION = "24.18.1";

/**
 * Idempotent: keeps whatever Node satisfies `minMajor` (system or
 * previously bootstrapped), otherwise fetches the pinned tarball.
 */
export function ensureNodeCommand(minMajor: number): string {
	const probe = `${AM_NODE_PATH_PREFIX} node -e "process.exit(parseInt(process.versions.node,10)>=${minMajor}?0:1)" >/dev/null 2>&1`;
	const detectArch = `A=$(uname -m); if [ "$A" = "x86_64" ]; then A=x64; elif [ "$A" = "aarch64" ] || [ "$A" = "arm64" ]; then A=arm64; else echo "unsupported arch: $A" >&2; exit 1; fi`;
	const fetch = `curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-$A.tar.gz -o /tmp/am-node.tar.gz`;
	const unpack = `mkdir -p "${AM_NODE_DIR}" && tar -xzf /tmp/am-node.tar.gz -C "${AM_NODE_DIR}" --strip-components=1 && rm -f /tmp/am-node.tar.gz`;
	return `if ! ${probe}; then ${detectArch}; ${fetch} && ${unpack}; fi`;
}

/**
 * Run a command with the bootstrapped Node first on PATH. Uses an
 * exported assignment inside a brace group -- a plain `PATH=... cmd1 |
 * cmd2` prefix only applies to cmd1, so pipelines (echo | base64 |
 * claude) would miss the PATH and die with exit 127.
 */
export function withAmNode(command: string): string {
	return `{ export PATH="${AM_BIN_PATHS}:$PATH"; ${command}; }`;
}

/**
 * Install a harness package into our own tree instead of `npm -g`.
 *
 * Substrates disagree about where `npm -g` lands and whether it is on
 * PATH (both measured 2026-07-31): E2B installs to /usr/local (on PATH,
 * fine) while Sprites routes node through nvm whose global bin is NOT on
 * PATH, so `npm install -g openclaw` reported success and left
 * `openclaw` unfindable. Pinning npm_config_prefix fixes the path but
 * nvm hard-refuses that variable. A plain local install with --prefix
 * sidesteps both: binaries always land in
 * $HOME/.agent-machines/pkgs/node_modules/.bin, which withAmNode()
 * guarantees on PATH, with no sudo and no global state.
 */
export function amNpmInstall(spec: string): string {
	return `{ export PATH="${AM_BIN_PATHS}:$PATH"; mkdir -p "${AM_PKG_DIR}"; npm install --prefix "${AM_PKG_DIR}" --no-fund --no-audit ${spec}; }`;
}
