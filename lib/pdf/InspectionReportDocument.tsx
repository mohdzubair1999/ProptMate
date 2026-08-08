import { Document, Page, Text, View, StyleSheet, Image, Link } from "@react-pdf/renderer";

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
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8, marginTop: 12 },
  item: { marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #E9E3D9" },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  itemTitle: { fontSize: 11, fontWeight: 700 },
  condition: { fontSize: 9, textTransform: "uppercase" },
  notes: { fontSize: 10, color: "#6B6A63", marginBottom: 6 },
  photoRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  photo: { width: 80, height: 80, borderRadius: 4, objectFit: "cover" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#6B6A63" },
});

const conditionColor: Record<string, string> = {
  good: "#2F6B5E",
  fair: "#D96B44",
  poor: "#C2410C",
  damaged: "#B91C1C",
};

type Photo = { id: string; url: string; embeddedUrl?: string | null };
type Item = { id: string; room: string; itemName: string; condition: string; notes: string | null; photos: Photo[] };

export type ReportData = {
  property: { address: string; type: string; landlordName: string | null };
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
      <Text style={styles.coverMeta}>
        Property type: {data.property.type}
        {data.property.landlordName ? ` · Landlord: ${data.property.landlordName}` : ""}
      </Text>
      <Text style={styles.coverMeta}>Inspector: {data.inspector.name || data.inspector.email}</Text>
      <Text style={styles.coverMeta}>
        {data.completedDate
          ? `Completed: ${new Date(data.completedDate).toLocaleDateString()}`
          : `Scheduled: ${data.scheduledDate ? new Date(data.scheduledDate).toLocaleDateString() : "—"}`}
      </Text>
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
        {data.aiSummary && (
          <View style={styles.aiSummaryBox}>
            <Text style={styles.aiSummaryLabel}>AI Summary</Text>
            <Text style={{ fontSize: 10 }}>{data.aiSummary}</Text>
          </View>
        )}

        {Object.entries(grouped).map(([room, items]) => (
          <View key={room} style={styles.section} wrap>
            <Text style={styles.sectionTitle}>{room}</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.item} wrap={false}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{item.itemName}</Text>
                  <Text style={{ ...styles.condition, color: conditionColor[item.condition] || "#6B6A63" }}>{item.condition}</Text>
                </View>
                {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                {item.photos.length > 0 && (
                  <View style={styles.photoRow}>
                    {item.photos.map((photo) => (
                      <ClickablePhoto key={photo.id} photo={photo} style={styles.photo} />
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>Generated by ProptMate on {new Date(data.generatedAt).toLocaleString()}</Text>
      </Page>
    </Document>
  );
}
