# Task: complete the loan decision workflow

## Context

An underwriter reviews a pending loan application and approves or rejects it. An approval above the delegated-authority threshold needs independent confirmation by another underwriter before it becomes final.

The previous engineer left a partially implemented single-underwriter vertical slice. Review and evolve the relevant API, PostgreSQL persistence, and UI into a production-ready end-to-end workflow.

The development seed includes two underwriters, low-value and high-value applications, and a support user. A notifier interface is supplied in `apps/api/src/notifier.ts`; external notification infrastructure are out of scope.

Please spend no more than **90 minutes**. Stop when the timebox expires and document what you would do next. Completing every improvement is less important than identifying and safely resolving the highest risks.

## Workflow and deliverables

1. Inspect the implementation before changing it.
2. Fill in [REVIEW.md](./REVIEW.md) with your initial findings and plan. We recommend committing this review separately before implementation.
3. Implement the workflow and add or improve relevant tests.
4. Keep commits small enough to review and leave the repository buildable.

Where more than one sound design is possible, make a reasonable decision and document its guarantees, tradeoffs, and known limitations. The review should make clear which risks you prioritized and how you verified the resulting behavior.

## Business workflow

- Only a session user whose role is exactly `UNDERWRITER` may record a decision.
- Every decision requires a non-empty reason
- Approval amounts use integer minor units and must be positive, no greater than the requested amount, and handled exactly across the browser, API, and database.
- Rejection and confirmation do not carry a new approval amount.
- An approval of **1,000,000 minor units or less** becomes final immediately.
- An approval above **1,000,000 minor units** enters `PENDING_CONFIRMATION` and retains the proposed amount.
- Only an application awaiting initial review may receive an initial approval.
- Only an application awaiting confirmation may be confirmed. Confirmation preserves the proposed amount.
- The underwriter who proposed a high-value approval must not confirm it.
- An application awaiting initial review or confirmation may be rejected by an underwriter, including the original approver.
- Rejection clears any active approved amount without destroying decision history.
- `APPROVED` and `REJECTED` are terminal.
- Every effective decision must leave an immutable audit trail sufficient to reconstruct what happened, who acted, and why.

Treat all request data as untrusted. Return useful, consistent errors for authentication, authorization, validation, missing data, incompatible decisions, and unexpected failures without exposing internal details.

## Production expectations

Treat this as a production workflow rather than a happy-path demo. Identify and address the material engineering risks in the submitted slice, and document the guarantees, evidence, assumptions, and limitations of your design.

## Notifications

Use the supplied `LoanNotifier` to support these business notifications:

- a high-value proposal: `APPROVAL_PROPOSED`
- a final low-value approval or confirmed approval: `APPROVED`
- a rejection from either non-terminal state: `REJECTED`

Decide how notification delivery fits into the workflow. The delivery logic must be callable and testable; scheduling infrastructure and the external transport are out of scope. Document the guarantees and limitations of your design.

## Migration requirements

Make changes through new additive Prisma migrations. Do not edit, replace, or rename the existing `20260809000000_init` migration. Existing pending, approved, rejected, user, and audit rows must remain valid and readable. Existing final decisions must not be reinterpreted as pending confirmation. The complete migration history must work both on a populated legacy database and a fresh database, and the seed must remain rerunnable.

## Frontend requirements

Complete the application review screen using inferred tRPC types. It must accurately represent the business workflow, validate input, handle money correctly, and provide useful accessible feedback.

Visual polish is welcome but is not a major scoring factor.

## Tests and submission

Keep the candidate-visible suite green with `pnpm test`. Add a focused set of tests for the highest risks you identify. Choose test levels and infrastructure capable of proving the behavior being claimed, and explain any important behavior that remains unverified.

Before submitting, run:

```bash
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Your submission includes working backend/frontend code, additive migrations, relevant tests, completed `REVIEW.md`, and normal reviewable commit history. Note known limitations, production observability, and safe rollout/rollback. You may use documentation, search, and AI coding tools; you remain responsible for every submitted line and should be able to explain and modify it without assistance in the follow-up interview.
