import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { LoanApplicationStatus, PrismaClient, UserRole } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  await prisma.user.upsert({
    where: { id: "user-underwriter-1" },
    update: {},
    create: { id: "user-underwriter-1", name: "Ada Underwriter", role: UserRole.UNDERWRITER },
  });

  await prisma.user.upsert({
    where: { id: "user-underwriter-2" },
    update: {},
    create: { id: "user-underwriter-2", name: "Grace Underwriter", role: UserRole.UNDERWRITER },
  });

  await prisma.user.upsert({
    where: { id: "user-support-1" },
    update: {},
    create: { id: "user-support-1", name: "Sam Support", role: UserRole.SUPPORT },
  });

  await prisma.loanApplication.upsert({
    where: { id: "app-pending" },
    update: {
      customerLastName: "Kovalenko",
      customerGender: "FEMALE",
      customerTaxId: "TAX-72419831",
    },
    create: {
      id: "app-pending",
      status: LoanApplicationStatus.PENDING_REVIEW,
      requestedAmountMinor: 500_000,
      customerFullName: "Olena Kovalenko",
      customerLastName: "Kovalenko",
      customerGender: "FEMALE",
      customerTaxId: "TAX-72419831",
      customerEmail: "olena@example.test",
      customerPhone: "+380501234567",
      customerNationalId: "ID-72419831",
      monthlyIncomeMinor: 180_000,
    },
  });

  await prisma.loanApplication.upsert({
    where: { id: "app-at-threshold" },
    update: {
      customerLastName: "Fixture",
      customerGender: "NON_BINARY",
      customerTaxId: "TAX-THRESHOLD",
    },
    create: {
      id: "app-at-threshold",
      status: LoanApplicationStatus.PENDING_REVIEW,
      requestedAmountMinor: 1_000_000,
      customerFullName: "Threshold Fixture",
      customerLastName: "Fixture",
      customerGender: "NON_BINARY",
      customerTaxId: "TAX-THRESHOLD",
      customerEmail: "threshold@example.test",
      customerPhone: "+380500000002",
      customerNationalId: "ID-THRESHOLD",
      monthlyIncomeMinor: 300_000,
    },
  });

  await prisma.loanApplication.upsert({
    where: { id: "app-high-value" },
    update: {
      customerLastName: "Fixture",
      customerGender: "MALE",
      customerTaxId: "TAX-HIGH-VALUE",
    },
    create: {
      id: "app-high-value",
      status: LoanApplicationStatus.PENDING_REVIEW,
      requestedAmountMinor: 2_000_000,
      customerFullName: "High Value Fixture",
      customerLastName: "Fixture",
      customerGender: "MALE",
      customerTaxId: "TAX-HIGH-VALUE",
      customerEmail: "high-value@example.test",
      customerPhone: "+380500000003",
      customerNationalId: "ID-HIGH-VALUE",
      monthlyIncomeMinor: 600_000,
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
