"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { LegalChromeContent, LegalChromeInline, LegalChromeMark } from "@/lib/types";

/**
 * Renderização somente leitura do cabeçalho e do rodapé, com os campos de numeração já
 * trocados pelo número real da folha. É o que aparece em todas as páginas fora do modo
 * de edição — no modo de edição, a primeira folha mostra o editor de verdade no lugar.
 */
export function LegalChromeView({
  content,
  pageNumber,
  totalPages,
  autoPageNumber,
}: {
  content: LegalChromeContent;
  pageNumber: number;
  totalPages: number;
  autoPageNumber: boolean;
}) {
  return (
    <>
      {content.content.map((paragraph, index) => (
        <p key={index} style={{ textAlign: paragraph.attrs.textAlign }}>
          {(paragraph.content ?? []).map((inline, inlineIndex) => (
            <Fragment key={inlineIndex}>{renderInline(inline, pageNumber, totalPages)}</Fragment>
          ))}
        </p>
      ))}
      {autoPageNumber && <p style={{ textAlign: "center" }}>{`Página ${pageNumber} de ${totalPages}`}</p>}
    </>
  );
}

function renderInline(inline: LegalChromeInline, pageNumber: number, totalPages: number): ReactNode {
  if (inline.type === "hardBreak") return <br />;
  if (inline.type === "pageNumberField") {
    return <>{inline.attrs.fieldKind === "total" ? totalPages : pageNumber}</>;
  }
  const style: CSSProperties = {};
  let node: ReactNode = inline.text;
  (inline.marks ?? []).forEach((mark: LegalChromeMark) => {
    if (mark.type === "bold") style.fontWeight = 700;
    if (mark.type === "italic") style.fontStyle = "italic";
    if (mark.type === "underline") style.textDecoration = "underline";
    if (mark.type === "textStyle") {
      if (mark.attrs.fontFamily) style.fontFamily = `"${mark.attrs.fontFamily}", serif`;
      if (mark.attrs.fontSize) style.fontSize = mark.attrs.fontSize;
    }
  });
  if (Object.keys(style).length) node = <span style={style}>{node}</span>;
  return node;
}
