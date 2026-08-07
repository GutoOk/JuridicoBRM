"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { LegalPageSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

type VerticalHandle = "marginTop" | "marginBottom";

const MIN_TEXT_HEIGHT_MM = 40;
const KEYBOARD_STEP_MM = 0.5;

/**
 * Régua vertical alinhada à pilha de folhas. As faixas de margem são desenhadas em todas
 * as páginas, mas só a primeira traz os punhos: a margem vale para o documento inteiro e
 * repetir o controle daria a impressão errada de margem por página.
 */
export function LegalVerticalRuler({
  pageSettings,
  pageHeightMm,
  pageGapMm,
  pageCount,
  canEdit,
  onPageSettingsChange,
}: {
  pageSettings: LegalPageSettings;
  pageHeightMm: number;
  pageGapMm: number;
  pageCount: number;
  canEdit: boolean;
  onPageSettingsChange: (settings: LegalPageSettings) => void;
}) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<VerticalHandle | null>(null);
  const [dragging, setDragging] = useState<VerticalHandle | null>(null);

  const marginTop = clamp(pageSettings.marginTop, 0, 80);
  const marginBottom = clamp(pageSettings.marginBottom, 0, 80);
  const stepMm = pageHeightMm + pageGapMm;
  const totalMm = pageCount * stepMm - pageGapMm;
  const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index), [pageCount]);
  const ticks = useMemo(
    () => Array.from({ length: Math.floor(pageHeightMm / 5) + 1 }, (_, index) => index * 5),
    [pageHeightMm]
  );

  const positionPercent = (value: number) => `${(value / totalMm) * 100}%`;

  const updateHandle = (handle: VerticalHandle, positionMm: number) => {
    const rounded = roundHalf(clamp(positionMm, 0, pageHeightMm));
    if (handle === "marginTop") {
      const next = clamp(rounded, 0, Math.min(80, pageHeightMm - marginBottom - MIN_TEXT_HEIGHT_MM));
      onPageSettingsChange({ ...pageSettings, marginTop: next });
      return;
    }
    const next = clamp(
      pageHeightMm - rounded,
      0,
      Math.min(80, pageHeightMm - marginTop - MIN_TEXT_HEIGHT_MM)
    );
    onPageSettingsChange({ ...pageSettings, marginBottom: next });
  };

  const updateFromClientY = (handle: VerticalHandle, clientY: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect?.height) return;
    // O punho vale para a primeira folha, então a leitura é relativa ao topo dela.
    updateHandle(handle, ((clientY - rect.top) / rect.height) * totalMm);
  };

  const beginDrag = (handle: VerticalHandle, event: PointerEvent<HTMLButtonElement>) => {
    if (!canEdit) return;
    event.preventDefault();
    draggingRef.current = handle;
    setDragging(handle);
    rulerRef.current?.setPointerCapture(event.pointerId);
    updateFromClientY(handle, event.clientY);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    setDragging(null);
    if (rulerRef.current?.hasPointerCapture(event.pointerId)) {
      rulerRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const adjustWithKeyboard = (handle: VerticalHandle, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canEdit || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const current = handle === "marginTop" ? marginTop : pageHeightMm - marginBottom;
    updateHandle(handle, current + direction * KEYBOARD_STEP_MM);
  };

  const marker = (handle: VerticalHandle, positionMm: number, label: string, value: number) => (
    <button
      type="button"
      className={cn("legal-vruler-handle", dragging === handle && "is-dragging")}
      style={{ top: positionPercent(positionMm) }}
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
      className={cn("legal-vruler", dragging && "is-active")}
      style={{ height: `${totalMm}mm` }}
      role="group"
      aria-label="Régua vertical do documento"
      onPointerMove={(event) => {
        if (draggingRef.current) updateFromClientY(draggingRef.current, event.clientY);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {pages.map((page) => {
        const pageTop = page * stepMm;
        return (
          <div key={page} className="legal-vruler-page" style={{ top: positionPercent(pageTop), height: positionPercent(pageHeightMm) }}>
            <div className="legal-vruler-margin-zone" style={{ top: 0, height: `${(marginTop / pageHeightMm) * 100}%` }} />
            <div className="legal-vruler-margin-zone" style={{ bottom: 0, height: `${(marginBottom / pageHeightMm) * 100}%` }} />
            {ticks.map((tick) => {
              const major = tick % 10 === 0;
              return (
                <span
                  key={tick}
                  className={cn("legal-vruler-tick", major && "is-major")}
                  style={{ top: `${(tick / pageHeightMm) * 100}%` }}
                  aria-hidden="true"
                >
                  {major && tick > 0 && tick < pageHeightMm && <span>{tick / 10}</span>}
                </span>
              );
            })}
          </div>
        );
      })}

      {marker("marginTop", marginTop, "Margem superior", marginTop)}
      {marker("marginBottom", pageHeightMm - marginBottom, "Margem inferior", marginBottom)}

      {dragging && (
        <span
          className="legal-vruler-reading"
          style={{ top: positionPercent(dragging === "marginTop" ? marginTop : pageHeightMm - marginBottom) }}
        >
          {formatMillimeters(dragging === "marginTop" ? marginTop : marginBottom)}
        </span>
      )}
    </div>
  );
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
