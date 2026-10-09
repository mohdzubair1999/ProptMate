import { Document, Page, Text, View, StyleSheet, Image, Link } from "@react-pdf/renderer";
import { CONDITION_LABELS } from "../inventoryConditions";
import { CLEANLINESS_LABELS } from "../inventoryCleanliness";
import { formatDate } from "../formatDate";
import { RichText } from "./RichText";
import { PAGE_MARGIN, SECTION_GAP, PageHeader, PageFooter } from "./pageChrome";

// @react-pdf/renderer needs real colour values, not Tailwind class names — this mirrors the
// same severity progression used in the web app's CONDITION_STYLES (calm green through to a
// clear red flag), just expressed as actual hex pairs instead of Tailwind utility classes.
const PDF_CONDITION_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: "#E7F0EC", text: "#2F6B5E" },
  good: { bg: "#E7F0EC", text: "#2F6B5E" },
  wear_and_tear: { bg: "#FBEEE8", text: "#D96B44" },
  worn: { bg: "#FFEDD5", text: "#C2410C" },
  damaged: { bg: "#FEE2E2", text: "#B91C1C" },
  beyond_economical_repair: { bg: "#FEE2E2", text: "#B91C1C" },
};

function conditionColors(condition: string) {
  return PDF_CONDITION_COLORS[condition] || { bg: "#F0EEEA", text: "#6B6A63" };
}

// Same severity-scaling intent as the web app's CLEANLINESS_STYLES, reusing the exact same
// palette as PDF_CONDITION_COLORS above for visual consistency across both badges.
const PDF_CLEANLINESS_COLORS: Record<string, { bg: string; text: string }> = {
  professionally_cleaned: { bg: "#E7F0EC", text: "#2F6B5E" },
  clean: { bg: "#E7F0EC", text: "#2F6B5E" },
  requires_cleaning: { bg: "#FBEEE8", text: "#D96B44" },
  not_cleaned: { bg: "#FEE2E2", text: "#B91C1C" },
};

// Sections where an unfilled field means "not applicable" (no shed, no oil tank) rather than a
// compliance question that was asked but skipped - unlike most of the report, these should only
// show what was actually filled in, the same way the Summary Reference block already does.
// Matched by title rather than a dedicated flag so it applies to every template without needing
// each one edited - every real template's naming for these sections contains one of these words.
const HIDE_UNFILLED_FIELDS_IN_SECTION = /\b(keys?|utility|meter)/i;

function cleanlinessColors(cleanliness: string) {
  return PDF_CLEANLINESS_COLORS[cleanliness] || { bg: "#F0EEEA", text: "#6B6A63" };
}

// 4 photos per row at the 2 cm margin: 4 x 115pt + 3 x 6pt gap = 478pt, inside the 481.9pt of
// usable width (A4 595.28pt - 2 x 56.69pt).
const PHOTO_SIZE = 115;

const styles = StyleSheet.create({
  // Text-only front cover: left exactly as it was, like the photo cover - only the pages after it get the 2 cm margin.
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#25344A" },
  contentPage: { padding: PAGE_MARGIN, fontSize: 10, fontFamily: "Helvetica", color: "#25344A" },
  coverPage: { padding: 0 },
  // A fixed size, deliberately - do NOT pin this to the page edges with top/right/bottom/left. The photo
  // sits inside a <Link>, which collapses to nothing around an absolutely-positioned child, so an
  // edge-pinned image is sized from that empty box and the cover comes out blank.
  coverImage: { position: "absolute", top: 0, left: 0, width: 595, height: 842, objectFit: "cover" },
  coverOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(37,52,74,0.82)", padding: 32 },
  coverBrand: { fontSize: 14, fontWeight: 700, color: "#ffffff", marginBottom: 10 },
  coverTitle: { fontSize: 24, fontWeight: 700, color: "#ffffff", marginBottom: 8 },
  coverMeta: { fontSize: 11, color: "#F0EDE7", marginBottom: 3 },
  header: { marginBottom: 20, borderBottom: "2px solid #25344A", paddingBottom: 12 },
  brand: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  meta: { fontSize: 10, color: "#6B6A63", marginBottom: 2 },
  aiSummaryBox: { backgroundColor: "#FBF8F4", padding: 10, borderRadius: 4, marginBottom: 16 },
  aiSummaryLabel: { fontSize: 8, color: "#D96B44", textTransform: "uppercase", marginBottom: 4 },
  summaryBox: { flexDirection: "row", gap: 8, marginBottom: 16 },
  summaryChip: { flex: 1, borderRadius: 4, padding: 8, alignItems: "center" },
  summaryChipCount: { fontSize: 16, fontWeight: 700 },
  summaryChipLabel: { fontSize: 7, textTransform: "uppercase", marginTop: 2 },
  // 2 cm after every section - the only separation between one section and the next.
  section: { marginBottom: SECTION_GAP },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6, marginTop: 0, backgroundColor: "#FBF8F4", padding: 6 },
  summaryRefGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  summaryRefItem: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  summaryRefItemFull: { width: "100%", marginBottom: 6 },
  summaryRefLabel: { fontSize: 7, color: "#6B6A63", textTransform: "uppercase", marginBottom: 1 },
  summaryRefValue: { fontSize: 9 },
  // Padding, not margin: the PDF library moves a whole block to the next page when its bottom MARGIN
  // would run past the page end, even if the block could simply have been split - which stranded
  // section headings. Padding is part of the block's own height, so it splits normally.
  field: { paddingBottom: 8 },
  fieldLabel: { fontSize: 9, color: "#6B6A63", marginBottom: 2 },
  fieldValue: { fontSize: 10 },
  conditionBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, alignSelf: "flex-start", marginTop: 2 },
  photoRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 4, objectFit: "cover" },
});

