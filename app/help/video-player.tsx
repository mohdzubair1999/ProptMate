"use client";

import { useRef, useState } from "react";

export type Chapter = { t: number; label: string };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// The tutorial video with chapter buttons: tap a chapter and the video jumps to that part and plays.
export default function VideoPlayer({ src, poster, chapters }: { src: string; poster: string; chapters: Chapter[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  // The chapter being watched is the last one that has started.
  const active = chapters.reduce((a, c, i) => (now >= c.t ? i : a), 0);

  const jump = (t: number) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = t;
    void v.play().catch(() => {
      /* the browser may refuse to start playing by itself; the person can press play */
    });
  };

  return (
    <div>
      <video
        ref={ref}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        className="w-full rounded-xl border border-line bg-black"
        data-testid="tutorial-video"
      >
        <source src={src} type="video/mp4" />
        Your browser can&apos;t play this video. <a href={src}>Download it instead</a>.
      </video>

      <p className="text-sm text-slate mt-3">Captions are shown on screen, so you can watch without sound.</p>

      <h3 className="font-display font-600 text-ink mt-6 mb-3">Jump to a part</h3>
      <ol className="grid sm:grid-cols-2 gap-2" data-testid="chapter-list">
        {chapters.map((c, i) => (
          <li key={c.t}>
            <button
              type="button"
              onClick={() => jump(c.t)}
              aria-current={i === active ? "true" : undefined}
              data-chapter={c.t}
              className={`w-full text-left flex items-baseline gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                i === active ? "border-signal bg-signal/10 text-ink" : "border-line text-slate hover:border-ink hover:text-ink"
              }`}
            >
              <span className="font-mono text-xs tabular-nums">{clock(c.t)}</span>
              <span>{c.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
