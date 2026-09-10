"use client";

import { useState } from "react";

import { useParams } from "next/navigation";

import { DecisionForm, type DecisionFormValue } from "@/components/DecisionForm";
import { trpc } from "@/lib/trpc";

import { Providers } from "../../providers";

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function ApplicationReview() {
  const params = useParams<{ id: string }>();
  const applicationId = params.id;

  const application = trpc.loanApplications.getForReview.useQuery({ applicationId });
  const utils = trpc.useUtils();
  const decide = trpc.loanApplications.decide.useMutation({
    onSuccess: async () => {
      await utils.loanApplications.getForReview.invalidate({ applicationId });
    },
  });

  const [confirmationReason, setConfirmationReason] = useState("");

  if (application.isPending) {
    return <main className="shell">Loading application…</main>;
  }

  if (application.isError) {
    return (
      <main className="shell" role="alert">
        Could not load this application: {application.error.message}
      </main>
    );
  }

  const item = application.data;

  // The mutation input is a discriminated union, so each branch is sent as its own
  // literal shape. Building one object with an optional amount would not narrow, and it
  // is also what lets the API guarantee that a rejection never carries an amount.
  async function submitInitialDecision(value: DecisionFormValue) {
    if (value.decision === "APPROVED") {
      await decide.mutateAsync({
        applicationId,
        decision: "APPROVED",
        approvedAmountMinor: value.approvedAmountMinor ?? 0,
        reason: value.reason,
      });
      return;
    }

    await decide.mutateAsync({
      applicationId,
      decision: "REJECTED",
      reason: value.reason,
    });
  }

  async function submitConfirmation(decision: "CONFIRMED" | "REJECTED") {
    await decide.mutateAsync({ applicationId, decision, reason: confirmationReason });
  }

  const decisionError = decide.isError ? (
    <p className="error" role="alert">
      {decide.error.data?.code === "CONFLICT"
        ? "This decision is no longer available. Another underwriter may have acted first, or you proposed this approval yourself."
        : decide.error.message}
    </p>
  ) : null;

  return (
    <main className="shell">
      <div className="eyebrow">Application {item.id}</div>
      <div className="title-row">
        <h1>{item.customer.fullName}</h1>
        <span className={`status status-${item.status.toLowerCase()}`}>{item.status}</span>
      </div>

      <section className="summary-card" aria-labelledby="application-summary">
        <h2 id="application-summary">Application summary</h2>
        <dl>
          <div>
            <dt>Requested</dt>
            <dd>{formatMoney(item.requestedAmountMinor)}</dd>
          </div>
          {item.approvedAmountMinor === null ? null : (
            <div>
              <dt>{item.status === "PENDING_CONFIRMATION" ? "Proposed" : "Approved"}</dt>
              <dd>{formatMoney(item.approvedAmountMinor)}</dd>
            </div>
          )}
          <div>
            <dt>Email</dt>
            <dd>{item.customer.email}</dd>
          </div>
        </dl>
      </section>

      <p aria-live="polite" className="notice">
        {decide.isPending ? "Recording decision…" : ""}
      </p>

      {item.status === "PENDING_REVIEW" ? (
        <section aria-labelledby="record-decision">
          <h2 id="record-decision">Record a decision</h2>
          <DecisionForm
            disabled={decide.isPending}
            onSubmit={submitInitialDecision}
            requestedAmountMinor={item.requestedAmountMinor}
          />
          {decisionError}
        </section>
      ) : null}

      {item.status === "PENDING_CONFIRMATION" ? (
        <section aria-labelledby="confirm-decision">
          <h2 id="confirm-decision">Confirm this proposal</h2>
          <p className="lede">
            This approval is above the delegated-authority threshold and needs an independent
            underwriter. Confirmation keeps the proposed amount; it cannot be changed here.
          </p>
          <form
            className="decision-form"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <fieldset disabled={decide.isPending}>
              <label>
                Reason
                <textarea
                  onChange={(event) => setConfirmationReason(event.target.value)}
                  required
                  rows={4}
                  value={confirmationReason}
                />
              </label>
              <button
                className="primary-button"
                disabled={confirmationReason.trim().length === 0}
                onClick={() => void submitConfirmation("CONFIRMED")}
                type="button"
              >
                Confirm approval
              </button>{" "}
              <button
                className="primary-button"
                disabled={confirmationReason.trim().length === 0}
                onClick={() => void submitConfirmation("REJECTED")}
                type="button"
              >
                Reject instead
              </button>
            </fieldset>
          </form>
          {decisionError}
        </section>
      ) : null}

      {item.status === "APPROVED" || item.status === "REJECTED" ? (
        <p className="notice">This application has reached a final decision.</p>
      ) : null}
    </main>
  );
}

export default function ApplicationReviewPage() {
  return (
    <Providers>
      <ApplicationReview />
    </Providers>
  );
}