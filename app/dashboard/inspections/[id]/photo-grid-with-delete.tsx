"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePhoto, deletePhotos } from "@/lib/actions/inspections";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PhotoLightbox from "@/components/PhotoLightbox";
import PhotoMarkup from "@/components/PhotoMarkup";

type Photo = { id: string; url: string };
// a marked-up copy is stored under a name that says so (see the markup route), so it can be told apart without a database column
const isMarkedUpCopy = (url: string) => /-markup-\d+\.jpg(\?|$)/.test(url);

export default function PhotoGridWithDelete({
  photos,
  isDraft,
  size = "md",
  lazy = false,
}: {
  photos: Photo[];
  isDraft: boolean;
  // Matches the two different thumbnail sizes already in use (item photos vs field photos) -
  // kept as an option rather than picking one, to avoid changing either page's existing look.
  size?: "sm" | "md";
  lazy?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [markup, setMarkup] = useState<Photo | null>(null); // the photo being marked up, if any

  const sizeClass = size === "sm" ? "w-14 h-14" : "w-16 h-16";

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await deletePhotos(Array.from(selected));
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      window.alert("Couldn't delete the selected photos — please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    try {
      await deletePhotos(photos.map((p) => p.id));
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      window.alert("Couldn't delete the photos — please try again.");
    } finally {
      setDeleting(false);
    }
  };

  if (photos.length === 0) return null;

  return (
    <div>
      {isDraft && photos.length > 1 && (
        <div className="flex items-center gap-2 mb-1.5">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              disabled={deleting}
              className="text-xs px-2.5 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : `🗑 Delete selected (${selected.size})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove all ${photos.length} photos? This cannot be undone.`)) deleteAll();
            }}
            disabled={deleting}
            className="text-xs px-2.5 py-1 rounded-full border border-line text-slate hover:border-red-600 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            🗑 Delete all ({photos.length})
          </button>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {photos.map((p) => (
          <div key={p.id} className="relative">
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                // A plain left-click opens the in-app viewer instead of a new tab. Middle-click,
                // and Ctrl/Cmd+click, are left alone so opening the full-resolution image in a
                // new tab (or downloading it) still works exactly as before.
                if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                setOpenIndex(photos.findIndex((ph) => ph.id === p.id));
              }}
            >
              <img src={p.url} alt="" loading={lazy ? "lazy" : undefined} className={`${sizeClass} rounded-lg object-cover border border-line`} />
            </a>
            {isMarkedUpCopy(p.url) && <span className="absolute bottom-0 left-0 right-0 text-[9px] leading-none text-center text-white bg-ink/70 rounded-b-lg py-0.5" data-testid="marked-up-badge">Marked up</span>}
            {isDraft && (
              <>
                <label className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white border border-line shadow flex items-center justify-center cursor-pointer">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="w-3 h-3" />
                </label>
                <button type="button" onClick={() => setMarkup(p)} aria-label="Mark up this photo" title="Mark up this photo (saves a copy)" data-testid="markup-open" className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-line text-ink text-[11px] flex items-center justify-center hover:bg-signal hover:text-white transition-colors shadow">✎</button>
                <form action={deletePhoto.bind(null, p.id)} className="absolute -top-1.5 -right-1.5">
                  <ConfirmSubmitButton
                    confirmMessage="Remove this photo? This cannot be undone."
                    className="w-5 h-5 rounded-full bg-ink text-white text-xs flex items-center justify-center hover:bg-red-600 transition-colors shadow"
                  >
                    ×
                  </ConfirmSubmitButton>
                </form>
              </>
            )}
          </div>
        ))}
      </div>
      <PhotoLightbox photos={photos} index={openIndex} onClose={() => setOpenIndex(null)} onIndexChange={setOpenIndex} />
      {markup && <PhotoMarkup photo={markup} onClose={() => setMarkup(null)} onSaved={() => { setMarkup(null); router.refresh(); }} />}
    </div>
  );
}
