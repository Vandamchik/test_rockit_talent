-- PostgreSQL allows adding an enum value inside a transaction but forbids using it in
-- that same transaction, and Prisma wraps every migration in one. This value therefore
-- has to land alone; the migration that references it follows separately.
ALTER TYPE "LoanApplicationStatus" ADD VALUE 'PENDING_CONFIRMATION';