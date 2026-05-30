# Browser Agent Console — four-paragraph explainer

Plain-language breakdown of why this is crazy, and why it is a real technical achievement. No jargon wall; shareable with anyone.

Also see: [BROWSER-AGENT-CONSOLE.md](./BROWSER-AGENT-CONSOLE.md) (full architecture + positioning).

---

## 1. Why almost nobody has this

The best AI tools right now (Claude Code, Codex, Hermes, OpenClaw) are not chat apps. They are full terminal programs: a black screen, arrow keys, the whole experience. The industry only has three bad options. Tell users to run it locally on their laptop (most people will not). Wrap it in a chat UI and strip out half the experience. Or lock you into one company's sandbox with their shell in their dashboard. A real browser terminal should exist, but the default design is a permanent WebSocket connection through your server, like a phone call that never hangs up, relaying every keystroke instantly. Modern app hosting on Vercel and similar platforms is built for quick requests, not hour-long open pipes. So the obvious architecture works on a laptop demo and dies in production. That is why you do not see this everywhere. Not because nobody thought of it, but because the blueprint assumes infrastructure most products cannot run.

## 2. The inversion (how it actually works)

Instead of hosting the session on the website, the session lives on the remote machine. A program called tmux keeps a real terminal open on the cloud box, like leaving a notebook on a desk while you walk away. When you type in the browser, the site sends a short HTTP message: these keys were pressed (`send-keys -H`). When the AI tool prints output, the site reads a log file on that machine with unbuffered `tail -f` and streams it back over SSE (one-way streaming, not a permanent socket). The website is a messenger, not the phone line: stateless trips in and out, no tunnel, no always-on relay server. Input is hex-encoded keystrokes into tmux. Output is raw terminal bytes from a pipe-pane log. Resize is a one-line exec. The same UI works on four different cloud providers (Dedalus, E2B, Sprites, Vercel) because the only primitive you need is "run a command on the box," which they all already have.

## 3. Why it is a technical and engineering achievement

This is serverless-safe interactive PTY emulation, a category of problem most teams punt on. You cannot hold a WebSocket PTY server on Vercel (functions timeout around 110 seconds, cold starts, no sticky sessions). Yet full-screen TUIs like Codex and Claude Code emit cursor-addressed escape sequences with no newlines, so line-buffered streaming would freeze the screen until the buffer fills. That is why the stack uses unbuffered tail, serialized input POSTs so keystrokes do not arrive out of order, parallel xterm load with session attach, snapshot paint on connect, E2B sandbox connect reuse, and config caching so every keypress does not re-fetch your account from the database. Native streaming where the SDK supports it; poll fallback for providers that only return output after a command finishes. tmux is pre-installed at bootstrap so first attach does not trigger a long package install. It is not a wrapper around xterm.js. It is a distributed systems design that makes interactivity work when the control plane is deliberately dumb and ephemeral.

## 4. Why it is crazy as a product (two breakthroughs in one)

Agent Machines stacks two things that each could stand alone. First: deploy, bootstrap, attach, and talk to the real CLI on neutral infra, with router and credential gates so provisioning does not silently fail. Second: a general pattern for "terminal in the browser on serverless" that any SaaS with remote workers could use. The closest predecessor is AWS CloudShell, a real browser terminal, but it is locked to Amazon. This is CloudShell-shaped, substrate-agnostic, wired to agent CLIs that were never meant for the web, on a stack (Next.js plus Vercel) that structurally cannot do what CloudShell's backend does. The terminal layer could spin out as its own product. It exists because agent CLIs are terminals and the main product could not ship without solving it. The missing primitive was not a better chat UI. It was "stateless courier, stateful worker." Once you invert that, putting Claude Code in a tab stops being magic and starts being inevitable.
