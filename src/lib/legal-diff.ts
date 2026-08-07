import type { JSONContent } from "@tiptap/core";

/**
 * Comparação entre duas versões de um documento.
 *
 * O diff é feito por parágrafo, que é a unidade com que se lê um texto jurídico, e não
 * por caractere: ver "o parágrafo 12 mudou" é mais útil do que uma sopa de marcações.
 * Dentro de um parágrafo alterado a diferença é refinada por palavra.
 *
 * É implementado aqui, e não com uma biblioteca, porque o algoritmo cabe em poucas
 * linhas e evita mais uma dependência num sistema que roda inteiro no navegador.
 */

export type LegalDiffKind = "igual" | "removido" | "adicionado" | "alterado";

export type LegalWordPart = { text: string; changed: boolean };

export type LegalDiffLine = {
  kind: LegalDiffKind;
  /** Texto do lado antigo (vazio em "adicionado"). */
  before: string;
  /** Texto do lado novo (vazio em "removido"). */
  after: string;
  /** Refino por palavra, presente apenas em "alterado". */
  beforeParts?: LegalWordPart[];
  afterParts?: LegalWordPart[];
};

export type LegalDiffSummary = {
  lines: LegalDiffLine[];
  added: number;
  removed: number;
  changed: number;
};

/** Similaridade mínima para tratar um par removido/adicionado como o mesmo parágrafo editado. */
const REWRITE_THRESHOLD = 0.5;

export function legalDocumentDiff(before: JSONContent, after: JSONContent): LegalDiffSummary {
  const lines = diffSequences(paragraphTexts(before), paragraphTexts(after));
  return {
    lines,
    added: lines.filter((line) => line.kind === "adicionado").length,
    removed: lines.filter((line) => line.kind === "removido").length,
    changed: lines.filter((line) => line.kind === "alterado").length,
  };
}

/** Texto de cada parágrafo, na ordem de leitura, atravessando blocos e listas. */
export function paragraphTexts(document: JSONContent): string[] {
  const texts: string[] = [];

  const visit = (node: JSONContent) => {
    if (node.type === "paragraph") {
      texts.push(inlineText(node.content ?? []).replace(/\s+/g, " ").trim());
      return;
    }
    if (node.type === "pageBreak") {
      texts.push("— quebra de página —");
      return;
    }
    (node.content ?? []).forEach(visit);
  };

  (document.content ?? []).forEach(visit);
  return texts;
}

function inlineText(nodes: JSONContent[]): string {
  return nodes.map((node) => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return " ";
    if (node.type === "dynamicField") return `[${String(node.attrs?.label ?? "Campo")}]`;
    if (node.type === "pageNumberField") {
      return node.attrs?.fieldKind === "total" ? "{total}" : "{página}";
    }
    return inlineText(node.content ?? []);
  }).join("");
}

/**
 * Maior subsequência comum entre os dois conjuntos de parágrafos. A matriz é O(n×m),
 * o que é folgado para a escala de um documento (algumas centenas de parágrafos).
 */
function diffSequences(before: string[], after: string[]): LegalDiffLine[] {
  const rows = before.length;
  const columns = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row][column] = before[row] === after[column]
        ? table[row + 1][column + 1] + 1
        : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }

  const lines: LegalDiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (before[row] === after[column]) {
      lines.push({ kind: "igual", before: before[row], after: after[column] });
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      lines.push({ kind: "removido", before: before[row], after: "" });
      row += 1;
    } else {
      lines.push({ kind: "adicionado", before: "", after: after[column] });
      column += 1;
    }
  }
  while (row < rows) {
    lines.push({ kind: "removido", before: before[row], after: "" });
    row += 1;
  }
  while (column < columns) {
    lines.push({ kind: "adicionado", before: "", after: after[column] });
    column += 1;
  }

  return mergeRewrites(lines);
}

/**
 * Um parágrafo reescrito aparece como remoção seguida de inserção. Quando os dois lados
 * são parecidos o bastante, viram uma única linha "alterado" com o destaque por palavra.
 */
function mergeRewrites(lines: LegalDiffLine[]): LegalDiffLine[] {
  const merged: LegalDiffLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];
    if (
      current.kind === "removido" &&
      next?.kind === "adicionado" &&
      similarity(current.before, next.after) >= REWRITE_THRESHOLD
    ) {
      const { beforeParts, afterParts } = diffWords(current.before, next.after);
      merged.push({
        kind: "alterado",
        before: current.before,
        after: next.after,
        beforeParts,
        afterParts,
      });
      index += 1;
      continue;
    }
    merged.push(current);
  }
  return merged;
}

function similarity(first: string, second: string): number {
  const a = words(first);
  const b = words(second);
  if (!a.length && !b.length) return 1;
  const pool = new Map<string, number>();
  a.forEach((word) => pool.set(word, (pool.get(word) ?? 0) + 1));
  let shared = 0;
  b.forEach((word) => {
    const available = pool.get(word) ?? 0;
    if (available > 0) {
      shared += 1;
      pool.set(word, available - 1);
    }
  });
  return (2 * shared) / (a.length + b.length);
}

/** Marca quais palavras saíram e quais entraram, também por maior subsequência comum. */
function diffWords(before: string, after: string): {
  beforeParts: LegalWordPart[];
  afterParts: LegalWordPart[];
} {
  const a = words(before);
  const b = words(after);
  const rows = a.length;
  const columns = b.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row][column] = a[row] === b[column]
        ? table[row + 1][column + 1] + 1
        : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }

  const beforeParts: LegalWordPart[] = [];
  const afterParts: LegalWordPart[] = [];
  const push = (parts: LegalWordPart[], text: string, changed: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.changed === changed) {
      last.text += ` ${text}`;
      return;
    }
    parts.push({ text, changed });
  };

  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (a[row] === b[column]) {
      push(beforeParts, a[row], false);
      push(afterParts, b[column], false);
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      push(beforeParts, a[row], true);
      row += 1;
    } else {
      push(afterParts, b[column], true);
      column += 1;
    }
  }
  while (row < rows) {
    push(beforeParts, a[row], true);
    row += 1;
  }
  while (column < columns) {
    push(afterParts, b[column], true);
    column += 1;
  }

  return { beforeParts, afterParts };
}

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}
