"use client";

import { useState } from "react";
import { changePassword } from "@/lib/auth-client";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setSaved(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }

    setSaving(true);
    try {
      const { error: authError } = await changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (authError) {
        setError(authError.message || "Couldn't change your password");
      } else {
        setSaved(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't change your password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-line rounded-xl p-5">
      <h2 className="font-display font-600 text-ink">Change password</h2>

      <label className="block text-sm font-medium text-ink mt-4 mb-1">Current password</label>
      <input
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      <label className="block text-sm font-medium text-ink mt-4 mb-1">New password</label>
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      <label className="block text-sm font-medium text-ink mt-4 mb-1">Confirm new password</label>
      <input
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700 mt-3">Password changed. You've been signed out of other devices.</p>}

      <button
        onClick={handleSubmit}
        disabled={saving || !currentPassword || !newPassword}
        className="mt-4 bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? "Changing…" : "Change password"}
      </button>
    </div>
  );
}
