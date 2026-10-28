/**
 * Server-side price list. The client only sends item ids and quantities;
 * prices are never trusted from the browser.
 */
export const CATALOG = new Map(
  [
    ["esp-01", "Espresso", 3.25],
    ["esp-02", "Cortado", 4.0],
    ["esp-03", "Flat White", 4.5],
    ["esp-04", "Oat Latte", 5.25],
    ["esp-05", "Maple Cinnamon Latte", 5.75],
    ["brw-01", "Pour-Over", 5.0],
    ["brw-02", "Batch Brew", 3.0],
    ["brw-03", "Ethiopia Guji Pour-Over", 6.25],
    ["cld-01", "Cold Brew", 4.75],
    ["cld-02", "Cold Brew Reserve", 6.5],
    ["cld-03", "Iced Oat Latte", 5.5],
    ["bak-01", "Butter Croissant", 3.75],
    ["bak-02", "Almond Croissant", 4.5],
    ["bak-03", "Pain au Chocolat", 4.25],
    ["bea-01", "Huila, Colombia", 18.0],
    ["bea-02", "Guji, Ethiopia", 21.0],
    ["bea-03", "House Espresso Blend", 16.5]
  ].map(([id, name, price]) => [id, { id, name, price }])
);
