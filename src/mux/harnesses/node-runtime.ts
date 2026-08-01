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
 * Seconds a version probe may take before its `node` is declared
 * unsuitable. Generous for a cold binary, short enough that a hanging
 * shim cannot stall an install.
 */
const PROBE_TIMEOUT_S = 15;

/**
 * Idempotent: keeps whatever Node satisfies `minMajor` (system or
 * previously bootstrapped), otherwise fetches the pinned tarball.
 */
export function ensureNodeCommand(
	minMajor: number,
	minMinor = 0,
	minPatch = 0,
): string {
	// Compare the full version, not just the major: openclaw's engine range
	// starts at 24.15.0, so a major-only check let Node 24.10 through and
	// the private Node was never fetched, leaving the harness permanently
	// uninstallable on that image.
	//
	// The probe is time-bounded because a substrate's `node` may not be a
	// binary at all. Sprites ships /.sprite/bin/node as an nvm shim that
	// sources nvm.sh and runs `nvm use default`; under a detached install it
	// hangs forever (measured: still running at 1m45s, zero output, with
	// more piling up behind it), which stalled the whole install with an
	// empty log. An unresponsive node is treated as unsuitable so the
	// bootstrap below fetches a real binary instead of waiting on a shim.
	const versionCheck = `node -e "const[M,m,p]=process.versions.node.split('.').map(Number);process.exit(M>${minMajor}||(M===${minMajor}&&(m>${minMinor}||(m===${minMinor}&&p>=${minPatch})))?0:1)"`;
	// `timeout` is absent on some minimal images; fall back to running the
	// check bare rather than failing the whole install on a missing tool.
	const bounded = `if command -v timeout >/dev/null 2>&1; then timeout ${PROBE_TIMEOUT_S} ${versionCheck}; else ${versionCheck}; fi`;
	// stdin from /dev/null: never let a probe block reading a tmux TTY.
	const probe = `${AM_NODE_PATH_PREFIX} sh -c '${bounded.replace(/'/g, `'\\''`)}' >/dev/null 2>&1 </dev/null`;
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
	// Clear any existing tree for this package first. Installs only run
	// after the probe says the CLI is unusable, so whatever is there is a
	// partial tree from a killed or hung earlier attempt -- and npm cannot
	// always replace one: on Sprites a leftover install failed with
	// `ENOTEMPTY: directory not empty, rmdir .../@mistralai/mistralai/esm/
	// hooks` (exit 217), which persists forever because sprites keep their
	// filesystem across runs. Only this package's directory is removed, so
	// a sandbox hosting several harnesses keeps the others.
	const pkgDir = `${AM_PKG_DIR}/node_modules/${packageNameOf(spec)}`;
	return `{ export PATH="${AM_BIN_PATHS}:$PATH"; mkdir -p "${AM_PKG_DIR}"; rm -rf "${pkgDir}"; npm install --prefix "${AM_PKG_DIR}" --no-fund --no-audit ${spec}; }`;
}

/** `openclaw@1.2.3` -> `openclaw`; `@scope/pkg@1.2.3` -> `@scope/pkg`. */
export function packageNameOf(spec: string): string {
	const at = spec.lastIndexOf("@");
	// A leading @ is the scope marker, not a version separator.
	return at > 0 ? spec.slice(0, at) : spec;
}
