"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Copy,
  EllipsisVertical,
  FilePenLine,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  canManageOwnedLegalEntity,
  createLegalQuickPart,
  createLegalTemplate,
  createLegalTemplateFolder,
  duplicateLegalQuickPart,
  duplicateLegalTemplate,
  moveLegalTemplate,
  renameLegalTemplateFolder,
  saveLegalDraft,
  setLegalEntityDeleted,
  setLegalTemplateFolderDeleted,
} from "@/lib/legal-document-actions";
import {
  normalizeLegalName,
  parseLegalContent,
  parseLegalPageSettings,
  parseLegalStyles,
} from "@/lib/legal-documents";
import { formatDateTime } from "@/lib/normalize";
import type { LegalQuickPart, LegalTemplate, LegalTemplateFolder } from "@/lib/types";
import { cn } from "@/lib/utils";

type CreateKind = "template" | "folder" | "quickPart";
type RenameTarget = { kind: "template"; item: LegalTemplate } | { kind: "folder"; item: LegalTemplateFolder };
type DeleteTarget =
  | { kind: "template"; item: LegalTemplate }
  | { kind: "quickPart"; item: LegalQuickPart }
  | { kind: "folder"; item: LegalTemplateFolder };

export default function ModelsPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("templates");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [createName, setCreateName] = useState("");
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameName, setRenameName] = useState("");
  const [moveTarget, setMoveTarget] = useState<LegalTemplate | null>(null);
  const [moveFolderId, setMoveFolderId] = useState("root");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [draggedTemplateId, setDraggedTemplateId] = useState<string | null>(null);
  const { data: activeFolderData } = useCollection<LegalTemplateFolder>("legalTemplateFolders", { where: [["deleted", "==", false]] });
  const { data: activeTemplateData } = useCollection<LegalTemplate>("legalTemplates", { where: [["deleted", "==", false]] });
  const { data: activeQuickPartData } = useCollection<LegalQuickPart>("legalQuickParts", { where: [["deleted", "==", false]] });
  const { data: deletedFolderCandidates } = useCollection<LegalTemplateFolder>(
    showDeleted ? "legalTemplateFolders" : null,
    isAdmin ? undefined : { where: [["createdById", "==", user?.id ?? ""]] },
    [showDeleted, isAdmin, user?.id]
  );
  const { data: deletedTemplateCandidates } = useCollection<LegalTemplate>(
    showDeleted ? "legalTemplates" : null,
    isAdmin ? undefined : { where: [["createdById", "==", user?.id ?? ""]] },
    [showDeleted, isAdmin, user?.id]
  );
  const { data: deletedQuickPartCandidates } = useCollection<LegalQuickPart>(
    showDeleted ? "legalQuickParts" : null,
    isAdmin ? undefined : { where: [["createdById", "==", user?.id ?? ""]] },
    [showDeleted, isAdmin, user?.id]
  );
  const folders = useMemo(
    () => showDeleted ? (deletedFolderCandidates ?? []).filter((folder) => folder.deleted) : (activeFolderData ?? []),
    [activeFolderData, deletedFolderCandidates, showDeleted]
  );
  const templates = useMemo(
    () => showDeleted ? (deletedTemplateCandidates ?? []).filter((template) => template.deleted) : (activeTemplateData ?? []),
    [activeTemplateData, deletedTemplateCandidates, showDeleted]
  );
  const quickParts = useMemo(
    () => showDeleted ? (deletedQuickPartCandidates ?? []).filter((part) => part.deleted) : (activeQuickPartData ?? []),
    [activeQuickPartData, deletedQuickPartCandidates, showDeleted]
  );
  const activeFolders = useMemo(
    () => folders.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [folders]
  );
  const folderNames = useMemo(() => new Map([...(activeFolderData ?? []), ...(deletedFolderCandidates ?? [])].map((folder) => [folder.id, folder.name])), [activeFolderData, deletedFolderCandidates]);
  const visibleTemplates = useMemo(() => {
    const term = normalizeLegalName(search);
    return (templates ?? [])
      .filter((template) => selectedFolder === "all" || (selectedFolder === "root" ? !template.folderId : template.folderId === selectedFolder))
      .filter((template) => !term || normalizeLegalName(`${template.name} ${template.createdBy}`).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [search, selectedFolder, templates]);
  const visibleQuickParts = useMemo(() => {
    const term = normalizeLegalName(search);
    return (quickParts ?? [])
      .filter((part) => !term || part.searchText.includes(term) || normalizeLegalName(part.title).includes(term))
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }, [quickParts, search]);

  const manage = (item: LegalTemplate | LegalQuickPart | LegalTemplateFolder) =>
    canManageOwnedLegalEntity(item, user, isAdmin);

  const createItem = async () => {
    if (!user || !createKind || !createName.trim()) return;
    setBusy(true);
    try {
      if (createKind === "folder") {
        await createLegalTemplateFolder(createName, user);
        toast({ title: "Pasta criada" });
      } else if (createKind === "quickPart") {
        const id = await createLegalQuickPart(createName, user);
        router.push(`/dashboard/models/parts/${id}`);
      } else {
        const folderId = !showDeleted && selectedFolder !== "all" && selectedFolder !== "root" ? selectedFolder : null;
        const id = await createLegalTemplate(createName, user, folderId);
        router.push(`/dashboard/models/${id}`);
      }
      setCreateKind(null);
      setCreateName("");
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível criar", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const renameItem = async () => {
    if (!user || !renameTarget || !renameName.trim()) return;
    setBusy(true);
    try {
      if (renameTarget.kind === "folder") {
        await renameLegalTemplateFolder(renameTarget.item.id, renameName, user);
      } else {
        const item = renameTarget.item;
        await saveLegalDraft("template", item.id, {
          name: renameName,
          content: parseLegalContent(item.contentJson),
          styles: parseLegalStyles(item.stylesJson),
          pageSettings: parseLegalPageSettings(item.pageSettingsJson),
        }, user);
      }
      toast({ title: "Nome atualizado" });
      setRenameTarget(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível renomear", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const moveItem = async () => {
    if (!user || !moveTarget) return;
    setBusy(true);
    try {
      await moveLegalTemplate(moveTarget.id, moveFolderId === "root" ? null : moveFolderId, user);
      toast({ title: "Modelo movido" });
      setMoveTarget(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível mover", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const dropTemplate = async (folderId: string | null) => {
    const template = templates.find((item) => item.id === draggedTemplateId);
    setDraggedTemplateId(null);
    if (!user || !template || !manage(template) || template.deleted || template.folderId === folderId) return;
    try {
      await moveLegalTemplate(template.id, folderId, user);
      toast({ title: "Modelo movido" });
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível mover", description: errorMessage(error) });
    }
  };

  const duplicateTemplate = async (template: LegalTemplate) => {
    if (!user) return;
    try {
      const id = await duplicateLegalTemplate(template, user);
      toast({ title: "Modelo duplicado" });
      router.push(`/dashboard/models/${id}`);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível duplicar", description: errorMessage(error) });
    }
  };

  const duplicateQuickPart = async (part: LegalQuickPart) => {
    if (!user) return;
    try {
      const id = await duplicateLegalQuickPart(part, user);
      toast({ title: "Parte rápida duplicada" });
      router.push(`/dashboard/models/parts/${id}`);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível duplicar", description: errorMessage(error) });
    }
  };

  const deleteItem = async () => {
    if (!user || !deleteTarget) return;
    setBusy(true);
    try {
      if (deleteTarget.kind === "folder") await setLegalTemplateFolderDeleted(deleteTarget.item, true, user);
      else await setLegalEntityDeleted(deleteTarget.kind, deleteTarget.item.id, true, user);
      toast({ title: "Item excluído" });
      setDeleteTarget(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível excluir", description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const restoreItem = async (target: DeleteTarget) => {
    if (!user) return;
    try {
      if (target.kind === "folder") await setLegalTemplateFolderDeleted(target.item, false, user);
      else await setLegalEntityDeleted(target.kind, target.item.id, false, user);
      toast({ title: "Item restaurado" });
    } catch (error) {
      toast({ variant: "destructive", title: "Não foi possível restaurar", description: errorMessage(error) });
    }
  };

  if (!user || activeFolderData === null || activeTemplateData === null || activeQuickPartData === null || (showDeleted && (deletedFolderCandidates === null || deletedTemplateCandidates === null || deletedQuickPartCandidates === null))) {
    return <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Carregando modelos...</div>;
  }

  return (
    <div className="page-shell">
      <PageHeader title="Modelos" description="Modelos jurídicos reutilizáveis e partes rápidas do escritório.">
        <HelpTip label="Cria uma pasta apenas para organizar os modelos.">
          <Button type="button" variant="outline" size="sm" onClick={() => { setCreateKind("folder"); setCreateName(""); }}>
            <FolderPlus className="mr-1.5 size-4" />Nova pasta
          </Button>
        </HelpTip>
        <HelpTip label="Cria um modelo jurídico vazio e abre o editor.">
          <Button type="button" size="sm" onClick={() => { setCreateKind("template"); setCreateName(""); }}>
            <Plus className="mr-1.5 size-4" />Novo modelo
          </Button>
        </HelpTip>
      </PageHeader>

      <Tabs value={tab} onValueChange={(value) => { setTab(value); setSearch(""); }}>
        <Toolbar>
          <TabsList className="h-8">
            <TabsTrigger value="templates" className="h-7"><FileText className="mr-1.5 size-3.5" />Modelos</TabsTrigger>
            <TabsTrigger value="parts" className="h-7"><BookOpenText className="mr-1.5 size-3.5" />Partes rápidas</TabsTrigger>
          </TabsList>
          <SearchBox value={search} onChange={setSearch} placeholder={tab === "templates" ? "Buscar modelo" : "Buscar parte rápida"} className="sm:ml-auto" />
          <Button type="button" variant={showDeleted ? "secondary" : "outline"} size="sm" className="h-8" onClick={() => { setShowDeleted((value) => !value); setSelectedFolder("all"); }} title="Mostrar ou ocultar itens excluídos">
            <Trash2 className="mr-1.5 size-3.5" />{showDeleted ? "Excluídos" : "Ver excluídos"}
          </Button>
          {tab === "parts" && (
            <Button type="button" size="sm" className="h-8" onClick={() => { setCreateKind("quickPart"); setCreateName(""); }}>
              <Plus className="mr-1.5 size-3.5" />Nova parte rápida
            </Button>
          )}
        </Toolbar>

        <TabsContent value="templates" className="mt-3">
          <div className="grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="surface p-2">
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Pastas</p>
              <FolderRow icon={<FolderOpen className="size-3.5" />} label="Todos os modelos" active={selectedFolder === "all"} onClick={() => setSelectedFolder("all")} />
              <FolderRow
                icon={<Folder className="size-3.5" />}
                label="Raiz"
                active={selectedFolder === "root"}
                onClick={() => setSelectedFolder("root")}
                onDrop={() => void dropTemplate(null)}
              />
              <div className="mt-1 space-y-0.5 border-t pt-1">
                {activeFolders.map((folder) => (
                  <div key={folder.id} className="flex items-center gap-1" onDragOver={(event) => event.preventDefault()} onDrop={() => void dropTemplate(folder.id)}>
                    <button
                      type="button"
                      onClick={() => setSelectedFolder(folder.id)}
                      className={cn("flex h-8 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-xs hover:bg-muted", selectedFolder === folder.id && "bg-muted font-medium", folder.deleted && "text-muted-foreground line-through")}
                    >
                      <Folder className="size-3.5 shrink-0" /><span className="truncate">{folder.name}</span>
                    </button>
                    {manage(folder) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-7"><EllipsisVertical className="size-3.5" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!folder.deleted && <DropdownMenuItem onClick={() => { setRenameTarget({ kind: "folder", item: folder }); setRenameName(folder.name); }}><Pencil className="mr-2 size-3.5" />Renomear</DropdownMenuItem>}
                          {folder.deleted
                            ? <DropdownMenuItem onClick={() => void restoreItem({ kind: "folder", item: folder })}><RotateCcw className="mr-2 size-3.5" />Restaurar</DropdownMenuItem>
                            : <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ kind: "folder", item: folder })}><Trash2 className="mr-2 size-3.5" />Excluir</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            <section className="work-table">
              <div className="ledger-header grid grid-cols-[minmax(0,1fr)_140px_110px_40px] items-center gap-2 px-3 py-2 text-xs text-muted-foreground max-md:grid-cols-[minmax(0,1fr)_40px]">
                <span>Modelo</span><span className="max-md:hidden">Pasta</span><span className="max-md:hidden">Alteração</span><span />
              </div>
              <div className="divide-y">
                {visibleTemplates.map((template) => (
                  <div
                    key={template.id}
                    draggable={manage(template) && !template.deleted}
                    onDragStart={() => setDraggedTemplateId(template.id)}
                    onDragEnd={() => setDraggedTemplateId(null)}
                    className="grid min-h-12 grid-cols-[minmax(0,1fr)_140px_110px_40px] items-center gap-2 px-3 py-1.5 hover:bg-muted/25 max-md:grid-cols-[minmax(0,1fr)_40px]"
                  >
                    <Link href={`/dashboard/models/${template.id}`} className="min-w-0">
                      <span className={cn("block truncate text-sm font-medium", template.deleted && "text-muted-foreground line-through")}>{template.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{template.createdBy} · versão {template.version}</span>
                    </Link>
                    <span className="truncate text-xs text-muted-foreground max-md:hidden">{template.folderId ? folderNames.get(template.folderId) ?? "Pasta removida" : "Raiz"}</span>
                    <span className="truncate text-[11px] text-muted-foreground max-md:hidden">{formatDateTime(template.updatedAt)}</span>
                    <ModelActions
                      template={template}
                      canManage={manage(template)}
                      onRename={() => { setRenameTarget({ kind: "template", item: template }); setRenameName(template.name); }}
                      onMove={() => { setMoveTarget(template); setMoveFolderId(template.folderId ?? "root"); }}
                      onDuplicate={() => void duplicateTemplate(template)}
                      onDelete={() => setDeleteTarget({ kind: "template", item: template })}
                      onRestore={() => void restoreItem({ kind: "template", item: template })}
                    />
                  </div>
                ))}
                {visibleTemplates.length === 0 && <EmptyState title="Nenhum modelo encontrado" description="Crie um modelo ou ajuste a busca e a pasta selecionada." className="m-3" />}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="parts" className="mt-3">
          <section className="work-table">
            <div className="ledger-header grid grid-cols-[minmax(0,1fr)_160px_110px_40px] items-center gap-2 px-3 py-2 text-xs text-muted-foreground max-md:grid-cols-[minmax(0,1fr)_40px]">
              <span>Parte rápida</span><span className="max-md:hidden">Criador</span><span className="max-md:hidden">Alteração</span><span />
            </div>
            <div className="divide-y">
              {visibleQuickParts.map((part) => (
                <div key={part.id} className="grid min-h-12 grid-cols-[minmax(0,1fr)_160px_110px_40px] items-center gap-2 px-3 py-1.5 hover:bg-muted/25 max-md:grid-cols-[minmax(0,1fr)_40px]">
                  <Link href={`/dashboard/models/parts/${part.id}`} className="min-w-0">
                    <span className={cn("block truncate text-sm font-medium", part.deleted && "text-muted-foreground line-through")}>{part.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{part.plainText || "Sem conteúdo"} · versão {part.version}</span>
                  </Link>
                  <span className="truncate text-xs text-muted-foreground max-md:hidden">{part.createdBy}</span>
                  <span className="truncate text-[11px] text-muted-foreground max-md:hidden">{formatDateTime(part.updatedAt)}</span>
                  <QuickPartActions
                    part={part}
                    canManage={manage(part)}
                    onDuplicate={() => void duplicateQuickPart(part)}
                    onDelete={() => setDeleteTarget({ kind: "quickPart", item: part })}
                    onRestore={() => void restoreItem({ kind: "quickPart", item: part })}
                  />
                </div>
              ))}
              {visibleQuickParts.length === 0 && <EmptyState title="Nenhuma parte rápida encontrada" description="Cadastre blocos reutilizáveis para inserir nos documentos." className="m-3" />}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={!!createKind} onOpenChange={(open) => { if (!open) setCreateKind(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{createKind === "folder" ? "Nova pasta" : createKind === "quickPart" ? "Nova parte rápida" : "Novo modelo"}</DialogTitle>
            <DialogDescription>O nome é o único campo obrigatório.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1"><Label htmlFor="legal-create-name">Nome</Label><Input id="legal-create-name" value={createName} onChange={(event) => setCreateName(event.target.value)} autoFocus /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateKind(null)}>Cancelar</Button><Button type="button" onClick={() => void createItem()} disabled={busy || !createName.trim()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Renomear</DialogTitle><DialogDescription>Altere apenas o nome visível do item.</DialogDescription></DialogHeader>
          <div className="space-y-1"><Label htmlFor="legal-rename-name">Nome</Label><Input id="legal-rename-name" value={renameName} onChange={(event) => setRenameName(event.target.value)} autoFocus /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>Cancelar</Button><Button type="button" onClick={() => void renameItem()} disabled={busy || !renameName.trim()}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveTarget} onOpenChange={(open) => { if (!open) setMoveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Mover modelo</DialogTitle><DialogDescription>Escolha a pasta de destino ou mova para a raiz.</DialogDescription></DialogHeader>
          <Select value={moveFolderId} onValueChange={setMoveFolderId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="root">Raiz</SelectItem>{(activeFolderData ?? []).map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMoveTarget(null)}>Cancelar</Button><Button type="button" onClick={() => void moveItem()} disabled={busy}>Mover</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Excluir item?"
        description={`Deseja excluir ${deleteTarget ? ("title" in deleteTarget.item ? deleteTarget.item.title : deleteTarget.item.name) : "este item"}?`}
        onConfirm={deleteItem}
        loading={busy}
      />
    </div>
  );
}

function FolderRow({ icon, label, active, onClick, onDrop }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; onDrop?: () => void }) {
  return <button type="button" onClick={onClick} onDragOver={onDrop ? (event) => event.preventDefault() : undefined} onDrop={onDrop} className={cn("flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-muted", active && "bg-muted font-medium")}>{icon}<span className="truncate">{label}</span></button>;
}

function ModelActions({ template, canManage, onRename, onMove, onDuplicate, onDelete, onRestore }: { template: LegalTemplate; canManage: boolean; onRename: () => void; onMove: () => void; onDuplicate: () => void; onDelete: () => void; onRestore: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-8" title="Ações do modelo"><EllipsisVertical className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href={`/dashboard/models/${template.id}`}><FilePenLine className="mr-2 size-3.5" />{canManage && !template.deleted ? "Editar" : "Visualizar"}</Link></DropdownMenuItem>
        {canManage && !template.deleted && <><DropdownMenuItem onClick={onRename}><Pencil className="mr-2 size-3.5" />Renomear</DropdownMenuItem><DropdownMenuItem onClick={onMove}><FolderInput className="mr-2 size-3.5" />Mover</DropdownMenuItem><DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 size-3.5" />Duplicar</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="mr-2 size-3.5" />Excluir</DropdownMenuItem></>}
        {canManage && template.deleted && <DropdownMenuItem onClick={onRestore}><RotateCcw className="mr-2 size-3.5" />Restaurar</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuickPartActions({ part, canManage, onDuplicate, onDelete, onRestore }: { part: LegalQuickPart; canManage: boolean; onDuplicate: () => void; onDelete: () => void; onRestore: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-8" title="Ações da parte rápida"><EllipsisVertical className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href={`/dashboard/models/parts/${part.id}`}><FilePenLine className="mr-2 size-3.5" />{canManage && !part.deleted ? "Editar" : "Visualizar"}</Link></DropdownMenuItem>
        {canManage && !part.deleted && <><DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 size-3.5" />Duplicar</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="mr-2 size-3.5" />Excluir</DropdownMenuItem></>}
        {canManage && part.deleted && <DropdownMenuItem onClick={onRestore}><RotateCcw className="mr-2 size-3.5" />Restaurar</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tente novamente.";
}
