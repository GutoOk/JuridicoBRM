"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gavel,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useDoc } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatDateTime, toDate } from "@/lib/normalize";
import type { Update } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PriorityBadge } from "@/components/shared/badges";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";
import { TaskDialog } from "@/components/shared/task-dialog";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: task } = useDoc<Update>("updates", id);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  if (task === undefined) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!task || task.type !== "Tarefa" || (task.deleted && !isAdmin)) {
    return <div className="page-shell"><EmptyState title="Tarefa não encontrada" description="Não foi possível localizar este registro." /></div>;
  }

  const due = toDate(task.dueDate);
  const late = task.status !== "Concluída" && !!due && due.getTime() < Date.now() - 86400000;
  const clientIds = task.clientIds?.length ? task.clientIds : task.clientId ? [task.clientId] : [];
  const clientNames = task.clientNames?.length ? task.clientNames : task.clientName ? [task.clientName] : [];
  const processIds = task.processIds?.length ? task.processIds : task.processId ? [task.processId] : [];
  const processNumbers = task.processNumbers?.length ? task.processNumbers : task.processNumber ? [task.processNumber] : [];
  const linkedClients = Array.from({ length: Math.max(clientIds.length, clientNames.length) }, (_, index) => ({ id: clientIds[index], name: clientNames[index] ?? "Cliente" }));
  const linkedProcesses = Array.from({ length: Math.max(processIds.length, processNumbers.length) }, (_, index) => ({ id: processIds[index], number: processNumbers[index] ?? "Processo" }));

  const toggleDone = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const completing = task.status !== "Concluída";
      await updateDoc(doc(db, "updates", task.id), {
        status: completing ? "Concluída" : "Pendente",
        completedAt: completing ? serverTimestamp() : null,
        completedBy: completing ? user.name : null,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      toast({ title: completing ? "Tarefa concluída" : "Tarefa reaberta" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar tarefa" });
    } finally {
      setSaving(false);
    }
  };

  const hideTask = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "updates", task.id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.name,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      toast({ title: "Tarefa excluída" });
      router.push("/dashboard/tasks");
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir tarefa" });
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const restore = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "updates", task.id), {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      toast({ title: "Tarefa restaurada" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar tarefa" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="acompanhamento de tarefa"
        title={task.description}
        description={linkedProcesses.length > 0 ? `${linkedProcesses.length} processo(s) vinculado(s)` : linkedClients.length > 0 ? `${linkedClients.length} cliente(s) vinculado(s)` : "Tarefa geral da equipe"}
        badge={<Badge variant={task.deleted ? "outline" : task.status === "Concluída" ? "secondary" : late ? "destructive" : "outline"}>{task.deleted ? "Excluída" : late ? "Vencida" : task.status ?? "Pendente"}</Badge>}
      >
        <Button variant="outline" asChild><Link href="/dashboard/tasks"><ArrowLeft className="mr-2 size-4" />Voltar</Link></Button>
        {task.deleted ? (
          <HelpTip label="Restaura a tarefa para a fila sem perder seu histórico."><Button onClick={restore} disabled={saving}><ArchiveRestore className="mr-2 size-4" />Restaurar</Button></HelpTip>
        ) : (
          <>
            <HelpTip label="Abre a edição em um painel lateral rolável."><Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-2 size-4" />Editar</Button></HelpTip>
            <HelpTip label={task.status === "Concluída" ? "Reabre a tarefa como pendente." : "Registra a conclusão com seu nome, data e hora."}>
              <Button onClick={toggleDone} disabled={saving}>
                {task.status === "Concluída" ? <RotateCcw className="mr-2 size-4" /> : <CheckCircle2 className="mr-2 size-4" />}
                {task.status === "Concluída" ? "Reabrir" : "Concluir"}
              </Button>
            </HelpTip>
          </>
        )}
      </PageHeader>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="surface p-3">
          <h2 className="mb-3 text-sm font-medium">Detalhes</h2>
          <dl className="grid gap-x-4 gap-y-3 text-[13px] sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Responsável</dt><dd className="mt-0.5 flex items-center gap-1.5"><UserRound className="size-3.5 text-muted-foreground" />{task.responsibleNames?.join(", ") || task.responsible || "Não definido"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Prioridade</dt><dd className="mt-0.5"><PriorityBadge priority={task.priority} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Prazo</dt><dd className={cn("mt-0.5 flex items-center gap-1.5", late && "text-destructive")}><CalendarDays className="size-3.5" />{task.dueDate ? formatDate(task.dueDate) : "Sem prazo"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Criada por</dt><dd className="mt-0.5">{task.author || "Não informado"} · {formatDateTime(task.createdAt)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Clientes</dt><dd className="mt-0.5 space-y-1">{linkedClients.length > 0 ? linkedClients.map((client, index) => client.id ? <Link key={`${client.id}-${index}`} href={`/dashboard/clients/${client.id}`} className="flex items-center gap-1.5 hover:underline"><UserRound className="size-3.5" />{client.name}</Link> : <span key={`client-${index}`} className="block">{client.name}</span>) : "Tarefa geral"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Processos</dt><dd className="mt-0.5 space-y-1">{linkedProcesses.length > 0 ? linkedProcesses.map((process, index) => process.id ? <Link key={`${process.id}-${index}`} href={`/dashboard/processes/${process.id}`} className="flex items-center gap-1.5 hover:underline"><Gavel className="size-3.5" />{process.number}</Link> : <span key={`process-${index}`} className="block">{process.number}</span>) : "Nenhum processo"}</dd></div>
          </dl>
          {task.updatedAt && <p className="mt-4 border-t pt-2 text-[11px] text-muted-foreground">Última alteração por {task.updatedBy || "usuário não informado"} em {formatDateTime(task.updatedAt)}</p>}
        </div>

        <aside className="surface p-3">
          <h2 className="mb-3 text-sm font-medium">Marcos</h2>
          <div className="space-y-0">
            <Milestone icon={Clock3} label="Tarefa criada" detail={`${task.author || "Autor não informado"} · ${formatDateTime(task.createdAt)}`} last={!task.completedAt && !task.deletedAt} />
            {task.completedAt && <Milestone icon={CheckCircle2} label="Tarefa concluída" detail={`${task.completedBy || "Usuário não informado"} · ${formatDateTime(task.completedAt)}`} last={!task.deletedAt} />}
            {task.deletedAt && <Milestone icon={Trash2} label="Tarefa excluída" detail={`${task.deletedBy || "Usuário não informado"} · ${formatDateTime(task.deletedAt)}`} last />}
          </div>
        </aside>
      </section>

      {!task.deleted && (
        <div className="surface flex justify-end p-2">
          <HelpTip label="Exclui esta tarefa.">
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-2 size-4" />Excluir tarefa</Button>
          </HelpTip>
        </div>
      )}

      <TaskDialog prefill={null} task={task} open={editing} onOpenChange={setEditing} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir tarefa?</AlertDialogTitle><AlertDialogDescription>Deseja excluir esta tarefa?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={hideTask} disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Milestone({ icon: Icon, label, detail, last = false }: { icon: typeof Clock3; label: string; detail: string; last?: boolean }) {
  return (
    <div className="relative flex gap-2.5 pb-4 text-xs">
      {!last && <span className="absolute bottom-0 left-[7px] top-4 w-px bg-border" />}
      <Icon className="relative z-10 mt-0.5 size-4 shrink-0 bg-background text-muted-foreground" />
      <div className="min-w-0"><p className="font-medium text-foreground">{label}</p><p className="mt-0.5 leading-snug text-muted-foreground">{detail}</p></div>
    </div>
  );
}
