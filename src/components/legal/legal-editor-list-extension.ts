"use client";

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { LegalListCounter, isLegalListStyle } from "@/lib/legal-lists";

export const LegalParagraphLists = Extension.create({
  name: "legalParagraphLists",
  priority: 1_000,

  addGlobalAttributes() {
    return [{
      types: ["paragraph"],
      attributes: {
        listKind: {
          default: null,
          parseHTML: (element) => {
            const value = element.getAttribute("data-legal-list-kind");
            return value === "bullet" || value === "ordered" ? value : null;
          },
          renderHTML: (attributes) => attributes.listKind
            ? { "data-legal-list-kind": String(attributes.listKind) }
            : {},
        },
        legalListStyle: {
          default: "decimal",
          parseHTML: (element) => {
            const value = element.getAttribute("data-legal-list-style");
            return isLegalListStyle(value) ? value : "decimal";
          },
          renderHTML: (attributes) => attributes.listKind
            ? { "data-legal-list-style": isLegalListStyle(attributes.legalListStyle) ? attributes.legalListStyle : "decimal" }
            : {},
        },
        listLevel: {
          default: 0,
          parseHTML: (element) => Number(element.getAttribute("data-legal-list-level") ?? 0),
          renderHTML: (attributes) => attributes.listKind
            ? { "data-legal-list-level": String(Math.min(8, Math.max(0, Number(attributes.listLevel ?? 0)))) }
            : {},
        },
        listSequenceId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-legal-list-sequence"),
          renderHTML: (attributes) => attributes.listKind && attributes.listSequenceId
            ? { "data-legal-list-sequence": String(attributes.listSequenceId) }
            : {},
        },
        listStart: {
          default: null,
          keepOnSplit: false,
          parseHTML: (element) => {
            const value = Number(element.getAttribute("data-legal-list-start"));
            return Number.isFinite(value) && value >= 1 ? Math.round(value) : null;
          },
          renderHTML: (attributes) => attributes.listKind && attributes.listStart != null
            ? { "data-legal-list-start": String(attributes.listStart) }
            : {},
        },
      },
    }];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        const { $from } = selection;
        if (
          !selection.empty ||
          $from.parent.type.name !== "paragraph" ||
          $from.parentOffset !== 0 ||
          !$from.parent.attrs.listKind
        ) {
          return false;
        }

        const paragraphPos = $from.before($from.depth);
        const transaction = this.editor.state.tr.setNodeMarkup(paragraphPos, undefined, {
          ...$from.parent.attrs,
          listKind: null,
          legalListStyle: "decimal",
          listLevel: 0,
          listSequenceId: null,
          listStart: null,
        });
        this.editor.view.dispatch(transaction.scrollIntoView());
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          const counter = new LegalListCounter();
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph") return true;
            const display = counter.next(node.attrs);
            if (display) {
              decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                "data-legal-list-kind": display.kind,
                "data-legal-list-style": display.style,
                "data-legal-list-level": String(display.level),
                "data-legal-list-label": display.label,
              }));
            }
            return false;
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});
