import type { JSONContent } from "@tiptap/core";
import type { ILevelsOptions, INumberingOptions } from "docx";
import {
  legalChromeAutoPageNumber,
  legalChromeContent,
  legalChromeIsEmpty,
} from "./legal-documents";
import { isLegalListStyle, type LegalListStyle } from "./legal-lists";
import type {
  LegalChromeContent,
  LegalChromeInline,
  LegalPageSettings,
  LegalParagraphStyle,
  LegalStyleMap,
} from "./types";

type DocxModule = typeof import("docx");

/** Cabeçalho/rodapé como parágrafos do Word, com o campo de numeração virando campo real. */
function chromeParagraphs(
  docx: DocxModule,
  content: LegalChromeContent
): InstanceType<DocxModule["Paragraph"]>[] {
  return content.content.map((paragraph) => new docx.Paragraph({
    alignment: alignmentType(docx, paragraph.attrs.textAlign),
    children: (paragraph.content ?? []).flatMap((inline) => chromeRuns(docx, inline)),
  }));
}

function chromeRuns(docx: DocxModule, inline: LegalChromeInline): InstanceType<DocxModule["TextRun"]>[] {
  if (inline.type === "hardBreak") return [new docx.TextRun({ break: 1 })];
  if (inline.type === "pageNumberField") {
    return [new docx.TextRun({
      children: [inline.attrs.fieldKind === "total" ? docx.PageNumber.TOTAL_PAGES : docx.PageNumber.CURRENT],
      size: 18,
    })];
  }
  let font: string | undefined;
  let size = 18;
  let bold = false;
  let italics = false;
  let underline = false;
  (inline.marks ?? []).forEach((mark) => {
    if (mark.type === "bold") bold = true;
    if (mark.type === "italic") italics = true;
    if (mark.type === "underline") underline = true;
    if (mark.type === "textStyle") {
      if (mark.attrs.fontFamily) font = mark.attrs.fontFamily;
      const parsed = Number.parseFloat(String(mark.attrs.fontSize ?? ""));
      if (Number.isFinite(parsed)) size = Math.round(parsed * 2);
    }
  });
  return [new docx.TextRun({
    text: inline.text,
    font,
    size,
    bold,
    italics,
    underline: underline ? { type: docx.UnderlineType.SINGLE } : undefined,
  })];
}

export async function createLegalDocxBlob(
  name: string,
  content: JSONContent,
  styles: LegalStyleMap,
  pageSettings: LegalPageSettings
): Promise<Blob> {
  const docx = await import("docx");
  const builder = new DocxContentBuilder(docx, styles);
  const children = builder.blocks(content);

  const headerDoc = legalChromeContent(pageSettings, "header");
  const footerDoc = legalChromeContent(pageSettings, "footer");
  const autoPageNumber = legalChromeAutoPageNumber(pageSettings);

  const headerParagraphs = chromeParagraphs(docx, headerDoc);
  const footerParagraphs = chromeParagraphs(docx, footerDoc);
  if (autoPageNumber) {
    footerParagraphs.push(new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      children: [
        new docx.TextRun({ text: "Página ", size: 18 }),
        new docx.TextRun({ children: [docx.PageNumber.CURRENT], size: 18 }),
        new docx.TextRun({ text: " de ", size: 18 }),
        new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES], size: 18 }),
      ],
    }));
  }

  const header = legalChromeIsEmpty(headerDoc) ? undefined : new docx.Header({ children: headerParagraphs });
  const footer = footerParagraphs.length && !(legalChromeIsEmpty(footerDoc) && !autoPageNumber)
    ? new docx.Footer({ children: footerParagraphs })
    : undefined;

  const document = new docx.Document({
    title: name,
    creator: "JuridicoBRM",
    styles: {
      paragraphStyles: Object.values(styles).map((style) => ({
        id: docxStyleId(style.id),
        name: style.name,
        basedOn: "Normal",
        next: docxStyleId(style.id),
        quickFormat: true,
        run: runStyle(docx, style),
        paragraph: paragraphStyle(docx, style),
      })),
    },
    numbering: { config: builder.numbering },
    sections: [{
      headers: header ? { default: header } : undefined,
      footers: footer ? { default: footer } : undefined,
      properties: {
        page: {
          size: pageSettings.paperSize === "LETTER"
            ? { width: 12240, height: 15840 }
            : { width: 11906, height: 16838 },
          margin: {
            top: mmToTwip(pageSettings.marginTop),
            right: mmToTwip(pageSettings.marginRight),
            bottom: mmToTwip(pageSettings.marginBottom),
            left: mmToTwip(pageSettings.marginLeft),
            header: 567,
            footer: 567,
          },
          // Sempre numerado a partir de 1: o campo inserido manualmente também depende disso.
          pageNumbers: { start: 1 },
        },
      },
      children: children.length ? children : [new docx.Paragraph("")],
    }],
  });
  return docx.Packer.toBlob(document);
}

class DocxContentBuilder {
  readonly numbering: Array<INumberingOptions["config"][number]> = [];
  private listIndex = 0;
  private readonly flatListReferences = new Map<string, string>();

