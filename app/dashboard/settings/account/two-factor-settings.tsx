"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { twoFactor } from "@/lib/auth-client";

type Step = "idle" | "password" | "scan" | "confirmed";

export default function TwoFactorSettings({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const handleStartEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await twoFactor.enable({ password });
    setLoading(false);

    if (res.error || !res.data || res.data.method !== "totp") {
      setError("Incorrect password.");
      return;
    }

    const dataUrl = await QRCode.toDataURL(res.data.totpURI);
    setQrDataUrl(dataUrl);
    setBackupCodes(res.data.backupCodes);
    setStep("scan");
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Better Auth marks 2FA as verified immediately on enable, before confirming the person
    // actually scanned it correctly — without this extra check, a scanning mistake wouldn't
    // surface until their next login, when it's too late to fix easily. Verifying a real
    // code right now catches that immediately instead.
    const res = await twoFactor.verifyTotp({ code: confirmCode });
    setLoading(false);

    if (res.error) {
      setError("That code didn't match — check your authenticator app and try again.");
      return;
    }

    setEnabled(true);
    setStep("confirmed");
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await twoFactor.disable({ password: disablePassword });
    setLoading(false);

    if (res.error) {
      setError("Incorrect password.");
      return;
    }

    setEnabled(false);
    setShowDisableForm(false);
    setStep("idle");
    setDisablePassword("");
  };

  if (enabled && step !== "confirmed") {
    return (
      <div className="bg-white border border-line rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-600 text-lg text-ink">Two-factor authentication</h2>
            <p className="text-sm text-verified mt-1">✓ Enabled on your account.</p>
          </div>
        </div>

        {!showDisableForm ? (
          <button onClick={() => setShowDisableForm(true)} className="mt-4 text-sm text-red-600 hover:text-red-700 underline">
            Disable two-factor authentication
          </button>
        ) : (
          <form onSubmit={handleDisable} className="mt-4 space-y-3 max-w-sm">
            <div>
              <label className="text-sm text-slate">Confirm your password</label>
              <input
                type="password"
                required
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={loading} className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                {loading ? "Disabling…" : "Disable"}
              </button>
              <button type="button" onClick={() => setShowDisableForm(false)} className="text-sm text-slate hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  if (step === "confirmed") {
    return (
      <div className="bg-white border border-line rounded-xl p-6">
        <h2 className="font-display font-600 text-lg text-ink">Two-factor authentication</h2>
        <p className="text-sm text-verified mt-1">✓ Set up and confirmed.</p>

        <div className="mt-4 bg-paper border border-line rounded-lg p-4">
          <p className="text-sm font-medium text-ink">Save your backup codes</p>
          <p className="text-xs text-slate mt-1">
            If you ever lose access to your authenticator app, each of these codes can be used once to sign in instead. Store them somewhere safe — this is the only time they'll be shown.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((code) => (
              <div key={code} className="bg-white border border-line rounded px-2 py-1">
                {code}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === "scan") {
    return (
      <div className="bg-white border border-line rounded-xl p-6">
        <h2 className="font-display font-600 text-lg text-ink">Scan this with your authenticator app</h2>
        <p className="text-sm text-slate mt-1">Use Google Authenticator, Authy, 1Password, or any TOTP-compatible app.</p>

        {qrDataUrl && (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Scan this QR code with your authenticator app" width={200} height={200} />
          </div>
        )}

        <form onSubmit={handleConfirm} className="mt-4 space-y-3 max-w-xs">
          <div>
            <label className="text-sm text-slate">Enter the 6-digit code from your app</label>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal tracking-widest"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? "Confirming…" : "Confirm"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white border border-line rounded-xl p-6">
      <h2 className="font-display font-600 text-lg text-ink">Two-factor authentication</h2>
      <p className="text-sm text-slate mt-1">Add an extra layer of security — a code from your phone, in addition to your password.</p>

      {step !== "password" ? (
        <button onClick={() => setStep("password")} className="mt-4 bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
          Enable two-factor authentication
        </button>
      ) : (
        <form onSubmit={handleStartEnable} className="mt-4 space-y-3 max-w-sm">
          <div>
            <label className="text-sm text-slate">Confirm your password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading} className="bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? "Setting up…" : "Continue"}
            </button>
            <button type="button" onClick={() => setStep("idle")} className="text-sm text-slate hover:text-ink">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
