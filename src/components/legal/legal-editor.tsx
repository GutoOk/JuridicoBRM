"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileDown,
  Loader2,
  Save,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/download";
import {
  restoreLegalVersion,
  saveLegalDraft,
  saveLegalVersion,
  canManageOwnedLegalEntity,
  getLegalVersionSnapshot,
  type LegalDraftPayload,
} from "@/lib/legal-document-actions";
import {
  findRepeatableBlocks,
  instantiateLegalContent,
  legalExportWarnings,
  newLegalNodeId,
  parseLegalContent,
  parseLegalPageSettings,
  parseLegalStyles,
  relatedClients,
  safeLegalFileName,
  type JSONContent,
} from "@/lib/legal-documents";
import type {
  Client,
  LegalDocument,
  LegalEntityKind,
  LegalPageSettings,
  LegalQuickPart,
  LegalStyleMap,
  LegalTemplate,
  LegalVersion,
  UserProfile,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { legalContentHash, legalEditorExtensions } from "./legal-editor-extensions";
import { LegalEditorSidebar } from "./legal-editor-sidebar";
import { LegalEditorToolbar } from "./legal-editor-toolbar";
import { LegalExportWarningDialog } from "./legal-export-warning-dialog";
import { LegalRepeatSelectionDialog } from "./legal-repeat-selection-dialog";

type LegalEditableEntity = LegalTemplate | LegalDocument | LegalQuickPart;
type SaveStatus = "saved" | "saving" | "unsaved" | "error";
type ExportFormat = "pdf" | "docx";

export function LegalEditor({
  kind,
  entity,
  user,
  isAdmin,
  versions,
  quickParts,
  currentClient,
  allClients = [],
  backHref,
}: {
  kind: LegalEntityKind;
  entity: LegalEditableEntity;
  user: UserProfile;
  isAdmin: boolean;
  versions: LegalVersion[];
  quickParts: LegalQuickPart[];
  currentClient?: Client | null;
  allClients?: Client[];
  backHref: string;
}) {
  const { toast } = useToast();
  const initialName = entityName(entity);
  const [name, setName] = useState(initialName);
  const [styles, setStyles] = useState<LegalStyleMap>(() => parseLegalStyles(entity.stylesJson));
  const [pageSettings, setPageSettings] = useState<LegalPageSettings>(() => parseLegalPageSettings(entity.pageSettingsJson));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [currentVersion, setCurrentVersion] = useState(entity.version);
  const [revision, setRevision] = useState(0);
  const [repeatBlockOpen, setRepeatBlockOpen] = useState(false);
  const [repeatBlockLabel, setRepeatBlockLabel] = useState("");
  const [quickPartForSelection, setQuickPartForSelection] = useState<LegalQuickPart | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<LegalVersion | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [exportWarnings, setExportWarnings] = useState<ReturnType<typeof legalExportWarnings>>([]);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const nameRef = useRef(name);
  const stylesRef = useRef(styles);
  const pageSettingsRef = useRef(pageSettings);
  const mountedRef = useRef(true);

  const canEdit = !entity.deleted && (
    kind === "document" || canManageOwnedLegalEntity(entity as LegalTemplate | LegalQuickPart, user, isAdmin)
  );

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    setSaveStatus("unsaved");
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: legalEditorExtensions(),
    content: parseLegalContent(entity.contentJson),
    editable: canEdit,
    editorProps: {
      attributes: {
        class: "legal-prosemirror min-h-[220mm] outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: markDirty,
  }, [entity.id]);

  nameRef.current = name;
  stylesRef.current = styles;
  pageSettingsRef.current = pageSettings;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  useEffect(() => {
    if (entity.version > currentVersion) setCurrentVersion(entity.version);
  }, [currentVersion, entity.version]);

  const payload = useCallback((): LegalDraftPayload => ({
    name: nameRef.current,
    content: editor?.getJSON() ?? parseLegalContent(entity.contentJson),
    styles: stylesRef.current,
    pageSettings: pageSettingsRef.current,
  }), [editor, entity.contentJson]);

  const queueSave = useCallback((createVersion: boolean): Promise<void> => {
    if (!canEdit) return Promise.resolve();
    const snapshot = payload();
    const savedRevision = revisionRef.current;
    if (!snapshot.name.trim()) {
      setSaveStatus("unsaved");
      return Promise.reject(new Error("Informe o nome antes de salvar."));
    }
    setSaveStatus("saving");
    const task = saveChainRef.current.then(async () => {
      if (createVersion) {
        const nextVersion = await saveLegalVersion(kind, entity.id, snapshot, user);
        if (mountedRef.current) setCurrentVersion(nextVersion);
      } else {
        await saveLegalDraft(kind, entity.id, snapshot, user);
      }
      savedRevisionRef.current = Math.max(savedRevisionRef.current, savedRevision);
      if (mountedRef.current) {
        setSaveStatus(revisionRef.current <= savedRevisionRef.current ? "saved" : "unsaved");
      }
    }).catch((error) => {
      if (mountedRef.current) setSaveStatus("error");
      throw error;
    });
    saveChainRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, [canEdit, entity.id, kind, payload, user]);

  useEffect(() => {
    if (!canEdit || revision === 0 || !name.trim()) return;
    const timer = window.setTimeout(() => {
      void queueSave(false).catch((error) => {
        toast({
          variant: "destructive",
          title: "Não foi possível salvar o rascunho",
          description: errorMessage(error),
        });
      });
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [canEdit, name, queueSave, revision, toast]);

  useEffect(() => {
    const hasUnsavedChanges = () => revisionRef.current > savedRevisionRef.current || saveStatus === "saving" || saveStatus === "error";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      if (!hasUnsavedChanges() || event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!target || target.getAttribute("target") === "_blank") return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (!window.confirm("Ainda há alterações não salvas. Deseja sair mesmo assim?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardLink, true);
    };
  }, [saveStatus]);

  const linkedClients = useMemo(
    () => currentClient ? relatedClients(currentClient, allClients) : [],
    [allClients, currentClient]
  );
  const availableQuickParts = quickParts.filter((part) => !(kind === "quickPart" && part.id === entity.id));

  if (!editor) {
    return <div className="surface flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Carregando editor...</div>;
  }

  const updateName = (value: string) => {
    setName(value);
    markDirty();
  };
  const updateStyles = (value: LegalStyleMap) => {
    setStyles(value);
    markDirty();
  };
  const updatePageSettings = (value: LegalPageSettings) => {
    setPageSettings(value);
    markDirty();
  };

  const explicitSave = async () => {
    try {
      await queueSave(true);
      toast({ title: "Versão salva", description: `Versão ${currentVersion + 1} registrada no histórico.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível salvar a versão", description: errorMessage(error) });
    }
  };

  const createRepeatableBlock = () => {
    const label = repeatBlockLabel.trim();
    if (!label) return;
    const ok = editor.chain().focus().wrapIn("repeatableBlock", {
      blockId: newLegalNodeId("repeat"),
      label,
    }).run();
    if (!ok) {
      toast({ variant: "destructive", title: "Selecione um ou mais parágrafos para criar o bloco" });
      return;
    }
    setRepeatBlockLabel("");
    setRepeatBlockOpen(false);
  };

  const insertQuickPart = (part: LegalQuickPart, selections: Record<string, string[]> = {}) => {
    const sourceContent = parseLegalContent(part.contentJson);
    let copiedContent = sourceContent.content ?? [];
    if (kind === "document" && currentClient) {
      copiedContent = instantiateLegalContent(
        sourceContent,
        currentClient,
        ensureClient(allClients, currentClient),
        selections
      ).content ?? [];
    }
    if (!copiedContent.length) copiedContent = [{ type: "paragraph", attrs: { styleId: "body" } }];
    copiedContent = editor.schema.nodeFromJSON({ type: "doc", content: copiedContent }).content.toJSON();
    editor.chain().focus().insertContent({
      type: "quickPartInstance",
      attrs: {
        sourceId: part.id,
        sourceTitle: part.title,
        sourceVersion: part.version,
        contentHash: legalContentHash(copiedContent),
      },
      content: copiedContent,
    }).run();
  };

  const requestQuickPart = async (part: LegalQuickPart) => {
    try {
      let version = part.version;
      let snapshot = await getLegalVersionSnapshot("quickPart", part.id, version);
      if (
        canManageOwnedLegalEntity(part, user, isAdmin) &&
        legalSnapshotChanged(part, snapshot)
      ) {
        version = await saveLegalVersion("quickPart", part.id, {
          name: part.title,
          content: parseLegalContent(part.contentJson),
          styles: parseLegalStyles(part.stylesJson),
          pageSettings: parseLegalPageSettings(part.pageSettingsJson),
        }, user);
        snapshot = await getLegalVersionSnapshot("quickPart", part.id, version);
      }
      const stablePart: LegalQuickPart = {
        ...part,
        title: snapshot.name,
        contentJson: snapshot.contentJson,
        plainText: snapshot.plainText,
        stylesJson: snapshot.stylesJson,
        pageSettingsJson: snapshot.pageSettingsJson,
      };
      const blocks = findRepeatableBlocks(parseLegalContent(stablePart.contentJson));
      if (kind === "document" && blocks.length) {
        setQuickPartForSelection(stablePart);
        return;
      }
      insertQuickPart(stablePart);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível carregar a parte rápida", description: errorMessage(error) });
    }
  };

  const restoreVersion = async () => {
    if (!restoreTarget) return;
    try {
      if (revisionRef.current > savedRevisionRef.current) await queueSave(false);
      const nextVersion = await restoreLegalVersion(kind, entity, restoreTarget.version, user);
      const restoredName = restoreTarget.name;
      const restoredStyles = parseLegalStyles(restoreTarget.stylesJson);
      const restoredPageSettings = parseLegalPageSettings(restoreTarget.pageSettingsJson);
      editor.commands.setContent(parseLegalContent(restoreTarget.contentJson), { emitUpdate: false });
      setName(restoredName);
      setStyles(restoredStyles);
      setPageSettings(restoredPageSettings);
      nameRef.current = restoredName;
      stylesRef.current = restoredStyles;
      pageSettingsRef.current = restoredPageSettings;
      revisionRef.current += 1;
      savedRevisionRef.current = revisionRef.current;
      setRevision(revisionRef.current);
      setCurrentVersion(nextVersion);
      setSaveStatus("saved");
      setRestoreTarget(null);
      toast({ title: "Versão restaurada", description: `O conteúdo agora está na versão ${nextVersion}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível restaurar a versão", description: errorMessage(error) });
    }
  };

  const requestExport = (format: ExportFormat) => {
    const warnings = legalExportWarnings(editor.getJSON());
    setExportFormat(format);
    setExportWarnings(warnings);
    if (!warnings.length) void performExport(format);
  };

  const performExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      if (canEdit && revisionRef.current > savedRevisionRef.current) await queueSave(false);
      const current = payload();
      const blob = format === "pdf"
        ? await (await import("@/lib/legal-export-pdf")).createLegalPdfBlob(current.name, current.content, current.styles, current.pageSettings)
        : await (await import("@/lib/legal-export-docx")).createLegalDocxBlob(current.name, current.content, current.styles, current.pageSettings);
      downloadBlob(blob, `${safeLegalFileName(current.name)}.${format}`);
      toast({ title: `${format.toUpperCase()} gerado` });
    } catch (error) {
      toast({ variant: "destructive", title: `Não foi possível gerar o ${format.toUpperCase()}`, description: errorMessage(error) });
    } finally {
      setExporting(null);
      setExportFormat(null);
    }
  };

  const paper = pageSettings.paperSize === "LETTER" ? { width: 216, height: 279 } : { width: 210, height: 297 };
  const styleRules = legalStyleRules(styles);
  const source = kind === "document" ? (entity as LegalDocument) : null;

  return (
    <div className="page-shell legal-editor-page">
      <header className="surface flex flex-wrap items-center gap-2 p-2">
        <Button asChild type="button" size="icon" variant="ghost" className="size-8" title="Voltar">
          <Link href={backHref}><ArrowLeft className="size-4" /></Link>
        </Button>
        <div className="min-w-[220px] flex-1">
          <Input
            value={name}
            onChange={(event) => updateName(event.target.value)}
            className="h-8 max-w-xl font-medium"
            aria-label="Nome"
            disabled={!canEdit}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span>Versão {currentVersion}</span>
            {source?.sourceTemplateId && <span>Modelo: {source.sourceTemplateName || "Não informado"} · versão {source.sourceTemplateVersion}</span>}
            {entity.deleted && <span className="text-destructive">Item excluído, aberto somente para consulta</span>}
          </div>
        </div>
        <SaveState status={saveStatus} />
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void explicitSave()} disabled={saveStatus === "saving"}>
            <Save className="mr-1.5 size-3.5" />Salvar versão
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" className="h-8" disabled={!!exporting}>
              {exporting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
              Exportar<ChevronDown className="ml-1 size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => requestExport("pdf")}><FileDown className="mr-2 size-4" />PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => requestExport("docx")}><FileDown className="mr-2 size-4" />DOCX</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <LegalEditorToolbar
        editor={editor}
        styles={styles}
        canEdit={canEdit}
        allowRepeatable={kind !== "document"}
        onInsertRepeatable={() => setRepeatBlockOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        <main className="legal-editor-canvas min-h-[560px] min-w-0 flex-1 overflow-y-auto rounded-md border bg-muted/35 p-2 sm:p-4">
          <style>{styleRules}</style>
          <article
            className="legal-paper legal-editor-scope relative mx-auto bg-white text-black shadow-sm"
            style={{
              width: `min(${paper.width}mm, 100%)`,
              minHeight: `${paper.height}mm`,
              paddingTop: `${pageSettings.marginTop}mm`,
              paddingRight: `${pageSettings.marginRight}mm`,
              paddingBottom: `${pageSettings.marginBottom}mm`,
              paddingLeft: `${pageSettings.marginLeft}mm`,
            }}
          >
            {pageSettings.headerText && (
              <div className="legal-page-header" style={{ top: `${Math.max(4, pageSettings.marginTop * 0.3)}mm`, left: `${pageSettings.marginLeft}mm`, right: `${pageSettings.marginRight}mm` }}>
                {pageSettings.headerText}
              </div>
            )}
            <EditorContent editor={editor} />
            {(pageSettings.footerText || pageSettings.showPageNumbers) && (
              <div className="legal-page-footer" style={{ bottom: `${Math.max(4, pageSettings.marginBottom * 0.3)}mm`, left: `${pageSettings.marginLeft}mm`, right: `${pageSettings.marginRight}mm` }}>
                {[pageSettings.footerText, pageSettings.showPageNumbers ? "Página 1" : ""].filter(Boolean).join(" · ")}
              </div>
            )}
          </article>
        </main>

        <LegalEditorSidebar
          editor={editor}
          kind={kind}
          styles={styles}
          pageSettings={pageSettings}
          versions={versions}
          quickParts={availableQuickParts}
          currentClient={currentClient}
          canEdit={canEdit}
          canManageQuickPart={(part) => canManageOwnedLegalEntity(part, user, isAdmin)}
          onStylesChange={updateStyles}
          onPageSettingsChange={updatePageSettings}
          onInsertQuickPart={requestQuickPart}
          onRestoreVersion={setRestoreTarget}
        />
      </div>

      <Dialog open={repeatBlockOpen} onOpenChange={setRepeatBlockOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar bloco repetível</DialogTitle>
            <DialogDescription>O trecho selecionado será repetido para os clientes vinculados escolhidos ao criar o documento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="repeat-block-name">Nome do bloco</Label>
            <Input id="repeat-block-name" value={repeatBlockLabel} onChange={(event) => setRepeatBlockLabel(event.target.value)} placeholder="Ex.: Contratantes" autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRepeatBlockOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={createRepeatableBlock} disabled={!repeatBlockLabel.trim()}>Criar bloco</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LegalRepeatSelectionDialog
        open={!!quickPartForSelection}
        blocks={quickPartForSelection ? findRepeatableBlocks(parseLegalContent(quickPartForSelection.contentJson)) : []}
        clients={linkedClients}
        title="Inserir parte rápida"
        onOpenChange={(open) => { if (!open) setQuickPartForSelection(null); }}
        onConfirm={(selection) => {
          if (quickPartForSelection) insertQuickPart(quickPartForSelection, selection);
          setQuickPartForSelection(null);
        }}
      />

      <LegalExportWarningDialog
        open={!!exportFormat && exportWarnings.length > 0}
        warnings={exportWarnings}
        onOpenChange={(open) => { if (!open) setExportFormat(null); }}
        onProceed={() => { if (exportFormat) void performExport(exportFormat); }}
      />

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar versão {restoreTarget?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              O rascunho atual será preservado no histórico antes da restauração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restoreVersion()}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveState({ status }: { status: SaveStatus }) {
  const state = {
    saved: { label: "Salvo", icon: <Check className="size-3.5" />, className: "text-emerald-700" },
    saving: { label: "Salvando", icon: <Loader2 className="size-3.5 animate-spin" />, className: "text-muted-foreground" },
    unsaved: { label: "Alterações pendentes", icon: null, className: "text-amber-700" },
    error: { label: "Erro ao salvar", icon: null, className: "text-destructive" },
  }[status];
  return <span className={cn("flex shrink-0 items-center gap-1 text-xs", state.className)}>{state.icon}{state.label}</span>;
}

function entityName(entity: LegalEditableEntity): string {
  return "title" in entity ? entity.title : entity.name;
}

function ensureClient(clients: Client[], client: Client): Client[] {
  return clients.some((item) => item.id === client.id) ? clients : [...clients, client];
}

function legalSnapshotChanged(entity: LegalQuickPart, version: LegalVersion): boolean {
  return entity.title !== version.name ||
    entity.contentJson !== version.contentJson ||
    entity.stylesJson !== version.stylesJson ||
    entity.pageSettingsJson !== version.pageSettingsJson;
}

function legalStyleRules(styles: LegalStyleMap): string {
  return Object.values(styles).map((style) => {
    const id = style.id.replace(/[^a-zA-Z0-9_-]/g, "-");
    const font = ["Times New Roman", "Arial", "Calibri", "Georgia", "Courier New"].includes(style.fontFamily)
      ? style.fontFamily
      : "Times New Roman";
    const alignment = ["left", "center", "right", "justify"].includes(style.alignment)
      ? style.alignment
      : "justify";
    return `.legal-editor-scope .ProseMirror p[data-style-id="${id}"] {
      font-family: "${font}", serif;
      font-size: ${clamp(style.fontSize, 8, 24)}pt;
      font-weight: ${style.bold ? 700 : 400};
      font-style: ${style.italic ? "italic" : "normal"};
      text-decoration: ${style.underline ? "underline" : "none"};
      text-align: ${alignment};
      margin-top: ${clamp(style.spaceBefore, 0, 100)}mm;
      margin-bottom: ${clamp(style.spaceAfter, 0, 100)}mm;
      line-height: ${clamp(style.lineHeight, 0.8, 3)};
      margin-left: ${clamp(style.leftIndent, -50, 100)}mm;
      text-indent: ${clamp(style.firstLineIndent, -50, 100)}mm;
    }`;
  }).join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tente novamente.";
}
