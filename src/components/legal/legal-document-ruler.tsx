"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Editor } from "@tiptap/react";
import { isLegalListStyle, legalListLabelWidthMm } from "@/lib/legal-lists";
import type { LegalPageSettings, LegalStyleMap } from "@/lib/types";
import { cn } from "@/lib/utils";

type RulerHandle = "marginLeft" | "marginRight" | "leftIndent" | "rightIndent" | "firstLineIndent";

const RULER_HANDLE_CLASS = {
  margin: "legal-ruler-handle-margin",
  "first-line": "legal-ruler-handle-first-line",
  "left-indent": "legal-ruler-handle-left-indent",
  "right-indent": "legal-ruler-handle-right-indent",
} as const;

const MIN_TEXT_WIDTH_MM = 40;
const MIN_PARAGRAPH_WIDTH_MM = 10;
const KEYBOARD_STEP_MM = 0.5;

export function LegalDocumentRuler({
  editor,
  styles,
  pageSettings,
  canEdit,
  onPageSettingsChange,
}: {
  editor: Editor;
  styles: LegalStyleMap;
  pageSettings: LegalPageSettings;
  canEdit: boolean;
  onPageSettingsChange: (settings: LegalPageSettings) => void;
}) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<RulerHandle | null>(null);
  const [dragging, setDragging] = useState<RulerHandle | null>(null);
  const [, setEditorRevision] = useState(0);

  useEffect(() => {
    const update = () => setEditorRevision((value) => value + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const paperWidth = pageSettings.paperSize === "LETTER" ? 216 : 210;
  const marginLeft = clamp(pageSettings.marginLeft, 0, 80);
  const marginRight = clamp(pageSettings.marginRight, 0, 80);
  const contentRight = paperWidth - marginRight;
  const paragraph = editor.getAttributes("paragraph");
  const activeStyle = styles[String(paragraph.styleId ?? "body")] ?? styles.body;
  const leftIndent = finiteOr(paragraph.leftIndent, activeStyle?.leftIndent ?? 0);
  const rightIndent = finiteOr(paragraph.rightIndent, activeStyle?.rightIndent ?? 0);
  const firstLineIndent = finiteOr(paragraph.firstLineIndent, activeStyle?.firstLineIndent ?? 0);
  const listTextOffset = legalListTextOffsetMm(paragraph);
  const leftIndentPosition = clamp(marginLeft + leftIndent, 0, contentRight - MIN_PARAGRAPH_WIDTH_MM);
  const rightIndentPosition = clamp(contentRight - rightIndent, leftIndentPosition + MIN_PARAGRAPH_WIDTH_MM, paperWidth);
  const firstLinePosition = clamp(
    leftIndentPosition + listTextOffset + firstLineIndent,
    0,
    rightIndentPosition - 2
  );
  const ticks = useMemo(
    () => Array.from({ length: Math.floor(paperWidth / 5) + 1 }, (_, index) => index * 5),
    [paperWidth]
  );

  const positionPercent = (value: number) => `${(value / paperWidth) * 100}%`;

  const updateHandle = (handle: RulerHandle, position: number) => {
    const roundedPosition = roundHalf(clamp(position, 0, paperWidth));

    if (handle === "marginLeft") {
      const nextMargin = clamp(roundedPosition, 0, Math.min(80, contentRight - MIN_TEXT_WIDTH_MM));
      onPageSettingsChange({ ...pageSettings, marginLeft: nextMargin });
      return;
    }

    if (handle === "marginRight") {
      const nextMargin = clamp(
        paperWidth - roundedPosition,
        0,
        Math.min(80, paperWidth - marginLeft - MIN_TEXT_WIDTH_MM)
      );
      onPageSettingsChange({ ...pageSettings, marginRight: nextMargin });
      return;
    }

    if (handle === "leftIndent") {
      const maxIndent = Math.min(100, rightIndentPosition - marginLeft - MIN_PARAGRAPH_WIDTH_MM);
      const nextIndent = clamp(roundHalf(roundedPosition - marginLeft), -Math.min(50, marginLeft), maxIndent);
      editor.commands.updateAttributes("paragraph", { leftIndent: nextIndent });
      return;
    }

    if (handle === "rightIndent") {
      const maxIndent = Math.min(100, contentRight - leftIndentPosition - MIN_PARAGRAPH_WIDTH_MM);
      const nextIndent = clamp(roundHalf(contentRight - roundedPosition), -Math.min(50, marginRight), maxIndent);
      editor.commands.updateAttributes("paragraph", { rightIndent: nextIndent });
      return;
    }

    const minFirstLineIndent = Math.max(-50, -marginLeft - leftIndent - listTextOffset);
    const maxFirstLineIndent = Math.max(
      minFirstLineIndent,
      Math.min(100, rightIndentPosition - marginLeft - leftIndent - listTextOffset - 2)
    );
    const nextFirstLineIndent = clamp(
      roundHalf(roundedPosition - marginLeft - leftIndent - listTextOffset),
      minFirstLineIndent,
      maxFirstLineIndent
    );
    editor.commands.updateAttributes("paragraph", { firstLineIndent: nextFirstLineIndent });
  };

  const positionForHandle = (handle: RulerHandle) => ({
    marginLeft,
    marginRight: contentRight,
    leftIndent: leftIndentPosition,
    rightIndent: rightIndentPosition,
    firstLineIndent: firstLinePosition,
  })[handle];

  const updateFromClientX = (handle: RulerHandle, clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    updateHandle(handle, ((clientX - rect.left) / rect.width) * paperWidth);
  };

  const beginDrag = (handle: RulerHandle, event: PointerEvent<HTMLButtonElement>) => {
    if (!canEdit) return;
    event.preventDefault();
    draggingRef.current = handle;
    setDragging(handle);
    rulerRef.current?.setPointerCapture(event.pointerId);
    updateFromClientX(handle, event.clientX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    setDragging(null);
    if (rulerRef.current?.hasPointerCapture(event.pointerId)) {
      rulerRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const adjustWithKeyboard = (handle: RulerHandle, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canEdit || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    updateHandle(handle, positionForHandle(handle) + direction * KEYBOARD_STEP_MM);
  };

  const selectCurrentParagraph = () => {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name !== "paragraph") continue;
      editor.chain().focus().setTextSelection({
        from: $from.start(depth),
        to: $from.end(depth),
      }).run();
      return;
    }
  };

  const marker = (
    handle: RulerHandle,
    position: number,
    label: string,
    value: number,
    kind: keyof typeof RULER_HANDLE_CLASS
  ) => (
    <button
      type="button"
      className={cn(
        "legal-ruler-handle",
        RULER_HANDLE_CLASS[kind],
        dragging === handle && "is-dragging"
      )}
      style={{ left: positionPercent(position) }}
      title={`${label}: ${formatMillimeters(value)}`}
      aria-label={`${label}: ${formatMillimeters(value)}`}
      disabled={!canEdit}
      onPointerDown={(event) => beginDrag(handle, event)}
      onKeyDown={(event) => adjustWithKeyboard(handle, event)}
    >
      <span aria-hidden="true" />
    </button>
  );

  return (
    <div
      ref={rulerRef}
      className={cn("legal-ruler mx-auto", dragging && "is-active")}
      style={{ width: `min(${paperWidth}mm, 100%)` }}
      role="group"
      aria-label="Régua do documento"
      onPointerMove={(event) => {
        if (draggingRef.current) updateFromClientX(draggingRef.current, event.clientX);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <button
        type="button"
        className="legal-ruler-margin-zone legal-ruler-selection-zone left-0"
        style={{ width: positionPercent(marginLeft) }}
        title="Selecionar parágrafo atual"
        aria-label="Selecionar parágrafo atual"
        onClick={selectCurrentParagraph}
      />
      <div className="legal-ruler-margin-zone right-0" style={{ width: positionPercent(marginRight) }} />

      {ticks.map((tick) => {
        const major = tick % 10 === 0;
        return (
          <span
            key={tick}
            className={cn("legal-ruler-tick", major && "is-major")}
            style={{ left: positionPercent(tick) }}
            aria-hidden="true"
          >
            {major && tick > 0 && tick < paperWidth && <span>{tick / 10}</span>}
          </span>
        );
      })}

      {marker("marginLeft", marginLeft, "Margem esquerda", marginLeft, "margin")}
      {marker("marginRight", contentRight, "Margem direita", marginRight, "margin")}
      {marker("firstLineIndent", firstLinePosition, "Recuo da primeira linha", firstLineIndent, "first-line")}
      {marker("leftIndent", leftIndentPosition, "Recuo esquerdo", leftIndent, "left-indent")}
      {marker("rightIndent", rightIndentPosition, "Recuo direito", rightIndent, "right-indent")}

      {dragging && (
        <span className="legal-ruler-reading" style={{ left: positionPercent(positionForHandle(dragging)) }}>
          {formatMillimeters(handleValue(dragging, marginLeft, marginRight, leftIndent, rightIndent, firstLineIndent))}
        </span>
      )}
    </div>
  );
}

function handleValue(
  handle: RulerHandle,
  marginLeft: number,
  marginRight: number,
  leftIndent: number,
  rightIndent: number,
  firstLineIndent: number
): number {
  return { marginLeft, marginRight, leftIndent, rightIndent, firstLineIndent }[handle];
}

function finiteOr(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function legalListTextOffsetMm(paragraph: Record<string, unknown>): number {
  if (paragraph.listKind !== "bullet" && paragraph.listKind !== "ordered") return 0;
  const level = clamp(Math.round(finiteOr(paragraph.listLevel, 0)), 0, 8);
  const style = isLegalListStyle(paragraph.legalListStyle) ? paragraph.legalListStyle : "decimal";
  const labelWidth = paragraph.listKind === "bullet" ? 8 : legalListLabelWidthMm(style);
  return labelWidth + level * 8;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMillimeters(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} mm`;
}
