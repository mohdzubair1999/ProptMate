"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveCompanyLogo, removeCompanyLogo, type LogoState } from "@/lib/actions/company";

// Shrinks the chosen picture to a sensible logo size in the browser (at most 480 x 240), so only a small, clean PNG or
// JPEG is ever sent. SVG is not accepted: it can carry script.
async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("Please choose a PNG or JPEG picture (not SVG, GIF or WebP).");
  if (file.size > 8_000_000) throw new Error("That picture is too large - please choose one under 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That picture could not be read."));
      i.src = url;
    });
    const scale = Math.min(1, 480 / img.naturalWidth, 240 / img.naturalHeight);
    const w = Math.max(16, Math.round(img.naturalWidth * scale));
    const h = Math.max(16, Math.round(img.naturalHeight * scale));
    const draw = (background: string | null) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Your browser could not process the picture.");
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      return c;
    };
    let out = draw(null).toDataURL("image/png");
    if (out.length > 280_000) out = draw("#FFFFFF").toDataURL("image/jpeg", 0.85); // a very detailed picture is saved as a JPEG instead
    if (out.length > 280_000) throw new Error("That picture is too detailed - please choose a simpler logo.");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CompanyLogoForm({ initialLogo }: { initialLogo: string | null }) {
  const [saveState, saveAction, saving] = useActionState<LogoState | undefined, FormData>(saveCompanyLogo, undefined);
  const [removeState, removeAction, removing] = useActionState<LogoState | undefined, FormData>(removeCompanyLogo, undefined);
  const [current, setCurrent] = useState<string | null>(initialLogo);
  const [pending, setPending] = useState<string | null>(null); // chosen, not yet saved
  const [localError, setLocalError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saveState?.ok) {
      setCurrent(saveState.logo ?? null);
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [saveState]);
  useEffect(() => {
    if (removeState?.ok) setCurrent(null);
  }, [removeState]);

  const error = localError || saveState?.error || removeState?.error || "";
  const shown = pending ?? current;

  return (
    <section className="bg-white border border-line rounded-xl p-6" data-testid="logo-section">
      <h2 className="font-display font-600 text-lg text-ink">Company logo</h2>
      <p className="text-sm text-slate mt-1">Shown in the corner of your floor plan sheets (PDF, PNG and SVG) and on shared plan pages. PNG or JPEG. Only an Admin can change it.</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="w-44 h-20 border border-dashed border-line rounded-lg flex items-center justify-center bg-paper overflow-hidden">
          {shown ? <img src={shown} alt="Your company logo" data-testid="logo-preview" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-slate">No logo yet</span>}
        </div>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            data-testid="logo-file"
            onChange={async (e) => {
              setLocalError("");
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setPending(await prepareLogo(file));
              } catch (err) {
                setPending(null);
                setLocalError(err instanceof Error ? err.message : "That picture could not be used.");
              }
            }}
            className="block text-sm text-slate"
          />
          <div className="flex gap-2">
            <form action={saveAction}>
              <input type="hidden" name="logo" value={pending ?? ""} />
              <button type="submit" disabled={!pending || saving} data-testid="logo-save" className="text-sm rounded-full px-4 py-1.5 bg-signal text-white font-medium disabled:opacity-50">
                {saving ? "Saving…" : "Save logo"}
              </button>
            </form>
            {current && !pending && (
              <form action={removeAction}>
                <button type="submit" disabled={removing} data-testid="logo-remove" className="text-sm rounded-full px-4 py-1.5 border border-line text-red-600 hover:border-red-400 disabled:opacity-50">
                  {removing ? "Removing…" : "Remove logo"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
      {saveState?.ok && !pending && !error && <p className="text-sm text-verified mt-3">✓ Logo saved</p>}
    </section>
  );
}
