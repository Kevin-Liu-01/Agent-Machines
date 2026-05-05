# Operator Profile

This file is a placeholder. The agent fills it in over time as it learns about its operator (preferences, stack, conventions, identity, recurring people and projects). Edit by hand to seed initial context, or let the agent populate it through the `memory` tool as you converse.

## How to use this file

- Add facts that are stable and worth carrying across sessions: name, role, current project focus, stack, recurring collaborators.
- Keep it under ~1300 characters (~500 tokens) so it fits comfortably in the system prompt every turn. The agent will prune to fit.
- Don't put secrets here -- the file is loaded into every prompt, and prompt-injecting content from elsewhere can read it. Secrets belong in `~/.hermes/.env`.

## Suggested seed (edit before first session)

- Name and role.
- Communication preferences: terse vs detailed, ASCII vs unicode, emoji policy.
- Style preferences: language flavors, formatting rules, comment policy.
- Current project focus and active repos.
- Key collaborators worth name-resolving.
- Anything you'd otherwise have to repeat every session.
