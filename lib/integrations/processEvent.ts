import { inspectionClientFields } from "@/lib/clientContacts";
import { prisma } from "@/lib/prisma";
import { PlanLimitError } from "@/lib/planLimitsDb";
import { matchOrCreateProperty } from "./matchOrCreateProperty";
import type { NormalizedIntegrationEvent } from "./types";
import { alreadyHasCheckOut, checkOutDate, checkOutEmail } from "@/lib/tenancyEnd";
import { sendPlainEmail } from "@/lib/sendEmail";
import { getMainAdminEmail } from "@/lib/getMainAdminEmail";

export type ProcessEventResult = {
  status: "processed" | "ignored" | "failed";
  message: string;
  createdInspectionId?: string;
};

export async function processIntegrationEvent(
  integration: {
    id: string;
    companyId: string;
    autoScheduleCheckIn: boolean;
    defaultTemplateId: string | null;
    defaultInspectorId: string | null;
    scheduleDaysBeforeStart: number;
    autoScheduleCheckOut?: boolean;
    checkOutDaysBeforeEnd?: number;
  },
  event: NormalizedIntegrationEvent
): Promise<ProcessEventResult> {
  if (event.type === "tenancy.ending") return scheduleCheckOut(integration, event);
  if (event.type !== "tenancy.created") {
    // Received and will be logged either way (see the webhook receiver) - just nothing this
    // framework currently has a response to yet. Not an error: a provider sending event
    // types this framework doesn't act on isn't itself a problem, and being able to receive
    // and log them now means adding a real response to a new event type later doesn't
    // require the provider connection to be re-done.
    return { status: "ignored", message: `No automatic action defined for event type "${event.type}"` };
  }

  if (!integration.autoScheduleCheckIn) {
    if (integration.autoScheduleCheckOut && event.tenancyEndDate) return scheduleCheckOut(integration, event);
    return { status: "ignored", message: "Auto-scheduling is turned off for this integration" };
  }

  if (!integration.defaultInspectorId) {
    // Inspection.inspectorId is required at the database level - there is genuinely no way
    // to create the inspection at all without one, so this is surfaced as a real failure
    // (not silently ignored), since it means the integration is switched on but
    // misconfigured and nothing will ever actually get scheduled until it's fixed.
    return { status: "failed", message: "Auto-scheduling is on, but no default inspector is set for this integration" };
  }

  let propertyId: string;
  try {
    ({ propertyId } = await matchOrCreateProperty(
      integration.companyId,
      event.propertyAddress,
      event.propertyCity,
      event.propertyPostcode
    ));
  } catch (err) {
    // a full plan is an ordinary, explainable outcome (shown in the integration's event log), not a crash
    if (err instanceof PlanLimitError) return { status: "failed", message: err.message };
    throw err;
  }

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (property?.archivedAt) return { status: "failed", message: "This property is archived. Restore it to schedule inspections from the integration." };
  if (!property) {
    // Genuinely shouldn't happen (matchOrCreateProperty either found or just created this
    // exact record), but checked rather than assumed, since silently proceeding with a
    // missing property would produce a confusing downstream error instead of a clear one.
    return { status: "failed", message: "Property lookup failed unexpectedly after matching/creating it" };
  }

  const scheduledDate = event.tenancyStartDate
    ? new Date(event.tenancyStartDate.getTime() - integration.scheduleDaysBeforeStart * 24 * 60 * 60 * 1000)
    : null;

  const inspection = await prisma.inspection.create({
    data: {
      propertyId,
      inspectorId: integration.defaultInspectorId,
      type: "check-in",
      status: "draft",
      scheduledDate,
      templateId: integration.defaultTemplateId,
      ...inspectionClientFields(property),
    },
  });

  // Same merge-field auto-fill the normal manual inspection-creation flow already does, so an auto-scheduled inspection isn't a lesser version of a manually-created one.
  await fillTemplateAnswers(integration.companyId, integration.defaultTemplateId, inspection.id, property, event);

  let message = `Check-in scheduled for ${property.address}${scheduledDate ? ` on ${scheduledDate.toLocaleDateString("en-GB")}` : ""}`;
  // A fixed-term tenancy already knows its end date: plan the check-out now too.
  if (integration.autoScheduleCheckOut && event.tenancyEndDate) {
    const out = await scheduleCheckOut(integration, event);
    message += `. ${out.message}`;
  }
  return { status: "processed", message, createdInspectionId: inspection.id };
}

