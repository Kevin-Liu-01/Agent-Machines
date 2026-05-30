# Agent Machines — three-paragraph explainer (general)

Why the whole product is insane, in plain language. Shareable with anyone.

Also see: [BROWSER-AGENT-CONSOLE-EXPLAINER.md](./BROWSER-AGENT-CONSOLE-EXPLAINER.md) (browser terminal deep dive).

---

## 1. What it actually is (vs normal AI)

Most AI products are a chat window. You ask something, you get an answer, you close the tab, and everything resets. Agent Machines is not that. It gives you a **real computer in the cloud** that stays on: disk, files, schedules, memory, tools, all wired to a serious AI agent already installed. Think of the difference between texting a smart friend once versus hiring an employee who has a desk, a login, a to-do list, and keeps working when you are not watching. Kevin built the layer that **deploys** that employee (one click), **sets them up** (installs the agent and hundreds of pre-built skills), and **lets you watch and steer** them from a normal website. You are not renting a conversation. You are renting a worker.

## 2. Why that is overpowered in practice

That worker can do things chat cannot. It can run on a schedule (check something every morning). It can use real tools (browser, GitHub, Stripe, databases) through a library of 160+ skills and 30+ integrations. It can browse the web, run code, save procedures to disk so the next job is faster. And you can pick **which brain** runs it (Claude Code, Codex, Hermes, OpenClaw) and **which cloud** it lives on, without being locked into one company. The dashboard shows you what it did, what it cost, and whether it is awake or asleep. You can put it to sleep when you are done and pay nothing for compute until you wake it again, but your setup stays saved. For people who would never open a developer terminal, Kevin also figured out how to run those same powerful command-line AI tools **inside the browser**, so you get the real thing in a tab instead of a watered-down chat clone.

## 3. Why it is a big deal (the "how is this allowed" part)

Almost everyone else forces you to choose: easy but shallow (chat apps), or powerful but expert-only (install everything on your laptop). Or they lock you into **their** cloud and **their** UI. Agent Machines refuses that tradeoff. Neutral infra, real agents, observable fleet, skills that **compound** on the machine over time (your custom playbooks stack up; you cannot export that from ChatGPT). The hard part was never the AI model. It was the plumbing: bootstrapping agents on arbitrary clouds, keeping auth and keys sane, streaming live terminal output through hosting that was never designed for it, and making non-engineers able to operate tools that were built for engineers. Kevin built that plumbing as the product. That is why it feels OP. It is the control plane for AI workers in a world where everyone else sold you a chat box or a blank server.
