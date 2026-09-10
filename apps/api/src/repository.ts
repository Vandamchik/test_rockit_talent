import type { LoanApplicationStatus as PrismaLoanApplicationStatus } from "@loan-review/db";
import { type PrismaClient } from "@loan-review/db";

import type {
  LoanApplicationRecord,
  LoanApplicationStatus,
  LoanRepository,
  RecordDecisionInput,
  RecordDecisionResult,
} from "./domain.js";

function toRecord(application: {
  id: string;
  status: PrismaLoanApplicationStatus;
  requestedAmountMinor: number;
  approvedAmountMinor: number | null;
  proposedByUserId: string | null;
  customerFullName: string;
  customerLastName: string;
  customerGender: string;
  customerTaxId: string;
  customerEmail: string;
  customerPhone: string;
  customerNationalId: string;
  monthlyIncomeMinor: number;
}): LoanApplicationRecord {
  return {
    id: application.id,
    status: application.status as LoanApplicationStatus,
    requestedAmountMinor: application.requestedAmountMinor,
    approvedAmountMinor: application.approvedAmountMinor,
    proposedByUserId: application.proposedByUserId,
    customer: {
      fullName: application.customerFullName,
      lastName: application.customerLastName,
      gender: application.customerGender,
      taxId: application.customerTaxId,
      email: application.customerEmail,
      phone: application.customerPhone,
      nationalId: application.customerNationalId,
      monthlyIncomeMinor: application.monthlyIncomeMinor,
    },
  };
}

export class PrismaLoanRepository implements LoanRepository {
  constructor(private readonly client: PrismaClient) {}

  async findApplication(id: string): Promise<LoanApplicationRecord | null> {
    const application = await this.client.loanApplication.findUnique({ where: { id } });
    return application ? toRecord(application) : null;
  }

  async listApplications(): Promise<LoanApplicationRecord[]> {
    const applications = await this.client.loanApplication.findMany({
      orderBy: { createdAt: "desc" },
    });
    return applications.map(toRecord);
  }

  async deleteApplication(id: string): Promise<LoanApplicationRecord> {
    const application = await this.client.loanApplication.delete({ where: { id } });
    return toRecord(application);
  }

  async recordDecision(input: RecordDecisionInput): Promise<RecordDecisionResult> {
    return this.client.$transaction(async (tx) => {
      const existing = await tx.loanApplication.findUnique({
        where: { id: input.applicationId },
        select: { status: true },
      });

      if (!existing) {
        return { outcome: "conflict" };
      }

      const updated = await tx.loanApplication.updateMany({
        where: {
          id: input.applicationId,
          status: {
            in: input.expectedStatuses as PrismaLoanApplicationStatus[],
          },
          ...(input.rejectActorAsProposer ? { proposedByUserId: { not: input.actorId } } : {}),
        },
        data: {
          status: input.nextStatus as PrismaLoanApplicationStatus,
          approvedAmountMinor: input.approvedAmountMinor,
          proposedByUserId: input.proposedByUserId,
        },
      });

      if (updated.count === 0) {
        return { outcome: "conflict" };
      }

      await tx.loanDecisionAudit.create({
        data: {
          applicationId: input.applicationId,
          actorId: input.actorId,
          previousStatus: existing.status,
          newStatus: input.nextStatus as PrismaLoanApplicationStatus,
          approvedAmountMinor: input.approvedAmountMinor,
          reason: input.reason,
        },
      });

      const application = await tx.loanApplication.findUniqueOrThrow({
        where: { id: input.applicationId },
      });

      return { outcome: "applied", application: toRecord(application) };
    });
  }
}