type Photo = { id: string; url: string; embeddedUrl?: string | null };
type Field = { id: string; label: string; type: string; options: string | null };
type Answer = { fieldId: string; value: string | null; photos: Photo[] };
type Section = { id: string; title: string; fields: Field[] };
type InventoryItem = {
  id: string;
  itemName: string;
  condition: string;
  make: string | null;
  quantity: number | null;
  notes: string | null;
  cleanliness?: string | null;
  photos: Photo[];
  templateFieldId: string | null;
};

export type TemplateReportData = {
  property: { address: string; type: string; landlordName: string | null; landlordAddress: string | null };
  type: string;
  templateName: string;
  completedDate: Date | null;
  inspector: { name: string | null; email: string };
  sections: Section[];
  answers: Answer[];
  inventoryItems: InventoryItem[];
  aiSummary?: string | null;
  coverPhotoUrl?: string | null;
  coverPhotoLinkUrl?: string | null;
  generatedAt: Date;
  // The issuing company's name - printed top-left on every page after the cover.
  companyName?: string | null;
  // The company's own website - the name in the header links to it, when set.
  companyWebsite?: string | null;
  summaryReference?: {
    propertyDescription: string | null;
    clientName: string | null;
    clientAddress: string | null;
    otherAlarmLocation: string | null;
    otherAlarmTested: string | null;
    boilerLocation: string | null;
    stopcockLocation: string | null;
    fuseBoxLocation: string | null;
  };
};

// A photo embedded in the PDF, wrapped so tapping it opens the original full-resolution
// version in a browser — most PDF viewers (Preview, Acrobat, Chrome) support this.
function ClickablePhoto({ photo, style }: { photo: Photo; style: any }) {
  const display = photo.embeddedUrl || photo.url;
  return (
    <Link src={photo.url}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={display} style={style} />
    </Link>
  );
}

// 4 matches how many 115pt photos actually fit across an A4 page's usable width at the 2 cm
// margin (481.9pt: 4 x 115pt + 3 x 6pt gap = 478pt) — chunking to that exact row capacity means each
// row is always full unless it's the very last one, so wrapping never leaves visible dead
// space mid-row.
const PHOTOS_PER_ROW = 4;

// Renders a photo set as independent, fixed-size rows rather than one flexWrap block. Each
// row is its own wrap={false} unit — the largest thing that can ever need to move to a new
// page as a whole is one row (121pt tall), never the entire photo set, regardless of how many
// photos an item has. This avoids react-pdf's documented buggy layout when a flexWrap row is
// forced to split mid-row across a page boundary (github.com/diegomura/react-pdf issues #430,
// #416), without the growing-overflow risk of treating an unbounded number of photos as one
// single unbreakable block.
function PhotoGrid({ photos }: { photos: Photo[] }) {
  const rows: Photo[][] = [];
  for (let i = 0; i < photos.length; i += PHOTOS_PER_ROW) {
    rows.push(photos.slice(i, i + PHOTOS_PER_ROW));
  }
  return (
    <>
      {rows.map((row, i) => (
        <View key={i} style={styles.photoRow} wrap={false}>
          {row.map((p) => (
            <ClickablePhoto key={p.id} photo={p} style={styles.photo} />
          ))}
        </View>
      ))}
    </>
  );
}

