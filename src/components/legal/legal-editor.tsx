"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
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
  LEGAL_VERSION_LABEL_MAX,
  type LegalDraftPayload,
} from "@/lib/legal-document-actions";
import {
  findRepeatableBlocks,
  instantiateLegalContent,
  legalChromeAutoPageNumber,
  legalChromeContent,
  legalExportWarnings,
  legalStyleRules,
  newLegalNodeId,
  parseLegalContent,
  parseLegalPageSettings,
  parseLegalStyles,
  relatedClients,
  safeLegalFileName,
  sanitizeLegalChromeContent,
  LEGAL_PAGE_GAP_MM,
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
import {
  legalContentHash,
  legalEditorExtensions,
  legalHeaderFooterExtensions,
} from "./legal-editor-extensions";
import { LegalDocumentRuler } from "./legal-document-ruler";
import { LegalEditorSidebar } from "./legal-editor-sidebar";
import { LegalEditorToolbar } from "./legal-editor-toolbar";
import { LegalExportWarningDialog } from "./legal-export-warning-dialog";
import { LegalChromeView } from "./legal-page-chrome";
import { LegalRepeatSelectionDialog } from "./legal-repeat-selection-dialog";
import { LegalVersionPreviewDialog } from "./legal-version-preview-dialog";
import { LegalVerticalRuler } from "./legal-vertical-ruler";

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
  const [previewVersion, setPreviewVersion] = useState<LegalVersion | null>(null);
  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [exportWarnings, setExportWarnings] = useState<ReturnType<typeof legalExportWarnings>>([]);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [chromeMode, setChromeMode] = useState(false);
  const [chromeArea, setChromeArea] = useState<"header" | "footer">("header");
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const currentVersionRef = useRef(entity.version);
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

  const updatePageSettings = useCallback((value: LegalPageSettings) => {
    pageSettingsRef.current = value;
    setPageSettings(value);
    markDirty();
  }, [markDirty]);

  const paper = pageSettings.paperSize === "LETTER" ? { width: 216, height: 279 } : { width: 210, height: 297 };
  const paperRef = useRef(paper);
  paperRef.current = paper;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: legalEditorExtensions({
      getGeometry: () => ({
        pageHeightMm: paperRef.current.height,
        marginTopMm: pageSettingsRef.current.marginTop,
        marginBottomMm: pageSettingsRef.current.marginBottom,
        gapMm: LEGAL_PAGE_GAP_MM,
      }),
      onPageCountChange: (value) => {
        if (mountedRef.current) setPageCount(value);
      },
    }),
    content: parseLegalContent(entity.contentJson),
    editable: canEdit,
    editorProps: {
      attributes: {
        class: "legal-prosemirror outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: markDirty,
  }, [entity.id]);

  const headerEditor = useChromeEditor(entity, "header", pageSettingsRef, updatePageSettings);
  const footerEditor = useChromeEditor(entity, "footer", pageSettingsRef, updatePageSettings);

  nameRef.current = name;
  stylesRef.current = styles;
  pageSettingsRef.current = pageSettings;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // No modo cabeçalho/rodapé o corpo fica travado, e vice-versa: só uma área aceita
  // digitação por vez, do mesmo jeito que o Word faz.
  useEffect(() => {
    editor?.setEditable(canEdit && !chromeMode);
    headerEditor?.setEditable(canEdit && chromeMode);
    footerEditor?.setEditable(canEdit && chromeMode);
  }, [canEdit, chromeMode, editor, footerEditor, headerEditor]);

  useEffect(() => {
    if (!canEdit && chromeMode) setChromeMode(false);
  }, [canEdit, chromeMode]);

  useEffect(() => {
    if (entity.version > currentVersion) setCurrentVersion(entity.version);
  }, [currentVersion, entity.version]);

  // Máximo porque a gravação atualiza a ref antes do estado: um render intermediário
  // não pode fazer a versão andar para trás.
  currentVersionRef.current = Math.max(currentVersionRef.current, currentVersion);

  const payload = useCallback((): LegalDraftPayload => ({
    name: nameRef.current,
    content: editor?.getJSON() ?? parseLegalContent(entity.contentJson),
    styles: stylesRef.current,
    pageSettings: pageSettingsRef.current,
  }), [editor, entity.contentJson]);

  /** Resolve com a versão vigente depois da gravação, que pode não ter mudado. */
  const queueSave = useCallback((createVersion: boolean, label = ""): Promise<number> => {
    if (!canEdit) return Promise.resolve(currentVersionRef.current);
    const snapshot = payload();
    const savedRevision = revisionRef.current;
    if (!snapshot.name.trim()) {
      setSaveStatus("unsaved");
      return Promise.reject(new Error("Informe o nome antes de salvar."));
    }
    setSaveStatus("saving");
    const task = saveChainRef.current.then(async () => {
      let version = currentVersionRef.current;
      if (createVersion) {
        version = await saveLegalVersion(kind, entity.id, snapshot, user, label);
        currentVersionRef.current = version;
        if (mountedRef.current) setCurrentVersion(version);
      } else {
        await saveLegalDraft(kind, entity.id, snapshot, user);
      }
      savedRevisionRef.current = Math.max(savedRevisionRef.current, savedRevision);
      if (mountedRef.current) {
        setSaveStatus(revisionRef.current <= savedRevisionRef.current ? "saved" : "unsaved");
      }
      return version;
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

  const explicitSave = async () => {
    const previousVersion = currentVersion;
    const label = versionLabel.trim();
    try {
      const saved = await queueSave(true, label);
      setVersionLabel("");
      setSaveVersionOpen(false);
      // Sem alteração em relação ao último marco, nenhuma versão nova é criada.
      toast(saved === previousVersion
        ? { title: "Nada mudou desde a última versão", description: `O histórico continua na versão ${saved}.` }
        : { title: "Versão salva", description: `Versão ${saved} registrada no histórico.` });
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
      // A restauração devolve a versão vigente sem criar marco quando o documento já
      // estava idêntico ao escolhido: nesse caso não há nada a recarregar nem a avisar.
      if (nextVersion === currentVersion) {
        setRestoreTarget(null);
        toast({ title: "O documento já está nesta versão", description: "Nada foi alterado." });
        return;
      }
      const restoredName = restoreTarget.name;
      const restoredStyles = parseLegalStyles(restoreTarget.stylesJson);
      const restoredPageSettings = parseLegalPageSettings(restoreTarget.pageSettingsJson);
      editor.commands.setContent(parseLegalContent(restoreTarget.contentJson), { emitUpdate: false });
      headerEditor?.commands.setContent(legalChromeContent(restoredPageSettings, "header"), { emitUpdate: false });
      footerEditor?.commands.setContent(legalChromeContent(restoredPageSettings, "footer"), { emitUpdate: false });
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

  const styleRules = legalStyleRules(styles);
  const source = kind === "document" ? (entity as LegalDocument) : null;
  const pageStepMm = paper.height + LEGAL_PAGE_GAP_MM;
  const stackHeightMm = pageCount * pageStepMm - LEGAL_PAGE_GAP_MM;
  const pages = Array.from({ length: pageCount }, (_, index) => index);
  const headerOffsetMm = Math.max(4, pageSettings.marginTop * 0.3);
  const footerOffsetMm = Math.max(8, pageSettings.marginBottom * 0.35);
  const headerDoc = legalChromeContent(pageSettings, "header");
  const footerDoc = legalChromeContent(pageSettings, "footer");
  const autoPageNumber = legalChromeAutoPageNumber(pageSettings);
  const chromeEditor = chromeArea === "header" ? headerEditor : footerEditor;

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
            <span title="Contagem aproximada, calculada pela tela — a exportação pode variar por uma linha">
              {pageCount === 1 ? "1 página" : `${pageCount} páginas`}
            </span>
            {source?.sourceTemplateId && <span>Modelo: {source.sourceTemplateName || "Não informado"} · versão {source.sourceTemplateVersion}</span>}
            {entity.deleted && <span className="text-destructive">Item excluído, aberto somente para consulta</span>}
          </div>
        </div>
        <SaveState status={saveStatus} />
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => { setVersionLabel(""); setSaveVersionOpen(true); }}
            disabled={saveStatus === "saving"}
          >
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
        editor={chromeMode && chromeEditor ? chromeEditor : editor}
        styles={styles}
        canEdit={canEdit}
        allowRepeatable={kind !== "document"}
        chromeMode={chromeMode}
        onToggleChromeMode={() => {
          const next = !chromeMode;
          setChromeMode(next);
          if (next) {
            setChromeArea("header");
            window.setTimeout(() => headerEditor?.commands.focus("end"), 0);
          } else {
            window.setTimeout(() => editor.commands.focus(), 0);
          }
        }}
        onInsertRepeatable={() => setRepeatBlockOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        <main className="legal-editor-canvas min-h-[560px] min-w-0 flex-1 overflow-y-auto rounded-md border bg-muted/35 px-2 pb-2 sm:px-4 sm:pb-4">
          <style>{styleRules}</style>
          {chromeMode && (
            <p className="legal-chrome-banner">
              Editando cabeçalho e rodapé. O texto do documento está temporariamente bloqueado.
            </p>
          )}
          <div className="legal-stage">
            <div className="legal-stage-gutter" aria-hidden={!canEdit}>
              <div className="legal-stage-corner" />
              <LegalVerticalRuler
                pageSettings={pageSettings}
                pageHeightMm={paper.height}
                pageGapMm={LEGAL_PAGE_GAP_MM}
                pageCount={pageCount}
                canEdit={canEdit && !chromeMode}
                onPageSettingsChange={updatePageSettings}
              />
            </div>

            <div className="legal-stage-main" style={{ width: `min(${paper.width}mm, 100%)` }}>
              <LegalDocumentRuler
                editor={editor}
                styles={styles}
                pageSettings={pageSettings}
                canEdit={canEdit && !chromeMode}
                onPageSettingsChange={updatePageSettings}
              />

              <div className="legal-pages" style={{ minHeight: `${stackHeightMm}mm` }}>
                {pages.map((page) => (
                  <div
                    key={`sheet-${page}`}
                    className="legal-sheet"
                    style={{ top: `${page * pageStepMm}mm`, height: `${paper.height}mm` }}
                    aria-hidden="true"
                  >
                    <span className="legal-sheet-number">{page + 1}</span>
                  </div>
                ))}

                {pages.map((page) => (
                  <div
                    key={`chrome-${page}`}
                    className={cn("legal-sheet-chrome", chromeMode && page === 0 && "is-editing")}
                    style={{ top: `${page * pageStepMm}mm`, height: `${paper.height}mm` }}
                  >
                    <div
                      className={cn("legal-page-header", chromeMode && page === 0 && chromeArea === "header" && "is-active")}
                      style={{ top: `${headerOffsetMm}mm`, left: `${pageSettings.marginLeft}mm`, right: `${pageSettings.marginRight}mm` }}
                      onPointerDown={() => { if (chromeMode && page === 0) setChromeArea("header"); }}
                    >
                      {chromeMode && page === 0
                        ? <EditorContent editor={headerEditor} />
                        : <LegalChromeView content={headerDoc} pageNumber={page + 1} totalPages={pageCount} autoPageNumber={false} />}
                    </div>
                    <div
                      className={cn("legal-page-footer", chromeMode && page === 0 && chromeArea === "footer" && "is-active")}
                      style={{ bottom: `${footerOffsetMm}mm`, left: `${pageSettings.marginLeft}mm`, right: `${pageSettings.marginRight}mm` }}
                      onPointerDown={() => { if (chromeMode && page === 0) setChromeArea("footer"); }}
                    >
                      {chromeMode && page === 0
                        ? <EditorContent editor={footerEditor} />
                        : <LegalChromeView content={footerDoc} pageNumber={page + 1} totalPages={pageCount} autoPageNumber={autoPageNumber} />}
                    </div>
                  </div>
                ))}

                <article
                  className={cn("legal-paper legal-editor-scope", chromeMode && "is-dimmed")}
                  style={{
                    minHeight: `${stackHeightMm}mm`,
                    paddingTop: `${pageSettings.marginTop}mm`,
                    paddingRight: `${pageSettings.marginRight}mm`,
                    paddingBottom: `${pageSettings.marginBottom}mm`,
                    paddingLeft: `${pageSettings.marginLeft}mm`,
                    ["--legal-page-margin-left" as string]: `${pageSettings.marginLeft}mm`,
                    ["--legal-page-margin-right" as string]: `${pageSettings.marginRight}mm`,
                  }}
                >
                  <div
                    className="legal-paragraph-selection-gutter"
                    style={{
                      top: `${pageSettings.marginTop}mm`,
                      bottom: `${pageSettings.marginBottom}mm`,
                      width: `${pageSettings.marginLeft}mm`,
                    }}
                    title="Selecionar parágrafo nesta altura"
                    onPointerDown={(event) => {
                      if (event.button !== 0 || chromeMode) return;
                      event.preventDefault();
                      selectParagraphAtY(editor, event.clientY);
                    }}
                  />
                  <EditorContent editor={editor} />
                </article>
              </div>
            </div>
          </div>
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
          onPreviewVersion={setPreviewVersion}
          currentVersion={currentVersion}
          onEditChrome={() => {
            setChromeMode(true);
            setChromeArea("header");
            window.setTimeout(() => headerEditor?.commands.focus("end"), 0);
          }}
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

      <Dialog open={saveVersionOpen} onOpenChange={setSaveVersionOpen}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="space-y-4"
            onSubmit={(event) => { event.preventDefault(); void explicitSave(); }}
          >
            <DialogHeader>
              <DialogTitle className="text-base">Salvar versão</DialogTitle>
              <DialogDescription>
                Um marco no histórico, separado do salvamento automático. O rótulo é opcional e serve para você reconhecer esta versão depois.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label htmlFor="legal-version-label" className="text-xs">Rótulo</Label>
              <Input
                id="legal-version-label"
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
                maxLength={LEGAL_VERSION_LABEL_MAX}
                placeholder="Ex.: antes de enviar ao cliente"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveVersionOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveStatus === "saving"}>Salvar versão</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <LegalVersionPreviewDialog
        version={previewVersion}
        versions={versions}
        currentVersion={currentVersion}
        canRestore={canEdit}
        onOpenChange={(open) => { if (!open) setPreviewVersion(null); }}
        onRestore={(version) => {
          setPreviewVersion(null);
          setRestoreTarget(version);
        }}
      />

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar versão {restoreTarget?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              O conteúdo desta versão volta a ser o atual. Se houver alterações ainda não
              marcadas como versão, elas são preservadas no histórico antes da troca.
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

/**
 * Editor dedicado do cabeçalho ou do rodapé. Vive fora do documento principal: são áreas
 * de página, não conteúdo, e mantê-las separadas evita que apareçam no fluxo do texto,
 * no histórico de desfazer do corpo ou nos blocos repetíveis.
 */
function useChromeEditor(
  entity: LegalEditableEntity,
  area: "header" | "footer",
  pageSettingsRef: MutableRefObject<LegalPageSettings>,
  onChange: (settings: LegalPageSettings) => void
) {
  return useEditor({
    immediatelyRender: false,
    extensions: legalHeaderFooterExtensions(),
    content: legalChromeContent(parseLegalPageSettings(entity.pageSettingsJson), area),
    editable: false,
    editorProps: {
      attributes: {
        class: "legal-chrome-prosemirror outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      const content = sanitizeLegalChromeContent(editor.getJSON());
      if (!content) return;
      onChange(area === "header"
        ? { ...pageSettingsRef.current, headerContent: content }
        : { ...pageSettingsRef.current, footerContent: content });
    },
  }, [entity.id]);
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

function selectParagraphAtY(editor: Editor, clientY: number): boolean {
  const paragraph = Array.from(editor.view.dom.querySelectorAll("p")).find((element) => {
    const rect = element.getBoundingClientRect();
    return clientY >= rect.top - 2 && clientY <= rect.bottom + 2;
  });
  if (!paragraph) return false;

  const position = editor.view.posAtDOM(paragraph, 0);
  const $position = editor.state.doc.resolve(position);
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.name !== "paragraph") continue;
    editor.chain().focus().setTextSelection({
      from: $position.start(depth),
      to: $position.end(depth),
    }).run();
    return true;
  }
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tente novamente.";
}
