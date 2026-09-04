// Always formats as DD/MM/YYYY (en-GB), regardless of the server's own default locale - which
// on Vercel's infrastructure defaults to US English (M/D/YYYY) no matter where the company or
// its users are actually based. This matters most for anything server-rendered, like the PDF
// report, which is always generated server-side and never uses the visitor's own browser
// locale at all - without an explicit locale here, it would show the wrong date format
// regardless of what the person viewing it has their own computer set to.
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB");
}
