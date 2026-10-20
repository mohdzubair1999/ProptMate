"use client";

import { useState } from "react";
import { TYPE_LABELS, DOCUMENT_DEFAULTS, addMonthsClamped } from "@/lib/complianceDocumentTypes";

export default function DocumentDateFields() {
  const [type, setType] = useState("GAS_SAFETY");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [certificateNumber, setCertificateNumber] = useState("");
  const [issuingBody, setIssuingBody] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<"idle" | "success" | "low-confidence" | "failed">("idle");

  const applyAutoSuggest = (newType: string, newIssueDate: string) => {
    if (expiryTouched || !newIssueDate) return;
    const months = DOCUMENT_DEFAULTS[newType]?.renewalMonths;
    if (!months) return;
    const suggested = addMonthsClamped(new Date(newIssueDate), months);
    setExpiryDate(suggested.toISOString().split("T")[0]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtracting(true);
    setExtractResult("idle");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ai/extract-compliance-document", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || !data.extracted) {
        setExtractResult("failed");
        return;
      }

      const { documentType: extType, issueDate: extIssue, expiryDate: extExpiry, certificateNumber: extCert, issuingBody: extBody, confidence } = data.extracted;

      if (extType && TYPE_LABELS[extType]) {
        setType(extType);
        applyAutoSuggest(extType, extIssue || issueDate);
      }
      if (extIssue) setIssueDate(extIssue);
      if (extExpiry) {
        setExpiryDate(extExpiry);
        setExpiryTouched(true); // a real extracted date takes priority over the auto-suggest heuristic
      }
      if (extCert) setCertificateNumber(extCert);
      if (extBody) setIssuingBody(extBody);

      setExtractResult(confidence === "low" ? "low-confidence" : "success");
    } catch {
      setExtractResult("failed");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <>
      <div className="col-span-2">
        <label className="text-sm text-slate">Upload certificate (optional, PDF or photo)</label>
        <input type="file" name="file" accept="application/pdf,image/*" onChange={handleFileChange} className="mt-1 w-full text-sm" />
        {extracting && <p className="text-xs text-slate mt-1">Reading certificate…</p>}
        {extractResult === "success" && <p className="text-xs text-verified mt-1">✓ Read successfully — please double-check the fields below.</p>}
        {extractResult === "low-confidence" && (
          <p className="text-xs text-signal mt-1">⚠ Read with low confidence — please carefully check every field below.</p>
        )}
        {extractResult === "failed" && <p className="text-xs text-slate mt-1">Couldn't read this file automatically — please fill in the fields below by hand.</p>}
      </div>

      <div className="col-span-2">
        <label className="text-sm text-slate">Document type</label>
        <select
          name="type"
          required
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            applyAutoSuggest(e.target.value, issueDate);
          }}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-slate">Issue date (optional)</label>
        <input
          type="date"
          name="issueDate"
          value={issueDate}
          onChange={(e) => {
            setIssueDate(e.target.value);
            applyAutoSuggest(type, e.target.value);
          }}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>
      <div>
        <label className="text-sm text-slate">
          Expiry date (optional)
          {DOCUMENT_DEFAULTS[type]?.renewalMonths && !expiryTouched && issueDate && (
            <span className="text-verified"> — suggested</span>
          )}
        </label>
        <input
          type="date"
          name="expiryDate"
          value={expiryDate}
          onChange={(e) => {
            setExpiryDate(e.target.value);
            setExpiryTouched(true);
          }}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>
      <div>
        <label className="text-sm text-slate">Certificate number (optional)</label>
        <input
          name="certificateNumber"
          value={certificateNumber}
          onChange={(e) => setCertificateNumber(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>
      <div>
        <label className="text-sm text-slate">Issuing body (optional)</label>
        <input
          name="issuingBody"
          value={issuingBody}
          onChange={(e) => setIssuingBody(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>
    </>
  );
}