export function TemplateReportDocument({ data }: { data: TemplateReportData }) {
  const answerByField = new Map(data.answers.map((a) => [a.fieldId, a]));
  const itemsByField = new Map<string, InventoryItem[]>();
  for (const item of data.inventoryItems) {
    if (!item.templateFieldId) continue;
    const list = itemsByField.get(item.templateFieldId) || [];
    list.push(item);
    itemsByField.set(item.templateFieldId, list);
  }

  const coverDetails = (
    <>
      <Text style={styles.coverTitle}>{data.templateName}</Text>
      <Text style={styles.coverMeta}>{data.property.address}</Text>
      <Text style={styles.coverMeta}>Property type: {data.property.type}</Text>
      <Text style={styles.coverMeta}>Inspector: {data.inspector.name || data.inspector.email}</Text>
      <Text style={styles.coverMeta}>Completed: {data.completedDate ? formatDate(data.completedDate) : "—"}</Text>
      {data.summaryReference?.clientName && (
        <>
          <Text style={[styles.coverMeta, { marginTop: 8 }]}>Client:</Text>
          <Text style={styles.coverMeta}>{data.summaryReference?.clientName}</Text>
          {data.summaryReference?.clientAddress && <Text style={styles.coverMeta}>{data.summaryReference?.clientAddress}</Text>}
        </>
      )}
    </>
  );

  return (
    <Document>
      {data.coverPhotoUrl ? (
        <Page size="A4" style={styles.coverPage}>
          {data.coverPhotoLinkUrl ? (
            <Link src={data.coverPhotoLinkUrl}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.coverPhotoUrl} style={styles.coverImage} />
            </Link>
          ) : (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.coverPhotoUrl} style={styles.coverImage} />
          )}
          <View style={styles.coverOverlay}>
            <Text style={styles.coverBrand}>ProptMate</Text>
            {coverDetails}
          </View>
        </Page>
      ) : (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.brand}>ProptMate</Text>
            <Text style={styles.title}>{data.templateName}</Text>
            <Text style={styles.meta}>{data.property.address}</Text>
            <Text style={styles.meta}>Property type: {data.property.type}</Text>
            <Text style={styles.meta}>Inspector: {data.inspector.name || data.inspector.email}</Text>
            <Text style={styles.meta}>Completed: {data.completedDate ? formatDate(data.completedDate) : "—"}</Text>
            {data.summaryReference?.clientName && (
              <>
                <Text style={[styles.meta, { marginTop: 8 }]}>Client:</Text>
                <Text style={styles.meta}>{data.summaryReference?.clientName}</Text>
                {data.summaryReference?.clientAddress && <Text style={styles.meta}>{data.summaryReference?.clientAddress}</Text>}
              </>
            )}
          </View>
        </Page>
      )}

      <Page size="A4" style={styles.contentPage}>
        {data.summaryReference &&
          (() => {
            // Only fields the inspector actually filled in are shown — an empty grid of
            // blank labels would look unfinished rather than simply not applicable.
            const entries: { label: string; value: string; full?: boolean }[] = [
              { label: "Description", value: data.summaryReference.propertyDescription || "", full: true },
              { label: "Other alarm location", value: data.summaryReference.otherAlarmLocation || "" },
              { label: "Other alarm tested", value: data.summaryReference.otherAlarmTested || "" },
              { label: "Boiler location", value: data.summaryReference.boilerLocation || "" },
              { label: "Stopcock location", value: data.summaryReference.stopcockLocation || "" },
              { label: "Trip-switch/fuse box location", value: data.summaryReference.fuseBoxLocation || "" },
            ].filter((e) => e.value.trim());

            if (entries.length === 0) return null;

            return (
              <View style={styles.section} wrap>
                <Text style={styles.sectionTitle}>Summary Reference</Text>
                <View style={styles.summaryRefGrid}>
                  {entries.map((e) => (
                    <View key={e.label} style={e.full ? styles.summaryRefItemFull : styles.summaryRefItem}>
                      <Text style={styles.summaryRefLabel}>{e.label}</Text>
                      <Text style={styles.summaryRefValue}>{e.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

        {data.aiSummary && (
          <View style={styles.aiSummaryBox}>
            <Text style={styles.aiSummaryLabel}>AI Summary</Text>
            <Text style={{ fontSize: 10 }}>{data.aiSummary}</Text>
          </View>
        )}

        {data.inventoryItems.length > 0 &&
          (() => {
            // Grouped into three buckets rather than showing all six condition values
            // separately — the point of a summary is a fast at-a-glance read, not another
            // detailed breakdown; that's what the sections below are for.
            const goodCount = data.inventoryItems.filter((i) => i.condition === "new" || i.condition === "good").length;
            const attentionCount = data.inventoryItems.filter((i) => i.condition === "wear_and_tear" || i.condition === "worn").length;
            const damagedCount = data.inventoryItems.filter((i) => i.condition === "damaged" || i.condition === "beyond_economical_repair").length;
            return (
              <View style={styles.summaryBox}>
                <View style={[styles.summaryChip, { backgroundColor: "#E7F0EC" }]}>
                  <Text style={[styles.summaryChipCount, { color: "#2F6B5E" }]}>{goodCount}</Text>
                  <Text style={[styles.summaryChipLabel, { color: "#2F6B5E" }]}>Good condition</Text>
                </View>
                <View style={[styles.summaryChip, { backgroundColor: "#FFEDD5" }]}>
                  <Text style={[styles.summaryChipCount, { color: "#C2410C" }]}>{attentionCount}</Text>
                  <Text style={[styles.summaryChipLabel, { color: "#C2410C" }]}>Needs attention</Text>
                </View>
                <View style={[styles.summaryChip, { backgroundColor: "#FEE2E2" }]}>
                  <Text style={[styles.summaryChipCount, { color: "#B91C1C" }]}>{damagedCount}</Text>
                  <Text style={[styles.summaryChipLabel, { color: "#B91C1C" }]}>Damaged</Text>
                </View>
              </View>
            );
          })()}

        {data.sections
          .filter((section) => {
            if (!HIDE_UNFILLED_FIELDS_IN_SECTION.test(section.title)) return true;
            return section.fields.some((f) => {
              if (f.type === "PAGE_BREAK") return false;
              const a = answerByField.get(f.id);
              if (f.type === "PHOTO" || f.type === "SIGNATURE") return !!(a && a.photos.length > 0);
              if (f.type === "INVENTORY_SECTION") return (itemsByField.get(f.id) || []).length > 0;
              return !!a?.value;
            });
          })
          .flatMap((section) => {
            // A section is a run of direct children of the page - its heading, then one block per field -
            // not one big container. Inside a container the heading is the first child, and the PDF
            // library only keeps a heading with what follows when something already sits above it on
            // the page, so a heading that started a container could be left alone at the bottom.
            const makeBlock = (field: Field, withLabel: boolean, gap: "margin" | "padding" | null) => {
              const answer = answerByField.get(field.id);

              // Reports have no page breaks. Templates made before that may still hold one - it is simply ignored.
              if (field.type === "PAGE_BREAK") return null;

              // Each inventory item's text and condition badges are grouped into their own
              // small, unsplittable block, so they can never be separated from each other
              // mid-item (name on one page, condition badge on the next). Deliberately NOT
              // extended to include the item's photos too - an earlier version of this file
              // did exactly that, and it meant an item with several photos could force a much
              // larger chunk to jump entirely to a new page than necessary, leaving a bigger
              // gap behind than the smaller text-only block ever would. Photos stay a
              // separate sibling, already broken into their own safely-sized, independently
              // breakable rows by PhotoGrid. The outer field container above stays wrap-able
              // for the same reason - locking it down wouldn't protect anything further, only
              // risk pushing the whole field to a new page when it doesn't fully fit.

              // An empty "Comments" or "Photos" field showing just a bare dash looks
              // unfinished rather than simply not applicable — skip the whole field,
              // including its label, when there's genuinely nothing to show.
              // Scoped deliberately narrow: only "Comments" and photo fields get hidden
              // when empty. Every other unanswered question (dropdowns, dates, etc.) keeps
              // showing the dash — for a compliance document like this, being able to see
              // that a genuine safety question was asked but not answered matters more than
              // a cleaner-looking page, and silently hiding it would make a skipped question
              // look identical to one that was never part of the report at all.
              const isPhotoField = field.type === "PHOTO" || field.type === "SIGNATURE";
              const isCommentsField = field.label.trim().toLowerCase() === "comments";
              // Within a keys/meter-readings section, every other field type (the key counts,
              // meter references) is hidden when blank too - "0" is a real, deliberately entered
              // answer and still shows; only genuinely untouched fields are skipped.
              const hideIfUnfilledHere = HIDE_UNFILLED_FIELDS_IN_SECTION.test(section.title) && !isPhotoField && !isCommentsField && field.type !== "PAGE_BREAK" && field.type !== "INVENTORY_SECTION";
              const isEmptyHiddenField =
                (isPhotoField && !(answer && answer.photos.length > 0)) || (isCommentsField && !answer?.value) || (hideIfUnfilledHere && !answer?.value);
              if (isEmptyHiddenField) return null;

              return (
                <View key={field.id} style={[styles.field, gap === "margin" ? { paddingBottom: 0, marginBottom: SECTION_GAP } : gap === "padding" ? { paddingBottom: SECTION_GAP } : {}]} wrap>
                  {withLabel && <Text style={styles.fieldLabel}>{field.label}</Text>}
                  {field.type === "INVENTORY_SECTION" ? (
                    (itemsByField.get(field.id) || []).length > 0 ? (
                      (itemsByField.get(field.id) || []).map((item) => {
                        const colors = conditionColors(item.condition);
                        return (
                          <View key={item.id} style={{ paddingBottom: 8 }}>
                            <View wrap={false}>
                              <Text style={styles.fieldValue}>
                                {item.quantity ? `${item.quantity}x ` : ""}
                                {item.itemName}
                                {item.make ? ` — ${item.make}` : ""}
                              </Text>
                              <View style={{ flexDirection: "row", gap: 4 }}>
                                <Text style={[styles.conditionBadge, { backgroundColor: colors.bg, color: colors.text }]}>
                                  {CONDITION_LABELS[item.condition] || item.condition}
                                </Text>
                                {item.cleanliness &&
                                  (() => {
                                    const cleanColors = cleanlinessColors(item.cleanliness);
                                    return (
                                      <Text style={[styles.conditionBadge, { backgroundColor: cleanColors.bg, color: cleanColors.text }]}>
                                        {CLEANLINESS_LABELS[item.cleanliness] || item.cleanliness}
                                      </Text>
                                    );
                                  })()}
                              </View>
                            </View>
                            {/* Deliberately OUTSIDE the wrap={false} block above, and no longer
                                glued into the same Text as the item name - a long description
                                should flow and split across a page boundary like normal text
                                instead of dragging the whole item to the next page. */}
                            {item.notes && <Text style={styles.fieldValue}>{item.notes}</Text>}
                            {item.photos.length > 0 && <PhotoGrid photos={item.photos} />}
                          </View>
                        );
                      })
                    ) : (
                      <Text style={styles.fieldValue}>No items recorded</Text>
                    )
                  ) : field.type === "INFO_TEXT" || field.type === "TERMS" || field.type === "GRID_SECTION" ? (
                    <Text style={styles.fieldValue}>{field.options || "—"}</Text>
                  ) : field.type === "PHOTO" || field.type === "SIGNATURE" ? (
                    <PhotoGrid photos={answer!.photos} />
                  ) : (
                    isCommentsField && answer?.value ? (
                      <RichText text={answer.value} style={styles.fieldValue} />
                    ) : (
                      <Text style={styles.fieldValue}>{answer?.value || "—"}</Text>
                    )
                  )}
                </View>
              );
            };

            // Which fields actually produce something (an empty Comments or Photos field, or a blank
            // Keys field, produces nothing).
            const shown: number[] = [];
            section.fields.forEach((f, i) => {
              if (makeBlock(f, true, null)) shown.push(i);
            });
            const first = shown[0];
            const last = shown[shown.length - 1];
            // The 2 cm gap after the section is a bottom margin on its last block - a margin is dropped at
            // a page break, so no gap is carried to the top of the next page. A section with only ONE block
            // uses padding instead: if that lone block moved to the next page because of its margin, the
            // heading would be left behind on its own.
            const gap = shown.length > 1 ? "margin" : "padding";
            // The heading and the label of the first field below it travel as one unbreakable unit, and
            // the unit needs room for the start of what follows, so a heading can never end up alone at
            // the bottom of a page.
            const heading = (
              <View key={`${section.id}-heading`} wrap={false} minPresenceAhead={50} style={shown.length === 0 ? { marginBottom: SECTION_GAP } : undefined}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {first !== undefined && <Text style={styles.fieldLabel}>{section.fields[first].label}</Text>}
              </View>
            );
            return [heading, ...shown.map((i) => makeBlock(section.fields[i], i !== first, i === last ? gap : null))];
          })}

        <PageHeader companyName={data.companyName} companyWebsite={data.companyWebsite} reference={`${data.property.address} · ${data.templateName}`} />
        <PageFooter />
      </Page>
    </Document>
  );
}
