"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addTeamMember } from "@/lib/actions/team";
import PasswordInput from "@/components/PasswordInput";

const BLANK = { name: "", email: "", password: "", role: "INSPECTOR" };

export default function AddTeamMemberForm() {
  const [state, formAction, pending] = useActionState(addTeamMember, {});
  // Controlled, deliberately: React 19 resets a plain uncontrolled form's fields after every
  // action submission, success OR failure - so on a real error (e.g. a duplicate email) the
  // admin would lose everything they'd typed, including the password, and have to redo it all.
  // Keeping the values in state here is what lets them survive a failed submission.
  const [fields, setFields] = useState(BLANK);

  // Clear the form back to blank once a member is genuinely added.
  useEffect(() => {
    if (state && !state.error && !pending) setFields(BLANK);
  }, [state, pending]);

  const set = (key: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));

  // Unlike a text input, React 19 resets a <select>'s DOM value to its native default (its first
  // option) after every action submission, even when it's controlled - so picking "Admin" and
  // then hitting a duplicate-email error would silently swap the role back to "Inspector"
  // without this. Re-assert the real value once the submission settles.
  const roleRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!pending && roleRef.current && roleRef.current.value !== fields.role) roleRef.current.value = fields.role;
  }, [pending, fields.role]);

  return (
    <form action={formAction} className="mt-4 space-y-4 max-w-sm">
      <div>
        <label className="text-sm text-slate">Name</label>
        <input name="name" required value={fields.name} onChange={set("name")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Email</label>
        <input name="email" type="email" required value={fields.email} onChange={set("email")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Temporary password</label>
        <PasswordInput
          name="password"
          required
          minLength={8}
          value={fields.password}
          onChange={set("password")}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
        <p className="text-xs text-slate mt-1">Share this with them directly — they can log in and it stays as-is unless they change it.</p>
      </div>
      <div>
        <label className="text-sm text-slate">Role</label>
        <select name="role" value={fields.role} onChange={set("role")} ref={roleRef} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
          <option value="INSPECTOR">Inspector</option>
          <option value="MANAGER">Manager</option>
          <option value="ADMIN">Admin</option>
          <option value="CLIENT">Client</option>
        </select>
      </div>
      {state?.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>}
      <button type="submit" disabled={pending} className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
        {pending ? "Adding…" : "Add team member"}
      </button>
    </form>
  );
}
