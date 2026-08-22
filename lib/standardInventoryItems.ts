// Standard items pre-populated for common room types when an Inventory inspection is
// created — saves re-typing "Bed", "Wardrobe" etc. every single time, while staying fully
// editable per inspection (items can be removed if they don't apply, or added beyond this
// list — this is just a helpful starting point, not a rigid requirement).
//
// Matched by substring against the room's actual title (case-insensitive), since real room
// titles include numbered variants like "Bedroom 2" or "Reception room 3", and compact
// variants like "Kitchen area in room" — not just the exact bare word.

type RoomItemRule = { matches: (title: string) => boolean; items: string[] };

const RULES: RoomItemRule[] = [
  {
    matches: (t) => /bedroom|spare room|^room$/i.test(t),
    items: ["Bed", "Wardrobe", "Chest of drawers", "Bedside table", "Light switch", "Double socket"],
  },
  {
    matches: (t) => /bathroom|ensuite|w\.?c\.?/i.test(t),
    items: ["Toilet", "Wash basin", "Bath / Shower", "Tiling / flooring"],
  },
  {
    matches: (t) => /reception room|communal reception/i.test(t),
    items: ["Sofa", "Chairs", "Table", "TV unit / storage", "Light switch", "Double socket"],
  },
  {
    matches: (t) => /kitchen/i.test(t),
    items: ["Oven / cooker", "Hob", "Fridge / freezer", "Washing machine", "Worktop / units", "Boiler", "Light switch", "Double socket"],
  },
  {
    matches: (t) => /hallway|stairs and landing/i.test(t),
    items: ["Flooring / carpet", "Light fittings", "Smoke alarm", "Light switch", "Double socket"],
  },
  {
    matches: (t) => /^utility room$/i.test(t),
    items: ["Washing machine", "Tumble dryer", "Boiler", "Sink", "Light switch", "Double socket"],
  },
  {
    matches: (t) => /^garden/i.test(t),
    items: ["Lawn / grass area", "Fencing", "Shed (if present)"],
  },
  {
    matches: (t) => /external space|balcony/i.test(t),
    items: ["Flooring / decking", "Railings", "Light switch", "Double socket"],
  },
  // Deliberately no rule for "Storage cupboard" or "Conservatory" — left freeform, too
  // variable to usefully standardise.
];

export function getStandardItemsForRoom(roomTitle: string): string[] {
  const rule = RULES.find((r) => r.matches(roomTitle));
  return rule ? rule.items : [];
}

// Items that make sense to track a "Make" (brand/manufacturer) for — appliances, basically.
// Deliberately keyed by item NAME, not by which room it's in, since the same appliance (a
// washing machine, a boiler) can genuinely end up in either the Kitchen or the Utility room
// depending on the property, and it should still get the Make field either way.
const APPLIANCE_ITEMS = new Set([
  "oven / cooker",
  "hob",
  "fridge / freezer",
  "washing machine",
  "tumble dryer",
  "boiler",
]);

export function isApplianceItem(itemName: string): boolean {
  return APPLIANCE_ITEMS.has(itemName.trim().toLowerCase());
}

// Items where "how many" genuinely matters more than tracking each one individually — a
// room might have 3 double sockets, and recording "3x Double socket, good condition" is far
// more useful than clicking "Add" three separate times for identical entries.
const QUANTITY_ITEMS = new Set(["light switch", "double socket"]);

export function isQuantityItem(itemName: string): boolean {
  return QUANTITY_ITEMS.has(itemName.trim().toLowerCase());
}
