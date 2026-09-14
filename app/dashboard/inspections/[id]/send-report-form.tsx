"use client";

import { useState } from "react";
import { sendReportForAcknowledgement } from "@/lib/actions/acknowledgements";
import MenuModal from "./menu-modal";

type Recipient = { email: string; name: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A compose window styled after Gmail/Outlook/Yahoo - chip-style recipients, a visible
// editable subject line, a real multi-line body, and a genuine attachment indicator -
// wrapped in the app's existing MenuModal so it opens as a proper overlay rather than an
// inline form sitting in the middle of the page.
export default function SendReportForm({
  inspectionId,
  initialRecipients,
  defaultSubject,
  reportFileName,
}: {
  inspectionId: string;
  initialRecipients: Recipient[];
  defaultSubject: string;
  reportFileName: string;
}) {
  const DEFAULT_MESSAGE = "Please find your report attached below.";

  // Chip-style recipients for plain email mode - just addresses, since a plain email never
  // displays anyone's name. Signature mode keeps the separate name+email row structure below,
  // since it genuinely needs a name per recipient (shown back to them when they confirm).
  const [chips, setChips] = useState<string[]>(initialRecipients.map((r) => r.email).filter(Boolean));
  const [chipInput, setChipInput] = useState("");
  const [rows, setRows] = useState<Recipient[]>(initialRecipients.length > 0 ? initialRecipients : [{ email: "", name: "" }]);

  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [requireSignature, setRequireSignature] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [sentCount, setSentCount] = useState(0);

  const addChipFromInput = () => {
    const trimmed = chipInput.trim().replace(/,$/, "");
    if (!trimmed) return;
    if (!EMAIL_PATTERN.test(trimmed)) {
      setErrorMsg(`"${trimmed}" doesn't look like a valid email address`);
      return;
    }
    if (!chips.includes(trimmed)) setChips((prev) => [...prev, trimmed]);
    setChipInput("");
    setErrorMsg("");
  };
  const removeChip = (email: string) => setChips((prev) => prev.filter((c) => c !== email));

  const updateRow = (i: number, field: "email" | "name", value: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { email: "", name: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const send = async (e: React.FormEvent, onSuccess: () => void) => {
    e.preventDefault();
    setSending(true);
    setStatus("idle");
    setErrorMsg("");

    try {
      if (requireSignature) {
        const filled = rows.map((r) => ({ email: r.email.trim(), name: r.name.trim() })).filter((r) => r.email);
        if (filled.length === 0) {
          setStatus("error");
          setErrorMsg("Add at least one recipient");
          setSending(false);
          return;
        }
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
        // A recipient still typed into the box but not yet turned into a chip (didn't press
        // Enter/comma) is a genuinely easy thing to do right before hitting send - counted in
        // rather than silently dropped.
        const pending = chipInput.trim().replace(/,$/, "");
        const allRecipients = pending && EMAIL_PATTERN.test(pending) ? [...chips, pending] : chips;

        if (allRecipients.length === 0) {
          setStatus("error");
          setErrorMsg("Add at least one recipient");
          setSending(false);
          return;
        }

        const res = await fetch("/api/email/send-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionId, recipientEmails: allRecipients, message, subject }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setErrorMsg(data.error || "Something went wrong");
          return;
        }
        setSentCount(allRecipients.length);
        setStatus("sent");
        setChips([]);
        setChipInput("");
      }

      setRows(initialRecipients.length > 0 ? initialRecipients : [{ email: "", name: "" }]);
      setMessage(DEFAULT_MESSAGE);
      setSubject(defaultSubject);
      onSuccess();
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
    <MenuModal label="Email report" icon="✉️" title="New message">
      {(close) => (
        <form
          onSubmit={(e) =>
            send(e, () => {
              // A brief, visible pause so the "Sent to N people" confirmation is actually
              // seen before the window closes, rather than an instant, jarring disappearance
              // right as the inspector's eyes land on it.
              setTimeout(close, 1100);
            })
          }
          className="space-y-3"
        >
        {initialRecipients.length > 0 && (
          <p className="text-xs text-slate">Pre-filled with everyone linked to this property — edit freely before sending.</p>
        )}

        {requireSignature ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate uppercase tracking-wide">To</label>
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  placeholder="Name"
                  value={row.name}
                  onChange={(e) => updateRow(i, "name", e.target.value)}
                  className="w-1/3 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                />
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
          </div>
        ) : (
          <div className="border-b border-line pb-2">
            <div className="flex items-center flex-wrap gap-1.5">
              <label className="text-xs font-medium text-slate uppercase tracking-wide mr-1">To</label>
              {chips.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 bg-paper border border-line rounded-full pl-3 pr-1.5 py-1 text-sm text-ink">
                  {email}
                  <button type="button" onClick={() => removeChip(email)} className="text-slate hover:text-red-600 leading-none px-0.5" title="Remove">
                    ✕
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={chipInput}
                onChange={(e) => setChipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                    if (chipInput.trim()) {
                      e.preventDefault();
                      addChipFromInput();
                    }
                  } else if (e.key === "Backspace" && !chipInput && chips.length > 0) {
                    removeChip(chips[chips.length - 1]);
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!pasted.includes(",") && !pasted.includes(";") && !/\s/.test(pasted.trim())) return; // a single address - let the normal typed-input path handle it
                  e.preventDefault();
                  const candidates = pasted.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
                  const valid = candidates.filter((c) => EMAIL_PATTERN.test(c));
                  const invalidCount = candidates.length - valid.length;
                  setChips((prev) => [...prev, ...valid.filter((v) => !prev.includes(v))]);
                  setChipInput("");
                  setErrorMsg(invalidCount > 0 ? `Added ${valid.length} valid address${valid.length === 1 ? "" : "es"} — skipped ${invalidCount} that didn't look right` : "");
                }}
                onBlur={addChipFromInput}
                placeholder={chips.length === 0 ? "recipient@email.com" : "Add another…"}
                className="flex-1 min-w-[140px] border-0 px-1 py-1 text-sm focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="border-b border-line pb-2 flex items-center gap-2">
          <label className="text-xs font-medium text-slate uppercase tracking-wide">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 border-0 px-1 py-1 text-sm focus:outline-none"
          />
        </div>

        {!requireSignature && (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Write a message…"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal resize-none"
          />
        )}

        <div className="flex items-center gap-1.5 text-xs text-slate bg-paper border border-line rounded-lg px-2.5 py-1.5 w-fit">
          📎 {reportFileName}
        </div>

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

        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            disabled={sending}
            className="bg-signal text-white px-6 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {sending ? "Sending…" : requireSignature ? "Send for confirmation" : "Send"}
          </button>
          {status === "sent" && (
            <p className="text-xs text-verified">
              Sent to {sentCount} {sentCount === 1 ? "person" : "people"}.
            </p>
          )}
        </div>
        {status === "error" && <p className="text-xs text-red-600">{errorMsg}</p>}
        </form>
      )}
    </MenuModal>
  );
}
