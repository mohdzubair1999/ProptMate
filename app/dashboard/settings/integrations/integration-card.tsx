"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateIntegrationSettings, testExistingIntegration, deleteIntegration } from "@/lib/actions/integrations";

type Integration = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  lastErrorMessage: string | null;
  lastEventAt: Date | null;
  webhookSecret: string;
  autoScheduleCheckIn: boolean;
  defaultTemplateId: string | null;
  defaultInspectorId: string | null;
  scheduleDaysBeforeStart: number;
  events: { id: string; eventType: string; status: string; resultMessage: string | null; createdAt: string }[];
};

const STATUS_STYLES: Record<string, string> = {
  connected: "bg-green-100 text-green-800",
  disconnected: "bg-slate/20 text-slate",
  error: "bg-red-100 text-red-800",
};

export default function IntegrationCard({
  integration,
  providerDisplayName,
  webhookUrl,
  templates,
  staffUsers,
  canManage,
}: {
  integration: Integration;
  providerDisplayName: string;
  webhookUrl: string;
  templates: { id: string; name: string; inspectionType: string }[];
  staffUsers: { id: string; name: string | null; email: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [autoSchedule, setAutoSchedule] = useState(integration.autoScheduleCheckIn);
  const [templateId, setTemplateId] = useState(integration.defaultTemplateId || "");
  const [inspectorId, setInspectorId] = useState(integration.defaultInspectorId || "");
  const [daysBefore, setDaysBefore] = useState(String(integration.scheduleDaysBeforeStart));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleSaveSettings = async () => {
    setSaving(true);
    setError("");
    try {
      await updateIntegrationSettings(integration.id, {
        autoScheduleCheckIn: autoSchedule,
        defaultTemplateId: templateId || null,
        defaultInspectorId: inspectorId || null,
        scheduleDaysBeforeStart: parseInt(daysBefore, 10) || 0,
      });
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't save these settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError("");
    try {
      const result = await testExistingIntegration(integration.id);
      if (!result.ok) setError(result.message || "Connection test failed");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't test this connection");
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Disconnect ${integration.displayName}? This can't be undone.`)) return;
    try {
      await deleteIntegration(integration.id);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't disconnect this integration");
    }
  };

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-line rounded-xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-display font-600 text-ink">{integration.displayName}</h3>
          <p className="text-xs text-slate">{providerDisplayName}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[integration.status] || STATUS_STYLES.disconnected}`}>
          {integration.status}
        </span>
      </div>

      {integration.status === "error" && integration.lastErrorMessage && (
        <p className="text-sm text-red-600 mt-2">{integration.lastErrorMessage}</p>
      )}

      {canManage && (
        <>
          <div className="mt-4">
            <label className="block text-sm font-medium text-ink mb-1">Webhook URL — paste this into {providerDisplayName}'s own webhook settings</label>
            <div className="flex items-center gap-2">
              <input readOnly value={webhookUrl} className="flex-1 border border-line rounded-lg px-3 py-2 text-xs font-mono bg-line/20" />
              <button onClick={handleCopyWebhookUrl} className="text-sm text-signal hover:underline shrink-0">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-slate mt-1">
              Signing secret: <code className="font-mono">{integration.webhookSecret}</code>
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id={`auto-${integration.id}`}
              checked={autoSchedule}
              onChange={(e) => setAutoSchedule(e.target.checked)}
              className="rounded border-line"
            />
            <label htmlFor={`auto-${integration.id}`} className="text-sm text-ink">
              Automatically schedule a check-in when a new tenancy comes in
            </label>
          </div>

          {autoSchedule && (
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate mb-1">Template to use</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full border border-line rounded-lg px-3 py-2 text-sm">
                  <option value="">No template (blank)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate mb-1">Default inspector</label>
                <select value={inspectorId} onChange={(e) => setInspectorId(e.target.value)} className="w-full border border-line rounded-lg px-3 py-2 text-sm">
                  <option value="">Choose an inspector…</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate mb-1">Days before tenancy start to schedule</label>
                <input
                  type="number"
                  min="0"
                  value={daysBefore}
                  onChange={(e) => setDaysBefore(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button onClick={handleSaveSettings} disabled={saving} className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? "Saving…" : "Save settings"}
            </button>
            <button onClick={handleTest} disabled={testing} className="text-sm text-slate hover:text-ink disabled:opacity-50">
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button onClick={handleDelete} className="text-sm text-red-600 hover:underline ml-auto">
              Disconnect
            </button>
          </div>
        </>
      )}

      {integration.events.length > 0 && (
        <div className="mt-5 pt-4 border-t border-line">
          <p className="text-xs font-medium text-slate uppercase tracking-wide mb-2">Recent events</p>
          <ul className="space-y-1.5">
            {integration.events.map((e) => (
              <li key={e.id} className="text-xs text-slate flex items-start gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded shrink-0 ${
                    e.status === "processed" ? "bg-green-100 text-green-800" : e.status === "failed" ? "bg-red-100 text-red-800" : "bg-line/40"
                  }`}
                >
                  {e.status}
                </span>
                <span>
                  {e.eventType} — {e.resultMessage || "—"} ({new Date(e.createdAt).toLocaleString("en-GB")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
