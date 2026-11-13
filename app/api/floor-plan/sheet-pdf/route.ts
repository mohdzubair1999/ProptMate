import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSession } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { SheetPdf, parseSvg, MAX_SVG_BYTES } from "@/lib/pdf/SheetPdf";

export const maxDuration = 30;

// Turns a plan sheet (built in the browser by lib/floorPlanSheet.ts) into a vector PDF. The SVG comes from the
// browser, so it is treated as untrusted: it is parsed by a strict whitelist converter (lib/pdf/SheetPdf.tsx) that
// keeps only plain drawing shapes and checks every value. Nothing is fetched, stored or run.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(session.user as any).companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });

  const limit = await checkRateLimit(`floorplan-pdf:${session.user.id}`, 30, 15);
  if (!limit.allowed) {
    return NextResponse.json({ error: "That's a lot of exports - please wait a few minutes and try again." }, { status: 429 });
  }

  // Refuse an oversized request before reading it.
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_SVG_BYTES * 1.3) return NextResponse.json({ error: "That plan is too large to export." }, { status: 413 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const svg = typeof body?.svg === "string" ? body.svg : "";
  const widthMm = Number(body?.widthMm);
  const heightMm = Number(body?.heightMm);
  const title = typeof body?.title === "string" ? body.title.slice(0, 200) : "Floor plan";
  if (svg.length === 0 || svg.length > MAX_SVG_BYTES) return NextResponse.json({ error: "That plan is too large to export." }, { status: 413 });
  // A real sheet is A4 or A3 (or something near), never a postage stamp or a billboard.
  if (!(widthMm >= 100 && widthMm <= 1200 && heightMm >= 100 && heightMm <= 1200)) return NextResponse.json({ error: "Invalid page size" }, { status: 400 });
  if (!parseSvg(svg)) return NextResponse.json({ error: "That plan could not be read. Please try again." }, { status: 400 });

  try {
    const buffer = await renderToBuffer(React.createElement(SheetPdf, { svg, widthMm, heightMm, title, logo: body?.logo }) as any);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="floor-plan.pdf"', "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "The PDF could not be made. Please try again." }, { status: 500 });
  }
}
