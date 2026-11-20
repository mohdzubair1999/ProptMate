"use client";

import { useState } from "react";

// Downloads a file from one of our own routes. If the server refuses (nothing to export, too many downloads), the reason is shown in
// words instead of a page of raw error text.
export default function DownloadButton({ url, label, fallbackName }: { url: string; label: string; fallbackName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : "The download couldn't be made. Please try again.");
        return;
      }
      const blob = await res.blob();
      const named = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1];
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = named && /^[\w.\-]+$/.test(named) ? named : fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="download-button">
      <button type="button" onClick={download} disabled={busy} className="border border-line text-ink px-5 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors disabled:opacity-50">
        {busy ? "Preparing…" : label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 mt-2 max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}
