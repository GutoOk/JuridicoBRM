"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  Edit3,
  EllipsisVertical,
  FilePlus2,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, SearchBox, Toolbar } from "@/components/shared/page-shell";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  createLegalDocument,
  canManageOwnedLegalEntity,
  duplicateLegalDocument,
  getLegalVersionSnapshot,
  saveLegalVersion,
  setLegalEntityDeleted,
} from "@/lib/legal-document-actions";
import { downloadBlob } from "@/lib/download";
import {
  findRepeatableBlocks,
  instantiateLegalContent,
  legalExportWarnings,
  normalizeLegalName,
  parseLegalContent,
  parseLegalPageSettings,
  parseLegalStyles,
  relatedClients,
  safeLegalFileName,
} from "@/lib/legal-documents";
import { dateMillis, formatDateTime } from "@/lib/normalize";
import type { Client, LegalDocument, LegalTemplate, LegalVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LegalExportWarningDialog } from "./legal-export-warning-dialog";
import { LegalRepeatSelectionDialog } from "./legal-repeat-selection-dialog";

type ExportTarget = { document: LegalDocument; format: "pdf" | "docx" };

export function ClientDocumentsTab({ client, allClients }: { client: Client; allClients: Client[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: documents } = useCollection<LegalDocument>(
    "legalDocuments",
    { where: [["clientId", "==", client.id]] },
    [client.id]
  );
  const { data: templates } = useCollection<LegalTemplate>("legalTemplates", { where: [["deleted", "==", false]] });
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LegalDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const visibleDocuments = useMemo(() => {
    const term = normalizeLegalName(search);
    return (documents ?? [])
      .filter((document) => showDeleted ? document.deleted : !document.deleted)
      .filter((document) => !term || normalizeLegalName(`${document.name} ${document.sourceTemplateName} ${document.createdBy}`).includes(term))
      .sort((a, b) => dateMillis(b.updatedAt ?? b.createdAt) - dateMillis(a.updatedAt ?? a.createdAt));
  }, [documents, search, showDeleted]);

  const duplicate = async (document: LegalDocument) => {
    if (!user) return;
    setBusy(true);
    try {
      const id = await duplicateLegalDocument(document, user);
      toast({ title: "Documento duplicado" });
      router.push(`/dashboard/documents/${id}`);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível duplicar", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user || !deleteTarget) return;
    setBusy(true);
    try {
      await setLegalEntityDeleted("document", deleteTarget.id, true, user);
      toast({ title: "Documento excluído" });
      setDeleteTarget(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível excluir", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (document: LegalDocument) => {
    if (!user) return;
    try {
      await setLegalEntityDeleted("document", document.id, false, user);
      toast({ title: "Documento restaurado" });
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível restaurar", description: errorMessage(error) });
    }
  };

  const requestExport = (document: LegalDocument, format: "pdf" | "docx") => {
    const warnings = legalExportWarnings(parseLegalContent(document.contentJson));
    if (warnings.length) {
      setExportTarget({ document, format });
      return;
    }
    void exportDocument(document, format);
  };

  const exportDocument = async (document: LegalDocument, format: "pdf" | "docx") => {
    setExportingId(`${document.id}-${format}`);
    try {
      const content = parseLegalContent(document.contentJson);
      const styles = parseLegalStyles(document.stylesJson);
      const settings = parseLegalPageSettings(document.pageSettingsJson);
      const blob = format === "pdf"
        ? await (await import("@/lib/legal-export-pdf")).createLegalPdfBlob(document.name, content, styles, settings)
        : await (await import("@/lib/legal-export-docx")).createLegalDocxBlob(document.name, content, styles, settings);
      downloadBlob(blob, `${safeLegalFileName(document.name)}.${format}`);
      toast({ title: `${format.toUpperCase()} gerado` });
    } catch (error) {
      toast({ variant: "destructive", title: `Não foi possível gerar o ${format.toUpperCase()}`, description: errorMessage(error) });
    } finally {
      setExportingId(null);
    }
  };

  if (!user || documents === null || templates === null) {
    return <div className="surface flex min-h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Carregando documentos...</div>;
  }

  return (
    <div className="space-y-3">
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar documento" />
        <Button type="button" variant={showDeleted ? "secondary" : "outline"} size="sm" className="h-8 sm:ml-auto" onClick={() => setShowDeleted((value) => !value)} title="Mostrar ou ocultar documentos excluídos">
          <Trash2 className="mr-1.5 size-3.5" />{showDeleted ? "Excluídos" : "Ver excluídos"}
        </Button>
        <Button type="button" size="sm" className="h-8" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />Novo documento
        </Button>
      </Toolbar>

      <section className="work-table">
        <div className="ledger-header grid grid-cols-[minmax(0,1fr)_150px_120px_130px_40px] items-center gap-2 px-3 py-2 text-xs text-muted-foreground max-lg:grid-cols-[minmax(0,1fr)_120px_40px]">
          <span>Documento</span><span className="max-lg:hidden">Modelo de origem</span><span>Criação</span><span className="max-lg:hidden">Última alteração</span><span />
        </div>
        <div className="divide-y">
          {visibleDocuments.map((document) => (
            <div key={document.id} className="grid min-h-12 grid-cols-[minmax(0,1fr)_150px_120px_130px_40px] items-center gap-2 px-3 py-1.5 hover:bg-muted/25 max-lg:grid-cols-[minmax(0,1fr)_120px_40px]">
              <Link href={`/dashboard/documents/${document.id}`} className="min-w-0">
                <span className={cn("block truncate text-sm font-medium", document.deleted && "text-muted-foreground line-through")}>{document.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{document.createdBy}</span>
              </Link>
              <span className="truncate text-xs text-muted-foreground max-lg:hidden">{document.sourceTemplateId ? document.sourceTemplateName || "Modelo removido" : "Documento em branco"}</span>
              <span className="truncate text-[11px] text-muted-foreground">{formatDateTime(document.createdAt)}</span>
              <span className="truncate text-[11px] text-muted-foreground max-lg:hidden">{formatDateTime(document.updatedAt)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-8" title="Ações do documento"><EllipsisVertical className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link href={`/dashboard/documents/${document.id}`}><Edit3 className="mr-2 size-3.5" />{document.deleted ? "Visualizar" : "Editar"}</Link></DropdownMenuItem>
                  {!document.deleted && <DropdownMenuItem onClick={() => void duplicate(document)} disabled={busy}><Copy className="mr-2 size-3.5" />Duplicar</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => requestExport(document, "pdf")} disabled={!!exportingId}><Download className="mr-2 size-3.5" />Gerar PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => requestExport(document, "docx")} disabled={!!exportingId}><Download className="mr-2 size-3.5" />Gerar DOCX</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {document.deleted
                    ? <DropdownMenuItem onClick={() => void restore(document)}><RotateCcw className="mr-2 size-3.5" />Restaurar</DropdownMenuItem>
                    : <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(document)}><Trash2 className="mr-2 size-3.5" />Excluir</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {visibleDocuments.length === 0 && (
            <EmptyState title="Nenhum documento encontrado" description="Crie um documento em branco ou use um modelo jurídico." icon={FileText} className="m-3">
              {!showDeleted && <Button type="button" size="sm" onClick={() => setNewOpen(true)}><FilePlus2 className="mr-1.5 size-4" />Novo documento</Button>}
            </EmptyState>
          )}
        </div>
      </section>

      <NewLegalDocumentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        client={client}
        allClients={allClients}
        templates={templates.filter((template) => !template.deleted)}
        onCreated={(id) => router.push(`/dashboard/documents/${id}`)}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Excluir documento?"
        description={`Deseja excluir ${deleteTarget?.name ?? "este documento"}?`}
        onConfirm={remove}
        loading={busy}
      />

      <LegalExportWarningDialog
        open={!!exportTarget}
        warnings={exportTarget ? legalExportWarnings(parseLegalContent(exportTarget.document.contentJson)) : []}
        onOpenChange={(open) => { if (!open) setExportTarget(null); }}
        onProceed={() => {
          if (exportTarget) void exportDocument(exportTarget.document, exportTarget.format);
        }}
      />
    </div>
  );
}

function NewLegalDocumentDialog({
  open,
  onOpenChange,
  client,
  allClients,
  templates,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  allClients: Client[];
  templates: LegalTemplate[];
  onCreated: (id: string) => void;
}) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"blank" | "template">("blank");
  const [name, setName] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [repeatSource, setRepeatSource] = useState<{ template: LegalTemplate; snapshot: LegalVersion } | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  const visibleTemplates = templates
    .filter((template) => !templateSearch.trim() || normalizeLegalName(`${template.name} ${template.plainText}`).includes(normalizeLegalName(templateSearch)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const reset = () => {
    setMode("blank");
    setName("");
    setTemplateSearch("");
    setTemplateId("");
    setRepeatSource(null);
  };

  const stableTemplateSnapshot = async (template: LegalTemplate): Promise<LegalVersion> => {
    let version = template.version;
    let snapshot = await getLegalVersionSnapshot("template", template.id, version);
    const changed = template.name !== snapshot.name ||
      template.contentJson !== snapshot.contentJson ||
      template.stylesJson !== snapshot.stylesJson ||
      template.pageSettingsJson !== snapshot.pageSettingsJson;
    if (changed && user && canManageOwnedLegalEntity(template, user, isAdmin)) {
      version = await saveLegalVersion("template", template.id, {
        name: template.name,
        content: parseLegalContent(template.contentJson),
        styles: parseLegalStyles(template.stylesJson),
        pageSettings: parseLegalPageSettings(template.pageSettingsJson),
      }, user);
      snapshot = await getLegalVersionSnapshot("template", template.id, version);
    }
    return snapshot;
  };

  const create = async (
    template: LegalTemplate | null,
    selections: Record<string, string[]> = {},
    loadedSnapshot?: LegalVersion
  ) => {
    if (!user || !name.trim()) return;
    setBusy(true);
    try {
      const snapshot = template
        ? loadedSnapshot ?? await stableTemplateSnapshot(template)
        : null;
      const id = await createLegalDocument({
        name,
        clientId: client.id,
        clientName: client.name,
        sourceTemplateId: template?.id ?? null,
        sourceTemplateName: snapshot?.name ?? "",
        sourceTemplateVersion: snapshot?.version ?? null,
        content: snapshot
          ? instantiateLegalContent(parseLegalContent(snapshot.contentJson), client, ensureClient(allClients, client), selections)
          : undefined,
        styles: snapshot ? parseLegalStyles(snapshot.stylesJson) : undefined,
        pageSettings: snapshot ? parseLegalPageSettings(snapshot.pageSettingsJson) : undefined,
      }, user);
      onOpenChange(false);
      reset();
      onCreated(id);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível criar o documento", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const continueCreation = async () => {
    if (mode === "blank") {
      void create(null);
      return;
    }
    if (!selectedTemplate) return;
    setBusy(true);
    try {
      const snapshot = await stableTemplateSnapshot(selectedTemplate);
      const blocks = findRepeatableBlocks(parseLegalContent(snapshot.contentJson));
      if (blocks.length) {
        onOpenChange(false);
        setRepeatSource({ template: selectedTemplate, snapshot });
        return;
      }
      await create(selectedTemplate, {}, snapshot);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível carregar a versão do modelo", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value && !repeatSource) reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo documento</DialogTitle>
            <DialogDescription>O documento será criado imediatamente como rascunho e vinculado a {client.name}.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={mode} onValueChange={(value: "blank" | "template") => { setMode(value); if (value === "blank") setTemplateId(""); }} className="grid grid-cols-2 gap-2">
            <Label htmlFor="document-blank" className={cn("flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm", mode === "blank" && "border-accent bg-accent/5")}><RadioGroupItem id="document-blank" value="blank" />Em branco</Label>
            <Label htmlFor="document-template" className={cn("flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm", mode === "template" && "border-accent bg-accent/5")}><RadioGroupItem id="document-template" value="template" />Usar modelo</Label>
          </RadioGroup>
          {mode === "template" && (
            <div className="space-y-2">
              <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Buscar modelo" className="pl-8" /></div>
              <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
                {visibleTemplates.map((template) => (
                  <button key={template.id} type="button" onClick={() => { setTemplateId(template.id); if (!name.trim() || name === selectedTemplate?.name) setName(template.name); }} className={cn("w-full px-3 py-2 text-left hover:bg-muted/50", template.id === templateId && "bg-muted")}>
                    <span className="block truncate text-sm font-medium">{template.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{template.createdBy} · versão {template.version}</span>
                  </button>
                ))}
                {visibleTemplates.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Nenhum modelo encontrado.</p>}
              </div>
            </div>
          )}
          <div className="space-y-1"><Label htmlFor="new-document-name">Nome do documento</Label><Input id="new-document-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Contrato de honorários" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" onClick={() => void continueCreation()} disabled={busy || !name.trim() || (mode === "template" && !selectedTemplate)}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Criar e editar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <LegalRepeatSelectionDialog
        open={!!repeatSource}
        blocks={repeatSource ? findRepeatableBlocks(parseLegalContent(repeatSource.snapshot.contentJson)) : []}
        clients={relatedClients(client, allClients)}
        onOpenChange={(value) => {
          if (!value) {
            setRepeatSource(null);
            reset();
          }
        }}
        onConfirm={(selection) => {
          if (repeatSource) void create(repeatSource.template, selection, repeatSource.snapshot);
        }}
      />
    </>
  );
}

function ensureClient(clients: Client[], client: Client): Client[] {
  return clients.some((item) => item.id === client.id) ? clients : [...clients, client];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tente novamente.";
}
