"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ArrowLeft, Loader2, Pencil, Plus, Star, Trash2, Undo2 } from "lucide-react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection, useDoc } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { dateMillis, formatDateTime } from "@/lib/normalize";
import type { Client, Process, Update } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { CodeBadge } from "@/components/shared/badges";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";
import { getProcessParties } from "@/components/shared/process-reference";
import { ProcessFormDialog } from "@/components/shared/process-form";
import { EditUpdateDialog, canEditUpdate } from "@/components/shared/edit-update-dialog";
import { SummarizeButton } from "@/components/shared/summarize-button";

export default function ProcessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const { data: process } = useDoc<Process>("processes", id);
  const { data: clients } = useCollection<Client>("clients");
  const { data: updatesByProcessId } = useCollection<Update>(
    "updates",
    { where: [["processId", "==", id]] },
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

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const client of clients ?? []) {
      map.set(client.id, client);
    }
    return map;
  }, [clients]);

  const timeline = useMemo(() => {
    const map = new Map<string, Update>();
    for (const item of [...(updatesByProcessId ?? []), ...(updatesByNumber ?? [])]) {
      if (!item.deleted) {
        map.set(item.id, item);
      }
    }
    return [...map.values()].sort(
      (a, b) => dateMillis(b.updateDate ?? b.createdAt) - dateMillis(a.updateDate ?? a.createdAt)
    );
  }, [updatesByProcessId, updatesByNumber]);

  if (process === undefined || !clients || !updatesByProcessId || (processNumber && !updatesByNumber)) {
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

  const linkedClients = (process.clientIds ?? []).map((clientId, index) => ({
    id: clientId,
    name: clientMap.get(clientId)?.name || process.clientNames?.[index] || clientId,
    code: clientMap.get(clientId)?.code,
    isMain: process.mainClientId === clientId,
  }));
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

  const softDelete = async () => {
    if (!user) return;
    await updateDoc(doc(db, "processes", process.id), {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: user.name,
    });
    toast({ title: "Processo movido para a lixeira" });
    router.push("/dashboard/processes");
  };

  const restore = async () => {
    await updateDoc(doc(db, "processes", process.id), { deleted: false, deletedAt: null, deletedBy: null });
    toast({ title: "Processo restaurado" });
  };

  const typeStyles: Record<string, string> = {
    Atendimento: "bg-blue-50/70 text-blue-700 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
    Anotação: "bg-amber-50/70 text-amber-800 border-amber-200/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
    Tarefa: "bg-violet-50/70 text-violet-700 border-violet-200/50 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/40",
    "Andamento Processual": "bg-emerald-50/70 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
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
          <span>
            {process.actionType || "Tipo de ação não informado"}
            {process.vara ? ` · ${process.vara}` : ""}
            {process.foro ? ` · ${process.foro}` : ""}
          </span>
        }
        badge={<Badge variant={process.status === "Ativo" ? "secondary" : "outline"}>{process.status}</Badge>}
      >
        <HelpTip label="Volta para a lista de processos.">
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/processes">
              <ArrowLeft className="mr-1.5 size-4" /> Processos
            </Link>
          </Button>
        </HelpTip>
        <HelpTip label="Edita todos os dados do processo, incluindo os clientes vinculados e o cliente principal.">
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 size-4" /> Editar
          </Button>
        </HelpTip>
        {!process.deleted && (
          <HelpTip label="Move o processo para a lixeira (reversível — nada é apagado do banco)." side="left">
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

      <section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface p-3">
          <h2 className="text-sm font-medium">Partes vinculadas</h2>
          <div className="mt-2 space-y-1.5 text-sm">
            {linkedClients.map((client) => (
              <Link
                key={client.id}
                href={`/dashboard/clients/${client.id}`}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-primary hover:bg-muted/60 hover:underline"
                title={client.isMain ? "Cliente principal — abrir ficha" : "Abrir ficha do cliente"}
              >
                {client.isMain && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                <CodeBadge code={client.code} />
                <span className="min-w-0 truncate">{client.name}</span>
              </Link>
            ))}
            {looseNames.map((name) => (
              <p key={name} className="rounded-md px-2 py-1 text-muted-foreground">
                {name}
              </p>
            ))}
            {process.parteContraria && (
              <p className="rounded-md px-2 py-1 text-muted-foreground">
                Parte contrária: {process.parteContraria}
                {process.polo ? ` · polo do cliente: ${process.polo}` : ""}
              </p>
            )}
            {!linkedClients.length && !looseNames.length && !process.parteContraria && (
              <p className="text-xs text-muted-foreground">
                Nenhuma parte vinculada — use Editar para vincular clientes.
              </p>
            )}
          </div>
          {getProcessParties(process) && (
            <p className="mt-2 text-[11px] text-muted-foreground">Resumo: {getProcessParties(process)}</p>
          )}
        </div>

        <div className="surface p-3">
          <h2 className="text-sm font-medium">Dados principais</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-[11px] text-muted-foreground">Polo</dt>
              <dd>{process.polo || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Instância</dt>
              <dd>{process.instancia || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Classe</dt>
              <dd>{process.classe || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Assunto</dt>
              <dd>{process.assunto || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Juiz</dt>
              <dd>{process.juiz || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Última atualização</dt>
              <dd>{formatDateTime(process.lastUpdate ?? process.updatedAt)}</dd>
            </div>
          </dl>
          {process.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{process.notes}</p>
          )}
        </div>
      </section>

      <section className="surface p-3">
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
            <div key={item.id} className="rounded-md border bg-card px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge
                  variant="outline"
                  className={cn("font-medium shadow-none", typeStyles[item.type] || "bg-muted text-muted-foreground")}
                >
                  {item.type}
                </Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {formatDateTime(item.updateDate ?? item.createdAt)}
                  {canEditUpdate(item, user?.id, isAdmin) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => setEditingUpdate(item)}
                      title="Editar ou excluir este registro"
                    >
                      <Pencil className="size-3" />
                    </Button>
                  )}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{item.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">por {item.author}</p>
            </div>
          ))}
          {timeline.length === 0 && (
            <EmptyState
              title="Nenhum andamento vinculado"
              description="Registre o primeiro andamento acima — ele também aparece na linha do tempo do cliente."
              className="border-0 bg-transparent"
            />
          )}
        </div>
      </section>

      <ProcessFormDialog open={editOpen} onOpenChange={setEditOpen} process={process} />
      <EditUpdateDialog
        update={editingUpdate}
        open={!!editingUpdate}
        onOpenChange={(o) => !o && setEditingUpdate(null)}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover processo para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              O processo {process.processNumber} deixará de aparecer nas listas, mas pode ser restaurado
              depois. Nada é apagado do banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={softDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Mover para lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
