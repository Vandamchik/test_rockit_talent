import type { LoanNotifier } from "./notifier.js";

export type UserRole = "UNDERWRITER" | "SUPPORT";

export type LoanApplicationStatus =
  "PENDING_REVIEW" | "PENDING_CONFIRMATION" | "APPROVED" | "REJECTED";

export type LoanDecision = "APPROVED" | "REJECTED" | "CONFIRMED";

export const HIGH_VALUE_THRESHOLD_MINOR = 1_000_000;

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface LoanApplicationRecord {
  id: string;
  status: LoanApplicationStatus;
  requestedAmountMinor: number;
  approvedAmountMinor: number | null;
  proposedByUserId: string | null;
  customer: {
    fullName: string;
    lastName: string;
    gender: string;
    taxId: string;
    email: string;
    phone: string;
    nationalId: string;
    monthlyIncomeMinor: number;
  };
}

export interface LoanApplicationView {
  id: string;
  status: LoanApplicationStatus;
  requestedAmountMinor: number;
  approvedAmountMinor: number | null;
  proposedByUserId: string | null;
  customer: {
    fullName: string;
    lastName: string;
    gender: string;
    taxId: string;
    email: string;
  };
}

export interface DecideLoanApplicationInput {
  applicationId: string;
  decision: LoanDecision;
  approvedAmountMinor?: number | undefined;
  reason: string;
}

export interface AuditRecordInput {
  applicationId: string;
  actorId: string;
  previousStatus: LoanApplicationStatus;
  newStatus: LoanApplicationStatus;
  approvedAmountMinor: number | null;
  reason: string;
}

export interface RecordDecisionInput {
  applicationId: string;
  actorId: string;
  expectedStatuses: LoanApplicationStatus[];
  nextStatus: LoanApplicationStatus;
  approvedAmountMinor: number | null;
  proposedByUserId: string | null;
  rejectActorAsProposer: boolean;
  reason: string;
}

export type RecordDecisionResult =
  { outcome: "applied"; application: LoanApplicationRecord } | { outcome: "conflict" };

export interface LoanRepository {
  findApplication(id: string): Promise<LoanApplicationRecord | null>;
  listApplications(): Promise<LoanApplicationRecord[]>;
  deleteApplication(id: string): Promise<LoanApplicationRecord>;
  recordDecision(input: RecordDecisionInput): Promise<RecordDecisionResult>;
}

export interface AppLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export interface RequestContext {
  repository: LoanRepository;
  session: { user: SessionUser } | null;
  logger: AppLogger;
  notifier: LoanNotifier;
}
