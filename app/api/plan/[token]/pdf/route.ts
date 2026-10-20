import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { checkRateLimit } from "@/lib/rateLimit";
import { SheetPdf } from "@/lib/pdf/SheetPdf";
import { loadSharedPlan } from "@/lib/floorPlanShareData";
import { buildSharedSheets, SHARE_TOKEN_RE } from "@/lib/floorPlanShare";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "plan";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

// The PDF of one floor of a shared plan, for anyone holding the link (no sign-in). Making a PDF is the costly part of
// this site, so it is rate limited per visitor; and a wrong, malformed or switched-off link is one identical 404.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!SHARE_TOKEN_RE.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 64);
  const limit = await checkRateLimit(`plan-share-pdf:${ip}`, 20, 15);
  if (!limit.allowed) return NextResponse.json({ error: "Too many downloads - please wait a few minutes and try again." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds ?? 300) } });

  const url = new URL(req.url);
  const floorParam = url.searchParams.get("floor") ?? "0";
  if (!/^\d{1,2}$/.test(floorParam)) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const floor = Number(floorParam);

  const plan = await loadSharedPlan(token);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const sheet = buildSharedSheets(plan).find((s) => s.index === floor);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  try {
    const buffer = await renderToBuffer(React.createElement(SheetPdf, { svg: sheet.svg, widthMm: sheet.widthMm, heightMm: sheet.heightMm, title: `Floor plan - ${plan.address}`, logo: sheet.logo }) as any);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${slug(plan.address)}-${slug(sheet.name)}.pdf"` },
    });
  } catch {
    return NextResponse.json({ error: "The PDF could not be made. Please try again." }, { status: 500, headers });
  }
}
