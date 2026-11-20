"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addWalkthroughItems } from "@/lib/actions/aiItems";
import { CONDITION_OPTIONS } from "@/lib/inventoryConditions";
import { CLEANLINESS_OPTIONS } from "@/lib/inventoryCleanliness";
import { LANGUAGES } from "@/lib/translateReport";
import type { WalkthroughItem } from "@/lib/ai/walkthrough";
import { WALKTHROUGH_CONDITIONS } from "@/lib/walkthroughConditions";

type Room = { name: string; templateFieldId: string | null };

export default function WalkthroughRecorder({ inspectionId, rooms, freeRoom }: { inspectionId: string; rooms: Room[]; freeRoom: boolean }) {
  const router = useRouter();
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [roomName, setRoomName] = useState(rooms[0]?.name ?? "");
  const [spoken, setSpoken] = useState("en");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [items, setItems] = useState<WalkthroughItem[]>([]);
  const [saveComments, setSaveComments] = useState(false);
  const [added, setAdded] = useState<number | null>(null);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);
  const room = rooms.find((r) => r.name === roomName);

  async function start() {
    setError(""); setAdded(null); setItems([]); setTranscript("");
    if (!roomName.trim()) { setError("Choose or type a room first."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); streamRef.current = null; send(); };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { setError("Couldn't access the microphone - please check your browser's permission for this site"); }
  }
  function stop() { recRef.current?.stop(); setRecording(false); }
  async function send() {
    const blob = new Blob(chunks.current, { type: "audio/webm" });
    if (blob.size === 0) { setError("No audio was captured - please try again"); return; }
    setBusy(true);
    try {
      const f = new FormData();
      f.append("audio", blob, "walkthrough.webm"); f.append("inspectionId", inspectionId); f.append("room", roomName); f.append("spokenLanguage", spoken);
      const res = await fetch("/api/ai/walkthrough", { method: "POST", body: f });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't process that recording");
      setTranscript(data.transcript || ""); setItems(data.items || []);
      if (!(data.items || []).length) setError("No items were picked up. Try again, naming each item and its condition.");
    } catch (e: any) { setError(e?.message || "Couldn't process that recording"); } finally { setBusy(false); }
  }
  const patch = (i: number, p: Partial<WalkthroughItem>) => setItems((all) => all.map((x, n) => (n === i ? { ...x, ...p } : x)));
  async function addAll() {
    setBusy(true); setError("");
    const r = await addWalkthroughItems({ inspectionId, room: roomName, templateFieldId: room?.templateFieldId ?? null, items, saveComments });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setAdded(r.added ?? 0); setItems([]); setTranscript(""); router.refresh();
  }
  const field = "border border-line rounded-lg px-2 py-1 text-sm";
  return (
    <div className="mt-4 max-w-3xl">
      <p className="text-sm text-slate">Pick a room, press record and talk through it, for example &quot;walls fair, scuff by the door, radiator good, carpet clean&quot;. ProptMate builds the item list for you to check before anything is added.</p>
      <div className="mt-4 flex gap-3 flex-wrap items-end">
        <div><label className="block text-xs text-slate mb-1">Room</label>
          {freeRoom ? (<><input list="wt-rooms" value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={80} className={field} data-testid="walkthrough-room" /><datalist id="wt-rooms">{rooms.map((r) => <option key={r.name} value={r.name} />)}</datalist></>) : (
            <select value={roomName} onChange={(e) => setRoomName(e.target.value)} className={field} data-testid="walkthrough-room">{rooms.map((r) => <option key={r.templateFieldId} value={r.name}>{r.name}</option>)}</select>)}
        </div>
        <div><label className="block text-xs text-slate mb-1">I&apos;m speaking</label>
          <select value={spoken} onChange={(e) => setSpoken(e.target.value)} className={field}><option value="en">English</option>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
        {!recording ? <button onClick={start} disabled={busy} className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50" data-testid="walkthrough-start">Start recording</button>
          : <button onClick={stop} className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium" data-testid="walkthrough-stop">Stop and build the list</button>}
        {busy && <span className="text-sm text-slate" role="status">Working…</span>}
      </div>
      {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
      {added !== null && <p className="text-sm text-verified mt-3" role="status" data-testid="walkthrough-added">Added {added} item{added === 1 ? "" : "s"} to {roomName}. Record another room whenever you are ready.</p>}
      {transcript && <p className="text-xs text-slate mt-3">Heard: &quot;{transcript}&quot;</p>}
      {items.length > 0 && (
        <div className="mt-4">
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="bg-white border border-line rounded-xl p-3" data-testid="walkthrough-item">
                <div className="flex gap-2 flex-wrap items-center">
                  <input value={it.name} onChange={(e) => patch(i, { name: e.target.value })} className={`${field} flex-1 min-w-[8rem]`} aria-label="Item name" />
                  <select value={it.condition} onChange={(e) => patch(i, { condition: e.target.value })} className={field} aria-label="Condition">{CONDITION_OPTIONS.filter((o) => WALKTHROUGH_CONDITIONS.includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  <select value={it.cleanliness ?? ""} onChange={(e) => patch(i, { cleanliness: e.target.value || null })} className={field} aria-label="Cleanliness"><option value="">Cleanliness not said</option>{CLEANLINESS_OPTIONS.filter((o) => o.value !== "custom" && o.value !== "n/a").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  <button onClick={() => setItems((all) => all.filter((_, n) => n !== i))} className="text-xs text-red-600 hover:underline">Remove</button>
                </div>
                {it.comment && <p className="text-xs text-slate mt-1">{it.comment}</p>}
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate"><input type="checkbox" checked={saveComments} onChange={(e) => setSaveComments(e.target.checked)} /> Also save the wording under each item as its note</label>
          <button onClick={addAll} disabled={busy} className="mt-3 bg-signal text-white px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50" data-testid="walkthrough-add">Add {items.length} item{items.length === 1 ? "" : "s"} to {roomName}</button>
        </div>
      )}
    </div>
  );
}
