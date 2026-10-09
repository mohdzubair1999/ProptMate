import type { CSSProperties } from "react";
import { parseRichText, type Run } from "@/lib/pdf/parseRichText";

const HAS_TAGS = /<\/?(b|strong|i|em|u|span|ul|li|p|div|br)\b/i;

function runStyle(run: Run): CSSProperties {
  return {
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? "italic" : undefined,
    textDecoration: run.underline ? "underline" : undefined,
    fontSize: run.fontSize,
  };
}

// For a completed (read-only) Comments field. Builds real React elements from the same parsed
// tree the PDF uses - never dangerouslySetInnerHTML, so there's no injection risk even though
// the stored value is already-sanitized HTML; plain text (no formatting ever applied, including
// everything saved before this feature existed) renders exactly as it always has.
export default function RichTextDisplay({ text, className }: { text: string; className?: string }) {
  if (!HAS_TAGS.test(text)) {
    return <p className={className}>{text}</p>;
  }

  const blocks = parseRichText(text);
  if (blocks.length === 0) return <p className={className}>—</p>;

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const runs = block.runs.map((run, j) => (
          <span key={j} style={runStyle(run)}>
            {run.text}
          </span>
        ));
        return block.type === "li" ? (
          <div key={i} className="flex gap-2">
            <span>•</span>
            <span>{runs}</span>
          </div>
        ) : (
          <p key={i}>{runs}</p>
        );
      })}
    </div>
  );
}
