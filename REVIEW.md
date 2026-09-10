# Initial review

Findings from reading the submitted slice before making any implementation changes.
Ordered by risk: everything under "Critical" can lose money, leak data, or corrupt
state. Everything else is under "Non-critical improvements".

## Critical issues

1. **The underwriter guard does not check the role.**
   `underwriterProcedure` tests `if (!ctx.session.user.role)`, which only asserts that the
   role string is non-empty. Every authenticated user passes, including the seeded
   `SUPPORT` account. The single hard authorization rule in the spec — only a session user
   whose role is exactly `UNDERWRITER` may record a decision — is therefore not enforced at
   all, and the existing test suite does not cover it.

2. **`loanApplications.delete` is unauthenticated and destroys records.**
   It is declared on the bare `t.procedure`, so it skips both the session check and the role
   check, and it hard-deletes the application row. Any unauthenticated caller can remove a
   loan application. The endpoint is not part of the specified workflow; the safe resolution
   is to remove it rather than to secure it, because a destructive delete is incompatible
   with the requirement that decision history survive.

3. **A blanket `catch` converts every error into `INTERNAL_SERVER_ERROR`.**
   The `decide` handler wraps its whole body in `try { ... } catch { throw new TRPCError({
   code: "INTERNAL_SERVER_ERROR" }) }`. The deliberate `NOT_FOUND`, `CONFLICT` and
   `BAD_REQUEST` errors raised inside that block are swallowed and rewritten, so a client can
   never distinguish "application not found" from "already decided" from "invalid amount".
   This directly contradicts the requirement to return useful, consistent errors, and it also
   hides genuine faults from operators because the original error is discarded rather than
   logged.

4. **The state change and its audit record are not atomic.**
   `updateApplication` and `createAudit` are two independent round-trips with no enclosing
   transaction. If the audit insert fails, the application is already decided and there is no
   record of who decided it or why — the audit trail is no longer sufficient to reconstruct
   what happened. The in-memory test double already exposes a `failNextAudit` flag, so this
   failure mode is reachable and testable today.

5. **The status transition is a check-then-act race.**
   The handler reads the application, compares its status in application code, and then
   issues an unconditional `update` by primary key. Two underwriters acting concurrently both
   observe `PENDING_REVIEW` and both write, so the second silently overwrites the first. Once
   the confirmation workflow exists this becomes the more serious version of the same bug:
   two concurrent confirmations of the same high-value proposal would both succeed. The guard
   must live in the `WHERE` clause of the write, not in a prior read.

6. **Approved amounts are not validated as positive.**
   Both layers are permissive. The Zod schema declares `approvedAmountMinor: z.number().optional()`,
   with no integer, positivity, or finiteness constraint. `validateBusinessRules` then checks
   only `Number.isInteger` and the upper bound against the requested amount. A negative or
   zero approval is accepted and persisted; `-500_000` passes every check. The spec requires
   the amount to be positive and no greater than the requested amount.

7. **Personally identifiable data is written to the application log.**
   `ctx.logger.info({ input, application, user: ctx.session.user }, "Processing loan decision")`
   serialises the entire application record on every decision, which includes `taxId`,
   `nationalId`, `email`, `phone` and `monthlyIncomeMinor`. Logs are typically shipped to a
   third-party aggregator with a broader access list and a longer retention period than the
   database, so this widens the blast radius of the most sensitive fields in the system.

8. **The confirmation workflow does not exist.**
   There is no `PENDING_CONFIRMATION` status in the enum, no threshold, no record of who
   proposed a high-value approval, and no separation-of-duties check. Approvals of any size
   are final immediately. This is the substance of the exercise and everything above is a
   prerequisite for building it safely.

9. **Money is stored in `INTEGER`, which caps amounts at ~21.5 million major units.**
   `requestedAmountMinor`, `approvedAmountMinor` and `monthlyIncomeMinor` are all Prisma
   `Int`, which maps to PostgreSQL `int4` with a ceiling of 2,147,483,647 minor units. That
   is a plausible loan size, and an overflow is a write failure or — worse, in a language
   with silent coercion — a wrong number. Note this is an overflow risk rather than a
   precision risk: JavaScript integers are exact well past `int4`, so the "handled exactly"
   requirement is currently met by luck of range rather than by design.

## Non-critical improvements

1. **The review screen cannot represent the specified workflow.** A route exists at
   `/applications/[id]`, but `DecisionForm` offers a fixed Approve/Reject choice and the
   router exposes no confirmation procedure, so there is no way to confirm a high-value
   proposal, no way to distinguish a proposed amount from a final one, and no way to hide the
   confirm action from the underwriter who proposed it. The screen also has no path to
   surface a `CONFLICT` — unavoidable while the API rewrites every error as
   `INTERNAL_SERVER_ERROR` (critical issue 3), but it needs an accessible error region and a
   disabled state for terminal applications once the API reports causes correctly.

2. **The decision response echoes the request instead of reporting persisted state.** The
   handler returns `status: input.decision` rather than the status read back from the write.
   Once the threshold rule exists, an approval above the threshold must report
   `PENDING_CONFIRMATION`, not `APPROVED`, so echoing the input would actively mislead the
   UI. Returning the persisted row also makes the response self-validating.

