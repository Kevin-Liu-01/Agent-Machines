---
name: computer-use
description: "Browser automation patterns via the browser_* tools (Playwright). Use when the user asks me to navigate a website, fill a form, scrape data, or test a UI flow."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  agent-machines:
    tags: [browser, automation, playwright, computer-use]
    related_skills: [empirical-verification]
---

# Computer Use (Browser)

Hermes ships with a `browser_*` toolset backed by Playwright. I can navigate, click, type, scroll, take snapshots, screenshot the page, and read the DOM.

## Workflow

1. **Observe before acting.** Always call `browser_snapshot` first. Don't click on guesses.
2. **Refs are sticky.** A snapshot returns refs you can pass to `browser_click(ref=...)`. Refs invalidate when the DOM mutates -- re-snapshot after navigation, click, type, scroll.
3. **One deliberate step, then verify.** After a click that should change state, snapshot again. After a navigate, wait briefly then snapshot. Don't chain four actions and hope.
4. **Stop after 4 failed attempts.** If repeated tries don't progress, surface the obstacle (login wall, captcha, missing element) instead of trying a fifth time.

## Common patterns

**Login that requires the user.** Stop and report. Don't fabricate credentials, don't bypass passkey prompts. The user manually completes the login, then I resume.

**Forms with autocomplete that change layout.** Type → wait 500ms → snapshot → click the now-correct ref. Never click a ref captured before typing.

**Lazy-loaded lists.** `browser_scroll` to bring an element into view. Use `scrollIntoView: true` rather than scrolling the page repeatedly.

**Multi-tab flows.** Use `browser_tabs(action="list")` to enumerate. Switch deliberately.

**Coordinate clicks.** `browser_mouse_click_xy` requires coordinates from a fresh viewport screenshot taken immediately before the click for the same tab. Any other tool call invalidates the screenshot.

## Anti-patterns

- Polling `browser_snapshot` every 500ms in a loop. The DOM hasn't changed; you're paying for nothing.
- Reusing a ref after a click without re-snapshotting.
- Single 30-second `browser_wait`. Prefer 2s + snapshot + retry; you proceed as soon as the page is ready.
- Trying to interact with iframe content. Hermes can't reach inside iframes. Skip or report.

## When I get stuck

Report:

1. Current URL.
2. What I was trying to reach.
3. The blocker observed (with a snapshot or screenshot).
4. The most likely next action (manual user step, different selector, different page entry).

Don't improvise more clicks; the user makes the call.

## Performance tooling

`browser_profile_start` and `browser_profile_stop` capture a CPU profile to `~/.cursor/browser-logs/`. When the user asks "why is this slow", I profile rather than guess.

## Console + network

`browser_console_messages` and `browser_network_requests` give me the page's JS errors and HTTP traffic. Useful for diagnosing "the button does nothing" -- usually it does something, just throws or returns 500.
