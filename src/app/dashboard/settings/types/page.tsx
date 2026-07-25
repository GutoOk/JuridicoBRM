"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { installDefaults } from "@/lib/seed";
import { newItemId } from "@/lib/checklist";
import type { CaseFieldDef, ChecklistGroupDef, ChecklistItemDef, ClientType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";
import { cn } from "@/lib/utils";

const COLOR_PRESETS = ["#0d9488", "#7c3aed", "#2563eb", "#dc2626", "#d97706", "#64748b", "#db2777", "#059669"];

/**
 * EDITOR DE OPERAÇÕES (admin) — acessado pelo botão "Editar operação" na tela
 * Operação. Tudo em uma coluna de cards; um card por operação (tipo de cliente).
 *
 * Checklist com PASTAS (categorias):
 *  - arraste itens para reordenar ou soltar dentro de outra pasta;
 *  - arraste o cabeçalho de uma pasta sobre outra para reordenar pastas;
 *  - criar/renomear/apagar pasta como no gerenciador de arquivos;
 *  - apagar uma pasta devolve os itens dela para a raiz (nada é perdido).
 *
 * Sem regras automáticas: prontidão é manual, todo item vira filtro e
 * pendência quando não está OK, e nada bloqueia nada.
 */
export default function TypesSettingsPage() {
  const { user, isAdmin } = useAuth();
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { toast } = useToast();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  // Abre direto a operação vinda da tela Operação (?tipo=...)
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tipo");
    if (param) setExpandedId(param);
  }, []);

  const sorted = useMemo(
    () => (types ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [types]
  );

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <EmptyState title="Acesso restrito" description="Somente administradores editam operações." />
      </div>
    );
  }

  const install = async () => {
    if (!user) return;
    setInstalling(true);
    try {
      const res = await installDefaults(user.name);
      toast({
        title: "Padrões instalados",
        description: `${res.types} operação(ões) e ${res.templates} mensagem(ns) criadas. Nada existente foi sobrescrito.`,
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao instalar padrões" });
    } finally {
      setInstalling(false);
    }
  };

  const createType = async () => {
    if (!user) return;
    try {
      const maxOrder = Math.max(0, ...sorted.map((t) => t.order ?? 0));
      const ref = await addDoc(collection(db, "clientTypes"), {
        name: "Nova operação",
        color: COLOR_PRESETS[maxOrder % COLOR_PRESETS.length],
        description: "",
        order: maxOrder + 1,
        archived: false,
        checklist: [],
        checklistGroups: [],
        caseFields: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      setExpandedId(ref.id);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao criar operação" });
    }
  };

  const moveType = async (t: ClientType, dir: -1 | 1) => {
    const idx = sorted.findIndex((x) => x.id === t.id);
    const other = sorted[idx + dir];
    if (!other) return;
    await Promise.all([
      updateDoc(doc(db, "clientTypes", t.id), { order: other.order ?? 0 }),
      updateDoc(doc(db, "clientTypes", other.id), { order: t.order ?? 0 }),
    ]);
  };

  if (!types) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell max-w-4xl">
      <PageHeader
        eyebrow="administração"
        title="Editar operações"
        description="Cada card é uma operação (tipo de cliente). Abra para editar nome, cor, checklist em pastas e campos do caso. A prontidão dos clientes é definida manualmente pela equipe na tela Operação."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/operacao">
            <ArrowLeft className="mr-1.5 size-4" /> Voltar à Operação
          </Link>
        </Button>
        <HelpTip label="Cria as operações e mensagens padrão do escritório (Barão de Mauá completo). Não sobrescreve nada que já exista.">
          <Button variant="outline" size="sm" onClick={install} disabled={installing}>
            {installing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Wand2 className="mr-1.5 size-4" />}
            Instalar padrões
          </Button>
        </HelpTip>
      </PageHeader>

      <div className="space-y-2">
        {sorted.map((t, i) => (
          <TypeCard
            key={t.id}
            type={t}
            expanded={expandedId === t.id}
            onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            onMoveUp={i > 0 ? () => moveType(t, -1) : undefined}
            onMoveDown={i < sorted.length - 1 ? () => moveType(t, 1) : undefined}
          />
        ))}
        {sorted.length === 0 && (
          <EmptyState
            title="Nenhuma operação ainda"
            description="Use Instalar padrões para começar com Barão de Mauá e Contestação GSI, ou crie a primeira abaixo."
          />
        )}
        <Button variant="outline" className="w-full border-dashed" onClick={createType}>
          <Plus className="mr-2 size-4" /> Nova operação
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card de operação (expande para editar)
// ---------------------------------------------------------------------------

function TypeCard({
  type,
  expanded,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  type: ClientType;
  expanded: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const itemCount = (type.checklist ?? []).filter((i) => i.active && !i.deleted).length;
  const fieldCount = (type.caseFields ?? []).filter((f) => !f.deleted).length;

  return (
    <Card className={cn("surface overflow-hidden", type.archived && "opacity-60")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
        title={expanded ? "Recolher" : "Abrir para editar checklist, pastas e campos"}
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
        <span className="min-w-0 truncate text-sm font-medium">{type.name}</span>
        {type.archived && <Badge variant="outline" className="text-[10px]">arquivada</Badge>}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {itemCount} itens · {fieldCount} campos
        </span>
        <span
          className="flex shrink-0 items-center"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          <Button variant="ghost" size="icon" className="size-6" disabled={!onMoveUp} onClick={onMoveUp} title="Subir na lista de operações">
            <ArrowUp className="size-3" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={!onMoveDown} onClick={onMoveDown} title="Descer na lista de operações">
            <ArrowDown className="size-3" />
          </Button>
        </span>
      </button>
      {expanded && <TypeEditor type={type} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Editor da operação: meta + checklist em pastas (drag & drop) + campos do caso
// ---------------------------------------------------------------------------

type DragPayload = { kind: "item" | "group"; id: string } | null;
type DefinitionDeleteTarget = { kind: "item" | "group" | "field"; id: string } | null;

function TypeEditor({ type }: { type: ClientType }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [meta, setMeta] = useState({ name: type.name, color: type.color, description: type.description ?? "" });
  const [items, setItems] = useState<ChecklistItemDef[]>([]);
  const [groups, setGroups] = useState<ChecklistGroupDef[]>([]);
  const [fields, setFields] = useState<CaseFieldDef[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<DragPayload>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DefinitionDeleteTarget>(null);

  // Carrega o rascunho e converte categorias antigas (texto) em pastas reais.
  useEffect(() => {
    const srcItems = (type.checklist ?? []).map((i) => ({ ...i }));
    const srcGroups = (type.checklistGroups ?? []).map((g) => ({ ...g }));
    let nextOrder = Math.max(0, ...srcGroups.map((g) => g.order ?? 0)) + 1;
    for (const item of srcItems) {
      if (!item.groupId && item.category && !item.deleted) {
        let group = srcGroups.find((g) => !g.deleted && g.name === item.category);
        if (!group) {
          group = { id: newItemId(), name: item.category, order: nextOrder++ };
          srcGroups.push(group);
        }
        item.groupId = group.id;
      }
    }
    setItems(srcItems);
    setGroups(srcGroups);
    setFields((type.caseFields ?? []).map((f) => ({ ...f })));
    setMeta({ name: type.name, color: type.color, description: type.description ?? "" });
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type.id]);

  const visibleGroups = groups.filter((g) => !g.deleted).sort((a, b) => a.order - b.order);
  const liveItems = items.filter((i) => !i.deleted);
  const rootItems = liveItems.filter((i) => !i.groupId || !visibleGroups.some((g) => g.id === i.groupId));
  const membersOf = (gid: string) => liveItems.filter((i) => i.groupId === gid);
  const deletedItems = items.filter((item) => item.deleted);
  const deletedGroups = groups.filter((group) => group.deleted);
  const deletedFields = fields.filter((field) => field.deleted);
  const deletedCount = deletedItems.length + deletedGroups.length + deletedFields.length;

  const touch = () => setDirty(true);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "clientTypes", type.id), {
        name: meta.name.trim() || type.name,
        color: meta.color,
        description: meta.description.trim(),
        checklist: items,
        checklistGroups: groups,
        caseFields: fields,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      setDirty(false);
      toast({ title: "Operação salva" });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!user) return;
    await updateDoc(doc(db, "clientTypes", type.id), {
      archived: !type.archived,
      archivedAt: type.archived ? null : serverTimestamp(),
      archivedBy: type.archived ? null : user.name,
    });
    toast({ title: type.archived ? "Operação restaurada" : "Operação arquivada" });
  };

  // ---- itens ----
  const addItem = (groupId?: string) => {
    setItems((prev) => [
      ...prev,
      {
        id: newItemId(),
        name: "Novo item",
        category: "",
        requirement: "opcional",
        blocking: false,
        generatesPendency: true,
        active: true,
        ...(groupId ? { groupId } : {}),
      },
    ]);
    touch();
  };

  const renameItem = (id: string, name: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    touch();
  };

  const removeItem = (id: string) => {
    if (!user) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, deleted: true, deletedAt: new Date().toISOString(), deletedBy: user.name } : i
      )
    );
    touch();
  };

  /** Move o item arrastado: antes de `beforeId` (mesma pasta do alvo) ou para o fim de `groupId`. */
  const dropItem = (draggedId: string, target: { beforeId?: string; groupId?: string }) => {
    setItems((prev) => {
      const list = [...prev];
      const from = list.findIndex((i) => i.id === draggedId);
      if (from < 0) return prev;
      const [moved] = list.splice(from, 1);
      if (target.beforeId) {
        const ref = list.find((i) => i.id === target.beforeId);
        const to = list.findIndex((i) => i.id === target.beforeId);
        if (to < 0) return prev;
        list.splice(to, 0, { ...moved, groupId: ref?.groupId });
      } else {
        // fim da pasta (ou raiz)
        const updated = { ...moved };
        if (target.groupId) updated.groupId = target.groupId;
        else delete updated.groupId;
        list.push(updated);
      }
      return list;
    });
    touch();
  };

  // ---- pastas ----
  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      { id: newItemId(), name: "Nova pasta", order: Math.max(0, ...prev.map((g) => g.order ?? 0)) + 1 },
    ]);
    touch();
  };

  const renameGroup = (id: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
    touch();
  };

  const removeGroup = (id: string) => {
    if (!user) return;
    // Itens da pasta voltam para a raiz — nada é apagado.
    setItems((prev) =>
      prev.map((i) => {
        if (i.groupId !== id) return i;
        const next = { ...i, category: "" };
        delete next.groupId;
        return next;
      })
    );
    setGroups((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, deleted: true, deletedAt: new Date().toISOString(), deletedBy: user.name } : g
      )
    );
    touch();
  };

  const removeField = (id: string) => {
    if (!user) return;
    setFields((prev) =>
      prev.map((field) =>
        field.id === id
          ? { ...field, deleted: true, deletedAt: new Date().toISOString(), deletedBy: user.name }
          : field
      )
    );
    touch();
  };

  const confirmDefinitionDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "item") removeItem(deleteTarget.id);
    if (deleteTarget.kind === "group") removeGroup(deleteTarget.id);
    if (deleteTarget.kind === "field") removeField(deleteTarget.id);
    setDeleteTarget(null);
  };

  const dropGroupBefore = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setGroups((prev) => {
      const live = prev.filter((g) => !g.deleted).sort((a, b) => a.order - b.order);
      const ids = live.map((g) => g.id).filter((id) => id !== draggedId);
      const at = ids.indexOf(targetId);
      if (at < 0) return prev;
      ids.splice(at, 0, draggedId);
      const orderById = new Map(ids.map((id, idx) => [id, idx + 1]));
      return prev.map((g) => (orderById.has(g.id) ? { ...g, order: orderById.get(g.id)! } : g));
    });
    touch();
  };

  const handleDrop = (target: { beforeItemId?: string; groupId?: string; beforeGroupId?: string }) => {
    if (!drag) return;
    if (drag.kind === "item") {
      dropItem(drag.id, { beforeId: target.beforeItemId, groupId: target.groupId });
    } else if (drag.kind === "group" && target.beforeGroupId) {
      dropGroupBefore(drag.id, target.beforeGroupId);
    }
    setDrag(null);
  };

  const itemRow = (item: ChecklistItemDef) => (
    <div
      key={item.id}
      draggable
      onDragStart={() => setDrag({ kind: "item", id: item.id })}
      onDragOver={(e) => drag?.kind === "item" && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDrop({ beforeItemId: item.id });
      }}
      className="group flex items-center gap-1.5 rounded-md border bg-card px-1.5 py-1"
      title="Arraste para reordenar ou soltar dentro de uma pasta"
    >
      <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
      <Input
        value={item.name}
        onChange={(e) => renameItem(item.id, e.target.value)}
        className="h-6 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-1"
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        onClick={() => setDeleteTarget({ kind: "item", id: item.id })}
        title="Excluir item"
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );

  return (
    <CardContent className="space-y-4 border-t px-3 pb-3 pt-3">
      {/* Meta da operação */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-4">
          <Label className="mb-0.5 block text-xs">Nome</Label>
          <Input value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); touch(); }} />
        </div>
        <div className="sm:col-span-4">
          <Label className="mb-0.5 block text-xs">Cor</Label>
          <div className="flex h-8 items-center gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                className={cn(
                  "size-5 rounded-full border-2",
                  meta.color === c ? "border-foreground" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
                onClick={() => { setMeta({ ...meta, color: c }); touch(); }}
              />
            ))}
          </div>
        </div>
        <div className="sm:col-span-4">
          <Label className="mb-0.5 block text-xs">Descrição</Label>
          <Input
            value={meta.description}
            onChange={(e) => { setMeta({ ...meta, description: e.target.value }); touch(); }}
            placeholder="Aparece no tooltip do seletor de operação"
          />
        </div>
      </div>

      {/* Checklist em pastas */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">Checklist</h3>
          <HelpTip label="Arraste itens entre as pastas ou para reordenar. Arraste o cabeçalho de uma pasta sobre outra para reordenar pastas. Todo item vale como filtro e como pendência enquanto não estiver OK — nada bloqueia nada." />
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addGroup}>
              <FolderPlus className="mr-1 size-3.5" /> Nova pasta
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addItem()}>
              <Plus className="mr-1 size-3.5" /> Novo item na raiz
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {/* Raiz */}
          <div
            onDragOver={(e) => drag?.kind === "item" && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop({ groupId: undefined });
            }}
            className={cn(
              "space-y-1 rounded-md border border-dashed p-1.5",
              rootItems.length === 0 && "flex min-h-9 items-center justify-center"
            )}
            title="Itens fora de qualquer pasta. Solte um item aqui para tirá-lo da pasta."
          >
            {rootItems.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                raiz — solte itens aqui para deixá-los fora de pastas
              </span>
            ) : (
              rootItems.map(itemRow)
            )}
          </div>

          {/* Pastas */}
          {visibleGroups.map((g) => {
            const members = membersOf(g.id);
            return (
              <div
                key={g.id}
                className="rounded-md border"
                onDragOver={(e) => drag && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag?.kind === "item") handleDrop({ groupId: g.id });
                  else if (drag?.kind === "group") handleDrop({ beforeGroupId: g.id });
                }}
              >
                <div
                  draggable
                  onDragStart={() => setDrag({ kind: "group", id: g.id })}
                  className="group flex items-center gap-1.5 rounded-t-md bg-muted/40 px-1.5 py-1"
                  title="Arraste sobre outra pasta para reordenar. Solte itens aqui para movê-los para esta pasta."
                >
                  <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
                  <Folder className="size-3.5 shrink-0 text-accent" />
                  {renamingGroup === g.id ? (
                    <Input
                      autoFocus
                      value={g.name}
                      onChange={(e) => renameGroup(g.id, e.target.value)}
                      onBlur={() => setRenamingGroup(null)}
                      onKeyDown={(e) => e.key === "Enter" && setRenamingGroup(null)}
                      className="h-6 px-1 text-[13px]"
                    />
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 truncate text-[13px] font-medium hover:underline"
                      onClick={() => setRenamingGroup(g.id)}
                      title="Clique para renomear a pasta"
                    >
                      {g.name}
                    </button>
                  )}
                  <span className="text-[11px] text-muted-foreground">({members.length})</span>
                  <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => setRenamingGroup(g.id)}
                      title="Renomear pasta"
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget({ kind: "group", id: g.id })}
                      title="Excluir pasta"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </span>
                </div>
                <div className="space-y-1 p-1.5">
                  {members.map(itemRow)}
                  <button
                    type="button"
                    onClick={() => addItem(g.id)}
                    className="w-full rounded-md border border-dashed px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    + adicionar item em “{g.name}”
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Campos do caso */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <h3 className="text-sm font-medium">Campos do caso</h3>
          <HelpTip label="Campos livres desta operação (ex.: bloco/lote, número do processo), exibidos na aba Caso de cada cliente." />
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs"
            onClick={() => {
              setFields((prev) => [...prev, { id: newItemId(), label: "Novo campo", type: "text" }]);
              touch();
            }}
          >
            <Plus className="mr-1 size-3.5" /> Adicionar campo
          </Button>
        </div>
        <div className="space-y-1">
          {fields.filter((f) => !f.deleted).map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-1.5 rounded-md border px-1.5 py-1">
              <Input
                value={f.label}
                onChange={(e) => {
                  setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)));
                  touch();
                }}
                className="h-6 w-52 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-1"
              />
              <Select
                value={f.type}
                onValueChange={(v) => {
                  setFields((prev) =>
                    prev.map((x) => (x.id === f.id ? { ...x, type: v as CaseFieldDef["type"] } : x))
                  );
                  touch();
                }}
              >
                <SelectTrigger className="h-6 w-28 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="textarea">Texto longo</SelectItem>
                  <SelectItem value="select">Lista</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                </SelectContent>
              </Select>
              {f.type === "select" && (
                <Input
                  value={(f.options ?? []).join("; ")}
                  onChange={(e) => {
                    setFields((prev) =>
                      prev.map((x) =>
                        x.id === f.id
                          ? { ...x, options: e.target.value.split(";").map((o) => o.trim()).filter(Boolean) }
                          : x
                      )
                    );
                    touch();
                  }}
                  placeholder="Opção 1; Opção 2"
                  className="h-6 min-w-40 flex-1 px-1 text-[11px]"
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-6 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteTarget({ kind: "field", id: f.id })}
                title="Excluir campo"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {deletedCount > 0 && (
        <div className="rounded-md border border-dashed p-2">
          <button
            type="button"
            onClick={() => setShowDeleted((current) => !current)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="size-3.5" /> {showDeleted ? "Ocultar apagados" : `Ver apagados (${deletedCount})`}
          </button>
          {showDeleted && (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {deletedItems.map((item) => (
                <DeletedDefinitionRow
                  key={`item-${item.id}`}
                  label={`Item: ${item.name}`}
                  onRestore={() => {
                    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, deleted: false, deletedAt: undefined, deletedBy: undefined } : entry));
                    touch();
                  }}
                />
              ))}
              {deletedGroups.map((group) => (
                <DeletedDefinitionRow
                  key={`group-${group.id}`}
                  label={`Pasta: ${group.name}`}
                  onRestore={() => {
                    setGroups((current) => current.map((entry) => entry.id === group.id ? { ...entry, deleted: false, deletedAt: undefined, deletedBy: undefined } : entry));
                    touch();
                  }}
                />
              ))}
              {deletedFields.map((field) => (
                <DeletedDefinitionRow
                  key={`field-${field.id}`}
                  label={`Campo: ${field.label}`}
                  onRestore={() => {
                    setFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, deleted: false, deletedAt: undefined, deletedBy: undefined } : entry));
                    touch();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rodapé do card */}
      <div className="flex items-center justify-between border-t pt-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={toggleArchive}>
          {type.archived ? (
            <>
              <ArchiveRestore className="mr-1.5 size-3.5" /> Restaurar operação
            </>
          ) : (
            <>
              <Archive className="mr-1.5 size-3.5" /> Arquivar operação
            </>
          )}
        </Button>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">alterações não salvas</span>}
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {dirty ? "Salvar alterações" : "Salvo"}
          </Button>
        </div>
      </div>
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Excluir ${deleteTarget?.kind === "group" ? "pasta" : deleteTarget?.kind === "field" ? "campo" : "item"}?`}
        description={`Deseja excluir ${
          deleteTarget?.kind === "group" ? "esta pasta" : deleteTarget?.kind === "field" ? "este campo" : "este item"
        }?`}
        onConfirm={confirmDefinitionDelete}
      />
    </CardContent>
  );
}

function DeletedDefinitionRow({ label, onRestore }: { label: string; onRestore: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded bg-muted/25 px-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={onRestore}>
        <ArchiveRestore className="mr-1 size-3" /> Restaurar
      </Button>
    </div>
  );
}
