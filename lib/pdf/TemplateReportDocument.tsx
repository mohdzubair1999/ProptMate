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
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6, marginTop: 10, backgroundColor: "#FBF8F4", padding: 6 },
  field: { marginBottom: 8 },
  fieldLabel: { fontSize: 9, color: "#6B6A63", marginBottom: 2 },
  fieldValue: { fontSize: 10 },
  photoRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  photo: { width: 70, height: 70, borderRadius: 4, objectFit: "cover" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#6B6A63" },
});

type Photo = { id: string; url: string; embeddedUrl?: string | null };
type Field = { id: string; label: string; type: string; options: string | null };
type Answer = { fieldId: string; value: string | null; photos: Photo[] };
type Section = { id: string; title: string; fields: Field[] };
type InventoryItem = { id: string; itemName: string; condition: string; notes: string | null; photos: Photo[]; templateFieldId: string | null };

export type TemplateReportData = {
  property: { address: string; type: string; landlordName: string | null };
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
      <Text style={styles.coverMeta}>
        Property type: {data.property.type}
        {data.property.landlordName ? ` · Landlord: ${data.property.landlordName}` : ""}
      </Text>
      <Text style={styles.coverMeta}>Inspector: {data.inspector.name || data.inspector.email}</Text>
      <Text style={styles.coverMeta}>Completed: {data.completedDate ? new Date(data.completedDate).toLocaleDateString() : "—"}</Text>
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
            <Text style={styles.meta}>
              Property type: {data.property.type}
              {data.property.landlordName ? ` · Landlord: ${data.property.landlordName}` : ""}
            </Text>
            <Text style={styles.meta}>Inspector: {data.inspector.name || data.inspector.email}</Text>
            <Text style={styles.meta}>Completed: {data.completedDate ? new Date(data.completedDate).toLocaleDateString() : "—"}</Text>
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

        {data.sections.map((section) => (
          <View key={section.id} style={styles.section} wrap>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.fields.map((field) => {
              const answer = answerByField.get(field.id);

              if (field.type === "PAGE_BREAK") {
                return <View key={field.id} break />;
              }

              return (
                <View key={field.id} style={styles.field} wrap={false}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  {field.type === "INVENTORY_SECTION" ? (
                    (itemsByField.get(field.id) || []).length > 0 ? (
                      (itemsByField.get(field.id) || []).map((item) => (
                        <View key={item.id} style={{ marginBottom: 6 }}>
                          <Text style={styles.fieldValue}>
                            {item.itemName} — {item.condition}
                            {item.notes ? ` — ${item.notes}` : ""}
                          </Text>
                          {item.photos.length > 0 && (
                            <View style={styles.photoRow}>
                              {item.photos.map((p) => (
                                <ClickablePhoto key={p.id} photo={p} style={styles.photo} />
                              ))}
                            </View>
                          )}
                        </View>
                      ))
                    ) : (
                      <Text style={styles.fieldValue}>No items recorded</Text>
                    )
                  ) : field.type === "INFO_TEXT" || field.type === "TERMS" || field.type === "GRID_SECTION" ? (
                    <Text style={styles.fieldValue}>{field.options || "—"}</Text>
                  ) : field.type === "PHOTO" || field.type === "SIGNATURE" ? (
                    answer && answer.photos.length > 0 ? (
                      <View style={styles.photoRow}>
                        {answer.photos.map((p) => (
                          <ClickablePhoto key={p.id} photo={p} style={styles.photo} />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.fieldValue}>—</Text>
                    )
                  ) : (
                    <Text style={styles.fieldValue}>{answer?.value || "—"}</Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer}>Generated by ProptMate on {new Date(data.generatedAt).toLocaleString()}</Text>
      </Page>
    </Document>
  );
}
