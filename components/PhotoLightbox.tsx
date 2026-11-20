"use client";

import { useEffect, useRef } from "react";

type Photo = { id: string; url: string };

// A full-screen viewer for one photo out of a set, with previous/next arrows. Controlled: the
// parent owns which photo is open (or null for closed) and passes it in, so the same open photo
// survives whatever else re-renders the parent (e.g. deleting a different photo from the grid
// behind it).
export default function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: {
  photos: Photo[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const open = index !== null && index >= 0 && index < photos.length;

  // Wraps at both ends - with only two or three photos, going "next" past the last one back to
  // the first is more natural than the arrow going dead.
  const go = (delta: number) => {
    if (index === null || photos.length === 0) return;
    onIndexChange((index + delta + photos.length) % photos.length);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    // Stops the page scrolling behind the overlay while it's open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, photos.length]);

  if (!open) return null;
  const photo = photos[index];

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) > 50) go(delta > 0 ? -1 : 1);
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/10 text-white text-xl flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        ×
      </button>

      {photos.length > 1 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-white/80 text-sm">
          {index + 1} / {photos.length}
        </div>
      )}

      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          aria-label="Previous photo"
          className="absolute left-2 md:left-4 w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/10 text-white text-2xl flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          ‹
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[86vh] object-contain rounded-lg select-none"
      />

      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          aria-label="Next photo"
          className="absolute right-2 md:right-4 w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/10 text-white text-2xl flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          ›
        </button>
      )}
    </div>
  );
}