  constructor(private readonly docx: DocxModule, private readonly styles: LegalStyleMap) {}

  blocks(content: JSONContent): InstanceType<DocxModule["Paragraph"]>[] {
    return this.visitBlocks(content.content ?? []);
  }

  private visitBlocks(nodes: JSONContent[]): InstanceType<DocxModule["Paragraph"]>[] {
    return nodes.flatMap((node) => {
      if (node.type === "paragraph") return [this.paragraph(node, this.flatList(node))];
      if (node.type === "pageBreak") {
        return [new this.docx.Paragraph({ children: [new this.docx.PageBreak()] })];
      }
      if (node.type === "orderedList") return this.orderedList(node, 0);
      if (node.type === "bulletList") return this.bulletList(node, 0);
      if (["repeatableBlock", "quickPartInstance", "doc"].includes(node.type ?? "")) {
        return this.visitBlocks(node.content ?? []);
      }
      return [];
    });
  }

  private orderedList(
    node: JSONContent,
    depth: number,
    inherited?: { reference: string; style: string }
  ): InstanceType<DocxModule["Paragraph"]>[] {
    const style = inherited?.style ?? String(node.attrs?.legalStyle ?? "decimal");
    const reference = inherited?.reference ?? `legal-list-${this.listIndex += 1}`;
    if (!inherited) {
      this.numbering.push({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: numberingFormat(this.docx, style),
          text: numberingText(style, level),
          alignment: this.docx.AlignmentType.LEFT,
          start: level === 0 ? Math.max(1, Number(node.attrs?.start ?? 1)) : 1,
          style: { paragraph: { indent: { left: 720 + level * 540, hanging: 360 } } },
        })),
      });
    }
    return (node.content ?? []).flatMap((item) => this.listItem(item, {
      type: "ordered",
      reference,
      legalStyle: style,
      depth,
    }));
  }

  private bulletList(node: JSONContent, depth: number): InstanceType<DocxModule["Paragraph"]>[] {
    return (node.content ?? []).flatMap((item) => this.listItem(item, { type: "bullet", depth }));
  }

  private listItem(
    node: JSONContent,
    context: { type: "ordered" | "bullet"; depth: number; reference?: string; legalStyle?: string }
  ): InstanceType<DocxModule["Paragraph"]>[] {
    let numbered = false;
    const paragraphs: InstanceType<DocxModule["Paragraph"]>[] = [];
    (node.content ?? []).forEach((child) => {
      if (child.type === "paragraph") {
        paragraphs.push(this.paragraph(child, !numbered ? context : undefined));
        numbered = true;
      } else if (child.type === "orderedList") {
        paragraphs.push(...this.orderedList(child, context.depth + 1, context.reference
          ? { reference: context.reference, style: context.legalStyle ?? "decimal" }
          : undefined));
      } else if (child.type === "bulletList") {
        paragraphs.push(...this.bulletList(child, context.depth + 1));
      } else if (child.type === "pageBreak") {
        paragraphs.push(new this.docx.Paragraph({ children: [new this.docx.PageBreak()] }));
      } else if (["repeatableBlock", "quickPartInstance"].includes(child.type ?? "")) {
        paragraphs.push(...this.visitBlocks(child.content ?? []));
      }
    });
    return paragraphs;
  }

  private paragraph(
    node: JSONContent,
    list?: { type: "ordered" | "bullet"; depth: number; reference?: string }
  ): InstanceType<DocxModule["Paragraph"]> {
    const style = this.styles[String(node.attrs?.styleId ?? "body")] ?? this.styles.body;
    const attrs = node.attrs ?? {};
    const alignment = String(attrs.textAlign ?? style.alignment);
    return new this.docx.Paragraph({
      style: docxStyleId(style.id),
      alignment: alignmentType(this.docx, alignment),
      spacing: {
        before: mmToTwip(numberOr(attrs.spaceBefore, style.spaceBefore)),
        after: mmToTwip(numberOr(attrs.spaceAfter, style.spaceAfter)),
        line: Math.round(numberOr(attrs.lineHeight, style.lineHeight) * 240),
        lineRule: this.docx.LineRuleType.AUTO,
      },
      indent: {
        left: mmToTwip(numberOr(attrs.leftIndent, style.leftIndent)),
        right: mmToTwip(numberOr(attrs.rightIndent, style.rightIndent)),
        firstLine: mmToTwip(numberOr(attrs.firstLineIndent, style.firstLineIndent)),
      },
      numbering: list?.type === "ordered" && list.reference
        ? { reference: list.reference, level: Math.min(8, list.depth) }
        : undefined,
      bullet: list?.type === "bullet" ? { level: Math.min(8, list.depth) } : undefined,
      children: this.inlineRuns(node.content ?? [], style),
    });
  }

  private flatList(
    node: JSONContent
  ): { type: "ordered" | "bullet"; depth: number; reference?: string } | undefined {
    const kind = node.attrs?.listKind;
    const depth = Math.min(8, Math.max(0, Math.round(Number(node.attrs?.listLevel ?? 0))));
    if (kind === "bullet") return { type: "bullet", depth };
    if (kind !== "ordered") return undefined;

    const style: LegalListStyle = isLegalListStyle(node.attrs?.legalListStyle)
      ? node.attrs.legalListStyle
      : "decimal";
    const sequenceId = String(node.attrs?.listSequenceId || `flat-${this.listIndex += 1}`);
    const key = `${sequenceId}:${style}`;
    let reference = this.flatListReferences.get(key);
    if (!reference) {
      reference = `legal-list-${this.listIndex += 1}`;
      this.flatListReferences.set(key, reference);
      const start = Math.max(1, Math.round(Number(node.attrs?.listStart ?? 1)));
      this.numbering.push({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: numberingFormat(this.docx, style),
          text: numberingText(style, level),
          alignment: this.docx.AlignmentType.LEFT,
          start: level === depth ? start : 1,
          style: { paragraph: { indent: { left: 720 + level * 540, hanging: 360 } } },
        })),
      });
    }
    return { type: "ordered", depth, reference };
  }

  private inlineRuns(nodes: JSONContent[], style: LegalParagraphStyle): InstanceType<DocxModule["TextRun"]>[] {
    return nodes.flatMap((node) => {
      if (node.type === "text") return [this.textRun(node, style)];
      if (node.type === "hardBreak") return [new this.docx.TextRun({ break: 1 })];
      if (node.type === "dynamicField") {
        return [this.textRun({ type: "text", text: `[${String(node.attrs?.label ?? "Campo")}]` }, style)];
      }
      if (node.type === "boundField") return this.inlineRuns(node.content ?? [], style);
      return this.inlineRuns(node.content ?? [], style);
    });
  }

  private textRun(node: JSONContent, style: LegalParagraphStyle): InstanceType<DocxModule["TextRun"]> {
    let font = style.fontFamily;
    let size = style.fontSize;
    let bold = style.bold;
    let italics = style.italic;
    let underline = style.underline;
    (node.marks ?? []).forEach((mark) => {
      if (mark.type === "bold") bold = true;
      if (mark.type === "italic") italics = true;
      if (mark.type === "underline") underline = true;
      if (mark.type === "textStyle") {
        if (typeof mark.attrs?.fontFamily === "string") font = mark.attrs.fontFamily;
        const directSize = Number.parseFloat(String(mark.attrs?.fontSize ?? ""));
        if (Number.isFinite(directSize)) size = directSize;
      }
    });
    return new this.docx.TextRun({
      text: node.text ?? "",
      font,
      size: Math.round(size * 2),
      bold,
      italics,
      underline: underline ? { type: this.docx.UnderlineType.SINGLE } : undefined,
    });
  }
}

