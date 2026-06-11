// Film-brand SKU starter library (Goal 5 / B2C-005). FACTUAL COLOR DATA ONLY —
// compiled by hand from the manufacturers' official color charts; no scraped
// tooling, artwork, or outlines (template-source license gate does not apply
// to factual color identifiers).
//
// Sources (read 2026-06-11):
// - 3M™ Wrap Film Series 2080 color palette poster,
//   https://multimedia.3m.com/mws/media/1783349O/3m-wrap-film-2080-series-color-palette.pdf
// - Avery Dennison® Supreme Wrapping Film™ color selector guide (A358174 05/2026),
//   https://graphics.averydennison.com/content/dam/averydennison/graphics/na/en/documents/sell-sheets-and-brochures/color-guide/na-swf-color-card-en.pdf
//
// HEX values are REPRESENTATIVE screen approximations of physical films taken
// from those charts — final color must always be confirmed against a physical
// swatch (the export pack prints the SKU precisely so the shop can do that).
// This is a starter subset of the most-stocked lines, not the full range
// (2080 ≈ 105 colors, SW900 ≈ 140+); extend in place, keep entries factual.

export interface FilmColor {
  /** Manufacturer. */
  brand: '3M' | 'Avery Dennison';
  /** Product series. */
  series: '2080' | 'SW900';
  /** Manufacturer SKU/code, e.g. "2080-G12", "SW900-190-O". */
  sku: string;
  /** Manufacturer color name. */
  name: string;
  /** Representative screen hex (see header). */
  hex: string;
  /** Finish family as printed on the chart. */
  finish:
    | 'gloss'
    | 'gloss metallic'
    | 'satin'
    | 'satin metallic'
    | 'matte'
    | 'matte metallic'
    | 'texture'
    | 'chrome';
}

const M3 = (sku: string, name: string, hex: string, finish: FilmColor['finish']): FilmColor => ({
  brand: '3M',
  series: '2080',
  sku: `2080-${sku}`,
  name,
  hex,
  finish,
});

const AV = (sku: string, name: string, hex: string, finish: FilmColor['finish']): FilmColor => ({
  brand: 'Avery Dennison',
  series: 'SW900',
  sku: `SW900-${sku}`,
  name,
  hex,
  finish,
});