3. **Major-to-minor conversion on the client goes through binary floating point.**
   `Math.round(Number(approvedAmount) * 100)` is correct for the values in the existing test
   but is the wrong shape for money: it depends on `Number` parsing, locale-independent
   decimal separators, and a rounding step that silently accepts three-decimal input. Parsing
   the decimal string directly into minor units keeps the browser exact and rejects
   over-precise input instead of quietly rounding it.

4. **The applications table flashes a loading state every five seconds.** The component
   branches on `applicationsQuery.isFetching`, which is true for background refetches as well
   as the initial load, so the five-second poll replaces the table with "Loading applications…"
   on every tick. `isPending` is the correct predicate. Separately, the polling `useEffect`
   depends on `[applicationsQuery]`, an object identity that changes on every render, so the
   interval is torn down and recreated continuously; `refetchInterval` on the query removes
   the effect entirely.

5. **Sensitive customer fields are surfaced in the list UI.** The table renders `gender` and
   `taxId` as columns. `taxId` is not needed to triage a queue, and using a protected
   characteristic as a visible attribute of a credit decision screen is a fair-lending
   concern (ECOA/Regulation B in the US; the EU Gender Directive) independent of the code. I
   would raise this with the product owner rather than decide it unilaterally, but it should
   not stay in a list view by default.

6. **The audit table is not actually immutable.** `LoanDecisionAudit` is an ordinary table;
   nothing prevents `UPDATE` or `DELETE`. "Immutable" is currently a naming convention rather
   than a guarantee, and a database-level trigger makes it enforceable and testable.

7. **Audit ordering is not reliable.** The table has no monotonic sequence. `createdAt` is
   `TIMESTAMP(3)`, so two decisions inside the same millisecond tie, and `cuid()` primary keys
   are not ordered. Reconstructing the exact sequence of events — a stated requirement — is
   therefore not guaranteed. The index is `(applicationId)` only.

8. **The actor's role is not captured at decision time.** If a user's role changes later, the
   audit trail no longer explains why the decision was permitted when it was made.

9. **`LoanNotifier` is defined but not wired.** It is absent from `RequestContext`, so there
   is no seam through which to inject it or assert on it.

10. **Smaller items.** The listen port is hardcoded to `4000` while `.env.example` and
    `turbo.json` both define `API_PORT`. `createContext` defaults every request to
    `user-underwriter-1`, so `session` is never null and the `UNAUTHORIZED` branch is
    unreachable — acceptable for a dev harness, but it means the auth path is untested.
    `LoanApplication.status` is unindexed. `customerFullName` and `customerLastName` duplicate
    data that can drift.

## Implementation plan

1. Commit this review on its own so the findings are timestamped before any code changes.
2. Fix the containable defects first, because they are small and independently valuable:
   correct the role predicate, remove the unauthenticated `delete`, replace the blanket
   `catch` with one that rethrows `TRPCError` and maps only unknown failures to
   `INTERNAL_SERVER_ERROR`, and reduce the decision log to non-identifying fields.
3. Add the schema in additive migrations, in this order:
   - `ALTER TYPE "LoanApplicationStatus" ADD VALUE 'PENDING_CONFIRMATION'` **alone in its own
     migration**. PostgreSQL permits adding an enum value inside a transaction but forbids
     using it in that same transaction, and Prisma wraps each migration in one — so any
     migration that both adds the value and references it will fail.
   - A second migration for `proposedByUserId` (nullable, FK to `User`), the widening of the
     money columns to `BIGINT`, an `AFTER`-insert-only trigger rejecting `UPDATE`/`DELETE` on
     `LoanDecisionAudit`, and the supporting indexes.
   Both are additive and leave existing rows valid; no existing `APPROVED` row acquires the
   new status, so final decisions are not reinterpreted.
4. Rewrite `decide` around the state machine. Model the input as a discriminated union
   (`APPROVE` carries an amount, `REJECT` and `CONFIRM` do not) so that "rejection carries no
   amount" is unrepresentable rather than validated. Perform the status change, the audit
   insert, and the outbox write in a single `$transaction`, and express the precondition as a
   conditional `updateMany` whose `WHERE` names the expected current status — and, for
   confirmation, `proposedByUserId: { not: actorId }`. Treat `count === 0` as `CONFLICT`.
5. Deliver notifications through a transactional outbox: the decision writes an outbox row in
   the same transaction, and a separately callable dispatcher reads and sends it.
6. Add tests at the level that can actually prove each claim (see Observability note below on
   what "prove" means here), then build the review screen against the inferred tRPC types.

## What I will not complete within the timebox

1. **A running outbox worker.** I will write and test the dispatch function, but scheduling,
   retry with backoff, poison-message handling and a dead-letter path are out of scope per
   the brief. What ships is the durable record plus a callable dispatcher, not a delivery
   guarantee.