// Creates the check-out inspection from the tenancy end date and tells the inspector and the main admin. Safe to receive twice: a check-out already planned for about that date is left alone.
async function scheduleCheckOut(
  integration: { companyId: string; defaultInspectorId: string | null; autoScheduleCheckOut?: boolean; checkOutDaysBeforeEnd?: number; defaultCheckOutTemplateId?: string | null },
  event: NormalizedIntegrationEvent
): Promise<ProcessEventResult> {
  if (!integration.autoScheduleCheckOut) return { status: "ignored", message: "Automatic check-outs are turned off for this integration" };
  if (!integration.defaultInspectorId) return { status: "failed", message: "Automatic check-outs are on, but no default inspector is set for this integration" };
  const when = checkOutDate(event.tenancyEndDate, integration.checkOutDaysBeforeEnd ?? 0);
  if (!when) return { status: "ignored", message: "The event has no tenancy end date, so no check-out was planned" };

  let propertyId: string;
  try {
    ({ propertyId } = await matchOrCreateProperty(integration.companyId, event.propertyAddress, event.propertyCity, event.propertyPostcode));
  } catch (err) {
    if (err instanceof PlanLimitError) return { status: "failed", message: err.message };
    throw err;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return { status: "failed", message: "Property lookup failed unexpectedly after matching/creating it" };
  if (property.archivedAt) return { status: "failed", message: "This property is archived. Restore it to plan check-outs from the integration." };

  const existing = await prisma.inspection.findMany({ where: { propertyId, deletedAt: null, type: "check-out" }, select: { type: true, status: true, scheduledDate: true } });
  if (alreadyHasCheckOut(existing, when)) return { status: "ignored", message: `A check-out for ${property.address} is already planned around that date` };

  // The chosen template must belong to this company; if it was deleted or is not theirs, the check-out is simply created without one.
  const checkOutTemplateId = integration.defaultCheckOutTemplateId ? (await prisma.template.findFirst({ where: { id: integration.defaultCheckOutTemplateId, companyId: integration.companyId }, select: { id: true } }))?.id ?? null : null;
  const inspection = await prisma.inspection.create({
    data: { propertyId, inspectorId: integration.defaultInspectorId, type: "check-out", status: "draft", scheduledDate: when, templateId: checkOutTemplateId, ...inspectionClientFields(property) },
  });
  await fillTemplateAnswers(integration.companyId, checkOutTemplateId, inspection.id, property, event);

  try {
    const inspector = await prisma.user.findUnique({ where: { id: integration.defaultInspectorId }, select: { email: true } });
    const admin = await getMainAdminEmail(integration.companyId);
    const mail = checkOutEmail({ address: property.address, when, tenantName: event.tenantName, created: true });
    await sendPlainEmail([inspector?.email, admin].filter((e): e is string => !!e).filter((e, i, a) => a.indexOf(e) === i), mail.subject, mail.lines);
  } catch (err) { console.error("Check-out email failed (the check-out was created):", err); }

  return { status: "processed", message: `Check-out scheduled for ${property.address} on ${when.toLocaleDateString("en-GB")}`, createdInspectionId: inspection.id };
}

// Fills the address, landlord and client name fields of the chosen template. Only the integration's own company's template is ever used.
async function fillTemplateAnswers(companyId: string, templateId: string | null | undefined, inspectionId: string, property: { address: string; city: string | null; postcode: string | null; landlordName: string | null }, event: NormalizedIntegrationEvent) {
  if (!templateId) return;
  const template = await prisma.template.findFirst({ where: { id: templateId, companyId }, include: { sections: { include: { fields: true } } } });
  if (!template) return;
  const mergeFieldValues: Record<string, string | null> = {
    "property address": [property.address, property.city, property.postcode].filter(Boolean).join(", ") || null,
    "landlord name": property.landlordName,
    "client name": event.tenantName || property.landlordName || null,
  };
  const answers: { inspectionId: string; fieldId: string; value: string }[] = [];
  for (const section of template.sections) for (const field of section.fields) {
    if (field.type !== "TEXT" && field.type !== "SHORT_TEXT") continue;
    const value = mergeFieldValues[field.label.trim().toLowerCase()];
    if (value) answers.push({ inspectionId, fieldId: field.id, value });
  }
  if (answers.length > 0) await prisma.fieldAnswer.createMany({ data: answers });
}
