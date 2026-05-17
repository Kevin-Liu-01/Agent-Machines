---
name: stripe-webhook-hardening
description: Harden Stripe webhook handlers against three failure-prone invariants — raw-body signature verification, negative-lifecycle handling, and idempotent side effects. Use when reviewing, implementing, or hardening Stripe webhook routes, or when the user says "stripe webhooks", "webhook hardening", "signature verification", "idempotent webhooks", or "webhook review."
---

# Stripe Webhook Hardening

Harden Stripe webhook handlers against the three ways generated webhook code most commonly fails in production.

## The Three Invariants

### 1. Raw-Body Signature Verification

The route MUST read the raw request body and verify `stripe-signature` before any JSON parsing. `stripe.webhooks.constructEvent(rawBody, sig, secret)` is the only valid entry point.

**Failure mode:** parsing JSON before `constructEvent` makes signature verification impossible — the signature covers the raw bytes, not the parsed object.

### 2. Negative-Lifecycle Handling

Failure and cancellation events (`invoice.payment_failed`, `customer.subscription.deleted`) MUST change real product state, not just log.

**Failure mode:** treating these as log-only events means users keep access after payment failure or cancellation.

### 3. Idempotent Side Effects

Every side effect MUST be replay-safe. Stripe retries and may deliver the same event more than once.

**Implementation options (all valid):**
- Store processed event IDs (good default)
- Use a stable business idempotency key (e.g., `checkout_session.id`)
- Use naturally idempotent state-setting updates (e.g., `UPDATE SET status = 'canceled'`)

The stronger invariant is that the mutation itself must be replay-safe.

## Review Checklist

1. Does the route read raw request body and verify `stripe-signature` before any parsing?
2. Do failure and cancellation events change real product state, not just log?
3. Is every side effect idempotent under replay?
4. Are there tests and an operational verification path through the Stripe dashboard?

## Architecture

Webhook routes should be thin ingress adapters. Shared billing helpers own verification, dispatch, idempotency, and state transitions. One shared billing path handles all billing mutations.

## Dedalus Canon

- `apps/website/app/api/(webhooks)/stripe/route.ts` — fail-closed ingress pattern
- `apps/website/services/stripe/webhooks/payment-handlers.ts` — `invoice.payment_failed` state update + checkout idempotency key
- `apps/website/services/stripe/webhooks/subscription-handlers.ts` — `customer.subscription.deleted` → downgrade to Hobby

## Verification Workflow

- Missing or invalid signature test → returns `400`
- Replay test → proves duplicate delivery is safe
- `invoice.payment_failed` → assert access state changes
- `customer.subscription.deleted` → assert access state changes
- Production check: Stripe Dashboard → Developers → Webhooks → Recent deliveries

## Scope

- Use this skill for webhook implementation or hardening
- Use `stripe-webhook-review` for explicit audit with PASS/FAIL/UNCLEAR output
- Use `stripe` for querying or mutating Stripe objects through the typed CLI wrapper