2. **An integration test against a real PostgreSQL instance.** This is the most significant
   gap and I want to be direct about it. The concurrency fix and the audit-immutability
   trigger are database behaviours; a test with a mocked Prisma client cannot prove either,
   because the mock would be asserting my own assumptions back at me. The candidate-visible
   suite is configured for `test/public/**` with no database available, and standing up
   Testcontainers inside the timebox would consume most of it. The transition logic is
   therefore proven at the router level with an in-memory double that emulates the
   conditional update, and the row-locking behaviour I rely on is argued from PostgreSQL
   semantics rather than demonstrated. I would close this first with more time.
3. **Zero-downtime widening of the money columns.** I widen `INTEGER` to `BIGINT` with a
   direct `ALTER TABLE`. This is safe for data but takes an `ACCESS EXCLUSIVE` lock and
   rewrites the table, which on a large production table means downtime. The production
   approach is expand/contract: add a new column, backfill in batches, dual-write, swap, drop.
4. **Authentication.** Identity still comes from `x-user-id` / `x-user-role` headers, which is
   the supplied dev harness and is trivially spoofable. Replacing it with real session
   verification is a separate concern from the decision workflow.
5. **Revisiting the `gender` and `taxId` fields.** Flagged above; it needs a product decision
   rather than a unilateral schema change.

## Production readiness

### Observability

Metrics: a counter of decisions by transition type (`initial_approval`, `proposal`,
`confirmation`, `rejection`), which gives both volume and the low-value/high-value mix; a
counter of rejected transitions by cause, split into `state_conflict`, `self_confirmation`
and `authorization`, because a rising `state_conflict` rate is the leading indicator of
concurrent-underwriter contention and `self_confirmation` attempts are a control signal, not
just noise; a histogram of decision-transaction duration; and outbox depth plus the age of
the oldest undispatched row, which is the single number that tells you whether notifications
are actually flowing.

Logs: structured, with a correlation ID propagated from the request through the transaction to
the outbox row so that one decision is reconstructable end to end. Field selection is an
allowlist — `applicationId`, `actorId`, `previousStatus`, `newStatus`, correlation ID — rather
than a denylist, because a denylist silently leaks every field added later. Amounts are logged
as order-of-magnitude buckets rather than exact values; the reason text is never logged, since
it is free text an underwriter may have pasted customer details into. Unknown errors are
logged with their stack at the boundary and returned to the client as an opaque code.

Traces: one span per decision with the transaction and the outbox write as children, so that
lock contention is visible as wait time rather than as an unexplained latency increase.

Alerts: any non-zero rate of audit-trigger violations (this should be structurally impossible,
so one occurrence means an unexpected write path exists); oldest-undispatched-outbox-row
exceeding a few minutes; a sustained rise in `state_conflict`; and any `INTERNAL_SERVER_ERROR`
from `decide`, which after these changes should be rare enough to page on.

### Rollout and rollback

The two migrations are additive and backward compatible, so I would deploy them ahead of the
application code and let the current version run against the new schema for at least one
release cycle. The old code ignores `proposedByUserId`, tolerates `BIGINT` columns, and never
writes the new enum value, so the intermediate state is safe in both directions.

The application change ships behind a flag on the threshold. With the flag off, the threshold
is effectively infinite and every approval is final — the current behaviour, but running on
the new code path, which means the rest of the rewrite (atomicity, conditional update, error
mapping) gets exercised in production before the workflow change is switched on. Turning the
flag on is then a config change, and turning it off is an instant rollback that does not touch
the schema.

The asymmetry to plan around is that code rollback is cheap and schema rollback is not.
`ALTER TYPE ... DROP VALUE` does not exist in PostgreSQL, so once any row reaches
`PENDING_CONFIRMATION` the enum change is effectively permanent. If the code is rolled back
while proposals are in flight, those rows are in a status the old code does not understand:
it will not confirm them and it will not reject them. The runbook therefore needs a query that
lists rows stuck in `PENDING_CONFIRMATION` and a documented decision — drain them before
rollback, or resolve them manually afterwards. Narrowing `BIGINT` back to `INTEGER` is
similarly a one-way door once any value exceeds the old range.

### Known limitations

Notification delivery is at-least-once, never exactly-once. The dispatcher can crash after the
external send and before marking the row dispatched, so consumers must be idempotent; the
outbox row ID is the natural idempotency key.

The concurrency guarantee rests on PostgreSQL's default `READ COMMITTED` isolation, where a
conflicting `UPDATE` blocks on the row lock and then re-evaluates its `WHERE` clause against
the committed row. That is what makes the losing writer see `count === 0` rather than silently
overwriting. Under a different isolation level, or if the guard were ever moved out of the
`WHERE` clause and back into application code, the property would not hold. This is asserted
from documented semantics and not demonstrated by a test in this submission.

Identity is header-supplied and spoofable, so the separation-of-duties rule is only as strong
as the (currently absent) authentication layer. The rule is enforced correctly given a trusted
`actorId`, and not at all without one.

The audit trigger prevents modification through the application's database role. It does not
constrain a superuser, and it is not a substitute for restricted database credentials, WAL
archiving, or shipping audit records to append-only external storage.

Finally, the audit trail records the actor's ID but not their role at the time of the
decision, so a later role change makes historical decisions harder to justify on their own
terms.