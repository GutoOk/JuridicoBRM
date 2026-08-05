"use client";

import { Extension, Node, mergeAttributes, type Extensions, type JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";

export const DynamicField = Node.create({
  name: "dynamicField",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      fieldKind: { default: "client" },
      fieldKey: { default: "" },
      label: { default: "Campo" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-legal-dynamic-field]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-legal-dynamic-field": "",
        contenteditable: "false",
      }),
      `[${String(HTMLAttributes.label ?? "Campo")}]`,
    ];
  },
});

export const BoundField = Node.create({
  name: "boundField",
  inline: true,
  group: "inline",
  content: "text*",
  marks: "_",
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      sourceType: { default: "client" },
      fieldKey: { default: "" },
      label: { default: "Campo" },
      sourceClientId: { default: null },
      missing: { default: false },
      originalValue: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-legal-bound-field]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-legal-bound-field": "",
        "data-missing": HTMLAttributes.missing ? "true" : "false",
        title: HTMLAttributes.missing
          ? `Preencha: ${String(HTMLAttributes.label ?? "campo")}`
          : `Dado do cadastro: ${String(HTMLAttributes.label ?? "campo")}`,
      }),
      0,
    ];
  },
});

export const PageBreakNode = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-legal-page-break]" }];
  },

  renderHTML() {
    return ["div", { "data-legal-page-break": "", contenteditable: "false" }];
  },
});

export const RepeatableBlock = Node.create({
  name: "repeatableBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: "" },
      label: { default: "Bloco repetível" },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-legal-repeatable-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-legal-repeatable-block": "",
        "data-label": String(HTMLAttributes.label ?? "Bloco repetível"),
      }),
      0,
    ];
  },
});

export const QuickPartInstance = Node.create({
  name: "quickPartInstance",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      sourceId: { default: "" },
      sourceTitle: { default: "Parte rápida" },
      sourceVersion: { default: 1 },
      contentHash: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-legal-quick-part]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-legal-quick-part": "",
        "data-label": String(HTMLAttributes.sourceTitle ?? "Parte rápida"),
      }),
      0,
    ];
  },
});

const ParagraphFormatting = Extension.create({
  name: "legalParagraphFormatting",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          styleId: {
            default: "body",
            parseHTML: (element) => element.getAttribute("data-style-id") || "body",
            renderHTML: (attributes) => ({ "data-style-id": attributes.styleId || "body" }),
          },
          spaceBefore: numericParagraphAttribute("margin-top", "data-space-before"),
          spaceAfter: numericParagraphAttribute("margin-bottom", "data-space-after"),
          lineHeight: numericParagraphAttribute("line-height", "data-line-height", ""),
          leftIndent: numericParagraphAttribute("margin-left", "data-left-indent"),
          firstLineIndent: numericParagraphAttribute("text-indent", "data-first-line-indent"),
        },
      },
      {
        types: ["orderedList"],
        attributes: {
          legalStyle: {
            default: "decimal",
            parseHTML: (element) => element.getAttribute("data-legal-style") || "decimal",
            renderHTML: (attributes) => ({
              "data-legal-style": attributes.legalStyle || "decimal",
              style: `--legal-list-start: ${Math.max(0, Number(attributes.start ?? 1) - 1)}`,
            }),
          },
        },
      },
    ];
  },
});

function numericParagraphAttribute(cssProperty: string, dataAttribute: string, unit = "mm") {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute(dataAttribute);
      return value == null ? null : Number(value);
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const attributeName = dataAttribute.replace("data-", "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = attributes[attributeName];
      if (value == null || value === "") return {};
      return {
        [dataAttribute]: String(value),
        style: `${cssProperty}: ${String(value)}${unit}`,
      };
    },
  };
}

export function legalContentHash(content: JSONContent[] | undefined): string {
  const source = JSON.stringify(content ?? []);
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

const LinkedContentCleanup = Extension.create({
  name: "linkedContentCleanup",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const replacements: { from: number; to: number; content: typeof newState.doc.content }[] = [];
          newState.doc.descendants((node, pos) => {
            if (
              node.type.name === "boundField" &&
              node.textContent !== String(node.attrs.originalValue ?? "")
            ) {
              replacements.push({ from: pos, to: pos + node.nodeSize, content: node.content });
            }
            if (
              node.type.name === "quickPartInstance" &&
              legalContentHash(node.content.toJSON()) !== String(node.attrs.contentHash ?? "")
            ) {
              replacements.push({ from: pos, to: pos + node.nodeSize, content: node.content });
            }
            return true;
          });
          if (!replacements.length) return null;
          const transaction = newState.tr;
          replacements
            .filter(
              (candidate) =>
                !replacements.some(
                  (other) =>
                    other !== candidate &&
                    other.from < candidate.from &&
                    other.to >= candidate.to
                )
            )
            .sort((a, b) => b.from - a.from)
            .forEach((replacement) => {
              transaction.replaceWith(replacement.from, replacement.to, replacement.content);
            });
          return transaction;
        },
      }),
    ];
  },
});

export function legalEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      link: false,
      strike: false,
    }),
    TextStyle,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ["paragraph"] }),
    ParagraphFormatting,
    DynamicField,
    BoundField,
    PageBreakNode,
    RepeatableBlock,
    QuickPartInstance,
    LinkedContentCleanup,
  ];
}
