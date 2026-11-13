"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { importCheckInReport } from "@/lib/actions/inspections";

type TemplateFieldInfo = {
  id: string;
  sectionTitle: string;
  label: string;
  type: string;
  options?: string;
};

type RoomSummary = { room: string; summary: string };
// "manual" marks a value the person typed themselves during review; "from-summary" marks
// one pre-filled from the matching room summary — kept distinct from both AI confidence
// levels and from each other, so it's clear at a glance where each value actually came from.
type FieldValue = { value: string; confidence: "high" | "low" | "manual" | "from-summary" };

// Sizes a comment textarea to its actual content rather than a fixed row count tied only
// to the field's static type — a pre-filled room summary can be several sentences long,
// and a fixed single row would visually hide most of it even though the full text is
// genuinely present underneath, just not visible without scrolling.
function computeTextareaRows(value: string, minRows: number, charsPerRow = 55, maxRows = 8): number {
  if (!value) return minRows;
  const newlineRows = value.split("\n").length;
  const lengthRows = Math.ceil(value.length / charsPerRow);
  return Math.max(minRows, Math.min(Math.max(newlineRows, lengthRows), maxRows));
}

export default function ImportCheckInReport({ inspectionId, templateFields }: { inspectionId: string; templateFields: TemplateFieldInfo[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string>("");
  const [stage, setStage] = useState<"idle" | "reading" | "review" | "saving" | "done" | "failed">("idle");
  const [roomSummaries, setRoomSummaries] = useState<RoomSummary[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [error, setError] = useState("");
  const [readingSeconds, setReadingSeconds] = useState(0);

  // Tracks how long the AI has been reading, purely to switch to a more reassuring
  // message once it's taking a while — a large template can genuinely take a minute or
  // two, and without this a long wait can look identical to something being broken.
  useEffect(() => {
    if (stage !== "reading") return;
    setReadingSeconds(0);
    const interval = setInterval(() => setReadingSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const fieldsById = new Map(templateFields.map((f) => [f.id, f]));

  // Grouped by section, matching how the actual inspection form is organised, so a long
  // template reads as a familiar, navigable list rather than one flat block of fields.
  const fieldsBySection = new Map<string, TemplateFieldInfo[]>();
  for (const f of templateFields) {
    const list = fieldsBySection.get(f.sectionTitle) || [];
    list.push(f);
    fieldsBySection.set(f.sectionTitle, list);
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setStage("reading");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", selected);
      formData.append("fields", JSON.stringify(templateFields));

      const uploadFormData = new FormData();
      uploadFormData.append("file", selected);
      uploadFormData.append("folder", "check-in-imports");

      // Runs alongside the AI extraction rather than after it, since the two are
      // independent — uploading the document doesn't need to wait for it to be read.
      const [extractRes, uploadRes] = await Promise.all([
        fetch("/api/ai/import-checkin-report", { method: "POST", body: formData }),
        fetch("/api/upload-document", { method: "POST", body: uploadFormData }),
      ]);
      const data = await extractRes.json();
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.url) {
        setStage("failed");
        setError("Couldn't upload the document — please try again.");
        return;
      }
      setUploadedUrl(uploadData.url);

      if (!extractRes.ok || !data.extracted) {
        setStage("failed");
        setError(data.error || "Couldn't read this report — please try again.");
        return;
      }

      const allExtractedRooms: RoomSummary[] = Array.isArray(data.extracted.roomSummaries) ? data.extracted.roomSummaries : [];
      const extractedMappings: { fieldId: string; value: string; confidence: string }[] = Array.isArray(data.extracted.mappings)
        ? data.extracted.mappings.filter((m: any) => fieldsById.has(m?.fieldId))
        : [];

      // Every template field gets an entry — AI-matched ones start pre-filled with their
      // confidence, everything else starts empty for the person to fill in directly here.
      const initialValues: Record<string, FieldValue> = {};
      for (const f of templateFields) {
        initialValues[f.id] = { value: "", confidence: "manual" };
      }

      // A room whose name genuinely matches a template section (not a guessed synonym like
      // "Lounge" vs "Reception room") gets its summary moved directly into that section's
      // own "Comments" field, and is dropped from the separate summaries list entirely —
      // otherwise the same room name would appear twice: once as its own summary entry, and
      // again as the template section heading right below it. Rooms with no matching
      // section (an entrance hallway, say, with nothing equivalent in this template) keep
      // their own entry, since there's nowhere else for that content to live.
      const normalize = (s: string) => s.trim().toLowerCase();
      // Defensive fallback in case the AI doesn't follow the exact-naming instruction —
      // also matches when the section title appears as a specifically parenthesized
      // segment of the room name (e.g. "Lounge (Reception room)"), never as a generic
      // substring anywhere in the string, which would risk merging genuinely different
      // rooms (an "Entrance and Hallway" is not automatically the same as a "Hallway").
      const roomMatchesSection = (roomName: string, sectionTitle: string) => {
        const r = normalize(roomName);
        const s = normalize(sectionTitle);
        if (r === s) return true;
        const parenMatch = roomName.match(/\(([^)]+)\)/);
        return !!parenMatch && normalize(parenMatch[1]) === s;
      };
      const extractedRooms: RoomSummary[] = [];
      for (const room of allExtractedRooms) {
        const matchingField = templateFields.find(
          (f) =>
            roomMatchesSection(room.room, f.sectionTitle) &&
            (normalize(f.label).includes("comment") || normalize(f.label).includes("note") || normalize(f.label).includes("observation")) &&
            (f.type === "TEXT" || f.type === "SHORT_TEXT")
        );
        if (matchingField) {
          initialValues[matchingField.id] = { value: room.summary, confidence: "from-summary" };
        } else {
          extractedRooms.push(room);
        }
      }

      for (const m of extractedMappings) {
        // A room-summary pre-fill is deliberately meant to be the fullest, most detailed
        // description of that room — a separate direct AI field match shouldn't silently
        // overwrite it with something shorter just because this loop happens to run
        // second. Whichever value is actually more complete wins, regardless of source.
        const existing = initialValues[m.fieldId];
        if (existing?.confidence === "from-summary" && existing.value.length > m.value.length) {
          continue;
        }
        initialValues[m.fieldId] = { value: m.value, confidence: m.confidence === "low" ? "low" : "high" };
      }

      setRoomSummaries(extractedRooms);
      setFieldValues(initialValues);
      setStage("review");
    } catch {
      setStage("failed");
      setError("Couldn't read this report — please try again.");
    }
  };

  const updateFieldValue = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: { value, confidence: "manual" } }));
  };

  const updateRoomSummary = (index: number, summary: string) => {
    setRoomSummaries((prev) => prev.map((r, i) => (i === index ? { ...r, summary } : r)));
  };

  const removeRoomSummary = (index: number) => {
    setRoomSummaries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (!uploadedUrl) return;
    setStage("saving");
    try {
      // Only genuinely-filled fields are sent — an empty value the person left blank
      // shouldn't be saved as a real answer.
      const mappings = Object.entries(fieldValues)
        .filter(([, v]) => v.value.trim())
        .map(([fieldId, v]) => ({ fieldId, value: v.value, confidence: v.confidence }));
      await importCheckInReport(inspectionId, uploadedUrl, roomSummaries, mappings);
      setStage("done");
      router.refresh();
    } catch {
      setStage("failed");
      setError("Couldn't save the imported report — please try again.");
    }
  };

  const handleCancel = () => {
    setFile(null);
    setUploadedUrl("");
    setRoomSummaries([]);
    setFieldValues({});
    setStage("idle");
    setError("");
  };

  if (stage === "idle" || stage === "reading" || stage === "failed") {
    return (
      <div className="mt-3">
        <label className="text-sm text-ink border border-line rounded-lg px-4 py-2 cursor-pointer hover:border-signal transition-colors inline-block">
          {stage === "reading" ? "Reading report…" : "📄 Upload external check-in report"}
          <input type="file" accept="application/pdf,image/*" onChange={handleFileChange} className="hidden" disabled={stage === "reading"} />
        </label>
        {stage === "reading" && readingSeconds >= 15 && (
          <p className="text-xs text-slate mt-2">
            Larger templates can take a minute or two to fully read — this is normal, no need to refresh or try again.
          </p>
        )}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  if (stage === "review") {
    return (
      <div className="mt-3 bg-paper border border-line rounded-xl p-4 space-y-4">
        <div>
          <h3 className="font-display font-600 text-ink">Review before saving</h3>
          {file && <p className="text-xs text-slate mt-0.5">From: {file.name}</p>}
          <p className="text-sm text-slate mt-1">
            Fields the AI could confidently match are already filled in — check them against the room summaries below. Everything else is empty for you to
            fill in directly. Nothing is saved until you confirm at the bottom.
          </p>
        </div>

        {roomSummaries.length > 0 && (
          <div>
            <p className="text-sm font-medium text-ink mb-2">Room summaries (for your reference)</p>
            <div className="space-y-2">
              {roomSummaries.map((r, i) => (
                <div key={i} className="border border-line rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-ink">{r.room}</p>
                    <button type="button" onClick={() => removeRoomSummary(i)} className="text-xs text-slate hover:text-red-600">
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={r.summary}
                    onChange={(e) => updateRoomSummary(i, e.target.value)}
                    rows={computeTextareaRows(r.summary, 2)}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {templateFields.length > 0 && (
          <div className="space-y-4">
            {Array.from(fieldsBySection.entries()).map(([sectionTitle, fields]) => (
              <div key={sectionTitle}>
                <p className="text-sm font-medium text-ink mb-2">{sectionTitle}</p>
                <div className="space-y-2">
                  {fields.map((field) => {
                    const current = fieldValues[field.id] || { value: "", confidence: "manual" as const };
                    let options: string[] = [];
                    if (field.type === "DROPDOWN" || field.type === "MULTIPLE_CHOICE") {
                      try {
                        const parsed = JSON.parse(field.options || "[]");
                        if (Array.isArray(parsed)) options = parsed;
                      } catch {}
                    }
                    return (
                      <div key={field.id} className="border border-line rounded-lg p-3">
                        <p className="text-xs text-slate mb-1.5">
                          {field.label}
                          {current.confidence === "low" && <span className="text-signal ml-2">⚠ AI suggestion, please check</span>}
                          {current.confidence === "high" && <span className="text-verified ml-2">✓ AI matched</span>}
                          {current.confidence === "from-summary" && <span className="text-slate ml-2">ℹ From room summary above</span>}
                        </p>
                        {(field.type === "YES_NO" || field.type === "SCORE" || field.type === "DROPDOWN" || field.type === "MULTIPLE_CHOICE") && (
                          <select
                            value={current.value}
                            onChange={(e) => updateFieldValue(field.id, e.target.value)}
                            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                          >
                            <option value="">Not filled in</option>
                            {field.type === "YES_NO" && ["Yes", "No", "N/A"].map((o) => <option key={o} value={o}>{o}</option>)}
                            {field.type === "SCORE" && ["1", "2", "3", "4", "5"].map((o) => <option key={o} value={o}>{o}</option>)}
                            {(field.type === "DROPDOWN" || field.type === "MULTIPLE_CHOICE") && options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        )}
                        {field.type === "DATE" && (
                          <input
                            type="date"
                            value={current.value}
                            onChange={(e) => updateFieldValue(field.id, e.target.value)}
                            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                          />
                        )}
                        {field.type === "NUMBER" && (
                          <input
                            type="number"
                            value={current.value}
                            onChange={(e) => updateFieldValue(field.id, e.target.value)}
                            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                          />
                        )}
                        {(field.type === "TEXT" || field.type === "SHORT_TEXT") && (
                          <textarea
                            value={current.value}
                            onChange={(e) => updateFieldValue(field.id, e.target.value)}
                            rows={computeTextareaRows(current.value, field.type === "TEXT" ? 3 : 1)}
                            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleConfirm} className="bg-signal text-white text-sm px-5 py-2 rounded-full hover:bg-signal/90 transition-colors">
            Save and use for comparison
          </button>
          <button onClick={handleCancel} className="text-sm text-slate hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (stage === "saving") {
    return <p className="text-sm text-slate mt-3">Saving…</p>;
  }

  return null;
}

