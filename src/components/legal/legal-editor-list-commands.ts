"use client";

import type { Editor } from "@tiptap/react";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, type Transaction } from "@tiptap/pm/state";
import { newLegalNodeId } from "@/lib/legal-documents";
import type { LegalListKind, LegalListStyle } from "@/lib/legal-lists";

type ParagraphRef = {
  node: ProseMirrorNode;
  pos: number;
};

export function setLegalParagraphList(
  editor: Editor,
  kind: LegalListKind,
  style: LegalListStyle
): boolean {
  const paragraphs = selectedParagraphs(editor);
  if (!paragraphs.length) return false;
  const sequenceId = newLegalNodeId("list");
  const transaction = editor.state.tr;
  paragraphs.forEach(({ node, pos }, index) => {
    transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listKind: kind,
      legalListStyle: style,
      listLevel: node.attrs.listKind ? legalLevel(node.attrs.listLevel) : 0,
      listSequenceId: sequenceId,
      listStart: index === 0 ? 1 : null,
    });
  });
  dispatch(editor, transaction);
  return true;
}

export function toggleLegalBulletList(editor: Editor): boolean {
  const paragraphs = selectedParagraphs(editor);
  if (!paragraphs.length) return false;
  if (paragraphs.every(({ node }) => node.attrs.listKind === "bullet")) {
    return clearLegalParagraphs(editor, paragraphs);
  }
  return setLegalParagraphList(editor, "bullet", "decimal");
}

export function clearLegalParagraphList(editor: Editor): boolean {
  const paragraphs = selectedParagraphs(editor).filter(({ node }) => !!node.attrs.listKind);
  if (!paragraphs.length) return false;
  return clearLegalParagraphs(editor, paragraphs);
}

export function selectionUsesLegalList(
  editor: Editor,
  kind: LegalListKind,
  style?: LegalListStyle
): boolean {
  const paragraphs = selectedParagraphs(editor);
  return paragraphs.length > 0 && paragraphs.every(({ node }) => (
    node.attrs.listKind === kind && (!style || node.attrs.legalListStyle === style)
  ));
}

export function changeLegalListLevel(editor: Editor, delta: -1 | 1): boolean {
  const paragraphs = selectedParagraphs(editor).filter(({ node }) => !!node.attrs.listKind);
  if (!paragraphs.length) return false;
  const transaction = editor.state.tr;
  paragraphs.forEach(({ node, pos }) => {
    transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listLevel: Math.min(8, Math.max(0, legalLevel(node.attrs.listLevel) + delta)),
    });
  });
  dispatch(editor, transaction);
  return true;
}

export function continueLegalList(editor: Editor): boolean {
  const selected = selectedParagraphs(editor).filter(({ node }) => !!node.attrs.listKind);
  const current = selected[0];
  if (!current) return false;

  const all = allParagraphs(editor);
  const currentSequence = String(current.node.attrs.listSequenceId ?? "");
  const targets = currentSequence
    ? all.filter(({ node }) => node.attrs.listSequenceId === currentSequence)
    : selected;
  const firstTargetPos = Math.min(...targets.map(({ pos }) => pos));
  const previous = all.filter(({ node, pos }) => (
    pos < firstTargetPos &&
    node.attrs.listKind === current.node.attrs.listKind &&
    node.attrs.legalListStyle === current.node.attrs.legalListStyle &&
    String(node.attrs.listSequenceId ?? "") !== currentSequence
  )).at(-1);
  if (!previous) return false;

  const previousSequence = String(previous.node.attrs.listSequenceId || newLegalNodeId("list"));
  const transaction = editor.state.tr;
  if (!previous.node.attrs.listSequenceId) {
    transaction.setNodeMarkup(previous.pos, undefined, {
      ...previous.node.attrs,
      listSequenceId: previousSequence,
    });
  }
  targets.forEach(({ node, pos }) => {
    transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listSequenceId: previousSequence,
      listStart: null,
    });
  });
  dispatch(editor, transaction);
  return true;
}

