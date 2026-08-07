"use client";

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Paginação visual aproximada.
 *
 * O documento continua sendo um único ProseMirror contínuo — cursor, seleção, desfazer
 * e colar seguem intactos. A cada mudança medimos onde o texto cruza a altura útil da
 * folha e injetamos espaçadores (decorations) do tamanho exato de "margem inferior +
 * intervalo entre folhas + margem superior". O texto passa a cair dentro das folhas
 * desenhadas atrás dele, dando a noção de quantas páginas o documento tem.
 *
 * A medição é feita em coordenadas *naturais*: a posição bruta de cada linha menos a
 * altura dos espaçadores que já existem acima dela. Sem isso o resultado dependeria do
 * próprio resultado anterior e as quebras ficariam oscilando.
 *
 * As quebras acompanham o navegador, não o motor do PDF nem o do Word, então a contagem
 * é uma boa aproximação e não uma garantia.
 */

export type LegalPageGeometry = {
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  gapMm: number;
};

export type LegalPaginationOptions = {
  getGeometry: () => LegalPageGeometry;
  onPageCountChange: (pageCount: number) => void;
};

/**
 * Cada quebra tem altura própria. Uma altura fixa faria a folga que sobra no pé de uma
 * folha ser herdada pela seguinte, e o texto acabaria invadindo a margem inferior — além
 * de não dar conta da quebra manual, que precisa consumir todo o resto da página.
 */
type PageBreakSpacer = { pos: number; height: number };

type PaginationState = {
  breaks: PageBreakSpacer[];
  decorations: DecorationSet;
};

type LineBox = { top: number; left: number; height: number };
type Atom = { pos: number; node: ProseMirrorNode; dom: HTMLElement };

/** Tudo o que a medição enxerga na folha, em ordem de leitura. */
type Item =
  /** `top` é relativo ao início do texto; `viewTop`/`left` continuam em coordenadas de viewport. */
  | { kind: "line"; top: number; viewTop: number; height: number; left: number; atom: Atom; atomIndex: number; lineIndex: number }
  | { kind: "spacer"; top: number; height: number; pos: number }
  | { kind: "manual"; top: number; pos: number };

export const legalPaginationKey = new PluginKey<PaginationState>("legalPagination");

const MEASURE_DELAY_MS = 120;
/**
 * Uma quebra nova reposiciona o texto abaixo dela, então o ajuste desce uma folha por
 * passada. Essas passadas de acomodação são encadeadas quase sem espera para o documento
 * assentar em poucos quadros, enquanto a espera cheia continua valendo para a digitação.
 */
const RELAX_DELAY_MS = 8;
const OVERFLOW_TOLERANCE_PX = 0.75;
/** Trava contra medições que não convergem: reinicia a cada alteração do documento. */
const MAX_CONSECUTIVE_APPLIES = 80;

