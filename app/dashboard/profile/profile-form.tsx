"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnProfile, uploadOwnAvatar } from "@/lib/actions/profile";

export default function ProfileForm({
  initialName,
  email,
  image,
  role,
  companyName,
  initialEmailNotificationsEnabled,
}: {
  initialName: string;
  email: string;
  image: string | null;
  role: string;
  companyName: string | null;
  initialEmailNotificationsEnabled: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(initialEmailNotificationsEnabled);
  const [avatarUrl, setAvatarUrl] = useState(image);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = await uploadOwnAvatar(formData);
      setAvatarUrl(url);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't upload that photo");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateOwnProfile(name, emailNotificationsEnabled);
      setSaved(true);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't save these changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-line rounded-xl p-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="relative w-16 h-16 rounded-full bg-line/40 overflow-hidden shrink-0 group disabled:opacity-60"
          title="Change photo"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Your profile photo" className="w-full h-full object-cover" />
          ) : (
            <span className="flex items-center justify-center w-full h-full text-lg font-display font-600 text-slate">
              {name.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">
            {uploadingAvatar ? "Uploading…" : "Change"}
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        <div>
          <p className="text-sm font-medium text-ink">{email}</p>
          <p className="text-xs text-slate mt-0.5">
            {role}
            {companyName ? ` — ${companyName}` : ""}
          </p>
        </div>
      </div>

      <label className="block text-sm font-medium text-ink mt-5 mb-1">Name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />

      <div className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          id="email-notifications"
          checked={emailNotificationsEnabled}
          onChange={(e) => setEmailNotificationsEnabled(e.target.checked)}
          className="rounded border-line"
        />
        <label htmlFor="email-notifications" className="text-sm text-ink">
          Email me about activity on my account
        </label>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700 mt-3">Saved.</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
