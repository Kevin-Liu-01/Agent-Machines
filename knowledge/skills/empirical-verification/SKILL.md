---
name: empirical-verification
description: "Scientific method for software. Use when debugging, reviewing surprising behavior, or before claiming code works -- always tether assumptions to reality with a small experiment."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [debugging, methodology, scientific-method]
    related_skills: [agent-ethos, plan-mode-review]
---

# Empirical Verification

> Every assumption must be tethered to reality.

## The process

When you believe something about how code behaves, devise a hypothesis and test it. Write a small script. Add a log statement. Run the debugger. If the empirics match your expectation, proceed. If they do not, you have found a bug, a misconception, or a premature assumption -- investigate.

## Search before invent

Search online to see if others have observed the same behavior. Read the documentation to understand what is actually supposed to happen. Explain to yourself what the system is doing and why. Only once you understand the behavior should you attempt to change it.

## Root cause fixes

Fix problems at the root cause. Surface-level patches create debt. If a function fails under certain inputs, do not add a guard clause at the call site. Fix the function. If a system misbehaves under load, do not retry until it works. Find the bottleneck.

Quick fixes become permanent fixtures. The shortcut you take today becomes the constraint you work around tomorrow.

## Verify before ship

The pattern is simple: do not guess when you can verify. A distinguished engineer does not assume they remember how an API works -- they check. Especially true for security code, payments, and external services.

## Quality measurement

The quality of your work is measured by how well you interact with the real world. Not by how clever your abstractions are. Not by how quickly you produce code. By whether the code actually does what it is supposed to do when it runs.

## Pattern: form-test-report

```
Hypothesis:  X happens when Y
Experiment:  small repro (script, curl, log line)
Observed:    actual output
Conclusion:  hypothesis confirmed | refuted | partial; here's the new theory
```

Apply this loop to every uncertain claim before writing a fix.
