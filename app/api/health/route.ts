import { NextResponse } from "next/server";

// Deliberately does nothing but respond - no database query, no auth check. Used by the
// offlineQueue.ts and offlinePhotoQueue.ts to confirm the server is genuinely reachable,
// since navigator.onLine only reflects whether a network interface is up, not whether it
// can actually reach anything (e.g. connected to wifi with no real internet access still
// reports true). Kept this cheap deliberately, since it may be polled repeatedly while
// waiting for connectivity to return.
export async function GET() {
  return NextResponse.json({ ok: true });
}
