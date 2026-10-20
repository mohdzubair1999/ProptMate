import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isIpBlocked, logSecurityEvent } from "@/lib/security";

// Checks the file's actual first bytes against known image format signatures, rather than
// trusting the client-supplied Content-Type header alone - that header is simple metadata
// the uploader controls, not a genuine verification of what the file actually is, and a
// mismatched or disguised file served back publicly from this endpoint is a real risk worth
// closing, not just a theoretical one.
function hasValidImageSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return isJpeg || isPng || isGif || isWebp;
}

export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  if (await isIpBlocked(clientIp)) {
    return NextResponse.json({ error: "Unable to process this upload" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(`qr-upload:${clientIp}`, 10, 15);
  if (!rateLimit.allowed) {
    await logSecurityEvent("rate_limit_exceeded", "low", clientIp, "upload-qr-report", "Exceeded 10 uploads in 15 minutes");
    return NextResponse.json({ error: "Too many uploads recently - please try again in a few minutes" }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const propertyId = formData.get("propertyId") as string | null;

  if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
  if (!file || file.size === 0) return NextResponse.json({ error: "No file was provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Please upload an image file" }, { status: 400 });
  // A firmer limit than the authenticated inspection-photo upload, since this endpoint is
  // reachable by anyone with the property's QR code, not just a logged-in inspector.
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image is too large - please use one under 8MB" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidImageSignature(bytes)) {
    await logSecurityEvent("invalid_file_upload", "low", clientIp, "upload-qr-report", `Rejected file claiming type "${file.type}" - failed genuine image signature check`);
    return NextResponse.json({ error: "This doesn't look like a genuine image file" }, { status: 400 });
  }

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "This property could not be found" }, { status: 404 });

  const blob = await put(`qr-issue-reports/${propertyId}-${Date.now()}-${file.name}`, new Blob([bytes], { type: file.type }), { access: "public" });
  return NextResponse.json({ url: blob.url });
}
