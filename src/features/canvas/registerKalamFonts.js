import { FONT_FAMILY, Fonts } from "@excalidraw/excalidraw";

// Excalidraw reserves ID 4 for host-registered custom fonts. ID 11 is free
// in the pinned build and gives Kalam Bold its own persisted family value.
FONT_FAMILY.Kalam = 4;
FONT_FAMILY["Kalam Bold"] = 11;

const metrics = {
  metrics: {
    unitsPerEm: 1000,
    ascender: 1000,
    descender: -250,
    lineHeight: 1.25,
  },
};

const subsets = [
  {
    unicodeRange: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    file: "latin",
  },
  {
    unicodeRange: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    file: "latin-ext",
  },
  {
    unicodeRange: "U+0900-097F,U+1CD0-1CFF,U+200C-200D,U+20B9,U+25CC",
    file: "devanagari",
  },
];

const registerKalamFamily = (family, id, weight) => {
  // Resolve the registry once and pass it as the registration context. This
  // mirrors Excalidraw's own initialization path and avoids relying on the
  // static getter as the method's `this` context.
  const registeredFonts = Fonts.registered;
  if (registeredFonts.has(id)) return;

  const descriptors = subsets.map(({ file, unicodeRange }) => ({
    uri: `https://cdn.jsdelivr.net/fontsource/fonts/kalam@18/${file}-${weight}-normal.woff2`,
    descriptors: { unicodeRange, weight: String(weight) },
  }));

  // Excalidraw keeps this hook private in its type surface, but its runtime
  // registration method accepts an object containing the shared font registry.
  const register = Fonts.register;
  if (typeof register !== "function") {
    throw new Error("This Excalidraw build does not support custom font registration.");
  }

  register.call({ registered: registeredFonts }, family, metrics, ...descriptors);

  if (!registeredFonts.has(id)) {
    throw new Error(`Excalidraw did not register the ${family} font family.`);
  }
};

registerKalamFamily("Kalam", 4, 400);
registerKalamFamily("Kalam Bold", 11, 700);
