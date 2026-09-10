"use client";

import type { LoanApplicationView } from "@loan-review/api/types";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { trpc } from "@/lib/trpc";

const columnHelper = createColumnHelper<LoanApplicationView>();

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(minor / 100);
}

const columns = [
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <input
        aria-label="Select all applications on this page"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
        type="checkbox"
      />
    ),
    cell: ({ row }) => (
      <input
        aria-label={`Select application ${row.original.id}`}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        type="checkbox"
      />
    ),
  }),
  columnHelper.accessor("id", {
    header: "Application",
    cell: ({ getValue }) => <Link href={`/applications/${getValue()}`}>{getValue()}</Link>,
  }),
  columnHelper.accessor("customer.fullName", {
    header: "Customer",
  }),
  columnHelper.accessor("customer.gender", {
    header: "Gender",
  }),
  columnHelper.accessor("customer.taxId", {
    header: "Tax ID",
  }),
  columnHelper.accessor("requestedAmountMinor", {
    header: "Requested",
    cell: ({ getValue }) => formatMoney(getValue()),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => (
      <span className={`status status-${getValue().toLowerCase()}`}>{getValue()}</span>
    ),
  }),
];

export function ApplicationsList() {
  const applicationsQuery = trpc.loanApplications.list.useQuery();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 2;
  const applications = applicationsQuery.data ?? [];
  const pageCount = Math.ceil(applications.length / pageSize);
  const pageApplications = useMemo(
    () => applications.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [applications, pageIndex],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      void applicationsQuery.refetch();
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [applicationsQuery]);

  const table = useReactTable({
    data: pageApplications,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
  });

  if (applicationsQuery.isFetching) {
    return <main className="shell applications-shell">Loading applications…</main>;
  }

  if (applicationsQuery.isError) {
    return (
      <main className="shell applications-shell" role="alert">
        Could not load applications: {applicationsQuery.error.message}
      </main>
    );
  }

  return (
    <main className="shell applications-shell">
      <div className="eyebrow">Underwriting workspace</div>
      <div className="title-row">
        <div>
          <h1>Applications</h1>
          <p className="lede">Review and select submitted loan applications.</p>
        </div>
        <span className="selection-count">{Object.keys(rowSelection).length} selected</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} scope="col">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr data-selected={row.getIsSelected() || undefined} key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button
          disabled={pageIndex === 0}
          onClick={() => setPageIndex((current) => current - 1)}
          type="button"
        >
          Previous
        </button>
        <span>
          Page {pageIndex + 1} of {pageCount}
        </span>
        <button
          disabled={pageIndex + 1 >= pageCount}
          onClick={() => setPageIndex((current) => current + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </main>
  );
}
