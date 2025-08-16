// src/lib/common/clean.js
export function stripZeroWidth(s) {
  if (!s) return s;
  // Remove a range of zero-width/invisible chars including U+2060
  return s.replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2061\u2062\u2063\u2064\uFEFF]/g, "");
}

export function stripDiacritics(s) {
  if (!s) return s;
  // Normalize and remove diacritics
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function tidyName(s) {
  if (!s) return s;
  const t = stripDiacritics(stripZeroWidth(s)).replace(/\s+/g, " ").trim();
  // Capitalize words if the string looks oddly lower/upper
  const needCaps = /^[a-z]/.test(t) || /\b[a-z]/.test(t);
  if (!needCaps) return t;
  return t.split(" ").map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w).join(" ");
}
