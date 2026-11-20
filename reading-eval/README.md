# Measuring the meter and label readers

The readers only *suggest*, and the person checks the digits against the photo. But a reading that ends up on a report can become
a billing dispute, so measure it before relying on it. Put photos here whose truth you know, run the tool, and read the numbers.

## 1. Make a set
One `.json` file per case, plus its photos in this folder (`example.json` is ignored).

A meter you can read yourself:
```json
{ "name": "Electric meter, kitchen cupboard", "kind": "meter", "photos": ["meter1.jpg"],
  "expect": { "reading": "01234", "serial": "E10AB12345" } }
```
`reading` is the exact digits on the main display, leaving out any digits on a red background or after a decimal point.
A meter the reader should REFUSE (blurry, glare, a dial meter, digits half hidden):
```json
{ "name": "Gas meter, blurry", "kind": "meter", "photos": ["gas-blurry.jpg"], "expect": { "unreadable": true } }
```
An appliance rating plate:
```json
{ "name": "Dishwasher plate", "kind": "label", "photos": ["plate.jpg"], "expect": { "brand": "Bosch", "model": "SMS46GI01G" } }
```
Include a good mix: **clear meters, meters in poor light or at an angle, glare on the glass, dial meters, two-rate meters
(day and night), and rating plates that are scratched, small or half hidden.** The hard ones are the point.

## 2. Run it
```
npx tsx@4.23.15 --env-file=.env scripts/eval-reading.ts
npx tsx@4.23.15 --env-file=.env scripts/eval-reading.ts --runs 3      # three goes each, to see how consistent it is
```

## 3. Read it
The two **SAFETY** lines come first: wrong values offered, and wrong serial numbers shown. The aim is **zero**. "Declined although
the photo was readable" is the reader being cautious, which is fine. Send me the summary and any case that went wrong and I
will tighten the instructions. Your photos stay on your computer; this folder is ignored by Git except for this README.
