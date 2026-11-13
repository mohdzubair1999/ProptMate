import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { userRateLimit } from "@/lib/aiGuard";
import { readUpload, safeFileName } from "@/lib/uploadGuard";

// Only the folders this upload is really used for. In particular it can no longer write into the photo folders
// (inspection-photos, field-photos), which other parts of the app treat as "this is a photo".
const ALLOWED_FOLDERS = new Set(["documents", "check-in-imports"]);

// A general-purpose document upload — unlike /api/upload, this isn't tied to an existing
// inspection item or field answer, since it's used for reference documents (like an
// externally-sourced check-in report) that don't attach to a specific field at upload time.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limited = await userRateLimit(session, "upload-document", { max: 60, windowMin: 15, companyDaily: 1000 });
  if (limited) return limited;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = String(formData.get("folder") || "documents").replace(/[^a-z0-9-]/gi, "");
  if (!ALLOWED_FOLDERS.has(folder)) {
    return NextResponse.json({ error: "Unknown upload folder" }, { status: 400 });
  }

  // 20MB matches the AI extraction routes' own limit. Only a PDF or an image, judged by what the file really is.
  const upload = await readUpload(file, { allow: ["pdf", "image"], maxBytes: 20 * 1024 * 1024 });
  if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: upload.status });

  const blob = await put(`${folder}/${Date.now()}-${safeFileName(file?.name, upload.type.ext)}`, upload.bytes, { access: "public", contentType: upload.type.mime });
  return NextResponse.json({ url: blob.url });
}
