import { prisma } from "@/lib/prisma";
import { matchOrCreateProperty } from "./matchOrCreateProperty";
import type { NormalizedIntegrationEvent } from "./types";

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
  },
  event: NormalizedIntegrationEvent
): Promise<ProcessEventResult> {
  if (event.type !== "tenancy.created") {
    // Received and will be logged either way (see the webhook receiver) - just nothing this
    // framework currently has a response to yet. Not an error: a provider sending event
    // types this framework doesn't act on isn't itself a problem, and being able to receive
    // and log them now means adding a real response to a new event type later doesn't
    // require the provider connection to be re-done.
    return { status: "ignored", message: `No automatic action defined for event type "${event.type}"` };
  }

  if (!integration.autoScheduleCheckIn) {
    return { status: "ignored", message: "Auto-scheduling is turned off for this integration" };
  }

  if (!integration.defaultInspectorId) {
    // Inspection.inspectorId is required at the database level - there is genuinely no way
    // to create the inspection at all without one, so this is surfaced as a real failure
    // (not silently ignored), since it means the integration is switched on but
    // misconfigured and nothing will ever actually get scheduled until it's fixed.
    return { status: "failed", message: "Auto-scheduling is on, but no default inspector is set for this integration" };
  }

  const { propertyId } = await matchOrCreateProperty(
    integration.companyId,
    event.propertyAddress,
    event.propertyCity,
    event.propertyPostcode
  );

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
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
    },
  });

  // Same merge-field auto-fill the normal manual inspection-creation flow already does, so
  // an auto-scheduled inspection isn't a lesser version of a manually-created one - the
  // inspector still finds the address and landlord name already filled in when they open it.
  if (integration.defaultTemplateId) {
    const template = await prisma.template.findUnique({
      where: { id: integration.defaultTemplateId },
      include: { sections: { include: { fields: true } } },
    });

    const mergeFieldValues: Record<string, string | null> = {
      "property address": [property.address, property.city, property.postcode].filter(Boolean).join(", ") || null,
      "landlord name": property.landlordName,
      "client name": event.tenantName || property.landlordName || null,
    };

    const answersToCreate: { inspectionId: string; fieldId: string; value: string }[] = [];
    if (template) {
      for (const section of template.sections) {
        for (const field of section.fields) {
          if (field.type !== "TEXT" && field.type !== "SHORT_TEXT") continue;
          const value = mergeFieldValues[field.label.trim().toLowerCase()];
          if (value) answersToCreate.push({ inspectionId: inspection.id, fieldId: field.id, value });
        }
      }
    }
    if (answersToCreate.length > 0) {
      await prisma.fieldAnswer.createMany({ data: answersToCreate });
    }
  }

  return {
    status: "processed",
    message: `Check-in scheduled for ${property.address}${scheduledDate ? ` on ${scheduledDate.toLocaleDateString("en-GB")}` : ""}`,
    createdInspectionId: inspection.id,
  };
}
