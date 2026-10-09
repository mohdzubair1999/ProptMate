import { Text, View } from "@react-pdf/renderer";
import { parseRichText, type Run } from "./parseRichText";

const HAS_TAGS = /<\/?(b|strong|i|em|u|span|ul|li|p|div|br)\b/i;

function runStyle(base: any, run: Run) {
  return [
    base,
    run.bold ? { fontFamily: "Helvetica-Bold" } : null,
    run.italic ? { fontFamily: run.bold ? "Helvetica-BoldOblique" : "Helvetica-Oblique" } : null,
    run.underline ? { textDecoration: "underline" } : null,
    run.fontSize ? { fontSize: run.fontSize } : null,
  ];
}

// `text` is whatever is stored for a Comments answer - either plain text (no formatting ever
// applied, including everything written before this feature existed) or the restricted HTML the
// rich-text editor and its sanitizer produce. Plain text renders exactly as it always has: one
// justified paragraph. HTML renders as real paragraphs/bullets with the actual bold, italic,
// underline and font-size applied, each wrapped line kept lined up under its own paragraph or
// bullet rather than under any later, differently-sized run.
export function RichText({ text, style }: { text: string; style: any }) {
  if (!HAS_TAGS.test(text)) {
    return <Text style={[style, { textAlign: "justify" }]}>{text}</Text>;
  }

  const blocks = parseRichText(text);
  if (blocks.length === 0) return null;

  return (
    <View>
      {blocks.map((block, i) => {
        const content = (
          <Text style={[style, { flex: block.type === "li" ? 1 : undefined, textAlign: block.type === "p" ? "justify" : undefined }]}>
            {block.runs.map((run, j) => (
              <Text key={j} style={runStyle(style, run)}>
                {run.text}
              </Text>
            ))}
          </Text>
        );
        if (block.type === "li") {
          return (
            <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={[style, { width: 10 }]}>•</Text>
              {content}
            </View>
          );
        }
        return (
          <View key={i} style={{ marginBottom: 6 }}>
            {content}
          </View>
        );
      })}
    </View>
  );
}
