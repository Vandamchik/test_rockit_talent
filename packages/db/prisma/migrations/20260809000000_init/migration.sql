CREATE TYPE "UserRole" AS ENUM ('UNDERWRITER', 'SUPPORT');
CREATE TYPE "LoanApplicationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanApplication" (
  "id" TEXT NOT NULL,
  "status" "LoanApplicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "requestedAmountMinor" INTEGER NOT NULL,
  "approvedAmountMinor" INTEGER,
  "customerFullName" TEXT NOT NULL,
  "customerLastName" TEXT NOT NULL,
  "customerGender" TEXT NOT NULL,
  "customerTaxId" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerNationalId" TEXT NOT NULL,
  "monthlyIncomeMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoanApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanDecisionAudit" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "previousStatus" "LoanApplicationStatus" NOT NULL,
  "newStatus" "LoanApplicationStatus" NOT NULL,
  "approvedAmountMinor" INTEGER,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanDecisionAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoanDecisionAudit_applicationId_idx" ON "LoanDecisionAudit"("applicationId");

ALTER TABLE "LoanDecisionAudit"
  ADD CONSTRAINT "LoanDecisionAudit_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoanDecisionAudit"
  ADD CONSTRAINT "LoanDecisionAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
