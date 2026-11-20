// "Download everything": turns a company's records into the spreadsheets that go in the ZIP. Pure, so the content and the safety rules can be tested.
import { toCsv } from "@/lib/csv";
import { onlyBlobUrls } from "@/lib/blobUrls";
import { safeFileName } from "@/lib/csv";

export type ExportProperty = { id: string; address: string; city: string | null; postcode: string | null; type: string; bedrooms: number | null; landlordName: string | null; archivedAt: Date | null; createdAt: Date };
export type ExportInspection = { id: string; propertyId: string; type: string; status: string; scheduledDate: Date | null; completedDate: Date | null; createdAt: Date; report: { pdfUrl: string | null } | null; items: { room: string; itemName: string; condition: string; cleanliness: string | null; make: string | null; quantity: number | null; notes: string | null; photos: { url: string }[] }[] };
export type ExportCompliance = { propertyId: string; type: string; otherTypeLabel: string | null; certificateNumber: string | null; issueDate: Date | null; expiryDate: Date | null; documentUrl: string | null };

export const PDF_LIMITS = { files: 40, bytes: 50 * 1024 * 1024 };

export function exportSheets(props: ExportProperty[], inspections: ExportInspection[], compliance: ExportCompliance[]): Record<string, string> {
  const addr = new Map(props.map((p) => [p.id, p.address]));
  const a = (id: string) => addr.get(id) ?? "";
  const items: unknown[][] = [["Property", "Inspection id", "Inspection type", "Room", "Item", "Condition", "Cleanliness", "Make", "Quantity", "Notes", "Photos"]];
  const photos: unknown[][] = [["Property", "Inspection id", "Room", "Item", "Photo link"]];
  for (const i of inspections) for (const it of i.items) {
    items.push([a(i.propertyId), i.id, i.type, it.room, it.itemName, it.condition, it.cleanliness, it.make, it.quantity, it.notes, it.photos.length]);
    for (const p of it.photos) photos.push([a(i.propertyId), i.id, it.room, it.itemName, p.url]);
  }
  return {
    "properties.csv": toCsv([["Id", "Address", "City", "Postcode", "Type", "Bedrooms", "Landlord", "Archived", "Added"], ...props.map((p) => [p.id, p.address, p.city, p.postcode, p.type, p.bedrooms, p.landlordName, p.archivedAt ? "yes" : "no", p.createdAt])]),
    "inspections.csv": toCsv([["Id", "Property", "Type", "Status", "Scheduled", "Completed", "Created", "Report PDF link"], ...inspections.map((i) => [i.id, a(i.propertyId), i.type, i.status, i.scheduledDate, i.completedDate, i.createdAt, i.report?.pdfUrl ?? ""])]),
    "inventory-items.csv": toCsv(items),
    "photo-links.csv": toCsv(photos),
    "compliance-documents.csv": toCsv([["Property", "Type", "Certificate number", "Issued", "Expires", "Document link"], ...compliance.map((c) => [a(c.propertyId), c.otherTypeLabel || c.type, c.certificateNumber, c.issueDate, c.expiryDate, c.documentUrl ?? ""])]),
  };
}

// Which report PDFs go into the ZIP itself (within the limits) and which are left as links in inspections.csv
export function pdfPlan(inspections: ExportInspection[], props: ExportProperty[]): { name: string; url: string }[] {
  const addr = new Map(props.map((p) => [p.id, p.address]));
  const out: { name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const i of inspections) {
    const url = onlyBlobUrls([i.report?.pdfUrl])[0];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ name: `reports/${safeFileName(addr.get(i.propertyId) ?? "property", "property")}/${i.type}-${(i.completedDate ?? i.createdAt).toISOString().slice(0, 10)}-${i.id.slice(-6)}.pdf`, url });
  }
  return out;
}

export function readme(opts: { company: string; when: Date; pdfsIncluded: number; pdfsTotal: number }): string {
  return [
    `ProptMate data export for ${opts.company}`, `Created ${opts.when.toISOString()}`, "",
    "properties.csv: every property, including archived ones.",
    "inspections.csv: every inspection, with the link to its report PDF.",
    "inventory-items.csv: every inventory item with its condition and cleanliness.",
    "photo-links.csv: a link to every photo.",
    "compliance-documents.csv: compliance certificates and their dates.",
    `reports/: ${opts.pdfsIncluded} of ${opts.pdfsTotal} report PDFs. ${opts.pdfsIncluded < opts.pdfsTotal ? "The rest are too large to include here; each has a link in inspections.csv." : "All report PDFs are included."}`, "",
    "Deleted inspections are not included. Spreadsheets open in Excel or Google Sheets.",
  ].join("\r\n");
}
