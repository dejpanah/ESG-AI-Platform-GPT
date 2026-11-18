export type TextDirectionMode = "auto" | "rtl" | "ltr";
export type ResolvedDirection = "rtl" | "ltr";

const RTL_CHAR_RE =
  /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/g;
const LTR_CHAR_RE = /[A-Za-z\u00C0-\u024F]/g;
const FIRST_STRONG_RE =
  /([\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC])|([A-Za-z\u00C0-\u024F])/;

/**
 * Detects whether text should be laid out RTL or LTR.
 * Accounts for bilingual Persian/Arabic ESG content that mixes Latin acronyms
 * such as ESG, CO2, Scope 1, tCO2e, or GRI.
 */
export function detectTextDirection(text?: string | null): ResolvedDirection {
  if (!text) return "ltr";

  const rtlMatches = text.match(RTL_CHAR_RE);
  const rtlCount = rtlMatches ? rtlMatches.length : 0;
  if (rtlCount === 0) return "ltr";

  const ltrMatches = text.match(LTR_CHAR_RE);
  const ltrCount = ltrMatches ? ltrMatches.length : 0;
  if (ltrCount === 0) return "rtl";

  if (rtlCount >= ltrCount * 0.2) return "rtl";

  const firstStrong = FIRST_STRONG_RE.exec(text);
  if (firstStrong && firstStrong[1]) return "rtl";

  return "ltr";
}

export function resolveTextDirection(
  mode: TextDirectionMode,
  text?: string | null,
): ResolvedDirection {
  if (mode === "rtl" || mode === "ltr") return mode;
  return detectTextDirection(text);
}

const STORAGE_PREFIX = "knowledgeos.dir.";

export function loadSavedDirection(
  scope: string,
  fallback: TextDirectionMode = "auto",
): TextDirectionMode {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    if (raw === "auto" || raw === "rtl" || raw === "ltr") return raw;
  } catch {
    // Ignore storage access failures.
  }
  return fallback;
}

export function saveDirection(scope: string, mode: TextDirectionMode): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${scope}`, mode);
  } catch {
    // Ignore storage access failures.
  }
}
