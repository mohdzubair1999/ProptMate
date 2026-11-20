import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatDate } from "../formatDate";
import { PAGE_MARGIN, PageHeader, PageFooter } from "./pageChrome";
import { CLASSIFICATION_LABELS, cleanlinessLabel, conditionLabel, tenancyText, type PackItem, type PackModel, type PackRow, type RowStatus } from "../disputePack";

// The deposit dispute pack as a PDF: a check-out set against its check-in. It states what was RECORDED, side by side, with the
// photographs taken; it does not decide who is responsible. Any fair wear and tear assessment shown is the one already recorded
// on the item, and is labelled as advisory.

const NAVY = "#25344A", MUTED = "#6B6A63", LINE = "#E4E1DA", PAPER = "#F7F5F0", SIGNAL = "#D96B44";
const COND: Record<string, { bg: string; text: string }> = {
  new: { bg: "#E7F0EC", text: "#2F6B5E" }, good: { bg: "#E7F0EC", text: "#2F6B5E" }, wear_and_tear: { bg: "#FBEEE8", text: "#D96B44" },
  worn: { bg: "#FFEDD5", text: "#C2410C" }, damaged: { bg: "#FEE2E2", text: "#B91C1C" }, beyond_economical_repair: { bg: "#FEE2E2", text: "#B91C1C" },
};
const STATUS: Record<RowStatus, { label: string; bg: string; text: string }> = {
  removed: { label: "NOT FOUND AT CHECK-OUT", bg: "#FEE2E2", text: "#B91C1C" },
  worse: { label: "WORSE THAN AT CHECK-IN", bg: "#FEE2E2", text: "#B91C1C" },
  changed: { label: "CHANGED", bg: "#FFEDD5", text: "#C2410C" },
  added: { label: "ADDED AT CHECK-OUT", bg: "#E8EEF7", text: "#25344A" },
  improved: { label: "IMPROVED", bg: "#E7F0EC", text: "#2F6B5E" },
  unchanged: { label: "UNCHANGED", bg: "#E7F0EC", text: "#2F6B5E" },
};
const s = StyleSheet.create({
  page: { padding: PAGE_MARGIN, paddingTop: PAGE_MARGIN + 18, paddingBottom: PAGE_MARGIN + 18, fontSize: 9.5, fontFamily: "Helvetica", color: NAVY },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sub: { fontSize: 11, color: MUTED, marginBottom: 14 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  small: { fontSize: 8.5, color: MUTED, lineHeight: 1.4 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10, marginBottom: 8, backgroundColor: PAPER },
  row2: { flexDirection: "row", gap: 8 },
  kv: { flexDirection: "row", marginBottom: 3 },
  k: { width: 230, color: MUTED },
  v: { flex: 1, fontFamily: "Helvetica-Bold" },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 9, marginBottom: 9 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", flex: 1, paddingRight: 6 },
  badge: { fontSize: 7, fontFamily: "Helvetica-Bold", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  col: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6 },
  colHead: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MUTED, marginBottom: 3 },
  pill: { fontSize: 8, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 3, alignSelf: "flex-start", marginBottom: 3 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5 },
  photo: { width: 112, height: 84, objectFit: "cover", borderRadius: 2 },
  assess: { marginTop: 6, padding: 6, borderLeftWidth: 3, borderLeftColor: SIGNAL, backgroundColor: PAPER },
  list2: { flexDirection: "row", flexWrap: "wrap" },
  li: { width: "50%", fontSize: 8.5, paddingRight: 8, marginBottom: 2 },
});

