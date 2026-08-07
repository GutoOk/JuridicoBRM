import type { JSONContent } from "@tiptap/core";
import type {
  Address,
  Client,
  LegalChromeContent,
  LegalChromeInline,
  LegalChromeMark,
  LegalChromeParagraph,
  LegalPageSettings,
  LegalParagraphStyle,
  LegalStyleMap,
} from "./types";
import { isLegalListStyle, type LegalListKind, type LegalListStyle } from "./legal-lists";

export const EMPTY_LEGAL_CONTENT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { styleId: "body" },
    },
  ],
};

export const DEFAULT_LEGAL_STYLES: LegalStyleMap = {
  title1: {
    id: "title1",
    name: "Título 1",
    fontFamily: "Times New Roman",
    fontSize: 16,
    bold: true,
    italic: false,
    underline: false,
    alignment: "center",
    spaceBefore: 12,
    spaceAfter: 10,
    lineHeight: 1.15,
    leftIndent: 0,
    rightIndent: 0,
    firstLineIndent: 0,
  },
  title2: {
    id: "title2",
    name: "Título 2",
    fontFamily: "Times New Roman",
    fontSize: 14,
    bold: true,
    italic: false,
    underline: false,
    alignment: "left",
    spaceBefore: 10,
    spaceAfter: 8,
    lineHeight: 1.15,
    leftIndent: 0,
    rightIndent: 0,
    firstLineIndent: 0,
  },
  title3: {
    id: "title3",
    name: "Título 3",
    fontFamily: "Times New Roman",
    fontSize: 12,
    bold: true,
    italic: false,
    underline: false,
    alignment: "left",
    spaceBefore: 8,
    spaceAfter: 6,
    lineHeight: 1.15,
    leftIndent: 0,
    rightIndent: 0,
    firstLineIndent: 0,
  },
  body: {
    id: "body",
    name: "Corpo de texto",
    fontFamily: "Times New Roman",
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    alignment: "justify",
    spaceBefore: 0,
    spaceAfter: 6,
    lineHeight: 1.5,
    leftIndent: 0,
    rightIndent: 0,
    firstLineIndent: 12.5,
  },
};

export const DEFAULT_LEGAL_PAGE_SETTINGS: LegalPageSettings = {
  paperSize: "A4",
  marginTop: 20,
  marginRight: 20,
  marginBottom: 20,
  marginLeft: 30,
  headerText: "",
  footerText: "",
  showPageNumbers: true,
  headerContent: null,
  footerContent: null,
};

export const LEGAL_PAGE_GAP_MM = 8;

/**
 * CSS dos estilos de parágrafo do documento. Fica aqui, e não dentro do editor, para o
 * editor e a pré-visualização de versões renderizarem com exatamente a mesma formatação.
 */
