"use client";

import type { ReactNode } from "react";
import { Document, Page, Text, View, pdf } from "@react-pdf/renderer";
import type { JSONContent } from "@tiptap/core";
import {
  collectLegalListDisplays,
  legalListLabelWidthMm,
  type LegalListDisplay,
} from "./legal-lists";
import type { LegalPageSettings, LegalParagraphStyle, LegalStyleMap } from "./types";

export async function createLegalPdfBlob(
  name: string,
  content: JSONContent,
  styles: LegalStyleMap,
  pageSettings: LegalPageSettings
): Promise<Blob> {
  return pdf(
    <LegalPdfDocument name={name} content={content} styles={styles} pageSettings={pageSettings} />
  ).toBlob();
}

function LegalPdfDocument({
  name,
  content,
  styles,
  pageSettings,
}: {
  name: string;
  content: JSONContent;
  styles: LegalStyleMap;
  pageSettings: LegalPageSettings;
}) {
  const footerOffset = Math.max(8, pageSettings.marginBottom * 0.35);
  const listDisplays = collectLegalListDisplays(content);
  return (
    <Document title={name} author="JuridicoBRM">
      <Page
        size={pageSettings.paperSize === "LETTER" ? "LETTER" : "A4"}
        wrap
        style={{
          paddingTop: mmToPoint(pageSettings.marginTop),
          paddingRight: mmToPoint(pageSettings.marginRight),
          paddingBottom: mmToPoint(pageSettings.marginBottom),
          paddingLeft: mmToPoint(pageSettings.marginLeft),
          fontFamily: "Times-Roman",
          fontSize: 12,
          color: "#111111",
        }}
      >
        {pageSettings.headerText.trim() && (
          <Text
            fixed
            style={{
              position: "absolute",
              top: mmToPoint(Math.max(4, pageSettings.marginTop * 0.3)),
              left: mmToPoint(pageSettings.marginLeft),
              right: mmToPoint(pageSettings.marginRight),
              textAlign: "center",
              fontSize: 9,
              color: "#444444",
            }}
          >
            {pageSettings.headerText}
          </Text>
        )}
        <PdfBlocks nodes={content.content ?? []} styles={styles} listDisplays={listDisplays} />
        {(pageSettings.footerText.trim() || pageSettings.showPageNumbers) && (
          <Text
            fixed
            style={{
              position: "absolute",
              bottom: mmToPoint(footerOffset),
              left: mmToPoint(pageSettings.marginLeft),
              right: mmToPoint(pageSettings.marginRight),
              textAlign: "center",
              fontSize: 9,
              color: "#444444",
            }}
            render={({ pageNumber, totalPages }) => [
              pageSettings.footerText.trim(),
              pageSettings.showPageNumbers ? `Página ${pageNumber} de ${totalPages}` : "",
            ].filter(Boolean).join(" · ")}
          />
        )}
      </Page>
    </Document>
  );
}

function PdfBlocks({
  nodes,
  styles,
  listDisplays,
}: {
  nodes: JSONContent[];
  styles: LegalStyleMap;
  listDisplays: Map<JSONContent, LegalListDisplay>;
}) {
  return <>{nodes.map((node, index) => (
    <PdfBlock key={`${node.type}-${index}`} node={node} styles={styles} listDisplays={listDisplays} />
  ))}</>;
}

function PdfBlock({
  node,
  styles,
  listDisplays,
}: {
  node: JSONContent;
  styles: LegalStyleMap;
  listDisplays: Map<JSONContent, LegalListDisplay>;
}): ReactNode {
  if (node.type === "paragraph") {
    const listDisplay = listDisplays.get(node);
    return listDisplay
      ? <PdfListParagraph node={node} styles={styles} display={listDisplay} />
      : <PdfParagraph node={node} styles={styles} />;
  }
  if (node.type === "pageBreak") return <View break />;
  if (node.type === "orderedList") return <PdfList node={node} styles={styles} ordered depth={0} ancestors={[]} />;
  if (node.type === "bulletList") return <PdfList node={node} styles={styles} ordered={false} depth={0} ancestors={[]} />;
  if (["repeatableBlock", "quickPartInstance", "doc"].includes(node.type ?? "")) {
    return <PdfBlocks nodes={node.content ?? []} styles={styles} listDisplays={listDisplays} />;
  }
  return null;
}

