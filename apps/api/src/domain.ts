export type UserRole = "UNDERWRITER" | "SUPPORT";
export type LoanApplicationStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type LoanDecision = "APPROVED" | "REJECTED";

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
  newStatus: LoanDecision;
  approvedAmountMinor: number | null;
  reason: string;
}

export interface LoanRepository {
  findApplication(id: string): Promise<LoanApplicationRecord | null>;
  listApplications(): Promise<LoanApplicationRecord[]>;
  deleteApplication(id: string): Promise<LoanApplicationRecord>;
  updateApplication(
    id: string,
    decision: LoanDecision,
    approvedAmountMinor: number | null,
  ): Promise<LoanApplicationRecord>;
  createAudit(input: AuditRecordInput): Promise<void>;
}

export interface AppLogger {
  info(context: Record<string, unknown>, message: string): void;
}

export interface RequestContext {
  repository: LoanRepository;
  session: { user: SessionUser } | null;
  logger: AppLogger;
}