const clean = (v: unknown, max = 1500) => {
  const t = String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}… (shortened)` : t;
};

function Side({ title, item, images, photoCount }: { title: string; item: PackItem | null; images: Record<string, string>; photoCount: number }) {
  if (!item) return (
    <View style={s.col}>
      <Text style={s.colHead}>{title}</Text>
      <Text style={{ color: MUTED }}>Not recorded</Text>
    </View>
  );
  const c = COND[item.condition] ?? { bg: "#F0EEEA", text: MUTED };
  const shown = item.photos.map((p) => images[p.url]).filter(Boolean).slice(0, photoCount);
  const missing = Math.min(item.photos.length, photoCount) - shown.length;
  return (
    <View style={s.col}>
      <Text style={s.colHead}>{title}</Text>
      <Text style={[s.pill, { backgroundColor: c.bg, color: c.text }]}>{conditionLabel(item.condition)}</Text>
      <Text>Cleanliness: {cleanlinessLabel(item.cleanliness)}</Text>
      {item.make ? <Text>Make: {clean(item.make, 80)}</Text> : null}
      {item.quantity ? <Text>Quantity: {item.quantity}</Text> : null}
      <Text style={{ marginTop: 3, lineHeight: 1.35 }}>{item.notes && clean(item.notes) ? clean(item.notes) : "No note recorded."}</Text>
      {shown.length > 0 ? <View style={s.photos}>{shown.map((src, i) => <Image key={i} src={src} style={s.photo} />)}</View> : null}
      {item.photos.length === 0 ? <Text style={[s.small, { marginTop: 4 }]}>No photograph recorded.</Text> : null}
      {missing > 0 ? <Text style={[s.small, { marginTop: 4 }]}>{missing} photograph{missing === 1 ? "" : "s"} could not be included.</Text> : null}
      {item.photos.length > photoCount ? <Text style={[s.small, { marginTop: 2 }]}>{item.photos.length - photoCount} more photograph{item.photos.length - photoCount === 1 ? "" : "s"} recorded in the report.</Text> : null}
    </View>
  );
}

function Card({ row, images, dates }: { row: PackRow; images: Record<string, string>; dates: { checkIn: string; checkOut: string } }) {
  const st = STATUS[row.status];
  const a = row.checkOut;
  // A normal card is kept together on one page. A card with a lot of text is allowed to flow onto the next page instead: forcing it
  // onto one page when it cannot fit makes the PDF library cut it off, silently losing part of the record.
  const weight = (row.checkIn?.notes?.length ?? 0) + (row.checkOut?.notes?.length ?? 0) + (a?.disputeRiskReasoning?.length ?? 0) + (a?.disputeRiskEvidenceNote?.length ?? 0);
  return (
    <View style={s.card} wrap={weight > 900}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{clean(row.room, 80) || "Room not recorded"}: {clean(row.itemName, 100)}{row.renamedFrom ? ` (recorded as "${clean(row.renamedFrom, 100)}" at check-in)` : ""}</Text>
        <Text style={[s.badge, { backgroundColor: st.bg, color: st.text }]}>{st.label}</Text>
      </View>
      <View style={s.row2}>
        <Side title={`AT CHECK-IN${dates.checkIn ? ` (${dates.checkIn})` : ""}`} item={row.checkIn} images={images} photoCount={2} />
        <Side title={`AT CHECK-OUT${dates.checkOut ? ` (${dates.checkOut})` : ""}`} item={row.checkOut} images={images} photoCount={2} />
      </View>
      {a?.disputeRiskClassification && row.status !== "unchanged" ? (
        <View style={s.assess}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>
            Recorded assessment (advisory): {CLASSIFICATION_LABELS[a.disputeRiskClassification] ?? clean(a.disputeRiskClassification, 40)}
            {a.disputeRiskConfidence ? `, ${clean(a.disputeRiskConfidence, 12)} confidence` : ""}
          </Text>
          {a.disputeRiskReasoning ? <Text style={{ marginTop: 2, lineHeight: 1.35 }}>{clean(a.disputeRiskReasoning, 900)}</Text> : null}
          {a.disputeRiskEvidenceNote ? <Text style={[s.small, { marginTop: 2 }]}>Evidence note: {clean(a.disputeRiskEvidenceNote, 600)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function DisputePackDocument({ model, images, address, companyName, companyWebsite, generatedAt }: { model: PackModel; images: Record<string, string>; address: string; companyName?: string | null; companyWebsite?: string | null; generatedAt: Date }) {
  const dates = { checkIn: model.tenancy.checkIn ? formatDate(model.tenancy.checkIn) : "", checkOut: model.tenancy.checkOut ? formatDate(model.tenancy.checkOut) : "" };
  const changed = model.rows.filter((r) => r.status !== "unchanged");
  const unchanged = model.rows.filter((r) => r.status === "unchanged");
  const c = model.counts;
  const cls = Object.entries(model.classifications);
  const summary: [string, number][] = [["Items compared", c.compared], ["Unchanged", c.unchanged], ["Worse than at check-in", c.worse], ["Improved", c.improved], ["Other changes (notes, make, cleanliness)", c.otherChange], ["Added at check-out", c.added], ["Not found at check-out", c.removed], ...(c.renamed > 0 ? ([["Matched under a different name", c.renamed]] as [string, number][]) : [])];
  return (
    <Document title={`Deposit dispute pack - ${clean(address, 80)}`} author={companyName || "ProptMate"}>
      <Page size="A4" style={s.page}>
        <PageHeader companyName={companyName} companyWebsite={companyWebsite} reference={`${clean(address, 60)} · Deposit dispute pack`} />
        <Text style={s.h1}>Deposit dispute pack</Text>
        <Text style={s.sub}>Check-out compared with check-in</Text>
        <View style={s.box}>
          <View style={s.kv}><Text style={s.k}>Property</Text><Text style={s.v}>{clean(address, 160)}</Text></View>
          <View style={s.kv}><Text style={s.k}>Check-in</Text><Text style={s.v}>{dates.checkIn || "Date not recorded"}</Text></View>
          <View style={s.kv}><Text style={s.k}>Check-out</Text><Text style={s.v}>{dates.checkOut || "Date not recorded"}</Text></View>
          <View style={s.kv}><Text style={s.k}>Length of tenancy</Text><Text style={s.v}>{tenancyText(model.tenancy.months)}</Text></View>
        </View>
        <Text style={s.h2}>Summary</Text>
        <View style={s.box}>
          {summary.map(([label, n]) => (
            <View style={s.kv} key={label}><Text style={s.k}>{label}</Text><Text style={s.v}>{n}</Text></View>
          ))}
        </View>
        {cls.length > 0 ? (
          <>
            <Text style={s.h2}>Recorded assessments of the items that changed</Text>
            <View style={s.box}>
              {cls.map(([k, n]) => (
                <View style={s.kv} key={k}><Text style={s.k}>{CLASSIFICATION_LABELS[k] ?? clean(k, 40)}</Text><Text style={s.v}>{n} item{n === 1 ? "" : "s"}</Text></View>
              ))}
              <Text style={[s.small, { marginTop: 4 }]}>These assessments were produced from the recorded information to help the inspector. They are advisory and are not a legal determination.</Text>
            </View>
          </>
        ) : null}
        <Text style={s.h2}>How to read this pack</Text>
        <Text style={{ lineHeight: 1.45 }}>
          Each item that changed is shown with what was recorded at check-in and at check-out, side by side, with the photographs taken. Items that did not change are listed at the end. Fair wear and tear depends on the length of the tenancy, the number of occupants and the condition at the start of the tenancy. This pack records what changed; it does not decide who is responsible.
        </Text>
        <PageFooter />
      </Page>
      {changed.length > 0 ? (
        <Page size="A4" style={s.page}>
          <PageHeader companyName={companyName} companyWebsite={companyWebsite} reference={`${clean(address, 60)} · Deposit dispute pack`} />
          <Text style={s.h2}>Items that changed ({changed.length})</Text>
          {changed.map((r, i) => <Card key={`${r.key}-${i}`} row={r} images={images} dates={dates} />)}
          <PageFooter />
        </Page>
      ) : (
        <Page size="A4" style={s.page}>
          <PageHeader companyName={companyName} companyWebsite={companyWebsite} reference={`${clean(address, 60)} · Deposit dispute pack`} />
          <Text style={s.h2}>Items that changed</Text>
          <Text>No item was recorded as changed between check-in and check-out.</Text>
          <PageFooter />
        </Page>
      )}
      <Page size="A4" style={s.page}>
        <PageHeader companyName={companyName} companyWebsite={companyWebsite} reference={`${clean(address, 60)} · Deposit dispute pack`} />
        <Text style={s.h2}>Items that did not change ({unchanged.length})</Text>
        {unchanged.length === 0 ? <Text>None.</Text> : (
          <View style={s.list2}>
            {unchanged.map((r, i) => (
              <Text key={`${r.key}-${i}`} style={s.li}>{clean(r.room, 40) || "-"}: {clean(r.itemName, 60)} ({conditionLabel(r.checkOut?.condition)})</Text>
            ))}
          </View>
        )}
        <Text style={s.h2}>Prepared from</Text>
        <Text style={{ lineHeight: 1.45 }}>
          The check-in{dates.checkIn ? ` of ${dates.checkIn}` : ""} and the check-out{dates.checkOut ? ` of ${dates.checkOut}` : ""}, as recorded by the inspector. Generated by ProptMate on {formatDate(generatedAt)}.
        </Text>
        <PageFooter />
      </Page>
    </Document>
  );
}