function PdfListParagraph({
  node,
  styles,
  display,
}: {
  node: JSONContent;
  styles: LegalStyleMap;
  display: LegalListDisplay;
}) {
  const style = styles[String(node.attrs?.styleId ?? "body")] ?? styles.body;
  const attrs = node.attrs ?? {};
  return (
    <View
      style={{
        flexDirection: "row",
        marginTop: mmToPoint(numberOr(attrs.spaceBefore, style.spaceBefore)),
        marginBottom: mmToPoint(numberOr(attrs.spaceAfter, style.spaceAfter)),
        marginLeft: mmToPoint(display.level * 8),
      }}
    >
      <Text
        style={{
          width: mmToPoint(display.kind === "bullet" ? 8 : legalListLabelWidthMm(display.style)),
          paddingRight: mmToPoint(2),
          fontFamily: pdfFont(style.fontFamily, style.bold, style.italic),
          fontSize: style.fontSize,
          textDecoration: style.underline ? "underline" : undefined,
        }}
      >
        {display.label}
      </Text>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>
        <PdfParagraph node={node} styles={styles} compact />
      </View>
    </View>
  );
}

function PdfParagraph({
  node,
  styles,
  compact = false,
}: {
  node: JSONContent;
  styles: LegalStyleMap;
  compact?: boolean;
}) {
  const style = styles[String(node.attrs?.styleId ?? "body")] ?? styles.body;
  const attrs = node.attrs ?? {};
  const bold = style.bold;
  const italic = style.italic;
  return (
    <Text
      style={{
        fontFamily: pdfFont(style.fontFamily, bold, italic),
        fontSize: style.fontSize,
        textDecoration: style.underline ? "underline" : undefined,
        textAlign: (attrs.textAlign ?? style.alignment) as "left" | "center" | "right" | "justify",
        marginTop: compact ? 0 : mmToPoint(numberOr(attrs.spaceBefore, style.spaceBefore)),
        marginBottom: compact ? 0 : mmToPoint(numberOr(attrs.spaceAfter, style.spaceAfter)),
        marginLeft: mmToPoint(numberOr(attrs.leftIndent, style.leftIndent)),
        marginRight: mmToPoint(numberOr(attrs.rightIndent, style.rightIndent)),
        lineHeight: numberOr(attrs.lineHeight, style.lineHeight),
        // react-pdf supports textIndent at runtime although it is absent from some type releases.
        textIndent: mmToPoint(numberOr(attrs.firstLineIndent, style.firstLineIndent)),
      } as never}
      orphans={2}
      widows={2}
    >
      <PdfInline nodes={node.content ?? []} baseStyle={style} />
    </Text>
  );
}

function PdfInline({ nodes, baseStyle }: { nodes: JSONContent[]; baseStyle: LegalParagraphStyle }): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "hardBreak") return "\n";
    if (node.type === "dynamicField") return `[${String(node.attrs?.label ?? "Campo")}]`;
    if (node.type === "boundField") {
      return <PdfInline key={`bound-${index}`} nodes={node.content ?? []} baseStyle={baseStyle} />;
    }
    if (node.type !== "text") {
      return <PdfInline key={`inline-${index}`} nodes={node.content ?? []} baseStyle={baseStyle} />;
    }
    let font = baseStyle.fontFamily;
    let size = baseStyle.fontSize;
    let bold = baseStyle.bold;
    let italic = baseStyle.italic;
    let underline = baseStyle.underline;
    (node.marks ?? []).forEach((mark) => {
      if (mark.type === "bold") bold = true;
      if (mark.type === "italic") italic = true;
      if (mark.type === "underline") underline = true;
      if (mark.type === "textStyle") {
        if (typeof mark.attrs?.fontFamily === "string") font = mark.attrs.fontFamily;
        const directSize = Number.parseFloat(String(mark.attrs?.fontSize ?? ""));
        if (Number.isFinite(directSize)) size = directSize;
      }
    });
    return (
      <Text
        key={`text-${index}`}
        style={{
          fontFamily: pdfFont(font, bold, italic),
          fontSize: size,
          textDecoration: underline ? "underline" : undefined,
        }}
      >
        {node.text ?? ""}
      </Text>
    );
  });
}

