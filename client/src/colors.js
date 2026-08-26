// Keep in sync with server/src/constants.js PLAYER_COLORS and the filenames
// under client/public/sprites/characters/.
export const PLAYER_COLORS = [
  { id: "beige", label: "Beige", swatch: "#c9a876" },
  { id: "brown", label: "Brown", swatch: "#8a5a2f" },
  { id: "charcoal", label: "Charcoal", swatch: "#3a3a3f" },
  { id: "navy", label: "Navy", swatch: "#2a3a63" },
  { id: "forest_green", label: "Forest Green", swatch: "#3a5a35" },
  { id: "maroon", label: "Maroon", swatch: "#6b2530" },
  { id: "purple", label: "Purple", swatch: "#5a3a7a" },
  { id: "teal", label: "Teal", swatch: "#2a7a75" },
  { id: "orange", label: "Orange", swatch: "#c96a2f" },
  { id: "white", label: "White", swatch: "#d8d5cc" },
  { id: "pink", label: "Pink", swatch: "#d67aa8" },
  { id: "yellow", label: "Yellow", swatch: "#d4a83a" },
];

export function spriteUrlFor(colorId) {
  return `/sprites/characters/${colorId}.png`;
}
