"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createJobFromQrReport, updateQrIssueReportStatus } from "@/lib/actions/qrReports";
import { EMERGENCY_ADVICE, URGENCY_LABEL, sortReports, triageReport, type Urgency } from "@/lib/qrTriage";

type QrIssueReport = {
  id: string;
  description: string;
  photoUrl: string | null;
  reporterName: string | null;
  reporterContact: string | null;
  status: string;
  createdAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-signal/10 text-signal",
  reviewed: "bg-line/40 text-slate",
  resolved: "bg-verified/10 text-verified",
};
const URGENCY_STYLES: Record<Urgency, string> = {
  emergency: "bg-red-600 text-white",
  urgent: "bg-amber-100 text-amber-800",
  routine: "bg-line/40 text-slate",
};

export default function QrIssueReportsList({ reports }: { reports: QrIssueReport[] }) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);
  const [jobMade, setJobMade] = useState<Record<string, "made" | "already">>({});
  const [error, setError] = useState("");

  if (reports.length === 0) return null;

  const handleStatusChange = async (reportId: string, status: string) => {
    setUpdating(reportId);
    try {
      await updateQrIssueReportStatus(reportId, status as "new" | "reviewed" | "resolved");
      router.refresh();
    } finally {
      setUpdating(null);
    }
  };
  const handleMakeJob = async (reportId: string) => {
    setUpdating(reportId);
    setError("");
    try {
      const r = await createJobFromQrReport(reportId);
      setJobMade((prev) => ({ ...prev, [reportId]: r.created ? "made" : "already" }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the job. Please try again.");
    } finally {
      setUpdating(null);
    }
  };

  const sorted = sortReports(reports);
  const openEmergencies = sorted.filter((r) => r.status !== "resolved" && triageReport(r.description).urgency === "emergency").length;

  return (
    <div className="mt-8">
      <h2 className="font-display font-600 text-lg text-ink">
        Issues reported via QR code {reports.filter((r) => r.status === "new").length > 0 && <span className="text-signal">({reports.filter((r) => r.status === "new").length} new)</span>}
      </h2>
      <p className="text-xs text-slate mt-1">Most serious first. The label is a suggestion from the words used, so please read each report yourself.</p>
      {openEmergencies > 0 && (
        <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800" data-testid="qr-emergency-banner">
          <strong>{openEmergencies === 1 ? "1 open report sounds like an emergency." : `${openEmergencies} open reports sound like emergencies.`}</strong> {EMERGENCY_ADVICE}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="mt-3 space-y-3">
        {sorted.map((r) => {
          const t = triageReport(r.description);
          const done = r.status === "resolved";
          return (
            <div key={r.id} className={`bg-white border rounded-xl p-4 ${t.urgency === "emergency" && !done ? "border-red-300" : "border-line"}`} data-testid="qr-report" data-urgency={t.urgency}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${done ? "bg-line/40 text-slate" : URGENCY_STYLES[t.urgency]}`} data-testid="qr-urgency">{URGENCY_LABEL[t.urgency]}</span>
                    <span className="text-xs text-slate" data-testid="qr-category">{t.category}</span>
                  </div>
                  <p className="text-sm text-ink">{r.description}</p>
                  {t.reasons.length > 0 && !done && <p className="text-xs text-slate mt-1" data-testid="qr-reasons">Suggested from: {t.reasons.map((w) => `"${w}"`).join(", ")}</p>}
                  {(r.reporterName || r.reporterContact) && (
                    <p className="text-xs text-slate mt-1">{[r.reporterName, r.reporterContact].filter(Boolean).join(" · ")}</p>
                  )}
                  <p className="text-xs text-slate mt-1">{new Date(r.createdAt).toLocaleString("en-GB")}</p>
                </div>
                <select
                  value={r.status}
                  onChange={(e) => handleStatusChange(r.id, e.target.value)}
                  disabled={updating === r.id}
                  className={`text-xs px-2 py-1 rounded-full font-medium border-0 ${STATUS_STYLES[r.status] || STATUS_STYLES.new}`}
                >
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              {r.photoUrl && <img src={r.photoUrl} alt="" className="mt-3 rounded-lg max-h-48" />}
              {!done && (
                <div className="mt-3">
                  {jobMade[r.id] ? (
                    <span className="text-xs text-verified" data-testid="qr-job-made">{jobMade[r.id] === "made" ? "Maintenance job created: see the property's jobs." : "There is already an open job for this report."}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleMakeJob(r.id)}
                      disabled={updating === r.id}
                      data-testid="qr-make-job"
                      className="text-xs rounded-full border border-line px-3 py-1 text-ink hover:border-signal disabled:opacity-50"
                    >
                      Make a maintenance job
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
