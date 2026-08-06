import type { JSONContent } from "@tiptap/core";

export const LEGAL_LIST_STYLES = [
  "decimal",
  "decimal-hierarchical",
  "alpha",
  "roman",
  "clause",
  "paragraph",
  "single-paragraph",
] as const;

export type LegalListKind = "bullet" | "ordered";
export type LegalListStyle = (typeof LEGAL_LIST_STYLES)[number];

export type LegalListParagraphAttrs = {
  kind: LegalListKind;
  style: LegalListStyle;
  level: number;
  sequenceId: string;
  start: number | null;
};

export type LegalListDisplay = LegalListParagraphAttrs & {
  label: string;
};

type SequenceState = {
  counters: number[];
};

export class LegalListCounter {
  private readonly sequences = new Map<string, SequenceState>();
  private fallbackRun = 0;
  private previousFallbackSignature: string | null = null;

  breakUnsequencedRun() {
    this.previousFallbackSignature = null;
  }

  next(rawAttrs: Record<string, unknown> | null | undefined): LegalListDisplay | null {
    const attrs = legalListParagraphAttrs(rawAttrs);
    if (!attrs) {
      this.breakUnsequencedRun();
      return null;
    }

    if (attrs.kind === "bullet") {
      this.trackFallback(attrs);
      return { ...attrs, label: "•" };
    }

    if (attrs.sequenceId) this.previousFallbackSignature = null;
    const sequenceKey = attrs.sequenceId || this.fallbackKey(attrs);
    const state = this.sequences.get(sequenceKey) ?? { counters: [] };
    const level = attrs.level;
    const levelWasNew = state.counters.length <= level;

    while (state.counters.length <= level) {
      state.counters.push(state.counters.length < level ? 1 : 0);
    }
    if (levelWasNew && attrs.start != null) state.counters[level] = attrs.start - 1;
    state.counters[level] = Math.max(0, state.counters[level] ?? 0) + 1;
    state.counters.length = level + 1;
    this.sequences.set(sequenceKey, state);

    return {
      ...attrs,
      label: legalListLabel(attrs.style, state.counters, level),
    };
  }

  private trackFallback(attrs: LegalListParagraphAttrs) {
    if (attrs.sequenceId) {
      this.previousFallbackSignature = null;
      return;
    }
    this.fallbackKey(attrs);
  }

  private fallbackKey(attrs: LegalListParagraphAttrs): string {
    const signature = `${attrs.kind}:${attrs.style}`;
    if (this.previousFallbackSignature !== signature) {
      this.fallbackRun += 1;
      this.previousFallbackSignature = signature;
    }
    return `fallback-${this.fallbackRun}`;
  }
}

export function collectLegalListDisplays(content: JSONContent): Map<JSONContent, LegalListDisplay> {
  const displays = new Map<JSONContent, LegalListDisplay>();
  const counter = new LegalListCounter();

  const visit = (nodes: JSONContent[]) => {
    nodes.forEach((node) => {
      if (node.type === "paragraph") {
        const display = counter.next(node.attrs as Record<string, unknown> | undefined);
        if (display) displays.set(node, display);
        return;
      }
      if (["doc", "repeatableBlock", "quickPartInstance"].includes(node.type ?? "")) {
        visit(node.content ?? []);
        return;
      }
      counter.breakUnsequencedRun();
    });
  };

  visit(content.content ?? []);
  return displays;
}

export function legalListParagraphAttrs(
  rawAttrs: Record<string, unknown> | null | undefined
): LegalListParagraphAttrs | null {
  const kind = rawAttrs?.listKind;
  if (kind !== "bullet" && kind !== "ordered") return null;
  const style = isLegalListStyle(rawAttrs?.legalListStyle) ? rawAttrs.legalListStyle : "decimal";
  const rawLevel = Number(rawAttrs?.listLevel ?? 0);
  const rawStart = rawAttrs?.listStart == null ? null : Number(rawAttrs.listStart);
  return {
    kind,
    style,
    level: Math.min(8, Math.max(0, Number.isFinite(rawLevel) ? Math.round(rawLevel) : 0)),
    sequenceId: typeof rawAttrs?.listSequenceId === "string" ? rawAttrs.listSequenceId : "",
    start: rawStart != null && Number.isFinite(rawStart)
      ? Math.min(1_000_000, Math.max(1, Math.round(rawStart)))
      : null,
  };
}

export function isLegalListStyle(value: unknown): value is LegalListStyle {
  return LEGAL_LIST_STYLES.includes(value as LegalListStyle);
}

export function legalListLabel(style: LegalListStyle, counters: number[], level: number): string {
  const number = Math.max(1, counters[level] ?? 1);
  if (style === "decimal-hierarchical") return counters.slice(0, level + 1).join(".");
  if (style === "alpha") return `${alphaNumber(number)})`;
  if (style === "roman") return romanNumber(number);
  if (style === "clause") return `Cláusula ${number}ª.`;
  if (style === "paragraph") return `§ ${number}º.`;
  if (style === "single-paragraph") return "Parágrafo único";
  return `${number}.`;
}

export function legalListLabelWidthMm(style: LegalListStyle): number {
  if (style === "clause") return 28;
  if (style === "single-paragraph") return 31;
  return 12;
}

function alphaNumber(value: number): string {
  let number = Math.max(1, value);
  let result = "";
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(97 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

function romanNumber(value: number): string {
  const pairs: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = Math.max(1, Math.min(3999, value));
  let result = "";
  pairs.forEach(([number, token]) => {
    while (remaining >= number) {
      result += token;
      remaining -= number;
    }
  });
  return result;
}