export const FILM_LIBRARY: readonly FilmColor[] = [
  // --- 3M 2080 · Gloss ---
  M3('G12', 'Gloss Black', '#0d0d0d', 'gloss'),
  M3('G10', 'Gloss White', '#f7f7f7', 'gloss'),
  M3('G13', 'Gloss Hot Rod Red', '#d62e23', 'gloss'),
  M3('G53', 'Gloss Flame Red', '#d22b1f', 'gloss'),
  M3('G83', 'Gloss Dark Red', '#8a1d20', 'gloss'),
  M3('G24', 'Gloss Deep Orange', '#e8742c', 'gloss'),
  M3('G54', 'Gloss Bright Orange', '#f28121', 'gloss'),
  M3('G25', 'Gloss Sunflower', '#f4ad26', 'gloss'),
  M3('G15', 'Gloss Bright Yellow', '#f7c810', 'gloss'),
  M3('G55', 'Gloss Lucid Yellow', '#f6e500', 'gloss'),
  M3('G46', 'Gloss Kelly Green', '#00873e', 'gloss'),
  M3('G16', 'Gloss Light Green', '#57b847', 'gloss'),
  M3('GP272', 'Gloss Midnight Blue', '#0e1a2b', 'gloss'),
  M3('G127', 'Gloss Boat Blue', '#122a54', 'gloss'),
  M3('G47', 'Gloss Intense Blue', '#1b46a5', 'gloss'),
  M3('G77', 'Gloss Sky Blue', '#4fc3e8', 'gloss'),
  M3('G103', 'Gloss Hot Pink', '#e54f9a', 'gloss'),
  M3('G31', 'Gloss Storm Gray', '#9aa0a3', 'gloss'),
  M3('G79', 'Gloss Light Ivory', '#f1e6c8', 'gloss'),
  // --- 3M 2080 · Gloss metallic / pearl ---
  M3('G212', 'Gloss Black Metallic', '#131316', 'gloss metallic'),
  M3('G201', 'Gloss Anthracite', '#2b2c2e', 'gloss metallic'),
  M3('G211', 'Gloss Charcoal Metallic', '#3a3c40', 'gloss metallic'),
  M3('G217', 'Gloss Deep Blue Metallic', '#16306b', 'gloss metallic'),
  M3('G227', 'Gloss Blue Metallic', '#1c3f9e', 'gloss metallic'),
  M3('G203', 'Gloss Red Metallic', '#a31e26', 'gloss metallic'),
  M3('G120', 'Gloss White Aluminum', '#d6d8da', 'gloss metallic'),
  M3('G251', 'Gloss Sterling Silver', '#c0c3c6', 'gloss metallic'),
  M3('G241', 'Gloss Gold Metallic', '#b3892a', 'gloss metallic'),
  // --- 3M 2080 · Satin ---
  M3('S12', 'Satin Black', '#161616', 'satin'),
  M3('S10', 'Satin White', '#f2f2f2', 'satin'),
  M3('S363', 'Satin Smoldering Red', '#93262a', 'satin'),
  M3('S196', 'Satin Apple Green', '#3f9c35', 'satin'),
  M3('S57', 'Satin Key West', '#62d4cf', 'satin'),
  M3('S347', 'Satin Perfect Blue', '#2660ad', 'satin'),
  M3('S271', 'Satin Thundercloud', '#3a3d42', 'satin'),
  M3('S51', 'Satin Battleship Gray', '#7e8184', 'satin'),
  M3('SP10', 'Satin Pearl White', '#efe9dc', 'satin'),
  // --- 3M 2080 · Matte ---
  M3('M12', 'Matte Black', '#1d1d1d', 'matte'),
  M3('M10', 'Matte White', '#efefef', 'matte'),
  M3('M13', 'Matte Red', '#c8342a', 'matte'),
  M3('M54', 'Matte Orange', '#e4761f', 'matte'),
  M3('M26', 'Matte Military Green', '#4c5340', 'matte'),
  M3('M27', 'Matte Indigo', '#20283a', 'matte'),
  M3('M67', 'Matte Riviera Blue', '#2e7fc2', 'matte'),
  M3('M22', 'Matte Deep Black', '#101010', 'matte'),
  M3('DM12', 'Dead Matte Black', '#0a0a0a', 'matte'),
  M3('M21', 'Matte Silver', '#9fa3a6', 'matte metallic'),
  M3('M211', 'Matte Charcoal Metallic', '#36383c', 'matte metallic'),
  M3('M229', 'Matte Copper Metallic', '#9c5b32', 'matte metallic'),
  M3('M206', 'Matte Pine Green Metallic', '#2c4a3a', 'matte metallic'),
  // --- 3M 2080 · Textures / chrome ---
  M3('CFS12', 'Carbon Fiber Black', '#1c1c1e', 'texture'),
  M3('BR120', 'Brushed Aluminum', '#c2c4c6', 'texture'),
  M3('BR201', 'Brushed Steel', '#8d8f92', 'texture'),
  M3('BR230', 'Brushed Titanium', '#6f7174', 'texture'),
  M3('GC451', 'Gloss Silver Chrome', '#d9dadc', 'chrome'),

  // --- Avery SW900 · Gloss ---
  AV('190-O', 'Gloss Black', '#0b0b0b', 'gloss'),
  AV('101-O', 'Gloss White', '#f7f7f7', 'gloss'),
  AV('865-O', 'Gloss Dark Grey', '#3c3f43', 'gloss'),
  AV('821-O', 'Gloss Rock Grey', '#6f7276', 'gloss'),
  AV('832-O', 'Gloss Grey', '#9b9ea1', 'gloss'),
  AV('415-O', 'Gloss Red', '#cc2229', 'gloss'),
  AV('433-O', 'Gloss Cardinal Red', '#c01622', 'gloss'),
  AV('436-O', 'Gloss Carmine Red', '#b3131f', 'gloss'),
  AV('475-O', 'Gloss Burgundy', '#6c1420', 'gloss'),
  AV('699-O', 'Gloss Indigo Blue', '#131a33', 'gloss'),
  AV('681-O', 'Gloss Dark Blue', '#14276b', 'gloss'),
  AV('677-O', 'Gloss Blue', '#1a3da8', 'gloss'),
  AV('667-O', 'Gloss Intense Blue', '#1750c4', 'gloss'),
  AV('632-O', 'Gloss Light Blue', '#2a7fd4', 'gloss'),
  AV('771-O', 'Gloss Emerald Green', '#00704a', 'gloss'),
  AV('792-O', 'Gloss Dark Green', '#133a2a', 'gloss'),
  AV('758-O', 'Gloss Grass Green', '#2f9e41', 'gloss'),
  AV('373-O', 'Gloss Orange', '#e87722', 'gloss'),
  AV('235-O', 'Gloss Yellow', '#f7d117', 'gloss'),
  AV('902-O', 'Gloss Ivory', '#efe3cd', 'gloss'),
  AV('901-O', 'Gloss Sand Dune', '#cdb286', 'gloss'),
  // --- Avery SW900 · Gloss metallic ---
  AV('191-O', 'Gloss Obsidian Black', '#0e0f11', 'gloss metallic'),
  AV('192-M', 'Gloss Black Metallic', '#131417', 'gloss metallic'),
  AV('807-M', 'Gloss Grey Metallic', '#6e7175', 'gloss metallic'),
  AV('803-M', 'Gloss Silver Metallic', '#b9bcbf', 'gloss metallic'),
  AV('401-M', 'Gloss Pure Red Metallic', '#b5232b', 'gloss metallic'),
  AV('646-M', 'Gloss Bright Blue Metallic', '#1d4fb8', 'gloss metallic'),
  AV('653-M', 'Gloss Dark Blue Metallic', '#1b2c55', 'gloss metallic'),
  AV('215-M', 'Gloss Gold Metallic', '#9f7e2e', 'gloss metallic'),
  // --- Avery SW900 · Satin ---
  AV('197-O', 'Satin Black', '#181818', 'satin'),
  AV('116-O', 'Satin White', '#f3f3f3', 'satin'),
  AV('833-O', 'Satin Grey', '#8a8d90', 'satin'),
  AV('438-O', 'Satin Carmine Red', '#aa2730', 'satin'),
  AV('682-O', 'Satin Dark Blue', '#1c3672', 'satin'),
  AV('633-O', 'Satin Light Blue', '#2f74bd', 'satin'),
  AV('712-O', 'Satin Khaki Green', '#6a6d57', 'satin'),
  AV('224-O', 'Satin Yellow', '#d9a519', 'satin'),
  // --- Avery SW900 · Satin metallic ---
  AV('823-M', 'Satin Black Rock Grey', '#2c2e30', 'satin metallic'),
  AV('854-M', 'Satin Dark Grey Metallic', '#4b4e52', 'satin metallic'),
  AV('805-M', 'Satin Silver Metallic', '#a8abae', 'satin metallic'),
  AV('260-M', 'Satin Safari Gold', '#ad8d3e', 'satin metallic'),
  // --- Avery SW900 · Matte ---
  AV('180-O', 'Matte Black', '#171717', 'matte'),
  AV('102-O', 'Matte White', '#f0f0f0', 'matte'),
  AV('856-O', 'Matte Dark Grey', '#595c60', 'matte'),
  AV('732-O', 'Matte Olive Green', '#4c5340', 'matte'),
  AV('711-O', 'Matte Khaki Green', '#5d6150', 'matte'),
  AV('321-O', 'Matte Orange', '#e26b1f', 'matte'),
  // --- Avery SW900 · Matte metallic ---
  AV('840-M', 'Matte Gunmetal Metallic', '#585b5e', 'matte metallic'),
  AV('845-M', 'Matte Charcoal Metallic', '#44474b', 'matte metallic'),
  AV('858-M', 'Matte Anthracite Metallic', '#303236', 'matte metallic'),
  AV('857-M', 'Matte Silver Metallic', '#a5a8ab', 'matte metallic'),
  AV('472-M', 'Matte Garnet Red Metallic', '#7e2230', 'matte metallic'),
  AV('623-M', 'Matte Night Blue Metallic', '#1d2a4a', 'matte metallic'),
  AV('671-M', 'Matte Brilliant Blue Metallic', '#2456b0', 'matte metallic'),
  AV('737-M', 'Matte Moss Green Metallic', '#4c7a4c', 'matte metallic'),
  // --- Avery SW900 · Textures ---
  AV('194-X', 'Carbon Fiber Black', '#1b1b1d', 'texture'),
  AV('812-X', 'Brushed Aluminum', '#c4c6c8', 'texture'),
  AV('813-X', 'Brushed Steel', '#8e9093', 'texture'),
  AV('933-X', 'Brushed Bronze', '#8a6a45', 'texture'),
] as const;

/** Case-insensitive substring search over brand, series, sku, name, finish. */
export function searchFilmLibrary(query: string, limit = 40): FilmColor[] {
  const q = query.trim().toLowerCase();
  if (!q) return FILM_LIBRARY.slice(0, limit);
  return FILM_LIBRARY.filter((c) =>
    `${c.brand} ${c.series} ${c.sku} ${c.name} ${c.finish}`.toLowerCase().includes(q),
  ).slice(0, limit);
}
