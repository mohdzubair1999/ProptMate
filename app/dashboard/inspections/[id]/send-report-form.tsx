"use client";

import { useState } from "react";
import { sendReportForAcknowledgement } from "@/lib/actions/acknowledgements";

type Recipient = { email: string; name: string };

export default function SendReportForm({
  inspectionId,
  initialRecipients,
}: {
  inspectionId: string;
  initialRecipients: Recipient[];
}) {
  const DEFAULT_MESSAGE = "Please find your report attached below.";
  const startingRows = initialRecipients.length > 0 ? initialRecipients : [{ email: "", name: "" }];

  const [rows, setRows] = useState<Recipient[]>(startingRows);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [requireSignature, setRequireSignature] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [sentCount, setSentCount] = useState(0);

  const updateRow = (i: number, field: "email" | "name", value: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { email: "", name: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setStatus("idle");
    setErrorMsg("");

    const filled = rows.map((r) => ({ email: r.email.trim(), name: r.name.trim() })).filter((r) => r.email);

    if (filled.length === 0) {
      setStatus("error");
      setErrorMsg("Add at least one recipient");
      setSending(false);
      return;
    }

    try {
      if (requireSignature) {
        // Signature mode genuinely needs a name for every recipient - it's what gets shown
        // back to them to confirm before they sign, unlike a plain email which never displays
        // a name to anyone.
        const missingName = filled.find((r) => !r.name);
        if (missingName) {
          setStatus("error");
          setErrorMsg(`Add a name for ${missingName.email} — required so they see who they're confirming as`);
          setSending(false);
          return;
        }

        const formData = new FormData();
        formData.set("inspectionId", inspectionId);
        for (const r of filled) {
          formData.append("recipientEmails", r.email);
          formData.append("recipientNames", r.name);
        }

        const result = await sendReportForAcknowledgement(undefined, formData);
        if (result.error) {
          setStatus("error");
          setErrorMsg(result.error);
          return;
        }
        setSentCount(result.sent || filled.length);
        setStatus("sent");
      } else {
        const res = await fetch("/api/email/send-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionId, recipientEmails: filled.map((r) => r.email), message }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setErrorMsg(data.error || "Something went wrong");
          return;
        }
        setSentCount(filled.length);
        setStatus("sent");
      }

      setRows(startingRows);
      setMessage(DEFAULT_MESSAGE);
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      setStatus("error");
      setErrorMsg("Something went wrong");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="mt-4 max-w-sm space-y-3">
      {initialRecipients.length > 0 && (
        <p className="text-xs text-slate">Pre-filled with everyone linked to this property — edit freely before sending.</p>
      )}

      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {requireSignature && (
            <input
              placeholder="Name"
              value={row.name}
              onChange={(e) => updateRow(i, "name", e.target.value)}
              className="w-1/3 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
            />
          )}
          <input
            type="email"
            placeholder="recipient@email.com"
            value={row.email}
            onChange={(e) => updateRow(i, "email", e.target.value)}
            className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
          />
          {rows.length > 1 && (
            <button type="button" onClick={() => removeRow(i)} className="text-slate hover:text-red-600 text-sm px-1" title="Remove">
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs text-signal hover:underline">
        + Add another recipient
      </button>

      {!requireSignature && (
        <input
          type="text"
          placeholder="Optional message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      )}

      <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={requireSignature} onChange={(e) => setRequireSignature(e.target.checked)} className="mt-0.5 rounded border-line" />
        <span>
          Require e-signature to confirm receipt
          <span className="block text-xs text-slate font-normal">
            {requireSignature
              ? "Each person gets a link to view the report and sign to confirm they received it — useful when you need proof, not just a record it was emailed."
              : "Off: just a normal email with the report attached, no confirmation tracked."}
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={sending}
        className="bg-ink text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-signal transition-colors disabled:opacity-50 w-fit"
      >
        {sending ? "Sending…" : requireSignature ? "📨 Send for confirmation" : "📧 Email report"}
      </button>
      {status === "sent" && (
        <p className="text-xs text-verified">
          Sent to {sentCount} {sentCount === 1 ? "person" : "people"}.
        </p>
      )}
      {status === "error" && <p className="text-xs text-red-600">{errorMsg}</p>}
    </form>
  );
}
