import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";

// a CSV download: never cached, named safely, and opened by spreadsheets as UTF-8
export function csvResponse(fileBase: string, rows: unknown[][]) {
  return new NextResponse(toCsv(rows), {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileBase}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