export function legalStyleRules(styles: LegalStyleMap, scope = ".legal-editor-scope"): string {
  return Object.values(styles).map((style) => {
    const id = style.id.replace(/[^a-zA-Z0-9_-]/g, "-");
    const font = LEGAL_FONT_OPTIONS.includes(style.fontFamily as (typeof LEGAL_FONT_OPTIONS)[number])
      ? style.fontFamily
      : "Times New Roman";
    const alignment = ["left", "center", "right", "justify"].includes(style.alignment)
      ? style.alignment
      : "justify";
    return `${scope} .ProseMirror p[data-style-id="${id}"] {
      font-family: "${font}", serif;
      font-size: ${clampNumber(style.fontSize, 8, 24)}pt;
      font-weight: ${style.bold ? 700 : 400};
      font-style: ${style.italic ? "italic" : "normal"};
      text-decoration: ${style.underline ? "underline" : "none"};
      text-align: ${alignment};
      margin-top: ${clampNumber(style.spaceBefore, 0, 100)}mm;
      margin-bottom: ${clampNumber(style.spaceAfter, 0, 100)}mm;
      line-height: ${clampNumber(style.lineHeight, 0.8, 3)};
      margin-left: ${clampNumber(style.leftIndent, -50, 100)}mm;
      margin-right: ${clampNumber(style.rightIndent, -50, 100)}mm;
      text-indent: ${clampNumber(style.firstLineIndent, -50, 100)}mm;
    }`;
  }).join("\n");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export const LEGAL_FONT_OPTIONS = [
  "Times New Roman",
  "Arial",
  "Calibri",
  "Georgia",
  "Courier New",
] as const;

export const LEGAL_CLIENT_FIELDS = [
  { key: "name", label: "Nome do cliente" },
  { key: "cpfCnpj", label: "CPF ou CNPJ" },
  { key: "type", label: "Tipo de pessoa" },
  { key: "rg", label: "RG" },
  { key: "rgIssuer", label: "Órgão emissor" },
  { key: "nationality", label: "Nacionalidade" },
  { key: "maritalStatus", label: "Estado civil" },
  { key: "profession", label: "Profissão" },
  { key: "motherName", label: "Nome da mãe" },
  { key: "phone", label: "Telefone principal" },
  { key: "email", label: "E-mail principal" },
  { key: "address", label: "Endereço principal completo" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado" },
  { key: "zipCode", label: "CEP" },
] as const;

export type LegalClientFieldKey = (typeof LEGAL_CLIENT_FIELDS)[number]["key"];

export type RepeatableBlockInfo = {
  id: string;
  label: string;
};

export type LegalExportWarning = {
  key: string;
  label: string;
  kind: "client" | "manual";
};

export function cloneLegalContent(content: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(content)) as JSONContent;
}

export function stringifyLegalContent(content: JSONContent): string {
  return JSON.stringify(content);
}

export function parseLegalContent(value: string | null | undefined): JSONContent {
  if (!value) return cloneLegalContent(EMPTY_LEGAL_CONTENT);
  try {
    const parsed = JSON.parse(value) as JSONContent;
    return migrateLegacyLegalLists(sanitizeLegalDocument(parsed));
  } catch {
    return cloneLegalContent(EMPTY_LEGAL_CONTENT);
  }
}

export function stringifyLegalStyles(styles: LegalStyleMap): string {
  return JSON.stringify(styles);
}

export function parseLegalStyles(value: string | null | undefined): LegalStyleMap {
  if (!value) return structuredClone(DEFAULT_LEGAL_STYLES);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return structuredClone(DEFAULT_LEGAL_STYLES);
    const result = structuredClone(DEFAULT_LEGAL_STYLES);
    Object.entries(parsed).slice(0, 40).forEach(([key, raw]) => {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key) || !isRecord(raw)) return;
      const fallback = result[key] ?? { ...DEFAULT_LEGAL_STYLES.body, id: key, name: "Estilo" };
      const alignment = legalAlignment(raw.alignment, fallback.alignment);
      result[key] = {
        id: key,
        name: safeText(raw.name, fallback.name, 100),
        fontFamily: LEGAL_FONT_OPTIONS.includes(raw.fontFamily as (typeof LEGAL_FONT_OPTIONS)[number])
          ? String(raw.fontFamily)
          : fallback.fontFamily,
        fontSize: finiteNumber(raw.fontSize, fallback.fontSize, 8, 24),
        bold: typeof raw.bold === "boolean" ? raw.bold : fallback.bold,
        italic: typeof raw.italic === "boolean" ? raw.italic : fallback.italic,
        underline: typeof raw.underline === "boolean" ? raw.underline : fallback.underline,
        alignment,
        spaceBefore: finiteNumber(raw.spaceBefore, fallback.spaceBefore, 0, 100),
        spaceAfter: finiteNumber(raw.spaceAfter, fallback.spaceAfter, 0, 100),
        lineHeight: finiteNumber(raw.lineHeight, fallback.lineHeight, 0.8, 3),
        leftIndent: finiteNumber(raw.leftIndent, fallback.leftIndent, -50, 100),
        rightIndent: finiteNumber(raw.rightIndent, fallback.rightIndent, -50, 100),
        firstLineIndent: finiteNumber(raw.firstLineIndent, fallback.firstLineIndent, -50, 100),
        custom: key.startsWith("custom-") || raw.custom === true,
      };
    });
    return result;
  } catch {
    return structuredClone(DEFAULT_LEGAL_STYLES);
  }
}

