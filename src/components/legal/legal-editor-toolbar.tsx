"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CornerDownLeft,
  Copy,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  MoveDown,
  MoveUp,
  Pilcrow,
  Redo2,
  RotateCcw,
  SplitSquareVertical,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTip } from "@/components/shared/page-shell";
import { cn } from "@/lib/utils";
import { LEGAL_FONT_OPTIONS } from "@/lib/legal-documents";
import type { LegalListStyle } from "@/lib/legal-lists";
import type { LegalStyleMap } from "@/lib/types";
import {
  changeLegalListLevel,
  continueLegalList,
  duplicateLegalListParagraph,
  moveLegalListParagraph,
  restartLegalList,
  selectionUsesLegalList,
  setLegalParagraphList,
  toggleLegalBulletList,
} from "./legal-editor-list-commands";

const LEGAL_LIST_OPTIONS = [
  { value: "decimal", label: "1., 2., 3." },
  { value: "decimal-hierarchical", label: "1.1 / 1.1.1" },
  { value: "alpha", label: "a), b), c)" },
  { value: "roman", label: "I, II, III" },
  { value: "clause", label: "Cláusula 1ª." },
  { value: "paragraph", label: "§ 1º." },
  { value: "single-paragraph", label: "Parágrafo único" },
] as const;

