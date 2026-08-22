"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { InspectionReportDocument, type ReportData } from "@/lib/pdf/InspectionReportDocument";
import { TemplateReportDocument, type TemplateReportData } from "@/lib/pdf/TemplateReportDocument";

// react-pdf can't reliably fetch remote URLs itself during server-side rendering — the same
// issue we hit and fixed for AI vision analysis. Fetch and embed each photo as a data URI
// instead, so the PDF always has the actual image bytes rather than a URL it has to resolve.
async function toDataUri(url: string, maxDimension = 1000): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch (err) {
    console.error("Failed to embed photo in report:", url, err);
    return null;
  }
}

async function resolvePhotos<T extends { photos: { id: string; url: string }[] }>(list: T[], label: string): Promise<T[]> {
  return Promise.all(
    list.map(async (entry) => {
      const resolved = await Promise.all(
        entry.photos.map(async (p) => {
          const dataUri = await toDataUri(p.url);
          console.log(`[report photo] ${label} photo ${p.id}: ${dataUri ? "embedded OK" : "FAILED to embed"} (source: ${p.url})`);
          // Keep the original full-resolution URL too, so the photo can be a clickable
          // link in the PDF opening the full-size version, separate from the smaller
          // embedded version actually shown on the page.
          return { ...p, embeddedUrl: dataUri, url: p.url };
        })
      );
      const kept = resolved.filter((p) => !!p.embeddedUrl);
      if (entry.photos.length > 0) {
        console.log(`[report photo] ${label} entry had ${entry.photos.length} photo(s), ${kept.length} made it into the report`);
      }
      return { ...entry, photos: kept };
    })
  );
}

export async function generateReport(formData: FormData) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;

  const inspectionId = String(formData.get("inspectionId") || "");

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined } },
    include: {
      property: true,
      inspector: true,
      items: { include: { photos: true }, orderBy: { room: "asc" } },
      template: {
        include: {
          sections: {
            where: { hidden: false },
            orderBy: { order: "asc" },
            include: { fields: { where: { hidden: false }, orderBy: { order: "asc" } } },
          },
        },
      },
      answers: { include: { photos: true, field: true } },
    },
  });

  if (!inspection) throw new Error("Inspection not found");
  if (inspection.status !== "completed") throw new Error("Mark the inspection complete before generating the report");

  // Resolve every photo to an embedded data URI up front, and pick a cover photo (the first
  // one found anywhere in the inspection) for the report's front page.
  console.log(`[report photo] Inspection has ${inspection.items.length} item(s) and ${inspection.answers.length} answer(s) to check for photos`);

  const resolvedItems = await resolvePhotos(inspection.items, "item");
  const resolvedAnswers = await resolvePhotos(inspection.answers, "answer");

  // Prefer a dedicated "front cover" field if the template has one (added via the Front
  // Cover quick-add block) — much more reliable than just grabbing whatever photo happens
  // to be first. Falls back to the first photo found anywhere if no such field exists.
  const dedicatedCover = resolvedAnswers.find(
    (a: any) => a.field?.label?.toLowerCase().includes("front cover") && a.photos.length > 0
  );

  const coverPhoto =
    dedicatedCover?.photos[0] ||
    resolvedItems.find((i) => i.photos.length > 0)?.photos[0] ||
    resolvedAnswers.find((a) => a.photos.length > 0)?.photos[0] ||
    null;

  const coverPhotoUrl = (coverPhoto as any)?.embeddedUrl || null;
  const coverPhotoLinkUrl = coverPhoto?.url || null;

  let buffer: Buffer;

  if (inspection.template) {
    // Same per-inspection "Hide" exclusions the live editing view respects — without this,
    // a section hidden just for this one report would still show up in the generated PDF.
    const excludedIds: string[] = inspection.excludedSectionIds ? JSON.parse(inspection.excludedSectionIds) : [];
    const visibleSections = inspection.template.sections.filter((s) => !excludedIds.includes(s.id));

    const templateData: TemplateReportData = {
      property: inspection.property,
      type: inspection.type,
      templateName: inspection.template.name,
      completedDate: inspection.completedDate,
      inspector: inspection.inspector,
      sections: visibleSections,
      answers: resolvedAnswers,
      inventoryItems: resolvedItems,
      aiSummary: inspection.aiSummary,
      coverPhotoUrl,
      coverPhotoLinkUrl,
      generatedAt: new Date(),
      summaryReference: {
        propertyDescription: inspection.propertyDescription,
        clientName: inspection.clientName,
        clientAddress: inspection.clientAddress,
        otherAlarmLocation: inspection.otherAlarmLocation,
        otherAlarmTested: inspection.otherAlarmTested,
        boilerLocation: inspection.boilerLocation,
        stopcockLocation: inspection.stopcockLocation,
        fuseBoxLocation: inspection.fuseBoxLocation,
      },
    };
    buffer = await renderToBuffer(TemplateReportDocument({ data: templateData }));
  } else {
    const reportData: ReportData = {
      property: inspection.property,
      type: inspection.type,
      status: inspection.status,
      scheduledDate: inspection.scheduledDate,
      completedDate: inspection.completedDate,
      inspector: inspection.inspector,
      items: resolvedItems,
      aiSummary: inspection.aiSummary,
      coverPhotoUrl,
      coverPhotoLinkUrl,
      generatedAt: new Date(),
      summaryReference: {
        propertyDescription: inspection.propertyDescription,
        clientName: inspection.clientName,
        clientAddress: inspection.clientAddress,
        otherAlarmLocation: inspection.otherAlarmLocation,
        otherAlarmTested: inspection.otherAlarmTested,
        boilerLocation: inspection.boilerLocation,
        stopcockLocation: inspection.stopcockLocation,
        fuseBoxLocation: inspection.fuseBoxLocation,
      },
    };
    buffer = await renderToBuffer(InspectionReportDocument({ data: reportData }));
  }

  const blob = await put(`inspection-reports/${inspectionId}-${Date.now()}.pdf`, buffer, {
    access: "public",
    contentType: "application/pdf",
  });

  await prisma.report.upsert({
    where: { inspectionId },
    update: { pdfUrl: blob.url, generatedAt: new Date() },
    create: { inspectionId, pdfUrl: blob.url },
  });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Deletes a generated report record. The PDF file itself stays in Blob storage (cheap,
// harmless to leave) — this just removes the report link so a new one can be generated.
export async function deleteReport(formData: FormData) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;

  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined } },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.report.deleteMany({ where: { inspectionId } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}
