"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import {
  Loader2,
  Plus,
  CheckCircle2,
  RotateCcw,
  Pencil,
  Trash2,
  Undo2,
  ArrowUpDown,
  X,
  Gavel,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { dateMillis, formatDate, toDate } from "@/lib/normalize";
import { PRIORITIES, type Priority, type Update, type UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBadge, PriorityBadge } from "@/components/shared/badges";
import { TaskDialog } from "@/components/shared/task-dialog";
import { cn } from "@/lib/utils";
import { EmptyState, FilterChip, HelpTip, PageHeader, Toolbar } from "@/components/shared/page-shell";
import { SearchBox } from "@/components/shared/page-shell";
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

type SortKey = "dueDate" | "priority" | "createdAt" | "responsible" | "status";
type ConfirmAction = { kind: "delete-selected" } | { kind: "restore"; task: Update };

const PRIORITY_RANK: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2 };
const KEEP = "__manter";

export default function TasksPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: tasksData } = useCollection<Update>("updates", { where: [["type", "==", "Tarefa"]] });
  const { data: users } = useCollection<UserProfile>("users");

  const [onlyMine, setOnlyMine] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [responsibleFilter, setResponsibleFilter] = useState<string>("todos");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "dueDate", dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Update | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  const activeUsers = (users ?? []).filter((u) => u.email && u.active !== false);

  const isMine = (t: Update) =>
    t.responsibleId === user?.id || t.responsible === user?.name || t.responsible === "Todos";

  const deletedCount = useMemo(
    () => (tasksData ?? []).filter((t) => t.deleted && (isAdmin || t.deletedBy === user?.name)).length,
    [tasksData, isAdmin, user?.name]
  );

  const tasks = useMemo(() => {
    let out = (tasksData ?? []).filter((t) =>
      showTrash ? t.deleted && (isAdmin || t.deletedBy === user?.name) : !t.deleted
    );
    if (!showTrash) {
      if (!showDone) out = out.filter((t) => t.status !== "Concluída");
      if (onlyMine) out = out.filter(isMine);
      if (responsibleFilter !== "todos") {
        out = out.filter(
          (t) => t.responsibleId === responsibleFilter || t.responsible === responsibleFilter
        );
      }
    }
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (q) {
      out = out.filter((t) =>
        [t.description, t.clientName, t.clientCode, t.processNumber, t.author, t.responsible]
          .some((value) => value?.toLocaleLowerCase("pt-BR").includes(q))
      );
    }
    const dir = sort.dir;
    return out.sort((a, b) => {
      switch (sort.key) {
        case "dueDate": {
          const da = a.dueDate ? dateMillis(a.dueDate) : Infinity;
          const dbv = b.dueDate ? dateMillis(b.dueDate) : Infinity;
          if (da !== dbv) return (da - dbv) * dir;
          return dateMillis(b.createdAt) - dateMillis(a.createdAt);
        }
        case "priority":
          return ((PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3)) * dir;
        case "responsible":
          return (a.responsible ?? "").localeCompare(b.responsible ?? "", "pt-BR") * dir;
        case "status":
          return (a.status ?? "Pendente").localeCompare(b.status ?? "Pendente", "pt-BR") * dir;
        case "createdAt":
        default:
          return (dateMillis(b.createdAt) - dateMillis(a.createdAt)) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksData, showDone, showTrash, onlyMine, responsibleFilter, search, sort, user?.id, user?.name, isAdmin]);

  const selectedTasks = tasks.filter((t) => selected.has(t.id));

  const requestSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const toggleDone = async (t: Update) => {
    if (!user) return;
    try {
      if (t.status === "Concluída") {
        await updateDoc(doc(db, "updates", t.id), { status: "Pendente", completedAt: null, completedBy: null });
      } else {
        await updateDoc(doc(db, "updates", t.id), {
          status: "Concluída",
          completedAt: serverTimestamp(),
          completedBy: user.name,
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar tarefa" });
    }
  };

  const softDeleteSelected = async () => {
    if (!user || selectedTasks.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTasks.forEach((t) =>
        batch.update(doc(db, "updates", t.id), {
          deleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: user.name,
        })
      );
      await batch.commit();
      toast({ title: `${selectedTasks.length} tarefa(s) movidas para a lixeira` });
      setSelected(new Set());
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir tarefas" });
    }
  };

  const restoreTask = async (t: Update) => {
    await updateDoc(doc(db, "updates", t.id), { deleted: false, deletedAt: null, deletedBy: null });
    toast({ title: "Tarefa restaurada" });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirming(true);
    try {
      if (confirmAction.kind === "delete-selected") await softDeleteSelected();
      else await restoreTask(confirmAction.task);
      setConfirmAction(null);
    } finally {
      setConfirming(false);
    }
  };

  const applyBulk = async (patch: Record<string, unknown>) => {
    if (!user || selectedTasks.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTasks.forEach((t) => {
        const p: Record<string, any> = { ...patch };
        if (p.status === "Concluída" && t.status !== "Concluída") {
          p.completedAt = serverTimestamp();
          p.completedBy = user.name;
        }
        if (p.status === "Pendente") {
          p.completedAt = null;
          p.completedBy = null;
        }
        batch.update(doc(db, "updates", t.id), p);
      });
      await batch.commit();
      toast({ title: `${selectedTasks.length} tarefa(s) atualizadas` });
      setSelected(new Set());
      setBulkOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Erro na edição em lote" });
    }
  };

  if (!tasksData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLate = (t: Update) => {
    const d = toDate(t.dueDate);
    return t.status !== "Concluída" && d && d.getTime() < Date.now() - 86400000;
  };

  const SortHead = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => requestSort(k)}
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        <ArrowUpDown className={cn("size-3", sort.key === k ? "opacity-100" : "opacity-30")} />
      </button>
    </TableHead>
  );

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="execução"
        title="Tarefas"
        description={`${tasks.length} tarefa(s) na lista atual. Use prazo e prioridade para manter a fila de cobrança e revisão andando.`}
      >
        <HelpTip label="Cria uma tarefa geral ou vinculada a cliente. O responsável pode ser uma pessoa ou toda a equipe.">
          <Button onClick={() => setTaskOpen(true)}>
            <Plus className="mr-2 size-4" /> Nova tarefa
          </Button>
        </HelpTip>
      </PageHeader>

      <Toolbar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Buscar tarefa, cliente, processo ou autor"
          className="max-w-sm"
        />
        <HelpTip label="Minhas: só as tarefas em que você é responsável (ou marcadas para Todos). Equipe: tarefas de todo mundo.">
          <span className="flex gap-1">
            <FilterChip active={onlyMine && !showTrash} onClick={() => { setOnlyMine(true); setShowTrash(false); }}>
              Minhas
            </FilterChip>
            <FilterChip active={!onlyMine && !showTrash} onClick={() => { setOnlyMine(false); setShowTrash(false); }}>
              Equipe
            </FilterChip>
          </span>
        </HelpTip>
        <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
          <SelectTrigger className="h-8 w-[190px] text-xs" disabled={showTrash}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {activeUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(!!v)} disabled={showTrash} />
          Mostrar concluídas
        </label>
        {deletedCount > 0 && (
          <HelpTip label="Mostra tarefas ocultadas, que permanecem armazenadas e podem ser restauradas.">
            <span>
              <FilterChip active={showTrash} onClick={() => setShowTrash(!showTrash)}>
                <Trash2 className="size-3" /> Lixeira {deletedCount}
              </FilterChip>
            </span>
          </HelpTip>
        )}
      </Toolbar>

      {selected.size > 0 && !showTrash && (
        <div className="surface case-spine flex flex-wrap items-center gap-2 p-2 pl-4">
          <Badge variant="secondary">{selected.size} selecionada(s)</Badge>
          <HelpTip label="Altera responsável, prioridade, prazo ou status de todas as tarefas selecionadas de uma vez.">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setBulkOpen(true)}>
              <Pencil className="mr-1.5 size-3.5" /> Editar em lote
            </Button>
          </HelpTip>
          <HelpTip label="Move as tarefas selecionadas para a lixeira (reversível).">
            <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => setConfirmAction({ kind: "delete-selected" })}>
              <Trash2 className="mr-1.5 size-3.5" /> Excluir
            </Button>
          </HelpTip>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>
            <X className="size-3.5" /> Limpar
          </Button>
        </div>
      )}

      <div className="work-table">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="ledger-header">
              <TableHead className="w-8">
                <Checkbox
                  checked={tasks.length > 0 && tasks.every((t) => selected.has(t.id))}
                  onCheckedChange={(v) => setSelected(v ? new Set(tasks.map((t) => t.id)) : new Set())}
                  aria-label="Selecionar todas as tarefas listadas"
                />
              </TableHead>
              <TableHead className="w-10" />
              <TableHead>Tarefa</TableHead>
              <TableHead className="hidden md:table-cell">Cliente</TableHead>
              <SortHead label="Responsável" k="responsible" className="hidden w-28 lg:table-cell" />
              <SortHead label="Prior." k="priority" className="hidden w-20 md:table-cell" />
              <SortHead label="Prazo" k="dueDate" className="w-24" />
              <SortHead label="Status" k="status" className="hidden w-24 lg:table-cell" />
              <TableHead className="w-16 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id} className={cn(t.status === "Concluída" && "opacity-50")}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v) next.add(t.id);
                      else next.delete(t.id);
                      setSelected(next);
                    }}
                  />
                </TableCell>
                <TableCell>
                  {!showTrash && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => toggleDone(t)}
                      title={t.status === "Concluída" ? "Reabrir tarefa" : "Concluir tarefa"}
                    >
                      {t.status === "Concluída" ? (
                        <RotateCcw className="size-4" />
                      ) : (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      )}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="min-w-0">
                  <div className={cn("truncate font-medium", t.status === "Concluída" && "line-through")} title={t.description}>
                    {t.description}
                  </div>
                  <div className="flex min-w-0 items-center gap-2 truncate text-[11px] text-muted-foreground">
                    <span>{t.author || "Autor não informado"}{t.createdAt ? ` · ${formatDate(t.createdAt)}` : ""}</span>
                    {t.processNumber && (
                      t.processId ? (
                        <Link href={`/dashboard/processes/${t.processId}`} className="inline-flex min-w-0 items-center gap-1 hover:underline" title="Abrir processo">
                          <Gavel className="size-3 shrink-0" /><span className="truncate">{t.processNumber}</span>
                        </Link>
                      ) : (
                        <span className="inline-flex min-w-0 items-center gap-1"><Gavel className="size-3 shrink-0" />{t.processNumber}</span>
                      )
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {t.clientId ? (
                    <Link
                      href={`/dashboard/clients/${t.clientId}`}
                      className="flex items-center gap-1.5 hover:underline"
                      title="Abrir a ficha do cliente"
                    >
                      <CodeBadge code={t.clientCode || undefined} />
                      <span className="truncate text-[13px]">{t.clientName}</span>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden truncate text-[13px] lg:table-cell">
                  {t.responsible === "Todos" ? <Badge variant="outline">Todos</Badge> : (t.responsible ?? "—")}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <PriorityBadge priority={t.priority} />
                </TableCell>
                <TableCell
                  className={cn("whitespace-nowrap text-[13px]", isLate(t) && "font-medium text-destructive")}
                >
                  {t.dueDate ? formatDate(t.dueDate) : "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge variant={t.status === "Concluída" ? "outline" : isLate(t) ? "destructive" : "secondary"}>
                    {isLate(t) ? "Vencida" : (t.status ?? "Pendente")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {showTrash ? (
                    <span className="inline-flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setConfirmAction({ kind: "restore", task: t })}
                        title="Restaurar tarefa"
                      >
                        <Undo2 className="size-3.5" />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setEditingTask(t)}
                      title="Editar descrição, responsável, prioridade e prazo"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  <EmptyState
                    title={showTrash ? "Lixeira vazia" : `Nenhuma tarefa ${showDone ? "" : "pendente"}`}
                    description={
                      showTrash
                        ? "Tarefas excluídas aparecem aqui e podem ser restauradas."
                        : onlyMine
                          ? "Nada para você agora. Veja as tarefas da equipe no filtro acima."
                          : "Quando uma pendência exigir ação, crie uma tarefa com responsável e prazo."
                    }
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TaskDialog prefill={null} open={taskOpen} onOpenChange={setTaskOpen} />
      <TaskDialog
        prefill={null}
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(o) => !o && setEditingTask(null)}
      />
      <BulkTaskDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        count={selectedTasks.length}
        users={activeUsers}
        onApply={applyBulk}
      />
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === "restore"
                ? "Restaurar tarefa?"
                : `Mover ${selectedTasks.length} tarefa(s) para a lixeira?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === "restore"
                ? "A tarefa voltará para a fila da equipe."
                : "As tarefas permanecerão armazenadas e poderão ser restauradas pela lixeira."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmedAction} disabled={confirming}>
              {confirming && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Edição em lote: cada campo com "manter como está" para alterar só o que precisa. */
function BulkTaskDialog({
  open,
  onOpenChange,
  count,
  users,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  users: UserProfile[];
  onApply: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [responsible, setResponsible] = useState(KEEP);
  const [priority, setPriority] = useState(KEEP);
  const [status, setStatus] = useState(KEEP);
  const [dueDate, setDueDate] = useState("");
  const [clearDue, setClearDue] = useState(false);
  const [applying, setApplying] = useState(false);

  const apply = async () => {
    const patch: Record<string, unknown> = {};
    if (responsible !== KEEP) {
      if (responsible === "__todos") {
        patch.responsible = "Todos";
        patch.responsibleId = "";
      } else {
        const u = users.find((x) => x.id === responsible);
        patch.responsible = u?.name ?? "";
        patch.responsibleId = u?.id ?? "";
      }
    }
    if (priority !== KEEP) patch.priority = priority as Priority;
    if (status !== KEEP) patch.status = status;
    if (clearDue) patch.dueDate = null;
    else if (dueDate) patch.dueDate = new Date(`${dueDate}T12:00:00`).toISOString();
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    setApplying(true);
    await onApply(patch);
    setApplying(false);
    setResponsible(KEEP);
    setPriority(KEEP);
    setStatus(KEEP);
    setDueDate("");
    setClearDue(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {count} tarefa(s) em lote</DialogTitle>
          <DialogDescription>
            Só os campos alterados serão aplicados — o resto fica como está em cada tarefa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsible} onValueChange={setResponsible}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Manter como está</SelectItem>
                  <SelectItem value="__todos">Todos (equipe)</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Manter como está</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Manter como está</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Concluída">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input
                type="date"
                value={dueDate}
                disabled={clearDue}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={clearDue} onCheckedChange={(v) => setClearDue(!!v)} />
                Remover prazo
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={applying}>
            {applying && <Loader2 className="mr-2 size-4 animate-spin" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
