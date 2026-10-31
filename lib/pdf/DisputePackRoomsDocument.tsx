import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatDate } from "../formatDate";
import { PAGE_MARGIN, PageHeader, PageFooter } from "./pageChrome";
import { CLASSIFICATION_LABELS, cleanlinessLabel, conditionLabel, isBelowGood, roomLayout, type PackItem, type RoomPackModel } from "../disputePack";

// The deposit dispute pack for a check-in that came from ANOTHER COMPANY's report. Their report is only available here as a short summary
// for each room, read from their document by software, so nothing is compared item by item: each room shows their summary beside the
// check-out items recorded here. The pack says plainly that the check-in side may contain errors and must be checked against the original.

const NAVY = "#25344A", MUTED = "#6B6A63", LINE = "#E4E1DA", PAPER = "#F7F5F0", SIGNAL = "#D96B44";
const COND: Record<string, { bg: string; text: string }> = {
  new: { bg: "#E7F0EC", text: "#2F6B5E" }, good: { bg: "#E7F0EC", text: "#2F6B5E" }, wear_and_tear: { bg: "#FBEEE8", text: "#D96B44" },
  worn: { bg: "#FFEDD5", text: "#C2410C" }, damaged: { bg: "#FEE2E2", text: "#B91C1C" }, beyond_economical_repair: { bg: "#FEE2E2", text: "#B91C1C" },
};
const s = StyleSheet.create({
  page: { padding: PAGE_MARGIN, paddingTop: PAGE_MARGIN + 18, paddingBottom: PAGE_MARGIN + 18, fontSize: 9.5, fontFamily: "Helvetica", color: NAVY },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sub: { fontSize: 11, color: MUTED, marginBottom: 14 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  small: { fontSize: 8.5, color: MUTED, lineHeight: 1.4 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10, marginBottom: 8, backgroundColor: PAPER },
  warn: { borderWidth: 1, borderColor: SIGNAL, borderRadius: 4, padding: 10, marginBottom: 8 },
  kv: { flexDirection: "row", marginBottom: 3 },
  k: { width: 230, color: MUTED },
  v: { flex: 1, fontFamily: "Helvetica-Bold" },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 9, marginBottom: 9 },
  cardTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  row2: { flexDirection: "row", gap: 8 },
  col: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6 },
  block: { borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6, marginBottom: 6 },
  colHead: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MUTED, marginBottom: 3 },
  item: { marginBottom: 6, paddingBottom: 5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  pill: { fontSize: 8, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 3, alignSelf: "flex-start", marginBottom: 2 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  photo: { width: 96, height: 72, objectFit: "cover", borderRadius: 2 },
  assess: { marginTop: 4, padding: 5, borderLeftWidth: 3, borderLeftColor: SIGNAL, backgroundColor: PAPER },
});
const clean = (v: unknown, max = 3000) => {
  const t = String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}… (shortened)` : t;
};

function Item({ it, images }: { it: PackItem; images: Record<string, string> }) {
  const c = COND[it.condition] ?? { bg: "#F0EEEA", text: MUTED };
  const shown = isBelowGood(it.condition) ? it.photos.map((p) => images[p.url]).filter(Boolean).slice(0, 2) : [];
  const missing = isBelowGood(it.condition) ? Math.min(it.photos.length, 2) - shown.length : 0;
  return (
    <View style={s.item} wrap={false}>
      <Text style={{ fontFamily: "Helvetica-Bold" }}>{clean(it.itemName, 100)}</Text>
      <Text style={[s.pill, { backgroundColor: c.bg, color: c.text }]}>{conditionLabel(it.condition)}</Text>
      <Text>Cleanliness: {cleanlinessLabel(it.cleanliness)}</Text>
      {it.make ? <Text>Make: {clean(it.make, 80)}</Text> : null}
      {it.notes && clean(it.notes) ? <Text style={{ marginTop: 2, lineHeight: 1.35 }}>{clean(it.notes, 1500)}</Text> : null}
      {shown.length > 0 ? <View style={s.photos}>{shown.map((src, i) => <Image key={i} src={src} style={s.photo} />)}</View> : null}
      {missing > 0 ? <Text style={[s.small, { marginTop: 3 }]}>{missing} photograph{missing === 1 ? "" : "s"} could not be included.</Text> : null}
      {it.disputeRiskClassification && isBelowGood(it.condition) ? (
        <View style={s.assess}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>
            Recorded assessment (advisory): {CLASSIFICATION_LABELS[it.disputeRiskClassification] ?? clean(it.disputeRiskClassification, 40)}
            {it.disputeRiskConfidence ? `, ${clean(it.disputeRiskConfidence, 12)} confidence` : ""}
          </Text>
          {it.disputeRiskReasoning ? <Text style={{ marginTop: 2, lineHeight: 1.35 }}>{clean(it.disputeRiskReasoning, 900)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function DisputePackRoomsDocument({ model, images, address, checkOutDate, sourceDocumentUrl, companyName, companyWebsite, generatedAt }: { model: RoomPackModel; images: Record<string, string>; address: string; checkOutDate: Date | null; sourceDocumentUrl: string; companyName?: string | null; companyWebsite?: string | null; generatedAt: Date }) {
  const ref = `${clean(address, 60)} · Deposit dispute pack`;
  const c = model.counts;
  return (
    <Document title={`Deposit dispute pack - ${clean(address, 80)}`} author={companyName || "ProptMate"}>
      <Page size="A4" style={s.page}>
        <PageHeader companyName={companyName} companyWebsite={companyWebsite} reference={ref} />
        <Text style={s.h1}>Deposit dispute pack</Text>
        <Text style={s.sub}>Check-out compared with a check-in report supplied by another company</Text>
        <View style={s.box}>
          <View style={s.kv}><Text style={s.k}>Property</Text><Text style={s.v}>{clean(address, 160)}</Text></View>
          <View style={s.kv}><Text style={s.k}>Check-out</Text><Text style={s.v}>{checkOutDate ? formatDate(checkOutDate) : "Date not recorded"}</Text></View>
          <View style={s.kv}><Text style={s.k}>Check-in</Text><Text style={s.v}>Report supplied by another company (date not recorded here)</Text></View>
        </View>
        <View style={s.warn}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Please read this first</Text>
          <Text style={{ lineHeight: 1.45 }}>
            The check-in side of this pack comes from a report written by another company. It was read from their document by software and summarised room by room, so it may contain mistakes or leave things out. Check every point against their original report before relying on it. Because their report was not recorded item by item, items are NOT compared one by one: each room shows their summary beside the check-out items recorded here.
          </Text>
          <Text style={[s.small, { marginTop: 4 }]}>Original check-in report: {clean(sourceDocumentUrl, 300)}</Text>
        </View>
        <Text style={s.h2}>Summary</Text>
        <View style={s.box}>
          <View style={s.kv}><Text style={s.k}>Rooms at check-out</Text><Text style={s.v}>{c.rooms}</Text></View>
          <View style={s.kv}><Text style={s.k}>Items recorded at check-out</Text><Text style={s.v}>{c.items}</Text></View>
          <View style={s.kv}><Text style={s.k}>Rooms with a check-in summary</Text><Text style={s.v}>{c.roomsWithSummary}</Text></View>
          <View style={s.kv}><Text style={s.k}>Items in wear and tear condition or worse</Text><Text style={s.v}>{c.itemsBelowGood}</Text></View>
          <View style={s.kv}><Text style={s.k}>Described in their report, no room here</Text><Text style={s.v}>{model.unmatchedSummaries.length}</Text></View>
        </View>
        <Text style={s.h2}>How to read this pack</Text>
        <Text style={{ lineHeight: 1.45 }}>
          For each room, the left side is what the other company's report says about the room, and the right side is what was recorded at check-out, with the more serious conditions first. Photographs are shown for items in wear and tear condition or worse. Fair wear and tear depends on the length of the tenancy, the number of occupants and the condition at the start of the tenancy. This pack records what was written; it does not decide who is responsible.
        </Text>
        <PageFooter />
      </Page>
      <Page size="A4" style={s.page}>
        <PageHeader companyName={companyName} companyWebsite={companyWebsite} reference={ref} />
        <Text style={s.h2}>Room by room ({model.rooms.length})</Text>
        {model.rooms.length === 0 ? <Text>No items were recorded at check-out.</Text> : null}
        {model.rooms.map((r, i) => (
          <View style={s.card} key={`${r.room}-${i}`}>
            <Text style={s.cardTitle}>{clean(r.room, 80)}</Text>
            {roomLayout(r) === "side" ? (
              // short enough to read side by side (a row cannot be split across pages, so only short rooms are laid out like this)
              <View style={s.row2}>
                <View style={s.col}>
                  <Text style={s.colHead}>CHECK-IN REPORT (OTHER COMPANY, READ BY SOFTWARE)</Text>
                  <Text style={{ lineHeight: 1.4 }}>{r.summary ? clean(r.summary) : "Their report has no summary for this room."}</Text>
                </View>
                <View style={s.col}>
                  <Text style={s.colHead}>CHECK-OUT (RECORDED HERE)</Text>
                  {r.items.map((it, k) => <Item key={`${it.id}-${k}`} it={it} images={images} />)}
                </View>
              </View>
            ) : (
              // long: the two parts are stacked full width and flow across pages
              <View>
                <View style={s.block}>
                  <Text style={s.colHead}>CHECK-IN REPORT (OTHER COMPANY, READ BY SOFTWARE)</Text>
                  <Text style={{ lineHeight: 1.4 }}>{r.summary ? clean(r.summary) : "Their report has no summary for this room."}</Text>
                </View>
                <View style={s.block}>
                  <Text style={s.colHead}>CHECK-OUT (RECORDED HERE)</Text>
                  {r.items.map((it, k) => <Item key={`${it.id}-${k}`} it={it} images={images} />)}
                </View>
              </View>
            )}
          </View>
        ))}
        {model.unmatchedSummaries.length > 0 ? (
          <>
            <Text style={s.h2}>Described in their report, but no items recorded in that room at check-out</Text>
            {model.unmatchedSummaries.map((u, i) => (
              <View style={s.box} key={`${u.room}-${i}`} wrap={false}>
                <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{clean(u.room, 80)}</Text>
                <Text style={{ lineHeight: 1.4 }}>{clean(u.summary)}</Text>
              </View>
            ))}
          </>
        ) : null}
        <Text style={[s.small, { marginTop: 10 }]}>Generated by ProptMate on {formatDate(generatedAt)}.</Text>
        <PageFooter />
      </Page>
    </Document>
  );
}
