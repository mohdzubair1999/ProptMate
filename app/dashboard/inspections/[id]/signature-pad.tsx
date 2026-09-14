"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SignaturePad({ fieldId, inspectionId, existingUrl }: { fieldId: string; inspectionId: string; existingUrl?: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#25344A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const save = async () => {
    const canvas = canvasRef.current!;
    setSaving(true);
    setError("");

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setError("Couldn't capture signature");
        setSaving(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", blob, "signature.png");
      formData.append("fieldId", fieldId);
      formData.append("inspectionId", inspectionId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      setSaving(false);

      if (!res.ok) {
        setError("Upload failed — try again");
        return;
      }
      router.refresh();
    }, "image/png");
  };

  if (existingUrl) {
    return (
      <div>
        <img src={existingUrl} alt="Signature" className="border border-line rounded-lg bg-white h-24" />
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={120}
        className="border border-line rounded-lg bg-white touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={clear} className="text-xs px-2.5 py-1 rounded-full border border-line text-slate hover:text-ink transition-colors">
          Clear
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!hasDrawn || saving}
          className="text-xs px-2.5 py-1 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save signature"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
