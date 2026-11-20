"use client";

import { useState } from "react";
import PhotoLightbox from "./PhotoLightbox";

type Photo = { id: string; url: string };

// A read-only grid of photo thumbnails that opens the shared lightbox on click, with arrow
// navigation between every photo in this set. For a grid that also needs select/delete, use
// PhotoGridWithDelete instead - it has its own built-in lightbox.
export default function PhotoStrip({
  photos,
  className,
  imgClassName,
}: {
  photos: Photo[];
  className: string;
  imgClassName: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <div className={className}>
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpenIndex(i)} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" loading="lazy" className={imgClassName} />
          </button>
        ))}
      </div>
      <PhotoLightbox photos={photos} index={openIndex} onClose={() => setOpenIndex(null)} onIndexChange={setOpenIndex} />
    </>
  );
}
