"use client";

import { useState, type FormEvent } from "react";

export interface DecisionFormValue {
  decision: "APPROVED" | "REJECTED";
  approvedAmountMinor?: number;
  reason: string;
}

interface DecisionFormProps {
  requestedAmountMinor: number;
  disabled?: boolean;
  onSubmit(value: DecisionFormValue): Promise<void> | void;
}

export function DecisionForm({
  requestedAmountMinor,
  disabled = false,
  onSubmit,
}: DecisionFormProps) {
  const [decision, setDecision] = useState<DecisionFormValue["decision"]>("APPROVED");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const value: DecisionFormValue =
        decision === "APPROVED"
          ? { decision, approvedAmountMinor: Math.round(Number(approvedAmount) * 100), reason }
          : { decision, reason };
      await onSubmit(value);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="decision-form" onSubmit={(event) => void handleSubmit(event)}>
      <fieldset disabled={disabled || submitting}>
        <legend>Decision</legend>
        <label className="radio-row">
          <input
            checked={decision === "APPROVED"}
            name="decision"
            onChange={() => setDecision("APPROVED")}
            type="radio"
            value="APPROVED"
          />
          Approve
        </label>
        <label className="radio-row">
          <input
            checked={decision === "REJECTED"}
            name="decision"
            onChange={() => setDecision("REJECTED")}
            type="radio"
            value="REJECTED"
          />
          Reject
        </label>

        {decision === "APPROVED" ? (
          <label>
            Approved amount
            <span className="input-affix">
              <span aria-hidden="true">€</span>
              <input
                inputMode="decimal"
                max={(requestedAmountMinor / 100).toFixed(2)}
                min="0.01"
                onChange={(event) => setApprovedAmount(event.target.value)}
                required
                step="0.01"
                type="number"
                value={approvedAmount}
              />
            </span>
          </label>
        ) : null}

        <label>
          Reason
          <textarea
            minLength={1}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={4}
            value={reason}
          />
        </label>

        <button className="primary-button" type="submit">
          {submitting ? "Saving…" : "Record decision"}
        </button>
      </fieldset>
    </form>
  );
}
