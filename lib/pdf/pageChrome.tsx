import { Link, Svg, Defs, LinearGradient, Stop, Rect, Text, View, StyleSheet } from "@react-pdf/renderer";

// 2 cm on every side of the content pages. The front cover is deliberately NOT given this: it is
// a separate <Page> with no padding so its photo runs to the edge of the paper, and none of the
// header/footer below is rendered on it either.
export const PAGE_MARGIN = (20 / 25.4) * 72; // 56.69pt

// The gap left after each section, where a page break used to be: 2 cm. Reports have no page
// breaks - sections simply run on from one another, a clear gap apart.
export const SECTION_GAP = (20 / 25.4) * 72;

// Where clicking the ProptMate mark in a report goes.
export const PROPTMATE_URL = "https://proptmate.zkmholdingslimited.com";

// ProptMate's own palette, so the marks read as part of the product rather than generic grey text.
const INK = "#25344A";
const SIGNAL = "#D96B44";
const SLATE = "#6B6A63";
const WHITE = "#FFFFFF";

// Both bands sit inside the 2 cm margin (56.7pt): 19pt from the edge, 18pt tall, leaving about 20pt
// of clear space before the report content starts.
const BAND = 18;
const EDGE = 19;

const chrome = StyleSheet.create({
  headerBand: { position: "absolute", top: EDGE, left: PAGE_MARGIN, right: PAGE_MARGIN, height: BAND, flexDirection: "row", alignItems: "center" },
  footerBand: { position: "absolute", bottom: EDGE, left: PAGE_MARGIN, right: PAGE_MARGIN, height: BAND, flexDirection: "row", alignItems: "center" },
  // A navy tag with an orange spine - the company name on top, the ProptMate wordmark below.
  tag: { flexDirection: "row", alignItems: "center", height: BAND, backgroundColor: INK, borderRadius: 3, paddingRight: 10 },
  spine: { width: 5, height: BAND, backgroundColor: SIGNAL, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, marginRight: 9 },
  tagName: { fontFamily: "Helvetica-Bold", fontSize: 7.2, letterSpacing: 1.7, textTransform: "uppercase", color: WHITE },
  tagMark: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 2 },
  // The orange line that fades out between the tag and the property reference.
  fade: { flex: 1, height: 2, marginLeft: 9 },
  headerRef: { fontSize: 7, color: SLATE, letterSpacing: 0.3, marginLeft: 9 },
  pageCluster: { flexDirection: "row", alignItems: "center", marginLeft: 9 },
  pageLabel: { fontSize: 6.5, letterSpacing: 1.6, color: SLATE },
  pageBadge: { width: BAND, height: BAND, borderRadius: 3, backgroundColor: SIGNAL, alignItems: "center", justifyContent: "center", marginHorizontal: 6 },
  pageNow: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: WHITE },
  pageTotal: { fontSize: 6.5, letterSpacing: 1.6, color: SLATE },
});

function FadeLine({ lead = true }: { lead?: boolean }) {
  return (
    <View style={[chrome.fade, lead ? {} : { marginLeft: 0 }]}>
      <Svg viewBox="0 0 100 2" preserveAspectRatio="none" style={{ width: "100%", height: 2 }}>
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={SIGNAL} stopOpacity={1} />
            <Stop offset="1" stopColor={SIGNAL} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="2" fill="url(#fade)" />
      </Svg>
    </View>
  );
}

// Only ever link out to a plain web address - never anything else a stored value could contain.
function webUrl(value?: string | null): string | null {
  const v = value?.trim();
  return v && /^https?:\/\/[^\s]+$/i.test(v) ? v : null;
}

// A long name would run past the right margin, so cap it.
function fitName(name: string): string {
  return name.length > 48 ? `${name.slice(0, 45).trimEnd()}...` : name;
}

const CONTENT_WIDTH = 595.28 - 2 * PAGE_MARGIN; // 481.9pt between the margins

// How much of the "address - report name" line fits to the right of the company tag. The widths
// are deliberately pessimistic (wide capitals in the tag) so that an unusually long company name
// or address makes the line shorter, or leaves it out, rather than ever running into the tag or
// past the margin.
function fitReference(reference: string | null | undefined, nameChars: number): string | null {
  const ref = reference?.replace(/\s+/g, " ").trim();
  if (!ref) return null;
  const tagWidth = nameChars ? 14 + nameChars * 8 + 10 : 0; // spine + gap, 7.2pt bold capitals with 1.7pt tracking, padding
  const usable = CONTENT_WIDTH - tagWidth - 9 - 9 - 24; // gaps either side of the line, and a line worth drawing
  const maxChars = Math.floor(usable / 4.2); // 7pt regular
  if (maxChars < 12) return null;
  return ref.length > maxChars ? `${ref.slice(0, maxChars - 3).replace(/[\s,;:.\u00b7-]+$/, "")}...` : ref;
}

// Top of every content page: the issuing company's name on a navy tag with an orange spine, a
// fading orange line, and - at the right - the property address and report name, so a page that
// gets separated from the rest of a printed report still says what it belongs to. Clicking the
// tag opens the company's website, if it has set one. With no company name there is no tag, and
// with neither a name nor a reference there is no header at all, rather than a blank one.
export function PageHeader({
  companyName,
  companyWebsite,
  reference,
}: {
  companyName?: string | null;
  companyWebsite?: string | null;
  reference?: string | null;
}) {
  const name = companyName?.trim() ? fitName(companyName.trim()) : null;
  const ref = fitReference(reference, name?.length ?? 0);
  if (!name && !ref) return null;
  const url = webUrl(companyWebsite);
  const tag = name ? (
    <View style={chrome.tag}>
      <View style={chrome.spine} />
      <Text style={chrome.tagName}>{name}</Text>
    </View>
  ) : null;
  return (
    <View style={chrome.headerBand} fixed>
      {tag && url ? <Link src={url} style={{ textDecoration: "none" }}>{tag}</Link> : tag}
      <FadeLine lead={!!tag} />
      {ref ? <Text style={chrome.headerRef}>{ref}</Text> : null}
    </View>
  );
}

// Bottom: the PROPTMATE wordmark on a navy tag (it links to the ProptMate site), a fading line,
// and the page number on an orange badge - "PAGE [2] OF 7".
export function PageFooter() {
  return (
    <View style={chrome.footerBand} fixed>
      <Link src={PROPTMATE_URL} style={{ textDecoration: "none" }}>
        <View style={chrome.tag}>
          <View style={chrome.spine} />
          <Text style={chrome.tagMark}>
            <Text style={{ color: WHITE }}>PROPT</Text>
            <Text style={{ color: SIGNAL }}>MATE</Text>
          </Text>
        </View>
      </Link>
      <FadeLine />
      <View style={chrome.pageCluster}>
        <Text style={chrome.pageLabel}>PAGE</Text>
        <View style={chrome.pageBadge}>
          <Text style={chrome.pageNow} render={({ pageNumber }) => `${pageNumber}`} />
        </View>
        <Text style={chrome.pageTotal} render={({ totalPages }) => `OF ${totalPages}`} />
      </View>
    </View>
  );
}