function runStyle(docx: DocxModule, style: LegalParagraphStyle) {
  return {
    font: style.fontFamily,
    size: Math.round(style.fontSize * 2),
    bold: style.bold,
    italics: style.italic,
    underline: style.underline ? { type: docx.UnderlineType.SINGLE } : undefined,
  };
}

function paragraphStyle(docx: DocxModule, style: LegalParagraphStyle) {
  return {
    alignment: alignmentType(docx, style.alignment),
    spacing: {
      before: mmToTwip(style.spaceBefore),
      after: mmToTwip(style.spaceAfter),
      line: Math.round(style.lineHeight * 240),
      lineRule: docx.LineRuleType.AUTO,
    },
    indent: {
      left: mmToTwip(style.leftIndent),
      right: mmToTwip(style.rightIndent),
      firstLine: mmToTwip(style.firstLineIndent),
    },
  };
}

function numberingFormat(docx: DocxModule, style: string): ILevelsOptions["format"] {
  if (style === "alpha") return docx.LevelFormat.LOWER_LETTER;
  if (style === "roman") return docx.LevelFormat.UPPER_ROMAN;
  if (style === "single-paragraph") return docx.LevelFormat.NONE;
  return docx.LevelFormat.DECIMAL;
}

function numberingText(style: string, level: number): string {
  const token = `%${level + 1}`;
  if (style === "decimal-hierarchical") {
    return Array.from({ length: level + 1 }, (_, index) => `%${index + 1}`).join(".");
  }
  if (style === "alpha") return `${token})`;
  if (style === "roman") return token;
  if (style === "clause") return `Cláusula ${token}ª.`;
  if (style === "paragraph") return `§ ${token}º.`;
  if (style === "single-paragraph") return "Parágrafo único";
  return `${token}.`;
}

function alignmentType(docx: DocxModule, value: string) {
  if (value === "center") return docx.AlignmentType.CENTER;
  if (value === "right") return docx.AlignmentType.RIGHT;
  if (value === "justify") return docx.AlignmentType.JUSTIFIED;
  return docx.AlignmentType.LEFT;
}

function docxStyleId(value: string): string {
  return `Legal-${value.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function mmToTwip(value: number): number {
  return Math.round(value * 56.692913);
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return value == null || !Number.isFinite(parsed) ? fallback : parsed;
}
