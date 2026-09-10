-- Additive only. Existing rows stay valid: proposedByUserId is nullable, and no existing
-- APPROVED or REJECTED row is touched, so final decisions are not reinterpreted as pending
-- confirmation.

ALTER TABLE "LoanApplication" ADD COLUMN "proposedByUserId" TEXT;

ALTER TABLE "LoanApplication"
  ADD CONSTRAINT "LoanApplication_proposedByUserId_fkey"
  FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "LoanApplication_status_idx" ON "LoanApplication"("status");
CREATE INDEX "LoanApplication_proposedByUserId_idx" ON "LoanApplication"("proposedByUserId");

-- Ordering the audit trail by createdAt alone is ambiguous at millisecond resolution;
-- this index at least makes per-application reconstruction cheap.
CREATE INDEX "LoanDecisionAudit_applicationId_createdAt_idx"
  ON "LoanDecisionAudit"("applicationId", "createdAt");

-- "Immutable" is currently a naming convention. Make it enforceable: the audit table
-- accepts inserts and nothing else.
CREATE OR REPLACE FUNCTION "reject_loan_decision_audit_mutation"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'LoanDecisionAudit rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LoanDecisionAudit_immutable"
  BEFORE UPDATE OR DELETE ON "LoanDecisionAudit"
  FOR EACH ROW EXECUTE FUNCTION "reject_loan_decision_audit_mutation"();