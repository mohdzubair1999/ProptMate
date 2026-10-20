"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createIntegration } from "@/lib/actions/integrations";

type ProviderOption = {
  key: string;
  displayName: string;
  description: string;
  credentialFields: { key: string; label: string; placeholder?: string; secret: boolean }[];
};

export default function ConnectIntegrationForm({ providers }: { providers: ProviderOption[] }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(providers[0]?.key || "");
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = providers.find((p) => p.key === selectedKey);

  if (providers.length === 0) {
    return <p className="text-sm text-slate">No connectable providers are available right now.</p>;
  }

  const handleConnect = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await createIntegration(selected.key, displayName || selected.displayName, credentials);
      setDisplayName("");
      setCredentials({});
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't connect this integration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-line rounded-xl p-5">
      <label className="block text-sm font-medium text-ink mb-1">Provider</label>
      <select
        value={selectedKey}
        onChange={(e) => {
          setSelectedKey(e.target.value);
          setCredentials({});
        }}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      >
        {providers.map((p) => (
          <option key={p.key} value={p.key}>
            {p.displayName}
          </option>
        ))}
      </select>
      {selected && <p className="text-xs text-slate mt-1">{selected.description}</p>}

      <label className="block text-sm font-medium text-ink mt-4 mb-1">Name for this connection</label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={selected?.displayName}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      {selected?.credentialFields.map((field) => (
        <div key={field.key} className="mt-4">
          <label className="block text-sm font-medium text-ink mb-1">{field.label}</label>
          <input
            type={field.secret ? "password" : "text"}
            value={credentials[field.key] || ""}
            onChange={(e) => setCredentials((c) => ({ ...c, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
          />
        </div>
      ))}

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <button
        onClick={handleConnect}
        disabled={saving}
        className="mt-4 bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}
