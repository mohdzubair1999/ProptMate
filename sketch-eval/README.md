# Measuring sketch accuracy

This folder lets you measure how accurately ProptMate reads hand-drawn floor plans, using your own sketches.

## 1. Collect sketches with known sizes
Use 10 to 20 real sketches of properties whose true room sizes you know (from a tape measure or a surveyed plan).
Include a mix:
- sketches with the sizes **written on them** (clearly, and a few untidily), in metres and in feet
- sketches with **no sizes written**
- photos taken in poor light, at an angle, and with shadows, as real jobs will be

## 2. Describe each one
For each sketch add the image (`kitchen-flat.jpg`) and a file with the same name ending `.json`:

```json
{
  "image": "kitchen-flat.jpg",
  "rooms": [
    { "name": "Lounge",  "widthM": 4.5, "lengthM": 3.8, "connectsTo": ["Hall"] },
    { "name": "Kitchen", "widthM": 3.2, "lengthM": 3.8, "connectsTo": ["Hall"] },
    { "name": "Hall",    "widthM": 1.4, "lengthM": 3.8 }
  ]
}
```
See `example.json`. Room names do not have to match exactly ("Lounge" and "Living room" count as the same room).
Sizes are in metres. Which way round width and length are does not matter.

## 3. Run it
```
npx tsx --env-file=.env scripts/eval-sketch-accuracy.ts
```
Add `--runs 3` to read every sketch three times and see how consistent it is. Each read is one AI call.

## 4. Read the summary
It reports, separately for sizes read from writing and sizes the AI had to estimate:
- how many true rooms were found
- the median size error, and how many sides were within 5%, 10% and 20% of the truth
- how many doors between rooms were right
- how much typing in **one real measurement** improves the estimates

The full results are saved next to the sketches. The sketches, and the results, stay on your computer.
