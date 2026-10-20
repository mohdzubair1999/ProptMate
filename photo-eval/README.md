# Measuring photo-description accuracy

This folder lets you measure how accurately ProptMate's "Analyse photo" describes photos, using your own photos and what
you know is in them. It uses the same code as the live button.

## 1. Collect photos you know the answer to
Use 20 to 40 sets (one photo, or a few of the same item). Include a mix:
- photos with **one clear defect** (a crack, a stain, damp, a burn, a chip)
- photos with **several** defects
- photos of things in **good condition**, where the right answer is "nothing concerning"
- poor photos: dim, angled, close-up, cluttered
- some **tricky** ones, where a wrong guess is easy (a stain that is not a leak, a scuff that is not damage)
- for maintenance sets: photos from different rooms, to test room identification

## 2. Describe each set
Add the photos and one `.json` file per set (see `example.json`):

```json
{
  "name": "Kitchen sealant",
  "photos": ["kitchen-sealant-1.jpg", "kitchen-sealant-2.jpg"],
  "mode": "inventory",
  "expect": {
    "mentions": [["crack*", "split"], ["mould", "mold", "black"]],
    "absent": [["burst", "flood*", "leak*"]],
    "clean": false
  }
}
```
- `mode`: `inventory` (check-in or check-out: facts only, no advice) or `maintenance` (mid-term and similar: advice is allowed)
- `mentions`: each inner list is one thing that must be mentioned. Any word in the list counts. A trailing `*` matches
  any ending (`crack*` matches cracked and cracking).
- `absent`: claims that would be wrong. Use these for traps: if a stain is not a leak, list `["leak*", "burst"]`.
- `clean`: `true` when the photo shows nothing wrong. A description that reports a defect then counts as a false alarm.
- `rooms` (with `"identifyRoom": true`): the rooms the photos are really of.

## 3. Run it
```
npx tsx --env-file=.env scripts/eval-photo-analysis.ts
```
Add `--runs 3` to describe each set three times and see how consistent it is, or `--deep` to try the deeper model.
Each run is one AI call.

To compare models, set `ANTHROPIC_PHOTO_MODEL_STANDARD` (or `_DEEP`) in `.env` and run it again. Nothing in the app
changes until you decide to use the better one.

## 4. Read the summary
It reports how many known defects were mentioned, how many descriptions were fully right, how often it invented a
claim you said was false, how often it reported a defect in a clean photo, and whether any inventory answer still
gave advice or said something was "not tested" (that must stay at 0%).

The photos, descriptions and results stay on your computer.