export function LegalEditorToolbar({
  editor,
  styles,
  canEdit,
  allowRepeatable,
  onInsertRepeatable,
}: {
  editor: Editor;
  styles: LegalStyleMap;
  canEdit: boolean;
  allowRepeatable: boolean;
  onInsertRepeatable: () => void;
}) {
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

  const paragraph = editor.getAttributes("paragraph");
  const textStyle = editor.getAttributes("textStyle");
  const activeStyleId = String(paragraph.styleId ?? "body");
  const activeListStyle = String(paragraph.legalListStyle ?? "decimal");
  const hasLegalList = paragraph.listKind === "bullet" || paragraph.listKind === "ordered";

  const iconButton = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    active = false,
    disabled = false
  ) => (
    <HelpTip label={label}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("size-7", active && "bg-muted text-foreground")}
        onClick={onClick}
        disabled={!canEdit || disabled}
      >
        {icon}
      </Button>
    </HelpTip>
  );

  return (
    <div className="legal-editor-toolbar surface flex min-h-10 flex-wrap items-center gap-1 p-1.5">
      <div className="flex items-center border-r pr-1">
        {iconButton("Desfazer", <Undo2 className="size-4" />, () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
        {iconButton("Refazer", <Redo2 className="size-4" />, () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
      </div>

      <Select
        value={activeStyleId}
        onValueChange={(value) => editor.chain().focus().updateAttributes("paragraph", { styleId: value }).run()}
        disabled={!canEdit}
      >
        <SelectTrigger className="h-7 w-[145px] text-xs" title="Estilo do parágrafo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(styles).map((style) => (
            <SelectItem key={style.id} value={style.id}>{style.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(textStyle.fontFamily ?? "")}
        onValueChange={(value) => editor.chain().focus().setFontFamily(value).run()}
        disabled={!canEdit}
      >
        <SelectTrigger className="h-7 w-[135px] text-xs" title="Fonte direta">
          <SelectValue placeholder="Fonte" />
        </SelectTrigger>
        <SelectContent>
          {LEGAL_FONT_OPTIONS.map((font) => <SelectItem key={font} value={font}>{font}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={String(textStyle.fontSize ?? "")}
        onValueChange={(value) => editor.chain().focus().setFontSize(value).run()}
        disabled={!canEdit}
      >
        <SelectTrigger className="h-7 w-[72px] text-xs" title="Tamanho direto">
          <SelectValue placeholder="Tam." />
        </SelectTrigger>
        <SelectContent>
          {[10, 11, 12, 13, 14, 16, 18].map((size) => (
            <SelectItem key={size} value={`${size}pt`}>{size} pt</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center border-l border-r px-1">
        {iconButton("Negrito", <Bold className="size-4" />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {iconButton("Itálico", <Italic className="size-4" />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
        {iconButton("Sublinhado", <Underline className="size-4" />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
      </div>

      <div className="flex items-center border-r pr-1">
        {iconButton("Alinhar à esquerda", <AlignLeft className="size-4" />, () => editor.chain().focus().setTextAlign("left").run(), editor.isActive({ textAlign: "left" }))}
        {iconButton("Centralizar", <AlignCenter className="size-4" />, () => editor.chain().focus().setTextAlign("center").run(), editor.isActive({ textAlign: "center" }))}
        {iconButton("Alinhar à direita", <AlignRight className="size-4" />, () => editor.chain().focus().setTextAlign("right").run(), editor.isActive({ textAlign: "right" }))}
        {iconButton("Justificar", <AlignJustify className="size-4" />, () => editor.chain().focus().setTextAlign("justify").run(), editor.isActive({ textAlign: "justify" }))}
      </div>

      <Popover>
        <HelpTip label="Recuos e espaçamentos do parágrafo">
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="size-7" disabled={!canEdit}>
              <Pilcrow className="size-4" />
            </Button>
          </PopoverTrigger>
        </HelpTip>
        <PopoverContent className="w-72 space-y-3" align="start">
          <p className="text-sm font-medium">Parágrafo</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Recuo esquerdo (mm)" value={paragraph.leftIndent} onChange={(value) => setParagraphAttribute(editor, "leftIndent", value)} />
            <NumberField label="Recuo direito (mm)" value={paragraph.rightIndent} onChange={(value) => setParagraphAttribute(editor, "rightIndent", value)} />
            <NumberField label="Primeira linha (mm)" value={paragraph.firstLineIndent} onChange={(value) => setParagraphAttribute(editor, "firstLineIndent", value)} />
            <NumberField label="Antes (mm)" value={paragraph.spaceBefore} onChange={(value) => setParagraphAttribute(editor, "spaceBefore", value)} />
            <NumberField label="Depois (mm)" value={paragraph.spaceAfter} onChange={(value) => setParagraphAttribute(editor, "spaceAfter", value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entre linhas</Label>
            <Select
              value={String(paragraph.lineHeight ?? "")}
              onValueChange={(value) => setParagraphAttribute(editor, "lineHeight", Number(value))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Do estilo" /></SelectTrigger>
              <SelectContent>
                {[1, 1.15, 1.5, 2].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex items-center border-l pl-1">
        {iconButton("Lista com marcadores", <List className="size-4" />, () => toggleLegalBulletList(editor), selectionUsesLegalList(editor, "bullet"))}
        <Select
          value={activeListStyle}
          onValueChange={(value) => setLegalParagraphList(editor, "ordered", value as LegalListStyle)}
          disabled={!canEdit}
        >
          <SelectTrigger className="h-7 w-[150px] text-xs" title="Numeração jurídica">
            <ListOrdered className="mr-1 size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEGAL_LIST_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {iconButton("Diminuir nível", <IndentDecrease className="size-4" />, () => changeLegalListLevel(editor, -1), false, !hasLegalList || Number(paragraph.listLevel ?? 0) <= 0)}
        {iconButton("Aumentar nível", <IndentIncrease className="size-4" />, () => changeLegalListLevel(editor, 1), false, !hasLegalList || Number(paragraph.listLevel ?? 0) >= 8)}
        {iconButton("Continuar sequência anterior", <CornerDownLeft className="size-4" />, () => continueLegalList(editor), false, paragraph.listKind !== "ordered")}
        {iconButton("Reiniciar em 1", <RotateCcw className="size-4" />, () => restartLegalList(editor), false, paragraph.listKind !== "ordered")}
        {iconButton("Mover item para cima", <MoveUp className="size-4" />, () => moveLegalListParagraph(editor, -1), false, !hasLegalList)}
        {iconButton("Mover item para baixo", <MoveDown className="size-4" />, () => moveLegalListParagraph(editor, 1), false, !hasLegalList)}
        {iconButton("Duplicar item", <Copy className="size-4" />, () => duplicateLegalListParagraph(editor), false, !hasLegalList)}
      </div>

      <div className="ml-auto flex items-center border-l pl-1">
        {allowRepeatable && iconButton("Marcar seleção como bloco repetível", <SplitSquareVertical className="size-4" />, onInsertRepeatable)}
        {iconButton("Inserir quebra de página", <CornerDownLeft className="size-4 rotate-90" />, () => editor.chain().focus().insertContent({ type: "pageBreak" }).run())}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={-50}
        max={100}
        step={0.5}
        className="h-8 text-xs"
        value={value == null ? "" : String(value)}
        placeholder="Do estilo"
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </div>
  );
}

function setParagraphAttribute(editor: Editor, key: string, value: number | null) {
  editor.chain().focus().updateAttributes("paragraph", { [key]: value }).run();
}