export function legalPagination(options: LegalPaginationOptions) {
  return Extension.create({
    name: "legalPagination",

    addProseMirrorPlugins() {
      return [
        new Plugin<PaginationState>({
          key: legalPaginationKey,

          state: {
            init: () => ({ breaks: [], decorations: DecorationSet.empty }),
            apply(transaction, value, _oldState, newState) {
              const meta = transaction.getMeta(legalPaginationKey) as
                | { breaks: PageBreakSpacer[] }
                | undefined;
              if (meta) {
                return {
                  breaks: meta.breaks,
                  decorations: buildDecorations(newState.doc, meta.breaks),
                };
              }
              if (!transaction.docChanged) return value;
              return {
                breaks: value.breaks.map((spacer) => ({
                  ...spacer,
                  pos: transaction.mapping.map(spacer.pos, -1),
                })),
                decorations: value.decorations.map(transaction.mapping, transaction.doc),
              };
            },
          },

          props: {
            decorations(state) {
              return legalPaginationKey.getState(state)?.decorations ?? DecorationSet.empty;
            },
          },

          view(view) {
            let timer = 0;
            let applies = 0;
            let lastPageCount = 0;
            let destroyed = false;

            const run = () => {
              if (destroyed || applies > MAX_CONSECUTIVE_APPLIES) return;
              const result = measure(view, options.getGeometry());
              if (!result) return;

              if (result.pageCount !== lastPageCount) {
                lastPageCount = result.pageCount;
                options.onPageCountChange(result.pageCount);
              }

              const current = legalPaginationKey.getState(view.state);
              if (current && sameBreaks(current, result)) return;

              applies += 1;
              view.dispatch(
                view.state.tr
                  .setMeta(legalPaginationKey, { breaks: result.breaks })
                  .setMeta("addToHistory", false)
                  .setMeta("preventUpdate", true)
              );
              scheduleIn(RELAX_DELAY_MS);
            };

            // Timeout puro em vez de requestAnimationFrame: a medição só depende de
            // layout, que getBoundingClientRect força na hora, e assim a paginação
            // continua funcionando com a aba em segundo plano ou sem composição.
            const scheduleIn = (delay: number) => {
              if (destroyed) return;
              window.clearTimeout(timer);
              timer = window.setTimeout(run, delay);
            };
            // Sem argumentos, para servir de ouvinte de evento sem receber o evento como atraso.
            const schedule = () => scheduleIn(MEASURE_DELAY_MS);

            const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
            observer?.observe(view.dom);
            if (view.dom.parentElement) observer?.observe(view.dom.parentElement);
            window.addEventListener("resize", schedule);
            void document.fonts?.ready.then(schedule).catch(() => undefined);
            schedule();

            return {
              update(_view, previousState) {
                if (!previousState.doc.eq(view.state.doc)) applies = 0;
                schedule();
              },
              destroy() {
                destroyed = true;
                window.clearTimeout(timer);
                window.removeEventListener("resize", schedule);
                observer?.disconnect();
              },
            };
          },
        }),
      ];
    },
  });
}

function sameBreaks(state: PaginationState, result: { breaks: PageBreakSpacer[] }): boolean {
  return (
    state.breaks.length === result.breaks.length &&
    state.breaks.every((spacer, index) =>
      spacer.pos === result.breaks[index].pos &&
      Math.abs(spacer.height - result.breaks[index].height) < 0.5)
  );
}

function buildDecorations(doc: ProseMirrorNode, breaks: PageBreakSpacer[]): DecorationSet {
  if (!breaks.length) return DecorationSet.empty;
  const decorations = breaks.flatMap((spacer) => {
    if (spacer.pos <= 0 || spacer.pos > doc.content.size || spacer.height <= 0) return [];
    const inline = doc.resolve(spacer.pos).parent.isTextblock;
    return [
      Decoration.widget(
        spacer.pos,
        () => {
          const element = document.createElement("span");
          element.className = "legal-page-spacer";
          element.setAttribute("data-legal-page-spacer", "");
          element.setAttribute("contenteditable", "false");
          element.setAttribute("aria-hidden", "true");
          element.style.height = `${spacer.height}px`;
          if (!inline) element.style.display = "block";
          return element;
        },
        {
          side: -1,
          marks: [],
          ignoreSelection: true,
          key: `legal-break-${spacer.pos}-${Math.round(spacer.height)}-${inline ? "i" : "b"}`,
        }
      ),
    ];
  });
  return DecorationSet.create(doc, decorations);
}