export function stringifyLegalPageSettings(settings: LegalPageSettings): string {
  return JSON.stringify(settings);
}

export function parseLegalPageSettings(value: string | null | undefined): LegalPageSettings {
  if (!value) return { ...DEFAULT_LEGAL_PAGE_SETTINGS };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return { ...DEFAULT_LEGAL_PAGE_SETTINGS };
    return {
      paperSize: parsed.paperSize === "LETTER" ? "LETTER" : "A4",
      marginTop: finiteNumber(parsed.marginTop, DEFAULT_LEGAL_PAGE_SETTINGS.marginTop, 0, 80),
      marginRight: finiteNumber(parsed.marginRight, DEFAULT_LEGAL_PAGE_SETTINGS.marginRight, 0, 80),
      marginBottom: finiteNumber(parsed.marginBottom, DEFAULT_LEGAL_PAGE_SETTINGS.marginBottom, 0, 80),
      marginLeft: finiteNumber(parsed.marginLeft, DEFAULT_LEGAL_PAGE_SETTINGS.marginLeft, 0, 80),
      headerText: safeText(parsed.headerText, "", 2_000),
      footerText: safeText(parsed.footerText, "", 2_000),
      showPageNumbers: typeof parsed.showPageNumbers === "boolean"
        ? parsed.showPageNumbers
        : DEFAULT_LEGAL_PAGE_SETTINGS.showPageNumbers,
      headerContent: sanitizeLegalChromeContent(parsed.headerContent),
      footerContent: sanitizeLegalChromeContent(parsed.footerContent),
    };
  } catch {
    return { ...DEFAULT_LEGAL_PAGE_SETTINGS };
  }
}

/**
 * Conteúdo efetivo do cabeçalho ou do rodapé.
 *
 * Documentos antigos guardavam só uma linha de texto; enquanto ninguém editar a área
 * na própria folha, ela é convertida em um parágrafo centralizado equivalente ao que
 * o editor e os exportadores sempre mostraram. O rodapé legado ainda recebe a
 * numeração automática, que agora vive em `legalChromeAutoPageNumber`.
 */
