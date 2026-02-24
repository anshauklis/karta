type LayoutMap = Record<string, string>;

interface LayoutPair {
  id: string;
  forward: LayoutMap;
  reverse: LayoutMap;
}

function invertMap(map: LayoutMap): LayoutMap {
  const inv: LayoutMap = {};
  for (const [k, v] of Object.entries(map)) {
    inv[v] = k;
  }
  return inv;
}

// QWERTY → ЙЦУКЕН mapping (lowercase)
const EN_RU_LOWER: LayoutMap = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  "[": "х", "]": "ъ", a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л",
  l: "д", ";": "ж", "'": "э", z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
  ",": "б", ".": "ю", "/": ".",
  "`": "ё",
};

// Build uppercase pairs
const EN_RU_UPPER: LayoutMap = {};
for (const [k, v] of Object.entries(EN_RU_LOWER)) {
  EN_RU_UPPER[k.toUpperCase()] = v.toUpperCase();
}

const FULL_FORWARD: LayoutMap = { ...EN_RU_LOWER, ...EN_RU_UPPER };
const FULL_REVERSE: LayoutMap = invertMap(FULL_FORWARD);

const LAYOUT_PAIRS: LayoutPair[] = [
  { id: "en-ru", forward: FULL_FORWARD, reverse: FULL_REVERSE },
];

/**
 * Convert text as if typed in the wrong keyboard layout.
 * Returns the converted string, or null if no characters were convertible.
 */
export function convertLayout(text: string): string | null {
  for (const pair of LAYOUT_PAIRS) {
    const forwardHits = [...text].filter((ch) => ch in pair.forward).length;
    const reverseHits = [...text].filter((ch) => ch in pair.reverse).length;

    if (forwardHits > 0 && forwardHits >= reverseHits) {
      const converted = [...text].map((ch) => pair.forward[ch] ?? ch).join("");
      if (converted !== text) return converted;
    }
    if (reverseHits > 0 && reverseHits > forwardHits) {
      const converted = [...text].map((ch) => pair.reverse[ch] ?? ch).join("");
      if (converted !== text) return converted;
    }
  }
  return null;
}
