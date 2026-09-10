import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan review workbench",
  description: "Manual underwriting decision workspace",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