export function legalChromeContent(
  settings: LegalPageSettings,
  area: "header" | "footer"
): LegalChromeContent {
  const stored = area === "header" ? settings.headerContent : settings.footerContent;
  if (stored) return stored;
  const legacy = (area === "header" ? settings.headerText : settings.footerText).trim();
  if (!legacy) return { type: "doc", content: [emptyLegalChromeParagraph()] };
  return {
    type: "doc",
    content: legacy.split("\n").map((line) => ({
      type: "paragraph",
      attrs: { textAlign: "center" },
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

/**
 * A numeração automática ("Página N de M") só entra quando o rodapé não tem nenhum
 * campo de numeração inserido manualmente — inserir o campo é assumir o controle.
 */
export function legalChromeAutoPageNumber(settings: LegalPageSettings): boolean {
  if (!settings.showPageNumbers) return false;
  return !legalChromeHasPageField(legalChromeContent(settings, "footer"))
    && !legalChromeHasPageField(legalChromeContent(settings, "header"));
}

export function legalChromeHasPageField(content: LegalChromeContent): boolean {
  return content.content.some((paragraph) =>
    (paragraph.content ?? []).some((inline) => inline.type === "pageNumberField")
  );
}

export function legalChromeIsEmpty(content: LegalChromeContent): boolean {
  return !content.content.some((paragraph) =>
    (paragraph.content ?? []).some((inline) =>
      inline.type === "pageNumberField" || (inline.type === "text" && inline.text.trim() !== "")
    )
  );
}

export function emptyLegalChromeParagraph(): LegalChromeParagraph {
  return { type: "paragraph", attrs: { textAlign: "center" } };
}

/** Aceita o JSON cru vindo do Firestore ou do editor e devolve só o que o esquema permite. */
export function sanitizeLegalChromeContent(value: unknown): LegalChromeContent | null {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) return null;
  const content = value.content
    .slice(0, 20)
    .map((node) => sanitizeLegalChromeParagraph(node))
    .filter((node): node is LegalChromeParagraph => !!node);
  return content.length ? { type: "doc", content } : { type: "doc", content: [emptyLegalChromeParagraph()] };
}

function sanitizeLegalChromeParagraph(value: unknown): LegalChromeParagraph | null {
  if (!isRecord(value) || value.type !== "paragraph") return null;
  const attrs = isRecord(value.attrs) ? value.attrs : {};
  const content = Array.isArray(value.content)
    ? value.content
        .slice(0, 200)
        .map((node) => sanitizeLegalChromeInline(node))
        .filter((node): node is LegalChromeInline => !!node)
    : [];
  return {
    type: "paragraph",
    attrs: { textAlign: legalAlignment(attrs.textAlign, "center") },
    ...(content.length ? { content } : {}),
  };
}

function sanitizeLegalChromeInline(value: unknown): LegalChromeInline | null {
  if (!isRecord(value)) return null;
  if (value.type === "hardBreak") return { type: "hardBreak" };
  if (value.type === "pageNumberField") {
    const attrs = isRecord(value.attrs) ? value.attrs : {};
    return { type: "pageNumberField", attrs: { fieldKind: attrs.fieldKind === "total" ? "total" : "current" } };
  }
  if (value.type !== "text" || typeof value.text !== "string") return null;
  const marks = Array.isArray(value.marks)
    ? value.marks.flatMap((mark): LegalChromeMark[] => {
        if (!isRecord(mark)) return [];
        if (mark.type === "bold" || mark.type === "italic" || mark.type === "underline") {
          return [{ type: mark.type }];
        }
        if (mark.type !== "textStyle") return [];
        const markAttrs = isRecord(mark.attrs) ? mark.attrs : {};
        const attrs: { fontFamily?: string; fontSize?: string } = {};
        if (LEGAL_FONT_OPTIONS.includes(markAttrs.fontFamily as (typeof LEGAL_FONT_OPTIONS)[number])) {
          attrs.fontFamily = String(markAttrs.fontFamily);
        }
        const size = Number.parseFloat(String(markAttrs.fontSize ?? ""));
        if (Number.isFinite(size)) attrs.fontSize = `${finiteNumber(size, 9, 6, 24)}pt`;
        return Object.keys(attrs).length ? [{ type: "textStyle", attrs }] : [];
      })
    : [];
  return { type: "text", text: value.text.slice(0, 2_000), ...(marks.length ? { marks } : {}) };
}

function sanitizeLegalDocument(value: unknown): JSONContent {
  let nodeCount = 0;
  const sanitizeText = (valueNode: unknown): JSONContent | null => {
    if (!isRecord(valueNode) || valueNode.type !== "text" || typeof valueNode.text !== "string") return null;
    nodeCount += 1;
    if (nodeCount > 20_000) return null;
    const marks: Array<{ type: string; attrs?: Record<string, unknown> }> | undefined = Array.isArray(valueNode.marks)
      ? valueNode.marks.flatMap((mark): Array<{ type: string; attrs?: Record<string, unknown> }> => {
          if (!isRecord(mark) || !["bold", "italic", "underline", "textStyle"].includes(String(mark.type))) return [];
          if (mark.type !== "textStyle") return [{ type: String(mark.type) }];
          const attrs: Record<string, string> = {};
          const markFont = mark.attrs && isRecord(mark.attrs) ? mark.attrs.fontFamily : "";
          if (LEGAL_FONT_OPTIONS.includes(markFont as (typeof LEGAL_FONT_OPTIONS)[number])) {
            attrs.fontFamily = String((mark.attrs as Record<string, unknown>).fontFamily);
          }
          const size = mark.attrs && isRecord(mark.attrs) ? Number.parseFloat(String(mark.attrs.fontSize ?? "")) : Number.NaN;
          if (Number.isFinite(size)) attrs.fontSize = `${finiteNumber(size, 12, 8, 24)}pt`;
          return Object.keys(attrs).length ? [{ type: "textStyle", attrs }] : [];
        })
      : undefined;
    return { type: "text", text: valueNode.text.slice(0, 200_000), ...(marks?.length ? { marks } : {}) };
  };

  const sanitizeInline = (valueNode: unknown, depth: number): JSONContent | null => {
    if (depth > 50 || !isRecord(valueNode)) return null;
    if (valueNode.type === "text") return sanitizeText(valueNode);
    if (valueNode.type === "hardBreak") return { type: "hardBreak" };
    if (valueNode.type === "dynamicField") {
      const attrs = isRecord(valueNode.attrs) ? valueNode.attrs : {};
      return {
        type: "dynamicField",
        attrs: {
          fieldKind: attrs.fieldKind === "manual" ? "manual" : "client",
          fieldKey: safeText(attrs.fieldKey, "", 200),
          label: safeText(attrs.label, "Campo", 200),
        },
      };
    }
    if (valueNode.type === "boundField") {
      const attrs = isRecord(valueNode.attrs) ? valueNode.attrs : {};
      const content = Array.isArray(valueNode.content)
        ? valueNode.content.map((child) => sanitizeText(child)).filter((child): child is JSONContent => !!child)
        : [];
      return {
        type: "boundField",
        attrs: {
          sourceType: attrs.sourceType === "manual" ? "manual" : "client",
          fieldKey: safeText(attrs.fieldKey, "", 200),
          label: safeText(attrs.label, "Campo", 200),
          sourceClientId: typeof attrs.sourceClientId === "string" ? attrs.sourceClientId.slice(0, 128) : null,
          missing: attrs.missing === true,
          originalValue: safeText(attrs.originalValue, "", 1_000),
        },
        content,
      };
    }
    return null;
  };

  const sanitizeBlock = (valueNode: unknown, depth: number): JSONContent | null => {
    if (depth > 50 || !isRecord(valueNode)) return null;
    nodeCount += 1;
    if (nodeCount > 20_000) return null;
    const attrs = isRecord(valueNode.attrs) ? valueNode.attrs : {};
    if (valueNode.type === "paragraph") {
      const content = Array.isArray(valueNode.content)
        ? valueNode.content.map((child) => sanitizeInline(child, depth + 1)).filter((child): child is JSONContent => !!child)
        : undefined;
      const textAlign = attrs.textAlign == null ? null : legalAlignment(attrs.textAlign, "left");
      return {
        type: "paragraph",
        attrs: {
          styleId: /^[a-zA-Z0-9_-]{1,100}$/.test(String(attrs.styleId ?? "")) ? String(attrs.styleId) : "body",
          textAlign,
          spaceBefore: nullableNumber(attrs.spaceBefore, 0, 100),
          spaceAfter: nullableNumber(attrs.spaceAfter, 0, 100),
          lineHeight: nullableNumber(attrs.lineHeight, 0.8, 3),
          leftIndent: nullableNumber(attrs.leftIndent, -50, 100),
          rightIndent: nullableNumber(attrs.rightIndent, -50, 100),
          firstLineIndent: nullableNumber(attrs.firstLineIndent, -50, 100),
          listKind: legalListKind(attrs.listKind),
          legalListStyle: legalListStyle(attrs.legalListStyle),
          listLevel: Math.round(finiteNumber(attrs.listLevel, 0, 0, 8)),
          listSequenceId: typeof attrs.listSequenceId === "string" ? attrs.listSequenceId.slice(0, 200) : null,
          listStart: attrs.listStart == null
            ? null
            : Math.round(finiteNumber(attrs.listStart, 1, 1, 1_000_000)),
        },
        ...(content?.length ? { content } : {}),
      };
    }
    if (valueNode.type === "pageBreak") return { type: "pageBreak" };
    if (valueNode.type === "orderedList" || valueNode.type === "bulletList") {
      const content = Array.isArray(valueNode.content)
        ? valueNode.content.map((child) => sanitizeListItem(child, depth + 1)).filter((child): child is JSONContent => !!child)
        : [];
      if (!content.length) return null;
      return valueNode.type === "orderedList"
        ? {
            type: "orderedList",
            attrs: {
              start: Math.round(finiteNumber(attrs.start, 1, 1, 1_000_000)),
              legalStyle: legalListStyle(attrs.legalStyle),
            },
            content,
          }
        : { type: "bulletList", content };
    }
    if (valueNode.type === "repeatableBlock" || valueNode.type === "quickPartInstance") {
      const content = Array.isArray(valueNode.content)
        ? valueNode.content.map((child) => sanitizeBlock(child, depth + 1)).filter((child): child is JSONContent => !!child)
        : [];
      if (!content.length) content.push(cloneLegalContent(EMPTY_LEGAL_CONTENT).content![0]);
      if (valueNode.type === "repeatableBlock") {
        return {
          type: "repeatableBlock",
          attrs: {
            blockId: safeText(attrs.blockId, newLegalNodeId("repeat"), 200),
            label: safeText(attrs.label, "Bloco repetível", 200),
          },
          content,
        };
      }
      return {
        type: "quickPartInstance",
        attrs: {
          sourceId: safeText(attrs.sourceId, "", 128),
          sourceTitle: safeText(attrs.sourceTitle, "Parte rápida", 200),
          sourceVersion: Math.round(finiteNumber(attrs.sourceVersion, 1, 1, 1_000_000)),
          contentHash: safeText(attrs.contentHash, "", 200),
        },
        content,
      };
    }
    return null;
  };

  const sanitizeListItem = (valueNode: unknown, depth: number): JSONContent | null => {
    if (depth > 50 || !isRecord(valueNode) || valueNode.type !== "listItem") return null;
    const blocks = Array.isArray(valueNode.content)
      ? valueNode.content.map((child) => sanitizeBlock(child, depth + 1)).filter((child): child is JSONContent => !!child)
      : [];
    if (blocks[0]?.type !== "paragraph") blocks.unshift({ type: "paragraph", attrs: { styleId: "body" } });
    return { type: "listItem", content: blocks };
  };

  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) {
    return cloneLegalContent(EMPTY_LEGAL_CONTENT);
  }
  const content = value.content.map((child) => sanitizeBlock(child, 0)).filter((child): child is JSONContent => !!child);
  return { type: "doc", content: content.length ? content : cloneLegalContent(EMPTY_LEGAL_CONTENT).content };
}

function migrateLegacyLegalLists(document: JSONContent): JSONContent {
  let sequenceIndex = 0;

  const migrateBlocks = (nodes: JSONContent[]): JSONContent[] => nodes.flatMap((node) => {
    if (node.type === "orderedList" || node.type === "bulletList") {
      return flattenList(node, 0);
    }
    if (["doc", "repeatableBlock", "quickPartInstance"].includes(node.type ?? "")) {
      return [{ ...node, content: migrateBlocks(node.content ?? []) }];
    }
    return [node];
  });

  const flattenList = (
    list: JSONContent,
    level: number,
    inherited?: { sequenceId: string; style: LegalListStyle }
  ): JSONContent[] => {
    const kind: LegalListKind = list.type === "bulletList" ? "bullet" : "ordered";
    const style = kind === "ordered"
      ? inherited?.style ?? legalListStyle(list.attrs?.legalStyle) as LegalListStyle
      : "decimal";
    const sequenceId = kind === "ordered" && inherited
      ? inherited.sequenceId
      : `legacy-list-${sequenceIndex += 1}`;
    const start = Math.round(finiteNumber(list.attrs?.start, 1, 1, 1_000_000));

    return (list.content ?? []).flatMap((item, itemIndex) => {
      const result: JSONContent[] = [];
      let numberedParagraphFound = false;
      (item.content ?? []).forEach((child) => {
        if (child.type === "paragraph") {
          if (!numberedParagraphFound) {
            result.push({
              ...child,
              attrs: {
                ...(child.attrs ?? {}),
                listKind: kind,
                legalListStyle: style,
                listLevel: Math.min(8, level),
                listSequenceId: sequenceId,
                listStart: itemIndex === 0 ? start : null,
              },
            });
            numberedParagraphFound = true;
          } else {
            result.push(child);
          }
          return;
        }
        if (child.type === "orderedList") {
          result.push(...flattenList(child, level + 1, kind === "ordered"
            ? { sequenceId, style }
            : undefined));
          return;
        }
        if (child.type === "bulletList") {
          result.push(...flattenList(child, level + 1));
          return;
        }
        if (["repeatableBlock", "quickPartInstance"].includes(child.type ?? "")) {
          result.push({ ...child, content: migrateBlocks(child.content ?? []) });
          return;
        }
        result.push(child);
      });
      if (!numberedParagraphFound) {
        result.unshift({
          type: "paragraph",
          attrs: {
            styleId: "body",
            listKind: kind,
            legalListStyle: style,
            listLevel: Math.min(8, level),
            listSequenceId: sequenceId,
            listStart: itemIndex === 0 ? start : null,
          },
        });
      }
      return result;
    });
  };

  return { ...document, content: migrateBlocks(document.content ?? []) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function nullableNumber(value: unknown, min: number, max: number): number | null {
  return value == null ? null : finiteNumber(value, min, min, max);
}

function legalAlignment(value: unknown, fallback: LegalParagraphStyle["alignment"]): LegalParagraphStyle["alignment"] {
  return ["left", "center", "right", "justify"].includes(String(value))
    ? value as LegalParagraphStyle["alignment"]
    : fallback;
}

function legalListStyle(value: unknown): string {
  return isLegalListStyle(value) ? value : "decimal";
}

function legalListKind(value: unknown): LegalListKind | null {
  return value === "bullet" || value === "ordered" ? value : null;
}

export function legalPlainText(content: JSONContent): string {
  const parts: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.type === "dynamicField") parts.push(String(node.attrs?.label ?? "Campo"));
    if (node.type === "pageBreak") parts.push("\n");
    node.content?.forEach(visit);
    if (["paragraph", "listItem", "legalListItem"].includes(node.type ?? "")) parts.push("\n");
  };
  visit(content);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function normalizeLegalName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function primaryPhone(client: Client): string {
  return client.phone?.trim() || client.phones?.find((item) => item.isPrimary)?.number?.trim() ||
    client.phones?.[0]?.number?.trim() || "";
}

function primaryEmail(client: Client): string {
  return client.email?.trim() || client.emails?.find((item) => item.isPrimary)?.address?.trim() ||
    client.emails?.[0]?.address?.trim() || "";
}

function primaryAddress(client: Client): Address | undefined {
  return client.addresses?.find((item) => item.isPrimary) ?? client.addresses?.[0];
}

export function clientAddressLine(client: Client): string {
  const legacy = primaryAddress(client);
  const addressLine = client.addressLine?.trim() ||
    [legacy?.street, legacy?.number, legacy?.complement, legacy?.district].filter(Boolean).join(", ");
  const city = client.city?.trim() || legacy?.city?.trim() || "";
  const state = client.state?.trim() || legacy?.state?.trim() || "";
  const zip = client.zipCode?.trim() || legacy?.zipCode?.trim() || "";
  const locality = [city, state].filter(Boolean).join("/");
  return [addressLine, locality, zip ? `CEP ${zip}` : ""].filter(Boolean).join(" - ");
}

export function resolveClientField(client: Client, key: string): string {
  const legacyAddress = primaryAddress(client);
  const values: Record<string, string> = {
    name: client.name?.trim() ?? "",
    cpfCnpj: client.cpfCnpj?.trim() ?? "",
    type: client.type ?? "",
    rg: client.rg?.trim() ?? "",
    rgIssuer: client.rgIssuer?.trim() ?? "",
    nationality: client.nationality?.trim() ?? "",
    maritalStatus: client.maritalStatus?.trim() ?? "",
    profession: client.profession?.trim() ?? "",
    motherName: client.motherName?.trim() ?? "",
    phone: primaryPhone(client),
    email: primaryEmail(client),
    address: clientAddressLine(client),
    city: client.city?.trim() || legacyAddress?.city?.trim() || "",
    state: client.state?.trim() || legacyAddress?.state?.trim() || "",
    zipCode: client.zipCode?.trim() || legacyAddress?.zipCode?.trim() || "",
  };
  return values[key] ?? "";
}

export function relatedClients(client: Client, allClients: Client[]): Client[] {
  const ids = new Set(client.nestedClientIds ?? []);
  allClients.forEach((candidate) => {
    if (candidate.nestedClientIds?.includes(client.id)) ids.add(candidate.id);
  });
  return allClients
    .filter((candidate) => ids.has(candidate.id) && !candidate.deleted)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function findRepeatableBlocks(content: JSONContent): RepeatableBlockInfo[] {
  const blocks: RepeatableBlockInfo[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "repeatableBlock") {
      blocks.push({
        id: String(node.attrs?.blockId ?? ""),
        label: String(node.attrs?.label ?? "Bloco repetível"),
      });
    }
    node.content?.forEach(visit);
  };
  visit(content);
  return blocks.filter((block) => block.id);
}

export function createBoundFieldNode(
  attrs: Record<string, unknown>,
  client: Client | null
): JSONContent {
  const kind = attrs.fieldKind === "manual" ? "manual" : "client";
  const key = String(attrs.fieldKey ?? "");
  const label = String(attrs.label ?? "Campo");
  const value = kind === "client" && client ? resolveClientField(client, key) : "";
  const shown = value || `[${label}]`;
  return {
    type: "boundField",
    attrs: {
      sourceType: kind,
      fieldKey: key,
      label,
      sourceClientId: kind === "client" ? client?.id ?? null : null,
      missing: !value,
      originalValue: shown,
    },
    content: [{ type: "text", text: shown }],
  };
}

export function instantiateLegalContent(
  template: JSONContent,
  client: Client,
  allClients: Client[],
  repeatSelections: Record<string, string[]> = {}
): JSONContent {
  const clientById = new Map(allClients.map((item) => [item.id, item]));

  const transform = (node: JSONContent, contextClient: Client): JSONContent[] => {
    if (node.type === "dynamicField") return [createBoundFieldNode(node.attrs ?? {}, contextClient)];

    if (node.type === "repeatableBlock") {
      const blockId = String(node.attrs?.blockId ?? "");
      return (repeatSelections[blockId] ?? []).flatMap((clientId) => {
        const selected = clientById.get(clientId);
        if (!selected) return [];
        return (node.content ?? []).flatMap((child) => transform(child, selected));
      });
    }

    const copy: JSONContent = { ...node };
    if (node.content) copy.content = node.content.flatMap((child) => transform(child, contextClient));
    return [copy];
  };

  const transformed = transform(cloneLegalContent(template), client);
  return transformed[0]?.type === "doc"
    ? transformed[0]
    : { type: "doc", content: transformed };
}

export function legalExportWarnings(content: JSONContent): LegalExportWarning[] {
  const warnings = new Map<string, LegalExportWarning>();
  const visit = (node: JSONContent) => {
    if (node.type === "boundField" && node.attrs?.missing === true) {
      const kind = node.attrs.sourceType === "manual" ? "manual" : "client";
      const label = String(node.attrs.label ?? "Campo pendente");
      const key = `${kind}:${String(node.attrs.fieldKey ?? label)}`;
      warnings.set(key, { key, label, kind });
    }
    if (node.type === "dynamicField") {
      const kind = node.attrs?.fieldKind === "manual" ? "manual" : "client";
      const label = String(node.attrs?.label ?? "Campo pendente");
      const key = `${kind}:${String(node.attrs?.fieldKey ?? label)}`;
      warnings.set(key, { key, label, kind });
    }
    node.content?.forEach(visit);
  };
  visit(content);
  return [...warnings.values()];
}

export function newLegalNodeId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function customLegalStyle(
  name: string,
  index: number,
  base: LegalParagraphStyle = DEFAULT_LEGAL_STYLES.body
): LegalParagraphStyle {
  return {
    ...base,
    id: `custom-${Date.now()}-${index}`,
    name: name.trim(),
    custom: true,
  };
}

export function safeLegalFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "documento";
}

export type { JSONContent };
