"use client";

import { useState } from "react";
import { exportMyData, deleteMyAccount } from "@/lib/actions/account";

export default function AccountDangerZone({ soleUser }: { soleUser: boolean }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setExportError("");
    const res = await exportMyData();
    setExporting(false);

    if (res.error || !res.data) {
      setExportError(res.error || "Something went wrong — please try again.");
      return;
    }

    // Building the download entirely client-side from the returned data, rather than a
    // server-generated file — simpler, and avoids needing separate file storage/cleanup
    // for what's essentially a one-time, personal download.
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proptmate-data-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (formData: FormData) => {
    setDeleting(true);
    setDeleteError("");
    const res = await deleteMyAccount(formData);
    // A successful deletion redirects server-side and never returns here — reaching this
    // point at all means it failed.
    setDeleting(false);
    if (res?.error) setDeleteError(res.error);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-line rounded-xl p-6">
        <h2 className="font-display font-600 text-lg text-ink">Export your data</h2>
        <p className="text-sm text-slate mt-1">
          Download everything tied to your account{soleUser ? "" : " and company"} — properties, inspections, and templates — as a single JSON file.
        </p>
        {exportError && <p className="text-sm text-red-600 mt-2">{exportError}</p>}
        <button onClick={handleExport} disabled={exporting} className="mt-4 border border-line text-ink px-5 py-2.5 rounded-full text-sm font-medium hover:border-ink transition-colors disabled:opacity-50">
          {exporting ? "Preparing…" : "Download my data"}
        </button>
      </div>

      <div className="bg-white border border-red-200 rounded-xl p-6">
        <h2 className="font-display font-600 text-lg text-red-700">Delete account</h2>
        <p className="text-sm text-slate mt-1">
          {soleUser
            ? "You're the only member of your company — deleting your account permanently removes your company, all properties, inspections, and reports. This cannot be undone."
            : "This removes your own account and access. Your company's shared data stays intact for the rest of your team."}
        </p>

        {!showDeleteForm ? (
          <button onClick={() => setShowDeleteForm(true)} className="mt-4 border border-red-300 text-red-700 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-red-50 transition-colors">
            Delete my account
          </button>
        ) : (
          <form action={handleDelete} className="mt-4 space-y-4 max-w-sm">
            <div>
              <label className="text-sm text-slate">Confirm your password</label>
              <input
                type="password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <div>
              <label className="text-sm text-slate">
                Type <strong className="text-ink">DELETE</strong> to confirm
              </label>
              <input
                type="text"
                name="confirmText"
                required
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={deleting || confirmText !== "DELETE"}
                className="bg-red-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
              <button type="button" onClick={() => setShowDeleteForm(false)} className="text-sm text-slate hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
