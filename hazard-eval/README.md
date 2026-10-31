# Measuring the damp and mould assistant

The assistant only *suggests*; you decide. But a safety tool should be measured, not trusted. Put sets of photos here whose truth
you know, run the tool, and read the numbers.

## 1. Make a set

One `.json` file per case, plus its photos in this folder (`example.json` is ignored):

```json
{
  "name": "Bedroom 2 ceiling, active mould",
  "photos": ["bed2-wide.jpg", "bed2-close.jpg"],
  "expect": { "signs": "yes", "atLeast": "Address within 28 days" }
}
```

- `signs`: `"yes"` or `"no"` (is there damp or mould?).
- `severity`: the exact option you would choose; or `atLeast`: the least serious option you would accept. Use `atLeast` when
  two options would both be reasonable. Options are your template's: `No concern`, `Monitor — recheck at next visit`,
  `Address within 28 days`, `Urgent — address within 7 days` (or list your own in `severityOptions`, mildest first).
- For a trend, add the earlier photos and what was recorded then, and the truth:

```json
{
  "name": "Same wall, a year later: larger",
  "photos": ["now.jpg"],
  "previousPhotos": ["before.jpg"],
  "previous": { "date": "14 May 2026", "severity": "Monitor — recheck at next visit", "extent": "Small patch above the window" },
  "expect": { "signs": "yes", "atLeast": "Address within 28 days", "trend": "larger" }
}
```
`trend` is one of `larger`, `smaller`, `similar`, `new`, `not_visible_now`, `cannot_tell`.

Include a mix: **clear mould, mild spotting, condensation only, old stains that are dry, a clean wall, dark or blurry photos, and
photos where the wall has been recently painted over.** The hard ones are the point.

## 2. Run it

```
npx tsx@4.23.15 --env-file=.env scripts/eval-hazard-assessment.ts
npx tsx@4.23.15 --env-file=.env scripts/eval-hazard-assessment.ts --runs 3      # three goes each, to see how consistent it is
```

## 3. Read it

The two **SAFETY** lines come first: problems rated less seriously than the truth, and all-clears given for a real problem. The aim
is **zero** of both. "Held back" answers (no severity suggested) are the assistant being cautious, which is fine. Send me the
summary and any cases that went wrong and I will tighten the instructions.

Your photos stay on your computer; this folder is ignored by Git except for this README.
