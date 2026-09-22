import { Document, Page, Text, View, StyleSheet, Image, Link } from "@react-pdf/renderer";
import { CONDITION_LABELS } from "../inventoryConditions";
import { CLEANLINESS_LABELS } from "../inventoryCleanliness";
import { formatDate } from "../formatDate";

// @react-pdf/renderer needs real colour values, not Tailwind class names — mirrors the same
// severity progression used in the web app's CONDITION_STYLES.
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

function cleanlinessColors(cleanliness: string) {
  return PDF_CLEANLINESS_COLORS[cleanliness] || { bg: "#F0EEEA", text: "#6B6A63" };
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#25344A" },
  coverPage: { padding: 0 },
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
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8, marginTop: 12 },
  summaryRefGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  summaryRefItem: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  summaryRefItemFull: { width: "100%", marginBottom: 6 },
  summaryRefLabel: { fontSize: 7, color: "#6B6A63", textTransform: "uppercase", marginBottom: 1 },
  summaryRefValue: { fontSize: 9 },
  item: { marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #E9E3D9" },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  itemTitle: { fontSize: 11, fontWeight: 700 },
  conditionBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8 },
  notes: { fontSize: 10, color: "#6B6A63", marginBottom: 6, textAlign: "justify" },
  photoRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  photo: { width: 120, height: 120, borderRadius: 4, objectFit: "cover" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#6B6A63" },
  pageNumber: { position: "absolute", bottom: 30, right: 40, fontSize: 8, color: "#6B6A63" },
});

type Photo = { id: string; url: string; embeddedUrl?: string | null };
type Item = {
  id: string;
  room: string;
  itemName: string;
  condition: string;
  make?: string | null;
  quantity?: number | null;
  notes: string | null;
  cleanliness?: string | null;
  photos: Photo[];
};

export type ReportData = {
  property: { address: string; type: string; landlordName: string | null; landlordAddress: string | null };
  type: string;
  status: string;
  scheduledDate: Date | null;
  completedDate: Date | null;
  inspector: { name: string | null; email: string };
  items: Item[];
  aiSummary?: string | null;
  coverPhotoUrl?: string | null;
  coverPhotoLinkUrl?: string | null;
  generatedAt: Date;
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

function ClickablePhoto({ photo, style }: { photo: Photo; style: any }) {
  const display = photo.embeddedUrl || photo.url;
  return (
    <Link src={photo.url}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={display} style={style} />
    </Link>
  );
}

// 4 matches how many 120pt photos fit across an A4 page's usable width at this padding
// (515pt / (120pt + 6pt gap) ≈ 4.1) — see TemplateReportDocument.tsx for the full reasoning.
// Renders a photo set as independent, fixed-size rows rather than one flexWrap block, so the
// largest thing that can ever need to move to a new page as a whole is one row, never the
// entire photo set regardless of how many photos an item has.
const PHOTOS_PER_ROW = 4;

function PhotoGrid({ photos }: { photos: Photo[] }) {
  const rows: Photo[][] = [];
  for (let i = 0; i < photos.length; i += PHOTOS_PER_ROW) {
    rows.push(photos.slice(i, i + PHOTOS_PER_ROW));
  }
  return (
    <>
      {rows.map((row, i) => (
        <View key={i} style={styles.photoRow} wrap={false}>
          {row.map((photo) => (
            <ClickablePhoto key={photo.id} photo={photo} style={styles.photo} />
          ))}
        </View>
      ))}
    </>
  );
}

export function InspectionReportDocument({ data }: { data: ReportData }) {
  const grouped = data.items.reduce<Record<string, Item[]>>((acc, item) => {
    acc[item.room] = acc[item.room] || [];
    acc[item.room].push(item);
    return acc;
  }, {});

  const coverDetails = (
    <>
      <Text style={styles.coverTitle}>
        {data.type.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())} Inspection Report
      </Text>
      <Text style={styles.coverMeta}>{data.property.address}</Text>
      <Text style={styles.coverMeta}>Property type: {data.property.type}</Text>
      <Text style={styles.coverMeta}>Inspector: {data.inspector.name || data.inspector.email}</Text>
      <Text style={styles.coverMeta}>
        {data.completedDate
          ? `Completed: ${formatDate(data.completedDate)}`
          : `Scheduled: ${data.scheduledDate ? formatDate(data.scheduledDate) : "—"}`}
      </Text>
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
            {coverDetails}
          </View>
        </Page>
      )}

      <Page size="A4" style={styles.page}>
        {data.summaryReference &&
          (() => {
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

        {data.items.length > 0 &&
          (() => {
            const goodCount = data.items.filter((i) => i.condition === "new" || i.condition === "good").length;
            const attentionCount = data.items.filter((i) => i.condition === "wear_and_tear" || i.condition === "worn").length;
            const damagedCount = data.items.filter((i) => i.condition === "damaged" || i.condition === "beyond_economical_repair").length;
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

        {Object.entries(grouped).map(([room, items]) => (
          <View key={room} style={styles.section} wrap>
            <Text style={styles.sectionTitle}>{room}</Text>
            {items.map((item) => {
              const colors = conditionColors(item.condition);
              return (
                <View key={item.id} style={styles.item}>
                  <View wrap={false}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTitle}>
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
                    {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                  </View>
                  {item.photos.length > 0 && <PhotoGrid photos={item.photos} />}
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer}>Generated by ProptMate on {new Date(data.generatedAt).toLocaleString()}</Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
