"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQrIssueReportStatus } from "@/lib/actions/qrReports";

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

export default function QrIssueReportsList({ reports }: { reports: QrIssueReport[] }) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);

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

  return (
    <div className="mt-8">
      <h2 className="font-display font-600 text-lg text-ink">
        Issues reported via QR code {reports.filter((r) => r.status === "new").length > 0 && <span className="text-signal">({reports.filter((r) => r.status === "new").length} new)</span>}
      </h2>
      <div className="mt-3 space-y-3">
        {reports.map((r) => (
          <div key={r.id} className="bg-white border border-line rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-ink">{r.description}</p>
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
          </div>
        ))}
      </div>
    </div>
  );
}