function measure(
  view: EditorView,
  geometry: LegalPageGeometry
): { breaks: PageBreakSpacer[]; pageCount: number } | null {
  const contentElement = view.dom as HTMLElement;
  if (!contentElement.isConnected) return null;
  const contentRect = contentElement.getBoundingClientRect();
  if (contentRect.height <= 0) return null;

  const millimeter = measureMillimeter();
  if (!millimeter) return null;

  // Área útil de uma folha e distância entre o topo de duas folhas consecutivas.
  const usablePx = (geometry.pageHeightMm - geometry.marginTopMm - geometry.marginBottomMm) * millimeter;
  const stepPx = (geometry.pageHeightMm + geometry.gapMm) * millimeter;
  const minSpacerPx = geometry.gapMm * millimeter;
  // Margens absurdas deixariam a área útil menor que uma linha: melhor não paginar.
  if (usablePx < millimeter * 10) return null;

  // A origem é o topo da área útil da primeira folha, lido da caixa de conteúdo do
  // papel. Não dá para usar o topo do próprio ProseMirror: a margem superior do
  // primeiro parágrafo colapsa para fora dele e desloca o retângulo.
  const host = contentElement.closest(".legal-paper");
  if (!host) return null;
  const hostRect = host.getBoundingClientRect();
  const origin = hostRect.top + Number.parseFloat(getComputedStyle(host).paddingTop || "0");

  const atoms: Atom[] = [];
  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock && !(node.isBlock && node.isLeaf)) return true;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) atoms.push({ pos, node, dom });
    return false;
  });

  const previous = legalPaginationKey.getState(view.state)?.breaks ?? [];
  const items: Item[] = [];

  Array.from(contentElement.querySelectorAll<HTMLElement>("[data-legal-page-spacer]"))
    .map((element) => element.getBoundingClientRect())
    .sort((first, second) => first.top - second.top)
    .forEach((rect, index) => {
      const known = previous[index];
      if (!known) return;
      items.push({ kind: "spacer", top: rect.top - origin, height: rect.height, pos: known.pos });
    });

  atoms.forEach((atom, atomIndex) => {
    if (atom.node.type.name === "pageBreak") {
      if (atomIndex === 0) return;
      const rect = atom.dom.getBoundingClientRect();
      items.push({
        kind: "manual",
        top: rect.bottom - origin,
        pos: atom.pos + atom.node.nodeSize,
      });
      return;
    }
    lineBoxes(atom.dom).forEach((line, lineIndex) => {
      items.push({
        kind: "line",
        top: line.top - origin,
        viewTop: line.top,
        height: line.height,
        left: line.left,
        atom,
        atomIndex,
        lineIndex,
      });
    });
  });

  items.sort((first, second) => first.top - second.top);

  const breaks: PageBreakSpacer[] = [];
  // Trabalhamos nas coordenadas realmente renderizadas. `shift` acumula o quanto o
  // conteúdo abaixo se desloca por causa das alturas que estamos recalculando agora;
  // o topo útil da folha k continua em `k * stepPx` contado do início do texto.
  let page = 0;
  let shift = 0;
  let pending: { pos: number; top: number } | null = null;

  const pushBreak = (position: number, contentTop: number) => {
    const height = Math.max(minSpacerPx, (page + 1) * stepPx - contentTop);
    breaks.push({ pos: position, height });
    page += 1;
    return height;
  };

  const fitsOnPage = (top: number, height: number) =>
    top + height <= page * stepPx + usablePx + OVERFLOW_TOLERANCE_PX;

  items.forEach((item, index) => {
    if (item.kind === "manual") {
      pending = { pos: item.pos, top: item.top };
      return;
    }

    if (item.kind === "spacer") {
      // A quebra manual reaproveita o espaçador que já está logo abaixo dela.
      if (pending && pending.pos === item.pos) {
        shift += pushBreak(item.pos, pending.top + shift) - item.height;
        pending = null;
        return;
      }
      const next = nextFlowItem(items, index);
      // Sem o espaçador o conteúdo seguinte subiria a própria altura dele: se assim
      // ainda couber na folha atual, a quebra ficou obsoleta e é descartada.
      if (next && fitsOnPage(next.top - item.height + shift, next.height)) {
        shift -= item.height;
        return;
      }
      shift += pushBreak(item.pos, item.top + shift) - item.height;
      return;
    }

    if (pending) {
      shift += pushBreak(pending.pos, pending.top + shift);
      pending = null;
    }

    const top = item.top + shift;
    if (fitsOnPage(top, item.height)) return;
    const position = breakPosition(view, item.atom, item, item.atomIndex, item.lineIndex);
    if (position == null) return;
    if (breaks.length && position <= breaks[breaks.length - 1].pos) return;
    shift += pushBreak(position, top);
  });

  return { breaks, pageCount: page + 1 };
}

