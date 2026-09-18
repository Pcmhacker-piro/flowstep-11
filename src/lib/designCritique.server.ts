/**
 * Automated visual critique for generated screens.
 *
 * Runs on the produced HTML document (no browser, no extra model call) and
 * scores five craft dimensions the weaker models routinely miss: hierarchy,
 * contrast, spacing, responsiveness and polish. Callers use the returned
 * issues to drive one self-repair pass before the screen is shown as final.
 */

export type CritiqueArea = "hierarchy" | "contrast" | "spacing" | "responsiveness" | "polish";

export type CritiqueIssue = {
  area: CritiqueArea;
  message: string;
  /** How badly this hurts the screen: 1 nitpick, 3 must-fix. */
  weight: number;
};

export type DesignCritique = {
  /** 0-100; 100 means no detected issues. */
  score: number;
  issues: CritiqueIssue[];
  passed: boolean;
};

const HEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (full.length !== 6) return null;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

function fontSizesPx(css: string) {
  const sizes: number[] = [];
  const re = /font-size\s*:\s*([\d.]+)\s*(px|rem|em)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    const value = Number.parseFloat(match[1] ?? "");
    if (!Number.isFinite(value)) continue;
    sizes.push(match[2]?.toLowerCase() === "px" ? value : value * 16);
  }
  return sizes;
}

function styleBlocks(html: string) {
  return (html.match(/<style[\s>][\s\S]*?<\/style>/gi) ?? []).join("\n");
}

