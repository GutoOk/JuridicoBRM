"use client";

import { use, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  Loader2,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Undo2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection, useDoc } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { caseGrade, pendingItems } from "@/lib/readiness";
import { caseFileId, addNote, setCaseGrade, updateClient } from "@/lib/db-actions";
import {
  formatPhone,
  telLink,
  waLink,
  formatDateTime,
  formatRelative,
  dateMillis,
} from "@/lib/normalize";
import type { CaseFile, Client, ClientType, Update, Process } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CodeBadge, GradeSelect, TypeChip, PriorityBadge } from "@/components/shared/badges";
import { ChecklistPanel } from "@/components/shared/checklist-panel";
import { CaseFieldsPanel } from "@/components/shared/case-fields-panel";
import { ContactDialog } from "@/components/shared/contact-dialog";
import { TaskDialog, type TaskPrefill } from "@/components/shared/task-dialog";
import { MessagePicker } from "@/components/shared/message-picker";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";
import { ProcessReference, getProcessParties } from "@/components/shared/process-reference";
import { ProcessFormDialog } from "@/components/shared/process-form";
import { EditUpdateDialog, canEditUpdate } from "@/components/shared/edit-update-dialog";
import { SummarizeButton } from "@/components/shared/summarize-button";
import { ClientNestingCard } from "@/components/shared/client-nesting-card";
import { effectiveClientTypeIds } from "@/lib/client-nesting";
import { searchable } from "@/lib/normalize";
import { Input } from "@/components/ui/input";

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const { data: client } = useDoc<Client>("clients", id);
  const { data: allClients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: updatesByClientId } = useCollection<Update>("updates", { where: [["clientId", "==", id]] }, [id]);
  const { data: updatesByClientIds } = useCollection<Update>("updates", { where: [["clientIds", "array-contains", id]] }, [id]);
  const { data: caseFiles } = useCollection<CaseFile>("caseFiles", { where: [["clientId", "==", id]] }, [id]);
  const { data: processes } = useCollection<Process>("processes");

  const [contactOpen, setContactOpen] = useState(false);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [processFormOpen, setProcessFormOpen] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<Update | null>(null);
  const [linkSearch, setLinkSearch] = useState("");

  const processMap = useMemo(() => {
    const map = new Map<string, Process>();
    for (const p of processes ?? []) {
      map.set(p.id, p);
      if (p.processNumber) {
        map.set(p.processNumber, p);
      }
    }
    return map;
  }, [processes]);

  if (client === undefined || !allClients || !types || !processes) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (client === null) {
    return <p className="text-muted-foreground">Cliente não encontrado.</p>;
  }

  const clientTypes = (types ?? [])
    .filter((t) => effectiveClientTypeIds(client, allClients).includes(t.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const cfMap = new Map((caseFiles ?? []).map((cf) => [cf.id, cf]));

  const phone = client.phone || client.phones?.find((p) => p.isPrimary)?.number || client.phones?.[0]?.number;
  const whats = client.whatsapp || phone;
  const tel = telLink(phone);
  const wa = waLink(whats);
  const email = client.email || client.emails?.find((e) => e.isPrimary)?.address || client.emails?.[0]?.address;
  const address =
    client.addressLine ||
    (client.addresses?.[0]
      ? [client.addresses[0].street, client.addresses[0].number, client.addresses[0].district]
          .filter(Boolean)
          .join(", ")
      : "");

  const clientUpdates = Array.from(
    new Map([...(updatesByClientId ?? []), ...(updatesByClientIds ?? [])].map((update) => [update.id, update])).values()
  );
  const timeline = clientUpdates
    .filter((u) => !u.deleted)
    .sort((a, b) => dateMillis(b.updateDate ?? b.createdAt) - dateMillis(a.updateDate ?? a.createdAt));
  const tasks = timeline.filter((u) => u.type === "Tarefa" && u.status !== "Concluída");

  const clientProcesses = (processes ?? []).filter(
    (p) => !p.deleted && (p.clientIds ?? []).includes(client.id)
  );
  const linkCandidates =
    linkSearch.trim().length >= 2
      ? (processes ?? [])
          .filter(
            (p) =>
              !p.deleted &&
              !(p.clientIds ?? []).includes(client.id) &&
              (p.processNumber.toLowerCase().includes(linkSearch.trim().toLowerCase()) ||
                (p.clientNames ?? []).some((n) => searchable(n).includes(searchable(linkSearch))))
          )
          .slice(0, 6)
      : [];

  const linkProcess = async (p: Process) => {
    if (!user) return;
    try {
      // Mantém clientIds e clientNames alinhados (mesma ordem).
      await updateDoc(doc(db, "processes", p.id), {
        clientIds: [...(p.clientIds ?? []), client.id],
        clientNames: [...(p.clientNames ?? []), client.name],
        mainClientId: p.mainClientId ?? client.id,
        updatedAt: serverTimestamp(),
      });
      setLinkSearch("");
      toast({ title: "Processo vinculado", description: p.processNumber });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao vincular processo" });
    }
  };

  const restore = async () => {
    if (!user) return;
    await updateDoc(doc(db, "clients", client.id), { deleted: false, deletedAt: null, deletedBy: null });
    toast({ title: "Cliente restaurado" });
  };

  const saveNote = async () => {
    if (!user || !noteText.trim()) return;
    try {
      await addNote(client, noteText.trim(), user);
      setNoteText("");
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar anotação" });
    }
  };

  const patchClient = async (data: Record<string, unknown>) => {
    if (!user) return;
    try {
      await updateClient(client.id, data, user);
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar" });
    }
  };

  return (
    <div className="page-shell max-w-6xl">
      {client.deleted && (
        <div className="surface flex items-center justify-between border-destructive bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">
            Este cliente está na lixeira e não aparece nas listas.
            {client.mergedIntoClientId && (
              <> Foi unificado em <Link href={`/dashboard/clients/${client.mergedIntoClientId}`} className="underline">{client.mergedIntoClientName || "outro cliente"}</Link>.</>
            )}
          </p>
          <Button size="sm" variant="outline" onClick={restore}>
            <Undo2 className="mr-2 size-4" /> Restaurar
          </Button>
        </div>
      )}

      {/* Cabeçalho */}
      <PageHeader
        eyebrow="ficha do cliente"
        title={client.name}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <CodeBadge code={client.code} className="text-sm" />
            <PriorityBadge priority={client.priority} />
          </span>
        }
        description={
          <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {clientTypes.map((t) => (
              <TypeChip key={t.id} type={t} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {phone && (
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Phone className="size-3.5" /> {formatPhone(phone)}
              </span>
            )}
            {email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" /> {email}
              </span>
            )}
            {address && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {address}
                {client.city ? ` — ${client.city}/${client.state ?? ""}` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Último contato: {formatRelative(client.lastContactAt)}
            {client.lastContactResult ? ` (${client.lastContactResult})` : ""}
          </p>
          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <InlineEdit
              label="Próxima ação"
              value={client.nextAction ?? ""}
              placeholder="Ex.: ligar sexta para cobrar extrato"
              help="O que precisa acontecer em seguida com este cliente. Salva sozinho ao sair do campo."
              onSave={(v) => patchClient({ nextAction: v })}
            />
            <InlineEdit
              label="Anotações"
              value={client.notes ?? ""}
              placeholder="Observações gerais do cliente…"
              help="Observações fixas do cadastro (as mesmas do formulário de edição). Salva sozinho ao sair do campo."
              multiline
              onSave={(v) => patchClient({ notes: v })}
            />
          </div>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          {tel && (
            <HelpTip label="Inicia uma ligação usando o aplicativo de telefone disponível.">
            <Button size="sm" variant="outline" asChild>
              <a href={tel}>
                <Phone className="mr-1.5 size-4" /> Ligar
              </a>
            </Button>
            </HelpTip>
          )}
          {wa && (
            <HelpTip label="Abre conversa no WhatsApp com este cliente.">
            <Button size="sm" variant="outline" className="text-emerald-700" asChild>
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 size-4" /> WhatsApp
              </a>
            </Button>
            </HelpTip>
          )}
          <HelpTip label="Registra resultado de ligação, WhatsApp ou outro contato e atualiza o último contato.">
          <Button size="sm" onClick={() => setContactOpen(true)}>
            <Plus className="mr-1.5 size-4" /> Registrar atendimento
          </Button>
          </HelpTip>
          <HelpTip label="Abre o formulário completo para alterar dados cadastrais e operacionais.">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/clients/${client.id}/edit`}>
              <Pencil className="mr-1.5 size-4" /> Editar
            </Link>
          </Button>
          </HelpTip>
        </div>
      </PageHeader>

      <Tabs defaultValue="timeline">
        <TabsList className="surface h-auto flex-wrap p-1">
          <TabsTrigger value="timeline">Andamentos ({timeline.length})</TabsTrigger>
          <TabsTrigger value="data">Dados do cliente</TabsTrigger>
          <TabsTrigger value="nesting">Vínculos entre clientes</TabsTrigger>
          <TabsTrigger value="processes">Processos ({clientProcesses.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas pendentes ({tasks.length})</TabsTrigger>
          {clientTypes.map((t) => (
            <TabsTrigger key={t.id} value={`type-${t.id}`}>
              {t.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {clientTypes.map((t) => {
          const cf = cfMap.get(caseFileId(client.id, t.id));
          const grade = caseGrade(cf);
          const pending = pendingItems(t, cf);
          return (
            <TabsContent key={t.id} value={`type-${t.id}`} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  Prontidão:
                  <GradeSelect
                    grade={grade}
                    onChange={(g) => {
                      if (user) {
                        setCaseGrade(client.id, t.id, g, user).catch(() =>
                          toast({ variant: "destructive", title: "Erro ao salvar prontidão" })
                        );
                      }
                    }}
                  />
                </span>
                <span className="text-sm text-muted-foreground">
                  {pending.length} pendência(s) no checklist
                </span>
              </div>
              {(t.caseFields ?? []).some((field) => !field.deleted) && (
                <Card className="surface">
                  <CardHeader className="pb-3">
                    <CardTitle>Dados do caso</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CaseFieldsPanel clientId={client.id} type={t} caseFile={cf} />
                  </CardContent>
                </Card>
              )}
              <Card className="surface">
                <CardHeader className="pb-3">
                  <CardTitle>Checklist</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChecklistPanel clientId={client.id} type={t} caseFile={cf} />
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}

        <TabsContent value="timeline" className="space-y-3">
          <div className="flex gap-2">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Nova anotação sobre o cliente…"
              rows={2}
            />
            <div className="flex flex-col gap-2">
              <Button onClick={saveNote} disabled={!noteText.trim()}>
                Salvar
              </Button>
              <SummarizeButton
                context={`cliente ${client.name}${client.code ? ` (${client.code})` : ""}`}
                lines={timeline.map(
                  (u) =>
                    `${formatDateTime(u.updateDate ?? u.createdAt)} — ${u.type}${u.channel ? ` (${u.channel}: ${u.result ?? ""})` : ""}: ${u.description}`
                )}
              />
            </div>
          </div>
          {timeline.length === 0 && (
            <EmptyState
              title="Nenhum andamento registrado"
              description="Use a caixa acima para criar a primeira anotação sobre o cliente."
            />
          )}
          <div className="space-y-2">
            {timeline.map((u) => {
              const proc =
                (u.processId ? processMap.get(u.processId) : undefined) ||
                (u.processNumber ? processMap.get(u.processNumber) : undefined);

              const typeStyles: Record<string, string> = {
                Atendimento: "bg-blue-50/70 text-blue-700 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
                Anotação: "bg-amber-50/70 text-amber-800 border-amber-200/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
                Tarefa: "bg-violet-50/70 text-violet-700 border-violet-200/50 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/40",
                "Andamento Processual": "bg-emerald-50/70 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
              };

              return (
                <div key={u.id} className="surface p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      <Badge variant="outline" className={cn("mr-2 font-medium shadow-none", typeStyles[u.type] || "bg-muted text-muted-foreground")}>
                        {u.type}
                      </Badge>
                      {u.type === "Atendimento" && u.channel ? `${u.channel} — ${u.result ?? ""}` : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {formatDateTime(u.updateDate ?? u.createdAt)}
                      {u.type !== "Tarefa" && canEditUpdate(u, user?.id, isAdmin) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => setEditingUpdate(u)}
                          title="Editar ou excluir este registro"
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                    </span>
                  </div>
                  {u.type === "Tarefa" ? (
                    <Link href={`/dashboard/tasks/${u.id}`} className="mt-1 block whitespace-pre-wrap font-medium hover:underline" title="Abrir acompanhamento da tarefa">
                      {u.description}
                    </Link>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap">{u.description}</p>
                  )}

                  {u.type === "Tarefa" && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Status: <Badge variant={u.status === "Concluída" ? "outline" : "secondary"} className="ml-1 h-5">{u.status ?? "Pendente"}</Badge></span>
                      <span>Responsável: <span className="text-foreground">{u.responsibleNames?.join(", ") || u.responsible || "Não definido"}</span></span>
                      <span>Prioridade: <PriorityBadge priority={u.priority} /></span>
                      <span>Prazo: <span className="text-foreground">{u.dueDate ? formatDateTime(u.dueDate).split(" ")[0] : "Sem prazo"}</span></span>
                      {u.completedAt && <span>Concluída por {u.completedBy || "usuário não informado"} em {formatDateTime(u.completedAt)}</span>}
                    </div>
                  )}

                  {u.type === "Tarefa" && (() => {
                    const processIds = u.processIds?.length ? u.processIds : u.processId ? [u.processId] : [];
                    const processNumbers = u.processNumbers?.length ? u.processNumbers : u.processNumber ? [u.processNumber] : [];
                    const count = Math.max(processIds.length, processNumbers.length);
                    if (count === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Array.from({ length: count }, (_, index) => {
                          const linkedProcess = (processIds[index] ? processMap.get(processIds[index]) : undefined) || (processNumbers[index] ? processMap.get(processNumbers[index]) : undefined);
                          const number = processNumbers[index] || linkedProcess?.processNumber || "Processo";
                          return linkedProcess ? <Link key={`${linkedProcess.id}-${index}`} href={`/dashboard/processes/${linkedProcess.id}`} className="text-xs text-primary hover:underline">{number}</Link> : <span key={`process-${index}`} className="text-xs text-muted-foreground">{number}</span>;
                        })}
                      </div>
                    );
                  })()}

                  {u.type === "Andamento Processual" && (
                    <ProcessReference process={proc} processNumber={u.processNumber} />
                  )}

                  <p className="mt-1 text-xs text-muted-foreground">por {u.author}</p>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="nesting">
          <ClientNestingCard client={client} clients={allClients} />
        </TabsContent>

        <TabsContent value="processes" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <HelpTip label="Abre o formulário de processo já com este cliente vinculado.">
              <Button size="sm" onClick={() => setProcessFormOpen(true)}>
                <Plus className="mr-1.5 size-4" /> Novo processo
              </Button>
            </HelpTip>
            <div className="relative w-full max-w-sm">
              <Input
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Vincular processo existente (busque pelo número)…"
                className="h-8"
                title="Busca um processo já cadastrado para vincular este cliente a ele"
              />
              {linkCandidates.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                  {linkCandidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => linkProcess(p)}
                    >
                      <span className="font-code text-[13px]">{p.processNumber}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {(p.clientNames ?? []).join(", ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {clientProcesses.length === 0 && (
            <EmptyState
              title="Nenhum processo vinculado"
              description="Cadastre um novo processo para este cliente ou vincule um processo já existente pela busca acima."
            />
          )}
          <div className="space-y-2">
            {clientProcesses.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/processes/${p.id}`}
                className="surface flex flex-wrap items-center justify-between gap-2 p-3 text-sm transition-colors hover:bg-muted/40"
                title="Abrir a página do processo"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-code text-[13px] text-primary">{p.processNumber}</span>
                  <span className="truncate text-muted-foreground">
                    {p.actionType || "—"}
                    {p.vara ? ` · ${p.vara}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {getProcessParties(p) && (
                    <span className="hidden max-w-72 truncate text-xs text-muted-foreground md:inline">
                      {getProcessParties(p)}
                    </span>
                  )}
                  <Badge variant={p.status === "Ativo" ? "secondary" : "outline"}>{p.status}</Badge>
                </span>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-3">
          <Button
            size="sm"
            onClick={() => {
              setTaskPrefill({ clientId: client.id, clientName: client.name, clientCode: client.code });
              setTaskOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-4" /> Nova tarefa
          </Button>
          {tasks.length === 0 && (
            <EmptyState
              title="Nenhuma tarefa pendente"
              description="Crie uma tarefa quando houver algo concreto para a equipe fazer."
            />
          )}
          {tasks.map((t) => (
            <div key={t.id} className="surface p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/dashboard/tasks/${t.id}`} className="font-medium hover:underline" title="Abrir acompanhamento da tarefa">{t.description}</Link>
                <PriorityBadge priority={t.priority} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Responsável: {t.responsibleNames?.join(", ") || t.responsible || "—"}
                {t.dueDate ? ` · Prazo: ${formatDateTime(t.dueDate).split(" ")[0]}` : ""}
              </p>
              {(() => {
                const processIds = t.processIds?.length ? t.processIds : t.processId ? [t.processId] : [];
                const processNumbers = t.processNumbers?.length ? t.processNumbers : t.processNumber ? [t.processNumber] : [];
                const count = Math.max(processIds.length, processNumbers.length);
                if (count === 0) return null;
                return <div className="mt-1 flex flex-wrap gap-2">{Array.from({ length: count }, (_, index) => {
                  const linkedProcess = (processIds[index] ? processMap.get(processIds[index]) : undefined) || (processNumbers[index] ? processMap.get(processNumbers[index]) : undefined);
                  const number = processNumbers[index] || linkedProcess?.processNumber || "Processo";
                  return linkedProcess ? <Link key={`${linkedProcess.id}-${index}`} href={`/dashboard/processes/${linkedProcess.id}`} className="text-xs text-primary hover:underline">{number}</Link> : <span key={`process-${index}`} className="text-xs text-muted-foreground">{number}</span>;
                })}</div>;
              })()}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="data" className="space-y-3">
          <Card className="surface">
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 pt-4 text-sm sm:grid-cols-2">
              <DataRow label="CPF/CNPJ" value={client.cpfCnpj} />
              <DataRow label="Tipo de pessoa" value={client.type} />
              <DataRow label="WhatsApp" value={client.whatsapp ? formatPhone(client.whatsapp) : ""} />
              <DataRow label="Origem do contato" value={client.origin} />
              <DataRow label="RG" value={client.rg ? `${client.rg}${client.rgIssuer ? ` (${client.rgIssuer})` : ""}` : ""} />
              <DataRow label="Profissão" value={client.profession} />
              <DataRow label="Estado civil" value={client.maritalStatus} />
              <DataRow label="Nacionalidade" value={client.nationality} />
              <DataRow label="Nome da mãe" value={client.motherName} />
              <DataRow
                label="Complemento e CEP do endereço principal"
                value={[client.addresses?.[0]?.complement, client.zipCode ? `CEP ${client.zipCode}` : ""].filter(Boolean).join(" · ")}
              />
              <DataRow
                label="Cadastrado"
                value={`${formatDateTime(client.createdAt)} por ${client.createdBy ?? "—"}`}
              />
              <DataRow
                label="Atualizado"
                value={`${formatDateTime(client.updatedAt)} por ${client.updatedBy ?? "—"}`}
              />
              {(client.phones ?? []).filter((item) => item.number && item.number !== phone).length > 0 && (
                <DataGroup
                  title="Telefones adicionais"
                  items={(client.phones ?? [])
                    .filter((item) => item.number && item.number !== phone)
                    .map((item) => `${formatPhone(item.number)}${item.description ? ` · ${item.description}` : ""}`)}
                />
              )}
              {(client.emails ?? []).filter((item) => item.address && item.address !== email).length > 0 && (
                <DataGroup
                  title="E-mails adicionais"
                  items={(client.emails ?? [])
                    .filter((item) => item.address && item.address !== email)
                    .map((item) => `${item.address}${item.description ? ` · ${item.description}` : ""}`)}
                />
              )}
              {(client.addresses ?? []).slice(1).length > 0 && (
                <DataGroup
                  title="Endereços adicionais"
                  items={(client.addresses ?? []).slice(1).map((item) =>
                    [
                      item.description,
                      [item.street, item.number].filter(Boolean).join(", "),
                      item.complement,
                      item.district,
                      [item.city, item.state].filter(Boolean).join("/"),
                      item.zipCode ? `CEP ${item.zipCode}` : "",
                    ].filter(Boolean).join(" · ")
                  )}
                />
              )}
            </CardContent>
          </Card>

          <Card className="surface">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1">
                Mensagem padrão
                <HelpTip label="Escolha um modelo, confira o texto preenchido com os dados do cliente e copie ou abra direto no WhatsApp." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MessagePicker
                client={client}
                pendencies={
                  clientTypes[0]
                    ? pendingItems(clientTypes[0], cfMap.get(caseFileId(client.id, clientTypes[0].id)))
                    : []
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ContactDialog client={client} open={contactOpen} onOpenChange={setContactOpen} />
      <TaskDialog prefill={taskPrefill} open={taskOpen} onOpenChange={setTaskOpen} />
      <ProcessFormDialog
        open={processFormOpen}
        onOpenChange={setProcessFormOpen}
        prefillClient={{ id: client.id, name: client.name }}
      />
      <EditUpdateDialog
        update={editingUpdate}
        open={!!editingUpdate}
        onOpenChange={(o) => !o && setEditingUpdate(null)}
      />

    </div>
  );
}

function DataRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-medium text-muted-foreground">{label}: </span>
      {value}
    </div>
  );
}

function DataGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-muted/15 p-2 sm:col-span-2">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {items.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}
      </div>
    </div>
  );
}

/**
 * Campo editável no próprio card: clique, digite e saia do campo — salva sozinho.
 * Usado para "Próxima ação" e "Anotações" no cabeçalho da ficha.
 */
function InlineEdit({
  label,
  value,
  placeholder,
  help,
  multiline,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  help: string;
  multiline?: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft.trim() === (value ?? "").trim()) return;
    onSave(draft.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const cls =
    "w-full rounded-md border border-transparent bg-muted/40 px-2 py-1 text-[13px] text-foreground placeholder:text-muted-foreground/60 transition-colors hover:border-border focus:border-ring focus:bg-background focus:outline-none";

  return (
    <div title={help}>
      <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {label}
        {saved && <span className="text-emerald-600">salvo ✓</span>}
      </p>
      {multiline ? (
        <textarea
          rows={2}
          className={cn(cls, "resize-none leading-snug")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={cls}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
