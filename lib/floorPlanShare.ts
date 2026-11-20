// What the public share link shows: each floor's plan sheet, rebuilt on the server from the snapshot that was saved with
// the plan. Pure (no database): the loader in floorPlanShareData.ts fetches the rows, this turns them into sheets.

import { buildSheet } from "./floorPlanSheet";
import { parseStoredSheetData } from "./floorPlanSheetData";
import { readLogo } from "./logoImage";

// The secret in a share link is 24 random bytes in URL-safe base64: exactly 32 of these characters.
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export type SharedPlan = {
  address: string;
  companyName: string;
  website: string | null;
  logo: string | null; // a data URI, or null
  levels: { name: string; sheetData: string | null }[];
};

export type SharedSheet = {
  index: number; // the floor's position among the plan's floors - what the PDF link asks for
  name: string;
  svg: string;
  widthMm: number;
  heightMm: number;
  logo?: { dataUri: string; x: number; y: number; w: number; h: number };
  totalInternalM2: number;
};

// Floors with no saved drawing (never saved since sharing began) are left out rather than shown blank.
export function buildSharedSheets(plan: SharedPlan, date: Date = new Date()): SharedSheet[] {
  const logo = readLogo(plan.logo);
  const out: SharedSheet[] = [];
  plan.levels.forEach((level, index) => {
    const data = parseStoredSheetData(level.sheetData);
    if (!data) return;
    const sheet = buildSheet({
      ...data,
      title: { address: plan.address, floorName: level.name, company: plan.companyName, website: plan.website ?? undefined, date, logo: logo ? { dataUri: logo.dataUri } : undefined },
      style: "colour",
      size: { unit: "mm" },
    });
    out.push({ index, name: level.name, svg: sheet.svg, widthMm: sheet.widthMm, heightMm: sheet.heightMm, logo: sheet.logo && logo ? { dataUri: logo.dataUri, ...sheet.logo } : undefined, totalInternalM2: sheet.totalInternalM2 });
  });
  return out;
}

export const sharedSheetDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