function textContent(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function critiqueDesignHtml(html: string): DesignCritique {
  const issues: CritiqueIssue[] = [];
  const css = styleBlocks(html);
  const text = textContent(html);
  const add = (area: CritiqueArea, message: string, weight = 2) => issues.push({ area, message, weight });

  // ---- hierarchy -----------------------------------------------------------
  const sizes = fontSizesPx(css);
  const maxSize = sizes.length > 0 ? Math.max(...sizes) : 0;
  const minSize = sizes.length > 0 ? Math.min(...sizes) : 0;
  if (sizes.length < 4) {
    add("hierarchy", "Only a couple of distinct font sizes are defined — the screen has no typographic hierarchy.", 3);
  }
  if (maxSize > 0 && maxSize < 26) {
    add("hierarchy", `The largest type is about ${Math.round(maxSize)}px: there is no clear focal headline.`, 3);
  }
  if (maxSize > 0 && minSize > 0 && maxSize / minSize < 1.8) {
    add("hierarchy", "Type scale is too flat (largest vs smallest size under 1.8x) — headings barely outrank metadata.", 2);
  }
  const weights = (css.match(/font-weight\s*:\s*(\d{3}|bold|semibold)/gi) ?? []).length;
  if (weights < 2) add("hierarchy", "Almost no font-weight variation — emphasis is not expressed.", 2);
  if (!/<h1[\s>]/i.test(html)) add("hierarchy", "No <h1>: the page has no primary heading.", 2);

  // ---- contrast ------------------------------------------------------------
  const hexes = Array.from(new Set((css.match(HEX) ?? []).map((h) => h.toLowerCase())));
  const parsed = hexes.map(parseHex).filter((c): c is [number, number, number] => c !== null);
  if (parsed.length > 0) {
    const luminances = parsed.map(relativeLuminance);
    const darkest = parsed[luminances.indexOf(Math.min(...luminances))]!;
    const lightest = parsed[luminances.indexOf(Math.max(...luminances))]!;
    if (contrastRatio(darkest, lightest) < 7) {
      add("contrast", "The palette's darkest and lightest colours are under 7:1 apart — text will look washed out.", 3);
    }
  }
  if (/#000000|#000\b/i.test(css) || /#ffffff/i.test(css)) {
    const pureInk = /color\s*:\s*(#000000|#000)\b/i.test(css);
    if (pureInk) add("contrast", "Pure #000 is used for text instead of a tuned near-black ink.", 1);
  }
  if (hexes.length < 5) {
    add("contrast", "Fewer than five colours defined — the screen lacks the neutral layers that create depth.", 2);
  }

  // ---- spacing -------------------------------------------------------------
  const paddings = (css.match(/padding[^;:]*:\s*[^;]+/gi) ?? []).length;
  const gaps = (css.match(/\bgap\s*:\s*[^;]+/gi) ?? []).length;
  if (paddings < 6) add("spacing", "Very few padding rules — sections will feel cramped and unstructured.", 3);
  if (gaps === 0) add("spacing", "No flex/grid gap rules — spacing between items is accidental.", 2);
  const odd = (css.match(/(?:padding|margin|gap)[^;:]*:\s*(?:[\d.]+px\s+)*?(\d+)px/gi) ?? [])
    .map((m) => Number.parseInt(m.replace(/\D+$/, "").match(/(\d+)px/)?.[1] ?? "0", 10))
    .filter((n) => n > 0 && n % 4 !== 0);
  if (odd.length > 6) add("spacing", "Many spacing values are off the 4px scale — rhythm looks inconsistent.", 1);

  // ---- responsiveness ------------------------------------------------------
  if (!/@media[^{]*max-width/i.test(css)) {
    add("responsiveness", "No max-width media queries — the layout will not reflow on tablet (834px) or mobile (390px).", 3);
  } else {
    const queries = (css.match(/@media[^{]*max-width\s*:\s*(\d+)/gi) ?? []).map((q) =>
      Number.parseInt(q.match(/(\d+)/g)?.slice(-1)[0] ?? "0", 10),
    );
    if (!queries.some((q) => q <= 900 && q >= 700)) {
      add("responsiveness", "No tablet breakpoint near 834px — the mid-width layout is unhandled.", 2);
    }
    if (!queries.some((q) => q <= 640)) {
      add("responsiveness", "No mobile breakpoint at or below 640px — narrow screens will overflow.", 2);
    }
  }
  if (!/<meta[^>]+name=["']viewport/i.test(html)) {
    add("responsiveness", "Missing viewport meta tag.", 2);
  }
  if (/width\s*:\s*(1[2-9]\d\d|[2-9]\d\d\d)px/i.test(css)) {
    add("responsiveness", "Fixed pixel widths above 1200px will cause horizontal overflow on smaller devices.", 2);
  }

  // ---- polish --------------------------------------------------------------
  if (!/:hover\b/i.test(css)) add("polish", "No :hover states — interactive elements feel dead.", 2);
  if (!/:focus(-visible)?\b/i.test(css)) add("polish", "No :focus-visible styles — keyboard users get no feedback.", 2);
  if (!/<svg[\s>]/i.test(html)) add("polish", "No inline SVG icons — the screen is text-only where icons are expected.", 2);
  if (/lorem ipsum/i.test(text)) add("polish", "Lorem ipsum placeholder copy instead of real, specific content.", 3);
  if (/\b(placeholder|coming soon|TODO|TBD)\b/i.test(text)) {
    add("polish", "Placeholder or TODO copy is visible on the screen.", 2);
  }
  if (/(?:box-shadow|border-radius)/i.test(css) === false) {
    add("polish", "No radii or shadows defined — surfaces have no material quality.", 1);
  }
  if (text.length < 600) add("polish", "Too little real content on the page — it reads as a wireframe.", 3);
  if (/https?:\/\/[^"')]+\.(?:png|jpe?g|webp|gif|svg)/i.test(html)) {
    add("polish", "External image URLs are used; they will not load. Use inline SVG or CSS compositions.", 2);
  }

  const penalty = issues.reduce((sum, issue) => sum + issue.weight * 6, 0);
  const score = Math.max(0, 100 - penalty);
  const severe = issues.filter((issue) => issue.weight >= 3).length;
  return { score, issues, passed: score >= 76 && severe === 0 };
}

/** Compact, model-readable revision brief. */
export function critiqueToBrief(critique: DesignCritique) {
  const byArea = critique.issues
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((issue) => `- [${issue.area}] ${issue.message}`)
    .join("\n");
  return `AUTOMATED VISUAL CRITIQUE (score ${critique.score}/100). A design reviewer inspected your screen and found these defects:
${byArea}

Return the COMPLETE corrected HTML document from <!doctype html> to </html>. Fix every listed defect while keeping the same product, palette intent, shell and content. Do not explain anything, do not use markdown fences, and do not regress anything that already worked.`;
}
