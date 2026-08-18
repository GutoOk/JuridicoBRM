"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection, useDoc } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { dateMillis, formatDateTime, searchable } from "@/lib/normalize";
import type { Client, Process, Update } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CodeBadge } from "@/components/shared/badges";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";
import { getProcessParties } from "@/components/shared/process-reference";
import { ProcessFormDialog } from "@/components/shared/process-form";
import { ProcessCostsPanel } from "@/components/shared/process-costs-panel";
import {
  ProcessFieldDialog,
  type ProcessFieldKind,
} from "@/components/shared/process-inline-editors";
import { EditUpdateDialog } from "@/components/shared/edit-update-dialog";
import { UpdateTimelineItem } from "@/components/shared/update-timeline-item";
import { SummarizeButton } from "@/components/shared/summarize-button";
import { TaskDialog, type TaskPrefill } from "@/components/shared/task-dialog";

export default function ProcessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const { data: process } = useDoc<Process>("processes", id);
  const { data: clients } = useCollection<Client>("clients");
  const { data: processes } = useCollection<Process>("processes");
  const { data: updatesByProcessId } = useCollection<Update>(
    "updates",
    { where: [["processId", "==", id]] },
    [id]
  );
  // Tarefas usam `processIds[]`, então precisam da própria assinatura.
  const { data: tasksByProcessIds } = useCollection<Update>(
    "updates",
    { where: [["processIds", "array-contains", id]] },
    [id]
  );

  const processNumber = process && process !== null ? process.processNumber : "";
  const { data: updatesByNumber } = useCollection<Update>(
    processNumber ? "updates" : null,
    { where: [["processNumber", "==", processNumber]] },
    [processNumber]
  );

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newUpdate, setNewUpdate] = useState("");
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<Update | null>(null);
  const [inlineField, setInlineField] = useState<ProcessFieldKind | null>(null);
  const [partySearch, setPartySearch] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; name: string } | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [partiesOpen, setPartiesOpen] = useState(false);
  const [showAllData, setShowAllData] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const toggleExpandedTask = (taskId: string) =>
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const client of clients ?? []) map.set(client.id, client);
    return map;
  }, [clients]);

  const processMap = useMemo(() => {
    const map = new Map<string, Process>();
    for (const item of processes ?? []) {
      map.set(item.id, item);
      if (item.processNumber) map.set(item.processNumber, item);
    }
    return map;
  }, [processes]);

  const allUpdates = useMemo(
    () => [...(updatesByProcessId ?? []), ...(updatesByNumber ?? []), ...(tasksByProcessIds ?? [])],
    [updatesByProcessId, updatesByNumber, tasksByProcessIds]
  );

  /** Registros ativos deste processo, sem repetir o que veio por mais de uma consulta. */
  const activeUpdates = useMemo(() => {
    const map = new Map<string, Update>();
    for (const item of allUpdates) {
      if (!item.deleted) map.set(item.id, item);
    }
    return [...map.values()];
  }, [allUpdates]);

  // Andamentos gravados dentro de uma tarefa não entram na lista geral: eles aparecem
  // expandidos dentro da própria tarefa.
  const taskProgressUpdates = activeUpdates.filter((item) => !!item.taskId);

  /** A linha do tempo é a lista geral de tudo, inclusive as tarefas. */
  const timeline = useMemo(
    () => activeUpdates
      .filter((item) => !item.taskId)
      .sort((a, b) => dateMillis(b.updateDate ?? b.createdAt) - dateMillis(a.updateDate ?? a.createdAt)),
    [activeUpdates]
  );

  const tasks = useMemo(
    () => activeUpdates
      .filter((item) => item.type === "Tarefa" && !item.taskId)
      .sort((a, b) => dateMillis(a.dueDate ?? a.createdAt) - dateMillis(b.dueDate ?? b.createdAt)),
    [activeUpdates]
  );

  const pendingTasks = tasks.filter((task) => task.status !== "Concluída");
  const doneTasks = tasks.filter((task) => task.status === "Concluída");
  const visibleTasks = showDoneTasks ? tasks : pendingTasks;

  const linkedClients = useMemo(() => {
    if (!process) return [];
    return (process.clientIds ?? []).map((clientId, index) => ({
      id: clientId,
      name: clientMap.get(clientId)?.name || process.clientNames?.[index] || clientId,
      code: clientMap.get(clientId)?.code,
      isMain: process.mainClientId === clientId,
    }));
  }, [clientMap, process]);

  const partyCandidates = useMemo(() => {
    const term = searchable(partySearch);
    if (term.length < 2 || !process) return [];
    const linked = new Set(process.clientIds ?? []);
    return (clients ?? [])
      .filter(
        (client) =>
          !client.deleted &&
          !linked.has(client.id) &&
          (searchable(client.name).includes(term) || (client.code ?? "").toLowerCase().includes(term))
      )
      .slice(0, 6);
  }, [clients, partySearch, process]);

  if (
    process === undefined ||
    !clients ||
    !processes ||
    !updatesByProcessId ||
    !tasksByProcessIds ||
    (processNumber && !updatesByNumber)
  ) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (process === null) {
    return (
      <div className="page-shell">
        <EmptyState title="Processo não encontrado" description="Ele pode ter sido excluído.">
          <Button variant="outline" asChild>
            <Link href="/dashboard/processes">
              <ArrowLeft className="mr-2 size-4" /> Voltar para processos
            </Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const looseNames =
    linkedClients.length > 0 ? [] : (process.clientNames ?? []).filter((name) => name.trim().length > 0);

  const addProcessUpdate = async () => {
    if (!user || !newUpdate.trim()) return;
    setSavingUpdate(true);
    try {
      await addDoc(collection(db, "updates"), {
        type: "Andamento Processual",
        processId: process.id,
        processNumber: process.processNumber,
        clientId: process.mainClientId ?? process.clientIds?.[0] ?? null,
        clientName: process.clientNames?.[0] ?? null,
        description: newUpdate.trim(),
        author: user.name,
        authorId: user.id,
        createdAt: serverTimestamp(),
        deleted: false,
      });
      setNewUpdate("");
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao registrar andamento" });
    } finally {
      setSavingUpdate(false);
    }
  };

  /** `clientIds` e `clientNames` andam sempre juntos, na mesma ordem. */
  const linkParty = async (client: Client) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "processes", process.id), {
        clientIds: [...(process.clientIds ?? []), client.id],
        clientNames: [...(process.clientNames ?? []), client.name],
        mainClientId: process.mainClientId ?? client.id,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      setPartySearch("");
      toast({ title: "Parte vinculada", description: client.name });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao vincular a parte" });
    }
  };

  const unlinkParty = async () => {
    if (!user || !unlinkTarget) return;
    const index = (process.clientIds ?? []).indexOf(unlinkTarget.id);
    if (index < 0) return;
    const clientIds = (process.clientIds ?? []).filter((_, position) => position !== index);
    const clientNames = (process.clientNames ?? []).filter((_, position) => position !== index);
    try {
      await updateDoc(doc(db, "processes", process.id), {
        clientIds,
        clientNames,
        // O principal não pode apontar para quem saiu: passa ao primeiro que restou.
        mainClientId: process.mainClientId === unlinkTarget.id ? clientIds[0] ?? null : process.mainClientId,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      setUnlinkTarget(null);
      toast({ title: "Parte desvinculada", description: unlinkTarget.name });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao desvincular a parte" });
    }
  };

  const setMainParty = async (clientId: string, name: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "processes", process.id), {
        mainClientId: clientId,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      toast({ title: "Cliente principal atualizado", description: name });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao definir o cliente principal" });
    }
  };

  const softDelete = async () => {
    if (!user) return;
    await updateDoc(doc(db, "processes", process.id), {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: user.name,
    });
    toast({ title: "Processo excluído" });
    router.push("/dashboard/processes");
  };

  const restore = async () => {
    await updateDoc(doc(db, "processes", process.id), { deleted: false, deletedAt: null, deletedBy: null });
    toast({ title: "Processo restaurado" });
  };

  return (
    <div className="page-shell max-w-6xl">
      {process.deleted && (
        <div className="flex items-center justify-between rounded-md border border-destructive bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">Este processo está na lixeira.</p>
          <Button size="sm" variant="outline" onClick={restore}>
            <Undo2 className="mr-2 size-4" /> Restaurar
          </Button>
        </div>
      )}

      <PageHeader
        eyebrow="processo"
        title={process.processNumber}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <span>
              {process.actionType || "Tipo de ação não informado"}
              {process.vara ? ` · ${process.vara}` : ""}
              {process.foro ? ` · ${process.foro}` : ""}
            </span>
            <InlineEditButton label="Editar número do processo" onClick={() => setInlineField("processNumber")} />
          </span>
        }
        badge={
          <span className="flex items-center gap-1">
            <Badge variant={process.status === "Ativo" ? "secondary" : "outline"}>{process.status}</Badge>
            <InlineEditButton label="Editar status" onClick={() => setInlineField("status")} />
          </span>
        }
      >
        <HelpTip label="Volta para a lista de processos.">
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/processes">
              <ArrowLeft className="mr-1.5 size-4" /> Processos
            </Link>
          </Button>
        </HelpTip>
        {!process.deleted && (
          <HelpTip label="Exclui este processo." side="left">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </HelpTip>
        )}
      </PageHeader>

      {/* Card superior: o essencial do processo sempre à vista, cada dado com seu lápis.
          É o que dispensou as abas de partes e de dados. */}
      <Card className="surface">
        <CardContent className="space-y-2 p-3 text-sm">
          <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-2">
            <p className="min-w-0">
              <span className="font-semibold">Partes: </span>
              {linkedClients.length === 0 && looseNames.length === 0 ? (
                <span className="text-muted-foreground/60">Nenhuma parte vinculada</span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 align-middle">
                  {linkedClients.map((client, index) => (
                    <span key={client.id} className="inline-flex items-center gap-1">
                      {client.isMain && <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" />}
                      <Link href={`/dashboard/clients/${client.id}`} className="text-primary hover:underline" title="Abrir ficha do cliente">
                        {client.name}
                      </Link>
                      {index < linkedClients.length + looseNames.length - 1 && <span className="text-muted-foreground">·</span>}
                    </span>
                  ))}
                  {looseNames.map((name) => (
                    <span key={name} className="text-muted-foreground">{name}</span>
                  ))}
                </span>
              )}
              {process.parteContraria && (
                <span className="text-muted-foreground"> — contra {process.parteContraria}</span>
              )}
              {process.polo && <span className="text-muted-foreground"> (polo {process.polo.toLocaleLowerCase("pt-BR")})</span>}
            </p>
            <InlineEditButton label="Editar partes do processo" onClick={() => setPartiesOpen(true)} />
          </div>

          <EditableDataRow label="Assunto" value={process.assunto} onEdit={() => setInlineField("assunto")} />

          <div>
            <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1">
              <span className="font-semibold">Observações</span>
              <InlineEditButton label="Editar observações" onClick={() => setInlineField("notes")} />
            </div>
            <p className={cn("whitespace-pre-wrap py-1", !process.notes && "text-muted-foreground/60")}>
              {process.notes || "Não cadastrado"}
            </p>
          </div>

          {showAllData && (
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 border-t border-border/50 pt-2 sm:grid-cols-2">
              <EditableDataRow label="Número" value={process.processNumber} onEdit={() => setInlineField("processNumber")} />
              <EditableDataRow label="Status" value={process.status} onEdit={() => setInlineField("status")} />
              <EditableDataRow label="Tipo de ação" value={process.actionType} onEdit={() => setInlineField("actionType")} />
              <EditableDataRow label="Classe" value={process.classe} onEdit={() => setInlineField("classe")} />
              <EditableDataRow label="Instância" value={process.instancia} onEdit={() => setInlineField("instancia")} />
              <EditableDataRow label="Foro" value={process.foro} onEdit={() => setInlineField("foro")} />
              <EditableDataRow label="Vara" value={process.vara} onEdit={() => setInlineField("vara")} />
              <EditableDataRow label="Juiz" value={process.juiz} onEdit={() => setInlineField("juiz")} />
              <EditableDataRow label="Polo do cliente" value={process.polo} onEdit={() => setInlineField("polo")} />
              <EditableDataRow label="Parte contrária" value={process.parteContraria} onEdit={() => setInlineField("parteContraria")} />
              <DataRow label="Última atualização" value={formatDateTime(process.lastUpdate ?? process.updatedAt)} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setShowAllData((current) => !current)}
            >
              {showAllData ? <ChevronUp className="mr-1.5 size-3.5" /> : <ChevronDown className="mr-1.5 size-3.5" />}
              {showAllData ? "Ver menos" : "Ver mais"}
            </Button>
            <HelpTip label="Abre o formulário completo, útil para alterar vários campos de uma vez ou usar a IA da capa do processo.">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setEditOpen(true)}
              >
                <Sparkles className="mr-1.5 size-3.5" /> Formulário completo
              </Button>
            </HelpTip>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="timeline" className="space-y-3">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="timeline">Andamentos ({timeline.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="costs">Custas</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-3">
          <div className="surface p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Andamentos deste processo</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{timeline.length} registro(s)</span>
                <SummarizeButton
                  context={`processo ${process.processNumber}`}
                  lines={timeline.map(
                    (u) => `${formatDateTime(u.updateDate ?? u.createdAt)} — ${u.type}: ${u.description}`
                  )}
                />
              </div>
            </div>
            <div className="mb-2 flex gap-2">
              <Textarea
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="Registrar novo andamento processual…"
                rows={2}
              />
              <HelpTip label="Grava um andamento processual na linha do tempo deste processo e do cliente principal.">
                <Button onClick={addProcessUpdate} disabled={savingUpdate || !newUpdate.trim()}>
                  {savingUpdate ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                </Button>
              </HelpTip>
            </div>
            <div className="space-y-2">
              {timeline.map((item) => (
                <UpdateTimelineItem
                  key={item.id}
                  update={item}
                  processMap={processMap}
                  taskProgress={item.type === "Tarefa" ? taskProgressUpdates.filter((entry) => entry.taskId === item.id) : []}
                  expanded={expandedTaskIds.has(item.id)}
                  onToggleExpanded={toggleExpandedTask}
                  onEdit={setEditingUpdate}
                  userId={user?.id}
                  isAdmin={isAdmin}
                />
              ))}
              {timeline.length === 0 && (
                <EmptyState
                  title="Nenhum andamento vinculado"
                  description="Registre o primeiro andamento acima — ele também aparece na linha do tempo do cliente."
                  className="border-0 bg-transparent"
                />
              )}
            </div>
          </div>
        </TabsContent>



        <TabsContent value="tasks" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setTaskPrefill({
                  processId: process.id,
                  processNumber: process.processNumber,
                  clientId: process.mainClientId ?? process.clientIds?.[0],
                  clientName: process.clientNames?.[0],
                });
                setTaskOpen(true);
              }}
            >
              <Plus className="mr-1.5 size-4" /> Nova tarefa
            </Button>
            {doneTasks.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant={showDoneTasks ? "secondary" : "outline"}
                className="h-8"
                onClick={() => setShowDoneTasks((current) => !current)}
                title="Mostrar ou ocultar as tarefas já concluídas"
              >
                <CheckCircle2 className="mr-1.5 size-3.5" />
                {showDoneTasks ? "Ocultar concluídas" : `Ver concluídas (${doneTasks.length})`}
              </Button>
            )}
          </div>
          {visibleTasks.length === 0 && (
            <EmptyState
              title={tasks.length ? "Nenhuma tarefa pendente" : "Nenhuma tarefa vinculada"}
              description={
                tasks.length
                  ? "Todas as tarefas deste processo já foram concluídas."
                  : "Crie uma tarefa quando houver algo concreto para a equipe fazer neste processo."
              }
            />
          )}
          <div className="space-y-2">
            {visibleTasks.map((task) => (
              <UpdateTimelineItem
                key={task.id}
                update={task}
                processMap={processMap}
                taskProgress={taskProgressUpdates.filter((entry) => entry.taskId === task.id)}
                expanded={expandedTaskIds.has(task.id)}
                onToggleExpanded={toggleExpandedTask}
                onEdit={setEditingUpdate}
                userId={user?.id}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="costs">
          <ProcessCostsPanel process={process} />
        </TabsContent>
      </Tabs>

      <Dialog open={partiesOpen} onOpenChange={setPartiesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Partes do processo</DialogTitle>
            <DialogDescription>
              Vincule clientes já cadastrados, escolha o principal pela estrela e desvincule quem não faz parte.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Input
              value={partySearch}
              onChange={(event) => setPartySearch(event.target.value)}
              placeholder="Buscar cliente por nome ou código…"
              className="h-8"
            />
            {partyCandidates.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                {partyCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => void linkParty(candidate)}
                  >
                    <CodeBadge code={candidate.code} />
                    <span className="min-w-0 truncate">{candidate.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {linkedClients.map((client) => (
              <div key={client.id} className="flex items-center gap-1.5 rounded-md border p-2 text-sm">
                <HelpTip label={client.isMain ? "Este é o cliente principal" : "Definir como cliente principal"}>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => { if (!client.isMain) void setMainParty(client.id, client.name); }}
                    aria-label={client.isMain ? "Cliente principal" : "Definir como cliente principal"}
                  >
                    <Star className={cn("size-3.5", client.isMain && "fill-amber-400 text-amber-500")} />
                  </button>
                </HelpTip>
                <Link
                  href={`/dashboard/clients/${client.id}`}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-primary hover:underline"
                  title="Abrir ficha do cliente"
                >
                  <CodeBadge code={client.code} />
                  <span className="min-w-0 truncate">{client.name}</span>
                </Link>
                <HelpTip label="Desvincular esta parte do processo">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    onClick={() => setUnlinkTarget({ id: client.id, name: client.name })}
                  >
                    <X className="size-3.5" />
                  </Button>
                </HelpTip>
              </div>
            ))}
            {looseNames.map((name) => (
              <p key={name} className="rounded-md border p-2 text-sm text-muted-foreground">
                {name} <span className="text-xs">(nome sem cadastro vinculado)</span>
              </p>
            ))}
            {!linkedClients.length && !looseNames.length && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma parte vinculada.</p>
            )}
          </div>

          <div className="rounded-md border p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Parte contrária</span>
              <InlineEditButton label="Editar parte contrária" onClick={() => setInlineField("parteContraria")} />
            </div>
            <p className={cn("mt-1", !process.parteContraria && "text-muted-foreground/60")}>
              {process.parteContraria || "Não cadastrado"}
              {process.polo ? ` · polo do cliente: ${process.polo}` : ""}
            </p>
            {getProcessParties(process) && (
              <p className="mt-1 text-[11px] text-muted-foreground">Resumo: {getProcessParties(process)}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPartiesOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProcessFieldDialog
        process={process}
        allProcesses={processes}
        kind={inlineField}
        onOpenChange={setInlineField}
      />
      <ProcessFormDialog open={editOpen} onOpenChange={setEditOpen} process={process} />
      <EditUpdateDialog
        update={editingUpdate}
        open={!!editingUpdate}
        onOpenChange={(o) => !o && setEditingUpdate(null)}
      />
      <TaskDialog prefill={taskPrefill} open={taskOpen} onOpenChange={setTaskOpen} />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir processo?"
        description="Deseja excluir este processo?"
        onConfirm={softDelete}
      />

      <ConfirmDeleteDialog
        open={!!unlinkTarget}
        onOpenChange={(open) => { if (!open) setUnlinkTarget(null); }}
        title="Desvincular parte?"
        description={`${unlinkTarget?.name ?? ""} deixa de constar neste processo. O cadastro do cliente não é alterado.`}
        onConfirm={unlinkParty}
      />
    </div>
  );
}

function DataRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex min-h-8 items-center border-b border-border/50 py-1 text-sm">
      <p className="min-w-0">
        <span className="font-semibold text-foreground">{label}: </span>
        <span className={cn(!value && "text-muted-foreground/60")}>{value || "Não cadastrado"}</span>
      </p>
    </div>
  );
}

function EditableDataRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value?: string | null;
  onEdit: () => void;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2 border-b border-border/50 py-1 text-sm">
      <p className="min-w-0">
        <span className="font-semibold text-foreground">{label}: </span>
        <span className={cn(!value && "text-muted-foreground/60")}>{value || "Não cadastrado"}</span>
      </p>
      <InlineEditButton label={`Editar ${label.toLocaleLowerCase("pt-BR")}`} onClick={onEdit} />
    </div>
  );
}

function InlineEditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Pencil className="size-3.5" />
    </button>
  );
}
