import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

// A general-purpose document upload — unlike /api/upload, this isn't tied to an existing
// inspection item or field answer, since it's used for reference documents (like an
// externally-sourced check-in report) that don't attach to a specific field at upload time.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = String(formData.get("folder") || "documents").replace(/[^a-z0-9-]/gi, "");

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const MAX_SIZE = 20 * 1024 * 1024; // 20MB — matches the AI extraction routes' own limit
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File is too large (max 20MB)" }, { status: 400 });
  }

  const blob = await put(`${folder}/${Date.now()}-${file.name}`, file, { access: "public" });
  return NextResponse.json({ url: blob.url });
}
