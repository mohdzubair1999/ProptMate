"use client";

import { useState } from "react";

// Drop-in replacement for <input type="password">: same props, minus "type" which this manages
// itself, plus a Show/Hide toggle so a typo isn't invisible until the submit fails.
export default function PasswordInput({ className = "", ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${className} pr-14`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate hover:text-ink"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