function PdfList({
  node,
  styles,
  ordered,
  depth,
  ancestors,
  inheritedStyle,
}: {
  node: JSONContent;
  styles: LegalStyleMap;
  ordered: boolean;
  depth: number;
  ancestors: number[];
  inheritedStyle?: string;
}) {
  const start = Math.max(1, Number(node.attrs?.start ?? 1));
  const legalStyle = inheritedStyle ?? String(node.attrs?.legalStyle ?? "decimal");
  return (
    <View style={{ marginBottom: 2 }}>
      {(node.content ?? []).map((item, index) => {
        const number = start + index;
        const path = [...ancestors, number];
        return (
          <View key={`item-${index}`} style={{ marginLeft: depth * 14, marginBottom: 3 }}>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ width: labelWidth(legalStyle, depth), paddingRight: 5, fontFamily: "Times-Roman", fontSize: 12 }}>
                {ordered ? legalListLabel(legalStyle, number, index, path) : "•"}
              </Text>
              <View style={{ flexGrow: 1, flexBasis: 0 }}>
                {(item.content ?? []).filter((child) => child.type === "paragraph").map((paragraph, paragraphIndex) => (
                  <PdfParagraph key={`paragraph-${paragraphIndex}`} node={paragraph} styles={styles} compact />
                ))}
              </View>
            </View>
            {(item.content ?? []).filter((child) => ["orderedList", "bulletList"].includes(child.type ?? "")).map((child, childIndex) => (
              <PdfList
                key={`nested-${childIndex}`}
                node={child}
                styles={styles}
                ordered={child.type === "orderedList"}
                depth={depth + 1}
                ancestors={path}
                inheritedStyle={child.type === "orderedList" ? legalStyle : undefined}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function legalListLabel(style: string, number: number, index: number, path: number[]): string {
  if (style === "decimal-hierarchical") return path.join(".");
  if (style === "alpha") return `${alphaNumber(number)})`;
  if (style === "roman") return romanNumber(number);
  if (style === "clause") return `Cláusula ${number}ª.`;
  if (style === "paragraph") return `§ ${number}º.`;
  if (style === "single-paragraph") return index === 0 ? "Parágrafo único" : `§ ${number}º.`;
  return `${number}.`;
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
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = Math.max(1, value);
  let result = "";
  pairs.forEach(([amount, token]) => {
    while (remaining >= amount) {
      result += token;
      remaining -= amount;
    }
  });
  return result;
}

function labelWidth(style: string, depth: number): number {
  if (["clause", "single-paragraph"].includes(style)) return depth ? 62 : 82;
  if (style === "paragraph") return 42;
  return 28 + depth * 5;
}

function pdfFont(font: string, bold: boolean, italic: boolean): string {
  const family = font.toLocaleLowerCase("pt-BR");
  const base = family.includes("courier") ? "Courier" : family.includes("times") || family.includes("georgia") ? "Times" : "Helvetica";
  if (base === "Times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  if (bold && italic) return `${base}-BoldOblique`;
  if (bold) return `${base}-Bold`;
  if (italic) return `${base}-Oblique`;
  return base;
}

function mmToPoint(value: number): number {
  return value * 2.8346457;
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return value == null || !Number.isFinite(parsed) ? fallback : parsed;
}
