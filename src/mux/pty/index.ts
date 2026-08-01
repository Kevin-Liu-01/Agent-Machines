/**
 * PTY surface: one handle per session (`openTmuxPty`), many viewers per
 * handle (`createPtyFanout`). `PtyHandle.output` is single-use by contract,
 * so anything that needs a second reader fans out rather than iterating twice.
 */

export { openTmuxPty } from "./tmux.js";
export {
	createPtyFanout,
	formatGapMarker,
	DEFAULT_REPLAY_BYTES,
	DEFAULT_SUBSCRIBER_BUFFER_BYTES,
	type PtyFanout,
	type PtyFanoutOptions,
	type PtyOverflowPolicy,
	type PtySubscribeOptions,
	type PtySubscription,
	type PtySubscriptionState,
	type PtyWritePolicy,
} from "./fanout.js";
