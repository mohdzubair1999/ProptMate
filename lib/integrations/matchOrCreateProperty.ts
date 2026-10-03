import { prisma } from "@/lib/prisma";

// Lowercases, trims, collapses whitespace, and drops common punctuation - lets "12 Example
// Street, London" and "12 example street  london" match as the same address without needing
// character-for-character identical strings from every different sending platform.
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[,.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function matchOrCreateProperty(
  companyId: string,
  address: string,
  city: string | undefined,
  postcode: string | undefined
): Promise<{ propertyId: string; wasCreated: boolean }> {
  const normalizedAddress = normalize(address);
  const normalizedPostcode = postcode ? normalize(postcode) : undefined;

  // Every candidate for this company is pulled and compared in memory rather than pushing
  // the normalization into the database query itself - property counts per company are small
  // enough that this is simpler and more obviously correct than replicating this exact
  // normalization logic as SQL, and it keeps the one normalize() function above as the only
  // place this matching rule is ever defined.
  const candidates = await prisma.property.findMany({
    where: { companyId },
    select: { id: true, address: true, postcode: true },
  });

  const match = candidates.find((c) => {
    const addressMatches = normalize(c.address) === normalizedAddress;
    if (!normalizedPostcode) return addressMatches;
    // When the event includes a postcode, both the address AND the postcode must match -
    // requiring both is deliberately stricter once a postcode is available, since two
    // genuinely different properties (different flats in the same building, for instance)
    // could otherwise share an address string closely enough to collide on address alone.
    return addressMatches && !!c.postcode && normalize(c.postcode) === normalizedPostcode;
  });

  if (match) {
    return { propertyId: match.id, wasCreated: false };
  }

  const created = await prisma.property.create({
    data: {
      companyId,
      address,
      city: city || undefined,
      postcode: postcode || undefined,
      // "flat" as a reasonable, common default - the event that triggered this creation
      // doesn't necessarily say what type of property it is, and guessing at bedrooms,
      // landlord details, or anything else the event didn't actually provide would be
      // inventing data rather than recording it. The note below is what actually matters
      // here: making sure staff know to check and complete this record, not the default
      // itself.
      type: "flat",
      notes: "Auto-created from an integration event - please verify and complete these details.",
    },
  });

  return { propertyId: created.id, wasCreated: true };
}
