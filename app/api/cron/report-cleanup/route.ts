import { hasCronSecret } from "@/lib/safeEqual";
import { NextRequest, NextResponse } from "next/server";
import { runReportCleanup } from "@/lib/reportCleanup";

// Daily: removes report PDFs that were replaced more than 90 days ago (see lib/reportRetention.ts). Same CRON_SECRET check as the other cron route.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!hasCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runReportCleanup();
  return NextResponse.json(result);
}