export function restartLegalList(editor: Editor, start = 1): boolean {
  const selected = selectedParagraphs(editor).filter(({ node }) => !!node.attrs.listKind);
  const current = selected[0];
  if (!current) return false;
  const normalizedStart = Number.isFinite(start)
    ? Math.min(1_000_000, Math.max(1, Math.round(start)))
    : 1;
  const currentSequence = String(current.node.attrs.listSequenceId ?? "");
  const targets = editor.state.selection.empty && currentSequence
    ? allParagraphs(editor).filter(({ node, pos }) => (
        pos >= current.pos && node.attrs.listSequenceId === currentSequence
      ))
    : selected;
  const sequenceId = newLegalNodeId("list");
  const transaction = editor.state.tr;
  targets.forEach(({ node, pos }, index) => {
    transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listSequenceId: sequenceId,
      listStart: index === 0 ? normalizedStart : null,
    });
  });
  dispatch(editor, transaction);
  return true;
}

export function moveLegalListParagraph(editor: Editor, direction: -1 | 1): boolean {
  const context = paragraphContext(editor);
  if (!context || !context.paragraph.attrs.listKind) return false;
  const nextIndex = context.index + direction;
  if (nextIndex < 0 || nextIndex >= context.parent.childCount) return false;

  const children = Array.from(
    { length: context.parent.childCount },
    (_, index) => context.parent.child(index)
  );
  [children[context.index], children[nextIndex]] = [children[nextIndex], children[context.index]];
  const replacement = context.parent.copy(Fragment.fromArray(children));
  const transaction = editor.state.tr;
  if (context.parentDepth === 0) {
    transaction.replaceWith(0, editor.state.doc.content.size, replacement.content);
  } else {
    transaction.replaceWith(context.parentPos, context.parentPos + context.parent.nodeSize, replacement);
  }
  const contentStart = context.parentDepth === 0 ? 0 : context.parentPos + 1;
  const offset = children.slice(0, nextIndex).reduce((total, child) => total + child.nodeSize, 0);
  transaction.setSelection(Selection.near(transaction.doc.resolve(contentStart + offset + 1)));
  dispatch(editor, transaction);
  return true;
}

export function duplicateLegalListParagraph(editor: Editor): boolean {
  const context = paragraphContext(editor);
  if (!context || !context.paragraph.attrs.listKind) return false;
  const contentStart = context.parentDepth === 0 ? 0 : context.parentPos + 1;
  const offset = Array.from({ length: context.index + 1 }, (_, index) => context.parent.child(index).nodeSize)
    .reduce((total, nodeSize) => total + nodeSize, 0);
  const insertAt = contentStart + offset;
  const transaction = editor.state.tr.insert(insertAt, context.paragraph);
  transaction.setSelection(Selection.near(transaction.doc.resolve(insertAt + 1)));
  dispatch(editor, transaction);
  return true;
}

function clearLegalParagraphs(editor: Editor, paragraphs: ParagraphRef[]): boolean {
  const transaction = editor.state.tr;
  paragraphs.forEach(({ node, pos }) => {
    transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listKind: null,
      legalListStyle: "decimal",
      listLevel: 0,
      listSequenceId: null,
      listStart: null,
    });
  });
  dispatch(editor, transaction);
  return true;
}

function selectedParagraphs(editor: Editor): ParagraphRef[] {
  const { selection, doc } = editor.state;
  if (selection.empty) {
    const { $from } = selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === "paragraph") return [{ node, pos: $from.before(depth) }];
    }
    return [];
  }

  const paragraphs: ParagraphRef[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return true;
    const contentFrom = pos + 1;
    const contentTo = pos + node.nodeSize - 1;
    const touches = contentFrom === contentTo
      ? selection.from <= contentFrom && selection.to >= contentTo
      : selection.from < contentTo && selection.to > contentFrom;
    if (touches) paragraphs.push({ node, pos });
    return false;
  });
  return paragraphs;
}

function allParagraphs(editor: Editor): ParagraphRef[] {
  const paragraphs: ParagraphRef[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "paragraph") {
      paragraphs.push({ node, pos });
      return false;
    }
    return true;
  });
  return paragraphs;
}

function paragraphContext(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const paragraph = $from.node(depth);
    if (paragraph.type.name !== "paragraph") continue;
    const parentDepth = depth - 1;
    return {
      paragraph,
      parent: $from.node(parentDepth),
      parentDepth,
      parentPos: parentDepth === 0 ? 0 : $from.before(parentDepth),
      index: $from.index(parentDepth),
    };
  }
  return null;
}

function legalLevel(value: unknown): number {
  const number = Number(value ?? 0);
  return Math.min(8, Math.max(0, Number.isFinite(number) ? Math.round(number) : 0));
}

function dispatch(editor: Editor, transaction: Transaction) {
  editor.view.dispatch(transaction.scrollIntoView());
  editor.commands.focus();
}