/** Próximo item que ocupa espaço no fluxo — espaçadores encadeados são ignorados. */
function nextFlowItem(items: Item[], index: number): { top: number; height: number } | null {
  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const item = items[cursor];
    if (item.kind === "line") return { top: item.top, height: item.height };
  }
  return null;
}

/**
 * 1mm em pixels. É lido de uma sonda real em vez de calculado por 96dpi para não
 * escorregar com zoom do navegador ou escala do sistema.
 */
function measureMillimeter(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:0;left:-9999px;width:0;height:100mm;pointer-events:none;";
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height > 0 ? height / 100 : 0;
}

/**
 * Retângulos de cada linha visual do bloco, ignorando os espaçadores que nós mesmos
 * injetamos — senão eles entrariam na conta como se fossem linhas de texto.
 */
function lineBoxes(element: HTMLElement): LineBox[] {
  const rects: DOMRect[] = [];

  const collect = (node: Node) => {
    if (node instanceof HTMLElement && node.hasAttribute("data-legal-page-spacer")) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.nodeValue?.length) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...Array.from(range.getClientRects()));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (!node.childNodes.length) {
      rects.push(node.getBoundingClientRect());
      return;
    }
    node.childNodes.forEach(collect);
  };

  element.childNodes.forEach(collect);

  const usable = rects.filter((rect) => rect.height > 0.5);
  if (!usable.length) {
    const rect = element.getBoundingClientRect();
    return rect.height > 0 ? [{ top: rect.top, left: rect.left, height: rect.height }] : [];
  }

  usable.sort((first, second) => first.top - second.top);
  const lines: LineBox[] = [];
  usable.forEach((rect) => {
    const last = lines[lines.length - 1];
    if (last && rect.top < last.top + Math.max(2, last.height * 0.5)) {
      last.height = Math.max(last.height, rect.bottom - last.top);
      last.left = Math.min(last.left, rect.left);
      return;
    }
    lines.push({ top: rect.top, left: rect.left, height: rect.height });
  });
  return lines;
}

/**
 * Onde cortar. Se a linha que estourou é a primeira do bloco, o bloco inteiro desce;
 * caso contrário cortamos dentro do parágrafo, no começo daquela linha.
 */
function breakPosition(
  view: EditorView,
  atom: Atom,
  line: { viewTop: number; left: number; height: number },
  atomIndex: number,
  lineIndex: number
): number | null {
  if (atomIndex === 0 && lineIndex === 0) return null;
  if (lineIndex === 0 || !atom.node.isTextblock) return atom.pos > 0 ? atom.pos : null;

  const found = view.posAtCoords({ left: line.left + 1, top: line.viewTop + line.height / 2 });
  if (!found) return atom.pos;
  const start = atom.pos + 1;
  const end = atom.pos + atom.node.nodeSize - 1;
  if (found.pos <= start || found.pos >= end) return atom.pos;
  return snapToWordStart(view.state.doc, found.pos, start);
}

/**
 * Recua até o começo da palavra para o espaçador não cair no meio dela. O limite existe
 * porque uma "palavra" gigante sem espaço não deve arrastar a quebra para longe.
 */
function snapToWordStart(doc: ProseMirrorNode, position: number, minPosition: number): number {
  let current = position;
  let steps = 0;
  while (current > minPosition && steps < 60) {
    const before = doc.resolve(current).nodeBefore;
    if (!before?.isText || !before.text) break;
    if (/\s/.test(before.text[before.text.length - 1] ?? "")) break;
    current -= 1;
    steps += 1;
  }
  return current;
}
