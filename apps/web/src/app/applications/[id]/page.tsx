"use client";

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
  const decide = trpc.loanApplications.decide.useMutation();

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

  async function submit(value: DecisionFormValue) {
    const amount =
      value.approvedAmountMinor === undefined
        ? {}
        : { approvedAmountMinor: value.approvedAmountMinor };
    await decide.mutateAsync({
      applicationId,
      decision: value.decision,
      reason: value.reason,
      ...amount,
    });
  }

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
          <div>
            <dt>Email</dt>
            <dd>{item.customer.email}</dd>
          </div>
        </dl>
      </section>

      {item.status === "PENDING_REVIEW" ? (
        <section aria-labelledby="record-decision">
          <h2 id="record-decision">Record a decision</h2>
          <DecisionForm
            disabled={decide.isPending}
            onSubmit={submit}
            requestedAmountMinor={item.requestedAmountMinor}
          />
          {decide.isError ? (
            <p className="error" role="alert">
              {decide.error.data?.code === "CONFLICT"
                ? "Another underwriter already processed this application."
                : decide.error.message}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="notice">This application has already been processed.</p>
      )}
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
