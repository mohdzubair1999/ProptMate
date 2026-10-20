"use client";

import { useState } from "react";
import { submitQrIssueReport } from "@/lib/actions/qrReports";

export default function QrReportForm({ propertyId }: { propertyId: string }) {
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("propertyId", propertyId);
      const res = await fetch("/api/upload-qr-report", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't upload that photo");
      setPhotoUrl(data.url);
    } catch (err: any) {
      setError(err?.message || "Couldn't upload that photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await submitQrIssueReport(propertyId, description, photoUrl || undefined, reporterName || undefined, reporterContact || undefined);
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || "Couldn't submit this report");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mt-6 bg-white border border-line rounded-xl p-5 text-center">
        <p className="text-ink font-medium">Thanks - this has been reported.</p>
        <p className="text-sm text-slate mt-1">The property team will follow up.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-white border border-line rounded-xl p-5">
      <label className="block text-sm font-medium text-ink mb-1">What's the issue?</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        placeholder="e.g. Tap in the bathroom is dripping"
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      <label className="block text-sm font-medium text-ink mt-4 mb-1">Photo (optional)</label>
      <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-sm" />
      {uploading && <p className="text-xs text-slate mt-1">Uploading…</p>}
      {photoUrl && <img src={photoUrl} alt="" className="mt-2 rounded-lg max-h-40" />}

      <label className="block text-sm font-medium text-ink mt-4 mb-1">Your name (optional)</label>
      <input
        type="text"
        value={reporterName}
        onChange={(e) => setReporterName(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      <label className="block text-sm font-medium text-ink mt-4 mb-1">Phone or email (optional, in case we need to follow up)</label>
      <input
        type="text"
        value={reporterContact}
        onChange={(e) => setReporterContact(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting || uploading || !description.trim()}
        className="mt-4 bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Report this issue"}
      </button>
    </div>
  );
}
