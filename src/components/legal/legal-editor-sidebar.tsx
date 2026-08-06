"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/react";
import {
  BookOpenText,
  Braces,
  Clock3,
  FileCog,
  FilePenLine,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { HelpTip, SearchBox } from "@/components/shared/page-shell";
import {
  createBoundFieldNode,
  customLegalStyle,
  LEGAL_CLIENT_FIELDS,
  LEGAL_FONT_OPTIONS,
  legalPlainText,
  newLegalNodeId,
  parseLegalContent,
  resolveClientField,
} from "@/lib/legal-documents";
import { formatDateTime } from "@/lib/normalize";
import type {
  Client,
  LegalDocument,
  LegalEntityKind,
  LegalPageSettings,
  LegalParagraphStyle,
  LegalQuickPart,
  LegalStyleMap,
  LegalVersion,
} from "@/lib/types";

type PendingField = {
  pos: number;
  nodeSize: number;
  key: string;
  label: string;
  kind: "client" | "manual";
};

export function LegalEditorSidebar({
  editor,
  kind,
  styles,
  pageSettings,
  versions,
  quickParts,
  currentClient,
  canEdit,
  canManageQuickPart,
  onStylesChange,
  onPageSettingsChange,
  onInsertQuickPart,
  onRestoreVersion,
}: {
  editor: Editor;
  kind: LegalEntityKind;
  styles: LegalStyleMap;
  pageSettings: LegalPageSettings;
  versions: LegalVersion[];
  quickParts: LegalQuickPart[];
  currentClient?: Client | null;
  canEdit: boolean;
  canManageQuickPart: (part: LegalQuickPart) => boolean;
  onStylesChange: (styles: LegalStyleMap) => void;
  onPageSettingsChange: (settings: LegalPageSettings) => void;
  onInsertQuickPart: (part: LegalQuickPart) => void;
  onRestoreVersion: (version: LegalVersion) => void;
}) {
  const [fieldSearch, setFieldSearch] = useState("");
  const [partSearch, setPartSearch] = useState("");
  const [manualName, setManualName] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("body");
  const [customStyleOpen, setCustomStyleOpen] = useState(false);
  const [customStyleName, setCustomStyleName] = useState("");
  const [customStyleFromSelection, setCustomStyleFromSelection] = useState(true);
  const [, setEditorRevision] = useState(0);

  useEffect(() => {
    const update = () => setEditorRevision((value) => value + 1);
    editor.on("update", update);
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("update", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  const pendingFields = collectPendingFields(editor);
  const selectedStyle = styles[selectedStyleId] ?? styles.body;
  const visibleFields = LEGAL_CLIENT_FIELDS.filter((field) =>
    field.label.toLocaleLowerCase("pt-BR").includes(fieldSearch.toLocaleLowerCase("pt-BR"))
  );
  const visibleParts = useMemo(() => {
    const term = partSearch.trim().toLocaleLowerCase("pt-BR");
    return quickParts
      .filter((part) => !part.deleted)
      .filter((part) => !term || `${part.title} ${part.plainText}`.toLocaleLowerCase("pt-BR").includes(term))
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }, [partSearch, quickParts]);

  const insertField = (fieldKind: "client" | "manual", fieldKey: string, label: string) => {
    if (!canEdit) return;
    if (kind === "document") {
      editor.chain().focus().insertContent(createBoundFieldNode(
        { fieldKind, fieldKey, label },
        fieldKind === "client" ? currentClient ?? null : null
      )).run();
      return;
    }
    editor.chain().focus().insertContent({
      type: "dynamicField",
      attrs: { fieldKind, fieldKey, label },
    }).run();
  };

  const insertManualField = () => {
    const label = manualName.trim();
    if (!label) return;
    insertField("manual", newLegalNodeId("manual"), label);
    setManualName("");
  };

  const updateStyle = (patch: Partial<LegalParagraphStyle>) => {
    if (!selectedStyle || !canEdit) return;
    onStylesChange({
      ...styles,
      [selectedStyle.id]: { ...selectedStyle, ...patch },
    });
  };

  const createCustomStyle = () => {
    const name = customStyleName.trim();
    if (!name) return;
    const base = customStyleFromSelection ? selectedParagraphFormatting(editor, styles) : undefined;
    const style = customLegalStyle(name, Object.keys(styles).length, base);
    onStylesChange({ ...styles, [style.id]: style });
    setSelectedStyleId(style.id);
    setCustomStyleName("");
    setCustomStyleOpen(false);
  };

  return (
    <aside className="surface flex min-h-0 w-full flex-col overflow-hidden lg:w-[330px] lg:shrink-0">
      <Tabs defaultValue="fields" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="m-1 grid h-9 grid-cols-5">
          <SidebarTab value="fields" label="Campos" icon={<Braces className="size-3.5" />} />
          <SidebarTab value="parts" label="Partes" icon={<BookOpenText className="size-3.5" />} />
          <SidebarTab value="styles" label="Estilos" icon={<Settings2 className="size-3.5" />} />
          <SidebarTab value="page" label="Página" icon={<FileCog className="size-3.5" />} />
          <SidebarTab value="versions" label="Versões" icon={<Clock3 className="size-3.5" />} />
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="fields" className="m-0 space-y-4 p-3">
            {kind === "document" && pendingFields.length > 0 && (
              <section className="space-y-2 border-b pb-3">
                <div>
                  <h2 className="text-sm font-medium">Campos pendentes</h2>
                  <p className="text-xs text-muted-foreground">Preencha o valor e ele passa a ser texto comum.</p>
                </div>
                <div className="space-y-2">
                  {pendingFields.map((field) => (
                    <PendingFieldRow key={`${field.pos}-${field.key}`} editor={editor} field={field} canEdit={canEdit} />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-sm font-medium">Dados do cliente</h2>
              <SearchBox
                value={fieldSearch}
                onChange={setFieldSearch}
                placeholder="Buscar campo"
                className="max-w-none"
              />
              <div className="divide-y rounded-md border">
                {visibleFields.map((field) => {
                  const value = currentClient ? resolveClientField(currentClient, field.key) : "";
                  return (
                    <button
                      key={field.key}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => insertField("client", field.key, field.label)}
                      disabled={!canEdit}
                      title={`Inserir ${field.label}`}
                    >
                      <span className="truncate">{field.label}</span>
                      {kind === "document" && (
                        <span className="max-w-24 truncate text-[11px] text-muted-foreground">{value || "pendente"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2 border-t pt-3">
              <h2 className="text-sm font-medium">Campo manual</h2>
              <div className="flex gap-1.5">
                <Input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      insertManualField();
                    }
                  }}
                  placeholder="Ex.: Prazo em dias"
                  className="h-8 text-xs"
                  disabled={!canEdit}
                />
                <HelpTip label="Inserir campo manual">
                  <Button type="button" size="icon" className="size-8" onClick={insertManualField} disabled={!canEdit || !manualName.trim()}>
                    <Plus className="size-4" />
                  </Button>
                </HelpTip>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="parts" className="m-0 space-y-3 p-3">
            <div>
              <h2 className="text-sm font-medium">Partes rápidas</h2>
              <p className="text-xs text-muted-foreground">A inserção cria uma cópia independente.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={partSearch} onChange={(event) => setPartSearch(event.target.value)} placeholder="Buscar título ou conteúdo" className="h-8 pl-8 text-xs" />
            </div>
            <div className="divide-y rounded-md border">
              {visibleParts.map((part) => (
                <div key={part.id} className="group flex items-start gap-1 px-2 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                    onClick={() => onInsertQuickPart(part)}
                    disabled={!canEdit}
                    title={`Inserir ${part.title}`}
                  >
                    <span className="block truncate text-xs font-medium">{part.title}</span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {legalPlainText(parseLegalContent(part.contentJson)) || "Parte sem conteúdo"}
                    </span>
                  </button>
                  {canManageQuickPart(part) && (
                    <HelpTip label="Editar parte rápida" side="left">
                      <Button asChild type="button" variant="ghost" size="icon" className="size-7 shrink-0">
                        <Link href={`/dashboard/models/parts/${part.id}`}><FilePenLine className="size-3.5" /></Link>
                      </Button>
                    </HelpTip>
                  )}
                </div>
              ))}
              {visibleParts.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Nenhuma parte rápida encontrada.</p>}
            </div>
          </TabsContent>

          <TabsContent value="styles" className="m-0 space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Estilos do documento</h2>
              <HelpTip label="Criar estilo personalizado" side="left">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => {
                    setCustomStyleFromSelection(true);
                    setCustomStyleOpen(true);
                  }}
                  disabled={!canEdit}
                >
                  <Plus className="size-4" />
                </Button>
              </HelpTip>
            </div>
            <Select value={selectedStyle?.id ?? "body"} onValueChange={setSelectedStyleId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(styles).map((style) => <SelectItem key={style.id} value={style.id}>{style.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedStyle && (
              <StyleFields style={selectedStyle} disabled={!canEdit} onChange={updateStyle} />
            )}
          </TabsContent>

          <TabsContent value="page" className="m-0 space-y-3 p-3">
            <h2 className="text-sm font-medium">Configuração da página</h2>
            <FieldLabel label="Tamanho do papel">
              <Select
                value={pageSettings.paperSize}
                onValueChange={(paperSize: LegalPageSettings["paperSize"]) => onPageSettingsChange({ ...pageSettings, paperSize })}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="LETTER">Carta</SelectItem>
                </SelectContent>
              </Select>
            </FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <PageNumberField label="Superior (mm)" value={pageSettings.marginTop} onChange={(marginTop) => onPageSettingsChange({ ...pageSettings, marginTop })} disabled={!canEdit} />
              <PageNumberField label="Inferior (mm)" value={pageSettings.marginBottom} onChange={(marginBottom) => onPageSettingsChange({ ...pageSettings, marginBottom })} disabled={!canEdit} />
              <PageNumberField label="Esquerda (mm)" value={pageSettings.marginLeft} onChange={(marginLeft) => onPageSettingsChange({ ...pageSettings, marginLeft })} disabled={!canEdit} />
              <PageNumberField label="Direita (mm)" value={pageSettings.marginRight} onChange={(marginRight) => onPageSettingsChange({ ...pageSettings, marginRight })} disabled={!canEdit} />
            </div>
            <FieldLabel label="Cabeçalho">
              <Textarea value={pageSettings.headerText} onChange={(event) => onPageSettingsChange({ ...pageSettings, headerText: event.target.value })} className="min-h-16 text-xs" disabled={!canEdit} />
            </FieldLabel>
            <FieldLabel label="Rodapé">
              <Textarea value={pageSettings.footerText} onChange={(event) => onPageSettingsChange({ ...pageSettings, footerText: event.target.value })} className="min-h-16 text-xs" disabled={!canEdit} />
            </FieldLabel>
            <div className="flex items-center justify-between gap-3 rounded-md border px-2 py-2">
              <Label htmlFor="legal-page-numbers" className="text-xs">Numeração de páginas</Label>
              <Switch
                id="legal-page-numbers"
                checked={pageSettings.showPageNumbers}
                onCheckedChange={(showPageNumbers) => onPageSettingsChange({ ...pageSettings, showPageNumbers })}
                disabled={!canEdit}
              />
            </div>
          </TabsContent>

          <TabsContent value="versions" className="m-0 space-y-3 p-3">
            <div>
              <h2 className="text-sm font-medium">Histórico de versões</h2>
              <p className="text-xs text-muted-foreground">O salvamento automático atualiza apenas o rascunho.</p>
            </div>
            <div className="divide-y rounded-md border">
              {[...versions].sort((a, b) => b.version - a.version).map((version) => (
                <div key={version.id} className="flex items-center gap-2 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">Versão {version.version}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {version.createdBy || "Usuário não informado"} · {formatDateTime(version.createdAt)}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onRestoreVersion(version)} disabled={!canEdit}>
                    Restaurar
                  </Button>
                </div>
              ))}
              {versions.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Nenhuma versão disponível.</p>}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <Dialog open={customStyleOpen} onOpenChange={setCustomStyleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar estilo</DialogTitle>
            <DialogDescription>Defina o nome e escolha se deseja copiar a formatação atual.</DialogDescription>
          </DialogHeader>
          <FieldLabel label="Nome">
            <Input value={customStyleName} onChange={(event) => setCustomStyleName(event.target.value)} autoFocus />
          </FieldLabel>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <Label htmlFor="custom-style-from-selection" className="text-xs">Basear no texto selecionado</Label>
            <Switch
              id="custom-style-from-selection"
              checked={customStyleFromSelection}
              onCheckedChange={setCustomStyleFromSelection}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomStyleOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={createCustomStyle} disabled={!customStyleName.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function SidebarTab({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <TabsTrigger value={value} className="h-7 gap-1 px-1 text-[10px]" title={label}>
      {icon}<span className="hidden min-[390px]:inline lg:inline">{label}</span>
    </TabsTrigger>
  );
}

function collectPendingFields(editor: Editor): PendingField[] {
  const fields: PendingField[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "boundField" && node.attrs.missing === true) {
      fields.push({
        pos,
        nodeSize: node.nodeSize,
        key: String(node.attrs.fieldKey ?? node.attrs.label ?? pos),
        label: String(node.attrs.label ?? "Campo pendente"),
        kind: node.attrs.sourceType === "manual" ? "manual" : "client",
      });
    }
    return true;
  });
  return fields;
}

function PendingFieldRow({ editor, field, canEdit }: { editor: Editor; field: PendingField; canEdit: boolean }) {
  const [value, setValue] = useState("");
  const fill = () => {
    const clean = value.trim();
    if (!clean) return;
    const transaction = editor.state.tr.replaceWith(
      field.pos,
      field.pos + field.nodeSize,
      editor.state.schema.text(clean)
    );
    editor.view.dispatch(transaction.scrollIntoView());
    setValue("");
  };
  return (
    <div className="space-y-1 rounded-md border p-2">
      <Label className="text-[11px]">{field.label}</Label>
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              fill();
            }
          }}
          className="h-7 text-xs"
          disabled={!canEdit}
        />
        <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={fill} disabled={!canEdit || !value.trim()}>Preencher</Button>
      </div>
    </div>
  );
}

function StyleFields({
  style,
  disabled,
  onChange,
}: {
  style: LegalParagraphStyle;
  disabled: boolean;
  onChange: (patch: Partial<LegalParagraphStyle>) => void;
}) {
  return (
    <div className="space-y-3">
      <FieldLabel label="Fonte">
        <Select value={style.fontFamily} onValueChange={(fontFamily) => onChange({ fontFamily })} disabled={disabled}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{LEGAL_FONT_OPTIONS.map((font) => <SelectItem key={font} value={font}>{font}</SelectItem>)}</SelectContent>
        </Select>
      </FieldLabel>
      <div className="grid grid-cols-2 gap-2">
        <PageNumberField label="Tamanho (pt)" value={style.fontSize} min={8} max={24} step={1} onChange={(fontSize) => onChange({ fontSize })} disabled={disabled} />
        <FieldLabel label="Alinhamento">
          <Select value={style.alignment} onValueChange={(alignment: LegalParagraphStyle["alignment"]) => onChange({ alignment })} disabled={disabled}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Esquerda</SelectItem>
              <SelectItem value="center">Centralizado</SelectItem>
              <SelectItem value="right">Direita</SelectItem>
              <SelectItem value="justify">Justificado</SelectItem>
            </SelectContent>
          </Select>
        </FieldLabel>
      </div>
      <div className="flex flex-wrap gap-3 rounded-md border p-2">
        <StyleToggle label="Negrito" checked={style.bold} disabled={disabled} onCheckedChange={(bold) => onChange({ bold })} />
        <StyleToggle label="Itálico" checked={style.italic} disabled={disabled} onCheckedChange={(italic) => onChange({ italic })} />
        <StyleToggle label="Sublinhado" checked={style.underline} disabled={disabled} onCheckedChange={(underline) => onChange({ underline })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PageNumberField label="Antes (mm)" value={style.spaceBefore} onChange={(spaceBefore) => onChange({ spaceBefore })} disabled={disabled} />
        <PageNumberField label="Depois (mm)" value={style.spaceAfter} onChange={(spaceAfter) => onChange({ spaceAfter })} disabled={disabled} />
        <PageNumberField label="Recuo esquerdo (mm)" value={style.leftIndent} min={-30} onChange={(leftIndent) => onChange({ leftIndent })} disabled={disabled} />
        <PageNumberField label="Recuo direito (mm)" value={style.rightIndent} min={-30} onChange={(rightIndent) => onChange({ rightIndent })} disabled={disabled} />
        <PageNumberField label="Primeira linha (mm)" value={style.firstLineIndent} min={-30} onChange={(firstLineIndent) => onChange({ firstLineIndent })} disabled={disabled} />
      </div>
      <FieldLabel label="Entre linhas">
        <Select value={String(style.lineHeight)} onValueChange={(value) => onChange({ lineHeight: Number(value) })} disabled={disabled}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[1, 1.15, 1.5, 2].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
        </Select>
      </FieldLabel>
    </div>
  );
}

function StyleToggle({ label, checked, disabled, onCheckedChange }: { label: string; checked: boolean; disabled: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = `style-${label.toLocaleLowerCase("pt-BR")}`;
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} disabled={disabled} />
      <Label htmlFor={id} className="text-xs">{label}</Label>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function PageNumberField({
  label,
  value,
  onChange,
  disabled,
  min = 0,
  max = 100,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <FieldLabel label={label}>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 text-xs"
        disabled={disabled}
      />
    </FieldLabel>
  );
}

function selectedParagraphFormatting(editor: Editor, styles: LegalStyleMap): LegalParagraphStyle {
  const paragraph = editor.getAttributes("paragraph");
  const textStyle = editor.getAttributes("textStyle");
  const base = styles[String(paragraph.styleId ?? "body")] ?? styles.body;
  const directFontSize = Number.parseFloat(String(textStyle.fontSize ?? ""));
  const alignment = ["left", "center", "right", "justify"].includes(String(paragraph.textAlign))
    ? paragraph.textAlign as LegalParagraphStyle["alignment"]
    : base.alignment;
  const fontFamily = LEGAL_FONT_OPTIONS.includes(textStyle.fontFamily)
    ? String(textStyle.fontFamily)
    : base.fontFamily;

  return {
    ...base,
    fontFamily,
    fontSize: Number.isFinite(directFontSize) ? directFontSize : base.fontSize,
    bold: base.bold || editor.isActive("bold"),
    italic: base.italic || editor.isActive("italic"),
    underline: base.underline || editor.isActive("underline"),
    alignment,
    spaceBefore: numberOr(paragraph.spaceBefore, base.spaceBefore),
    spaceAfter: numberOr(paragraph.spaceAfter, base.spaceAfter),
    lineHeight: numberOr(paragraph.lineHeight, base.lineHeight),
    leftIndent: numberOr(paragraph.leftIndent, base.leftIndent),
    rightIndent: numberOr(paragraph.rightIndent, base.rightIndent),
    firstLineIndent: numberOr(paragraph.firstLineIndent, base.firstLineIndent),
  };
}

function numberOr(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
