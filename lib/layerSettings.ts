import { cleanLayerName } from "./floorPlanObjects";

// What can be set on a layer of the person's own: a COLOUR (from a fixed palette, so it prints and exports well) and a LOCK (its items cannot be picked, moved or deleted by accident).
// Kept per floor, by the layer's name. Pure (no screen, no database), so every rule is tested directly.
export type LayerColour = { id: string; label: string; hex: string; aci: number; bw: string };
// hex: the colour drawn; aci: the standard CAD colour number written to a DXF file; bw: the grey it becomes on a black-and-white sheet
export const LAYER_COLOURS: LayerColour[] = [
  { id: "red", label: "Red", hex: "#DC2626", aci: 1, bw: "#111111" },
  { id: "orange", label: "Orange", hex: "#EA580C", aci: 30, bw: "#2B2B2B" },
  { id: "amber", label: "Amber", hex: "#CA8A04", aci: 2, bw: "#3F3F3F" },
  { id: "green", label: "Green", hex: "#16A34A", aci: 3, bw: "#555555" },
  { id: "teal", label: "Teal", hex: "#0891B2", aci: 4, bw: "#222222" },
  { id: "blue", label: "Blue", hex: "#2563EB", aci: 5, bw: "#333333" },
  { id: "purple", label: "Purple", hex: "#7C3AED", aci: 6, bw: "#4A4A4A" },
  { id: "grey", label: "Grey", hex: "#64748B", aci: 8, bw: "#666666" },
];
export type LayerSetting = { colour?: string; locked?: boolean };
export type LayerSettings = Record<string, LayerSetting>;
export const MAX_LAYER_SETTINGS = 20;
export const EMPTY_LAYER_SETTINGS: LayerSettings = {}; // one shared empty value

// The palette's own spelling of a colour (capitals), or null when it is not one of the palette's colours
export function paletteHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const up = v.trim().toUpperCase();
  return LAYER_COLOURS.find((c) => c.hex === up)?.hex ?? null;
}
export const hexToAci = (hex: unknown): number | undefined => LAYER_COLOURS.find((c) => c.hex === paletteHex(hex))?.aci;

const lc = (s: string) => s.toLowerCase();
const find = (settings: LayerSettings | null | undefined, name: string): [string, LayerSetting] | undefined => Object.entries(settings ?? {}).find(([k]) => lc(k) === lc(String(name)));

// Untrusted settings (from the browser or from storage) rebuilt from scratch: only valid layer names, only palette colours, only a lock that is really true, nothing empty,
// at most 20 layers. When `names` is given (the layers that really exist on the floor), settings for any other name are dropped and the names' own spelling is used.
export function cleanLayerSettings(raw: unknown, names?: string[]): LayerSettings {
  const out: LayerSettings = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const allowed = Array.isArray(names) ? names : null;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    if (Object.keys(out).length >= MAX_LAYER_SETTINGS) break;
    const valid = cleanLayerName(k);
    if (!valid || !v || typeof v !== "object") continue;
    const name = allowed ? allowed.find((n) => lc(n) === lc(valid)) : valid;
    if (!name || find(out, name)) continue;
    const colour = paletteHex((v as Record<string, unknown>).colour);
    const locked = (v as Record<string, unknown>).locked === true;
    if (!colour && !locked) continue;
    out[name] = { ...(colour ? { colour } : {}), ...(locked ? { locked: true } : {}) };
  }
  return out;
}
export const layerColour = (s: LayerSettings | null | undefined, name: string | undefined): string | undefined => (name ? find(s, name)?.[1].colour : undefined);
export const isLayerLocked = (s: LayerSettings | null | undefined, name: string | undefined): boolean => (name ? find(s, name)?.[1].locked === true : false);

function put(s: LayerSettings, name: string, next: LayerSetting): LayerSettings {
  const out: LayerSettings = { ...s };
  const hit = find(s, name);
  if (hit) delete out[hit[0]];
  const clean: LayerSetting = { ...(next.colour ? { colour: next.colour } : {}), ...(next.locked ? { locked: true } : {}) };
  if (clean.colour || clean.locked) out[hit?.[0] ?? name] = clean;
  return out;
}
export function setLayerColour(s: LayerSettings | null | undefined, name: string, hex: string | null): LayerSettings {
  const cur = find(s, name)?.[1] ?? {};
  const colour = hex === null ? undefined : paletteHex(hex) ?? cur.colour; // a colour that is not in the palette changes nothing
  return put(s ?? {}, name, { ...cur, colour });
}
export function setLayerLocked(s: LayerSettings | null | undefined, name: string, locked: boolean): LayerSettings {
  const cur = find(s, name)?.[1] ?? {};
  return put(s ?? {}, name, { ...cur, locked: locked === true });
}
// Renaming a layer carries its settings; when it is renamed to another layer that has settings of its own, those win
export function renameLayerSettings(s: LayerSettings | null | undefined, from: string, to: string): LayerSettings {
  const src = find(s, from);
  if (!src) return { ...(s ?? {}) };
  const out: LayerSettings = { ...(s ?? {}) };
  delete out[src[0]];
  return find(out, to) ? out : { ...out, [to]: src[1] };
}
export function deleteLayerSettings(s: LayerSettings | null | undefined, name: string): LayerSettings {
  const hit = find(s, name), out: LayerSettings = { ...(s ?? {}) };
  if (hit) delete out[hit[0]];
  return out;
}
// What is stored with the floor: the settings as text, or null when there are none
export const serialiseLayerSettings = (s: LayerSettings | null | undefined): string | null => (s && Object.keys(s).length > 0 ? JSON.stringify(s) : null);
export function parseLayerSettings(json: unknown, names?: string[]): LayerSettings {
  if (typeof json !== "string" || json.length === 0 || json.length > 20_000) return {};
  try { return cleanLayerSettings(JSON.parse(json), names); } catch { return {}; }
}
// The DXF layer name -> standard colour number, for the layers that have a colour (the name is the DXF-safe form, as written to the file)
export function dxfLayerColours(s: LayerSettings | null | undefined, toDxfName: (n: string) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [n, v] of Object.entries(s ?? {})) { const aci = hexToAci(v.colour); if (aci !== undefined) out[toDxfName(n)] = aci; }
  return out;
}
