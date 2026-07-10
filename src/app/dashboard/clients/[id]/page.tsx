"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  Loader2,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection, useDoc } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { computeReadiness } from "@/lib/readiness";
import { caseFileId, addNote } from "@/lib/db-actions";
import {
  formatPhone,
  telLink,
  waLink,
  formatDateTime,
  formatRelative,
  dateMillis,
} from "@/lib/normalize";
import type { CaseFile, Client, ClientType, Update } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CodeBadge, ReadinessBadge, TypeChip, PriorityBadge } from "@/components/shared/badges";
import { ChecklistPanel } from "@/components/shared/checklist-panel";
import { CaseFieldsPanel } from "@/components/shared/case-fields-panel";
import { ContactDialog } from "@/components/shared/contact-dialog";
import { TaskDialog, type TaskPrefill } from "@/components/shared/task-dialog";
import { MessagePicker } from "@/components/shared/message-picker";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const { data: client } = useDoc<Client>("clients", id);
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: updates } = useCollection<Update>("updates", { where: [["clientId", "==", id]] }, [id]);
  const { data: caseFiles } = useCollection<CaseFile>("caseFiles", { where: [["clientId", "==", id]] }, [id]);

  const [contactOpen, setContactOpen] = useState(false);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (client === undefined || !types) {
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
    .filter((t) => (client.typeIds ?? []).includes(t.id))
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

  const timeline = (updates ?? [])
    .filter((u) => !u.deleted)
    .sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));
  const tasks = timeline.filter((u) => u.type === "Tarefa" && u.status !== "Concluída");

  const softDelete = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "clients", client.id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.name,
      });
      toast({ title: "Cliente movido para a lixeira" });
      router.push("/dashboard/clients");
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" });
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

  return (
    <div className="page-shell max-w-6xl">
      {client.deleted && (
        <div className="surface flex items-center justify-between border-destructive bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">
            Este cliente está na lixeira e não aparece nas listas.
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
            {client.generalStatus && <Badge variant="secondary">{client.generalStatus}</Badge>}
            {client.responsibleName && (
              <span className="text-sm text-muted-foreground">Responsável: {client.responsibleName}</span>
            )}
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
            {client.nextAction && (
              <>
                {" "}
                · <span className="font-medium text-foreground">Próxima ação: {client.nextAction}</span>
              </>
            )}
          </p>
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
            <Plus className="mr-1.5 size-4" /> Registrar contato
          </Button>
          </HelpTip>
          <HelpTip label="Abre o formulário completo para alterar dados cadastrais e operacionais.">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/clients/${client.id}/edit`}>
              <Pencil className="mr-1.5 size-4" /> Editar
            </Link>
          </Button>
          </HelpTip>
          {!client.deleted && (
            <HelpTip label="Move o cliente para a lixeira sem apagar os dados do banco." side="left">
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
        </div>
      </PageHeader>

      <Tabs defaultValue={clientTypes[0] ? `type-${clientTypes[0].id}` : "timeline"}>
        <TabsList className="surface h-auto flex-wrap p-1">
          {clientTypes.map((t) => (
            <TabsTrigger key={t.id} value={`type-${t.id}`}>
              {t.name}
            </TabsTrigger>
          ))}
          <TabsTrigger value="timeline">Andamentos ({timeline.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="message">Mensagem</TabsTrigger>
          <TabsTrigger value="data">Dados</TabsTrigger>
        </TabsList>

        {clientTypes.map((t) => {
          const cf = cfMap.get(caseFileId(client.id, t.id));
          const readiness = computeReadiness(t, cf, client);
          return (
            <TabsContent key={t.id} value={`type-${t.id}`} className="space-y-4">
              <div className="flex items-center gap-3">
                <ReadinessBadge readiness={readiness} />
                <span className="text-sm text-muted-foreground">
                  {readiness.requiredDone}/{readiness.requiredTotal} obrigatórios ·{" "}
                  {readiness.pendencies.length} pendência(s)
                </span>
              </div>
              {(t.caseFields ?? []).length > 0 && (
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
            <Button onClick={saveNote} disabled={!noteText.trim()}>
              Salvar
            </Button>
          </div>
          {timeline.length === 0 && (
            <EmptyState
              title="Nenhum andamento registrado"
              description="Use a caixa acima para criar a primeira anotação sobre o cliente."
            />
          )}
          <div className="space-y-2">
            {timeline.map((u) => (
              <div key={u.id} className="surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    <Badge variant="outline" className="mr-2">
                      {u.type}
                    </Badge>
                    {u.type === "Atendimento" && u.channel ? `${u.channel} — ${u.result ?? ""}` : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{u.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">por {u.author}</p>
              </div>
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
                <p className="font-medium">{t.description}</p>
                <PriorityBadge priority={t.priority} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Responsável: {t.responsible ?? "—"}
                {t.dueDate ? ` · Prazo: ${formatDateTime(t.dueDate).split(" ")[0]}` : ""}
              </p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="message">
          <Card className="surface">
            <CardContent className="pt-6">
              <MessagePicker
                client={client}
                pendencies={
                  clientTypes[0]
                    ? computeReadiness(clientTypes[0], cfMap.get(caseFileId(client.id, clientTypes[0].id)), client)
                        .pendencies
                    : []
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card className="surface">
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 pt-6 text-sm sm:grid-cols-2">
              <DataRow label="CPF/CNPJ" value={client.cpfCnpj} />
              <DataRow label="Tipo de pessoa" value={client.type} />
              <DataRow label="E-mail" value={email} />
              <DataRow label="Origem do contato" value={client.origin} />
              <DataRow label="RG" value={client.rg} />
              <DataRow label="Profissão" value={client.profession} />
              <DataRow label="Estado civil" value={client.maritalStatus} />
              <DataRow label="Nome da mãe" value={client.motherName} />
              <DataRow label="CEP" value={client.zipCode} />
              <DataRow
                label="Cadastrado"
                value={`${formatDateTime(client.createdAt)} por ${client.createdBy ?? "—"}`}
              />
              <DataRow
                label="Atualizado"
                value={`${formatDateTime(client.updatedAt)} por ${client.updatedBy ?? "—"}`}
              />
              {(client.phones ?? []).length > 0 && (
                <div className="sm:col-span-2">
                  <p className="font-medium text-muted-foreground">Telefones (cadastro antigo)</p>
                  {(client.phones ?? []).map((p, i) => (
                    <p key={i}>
                      {formatPhone(p.number)} {p.description ? `— ${p.description}` : ""}
                    </p>
                  ))}
                </div>
              )}
              {client.notes && (
                <div className="sm:col-span-2">
                  <p className="font-medium text-muted-foreground">Observações</p>
                  <p className="whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ContactDialog client={client} open={contactOpen} onOpenChange={setContactOpen} />
      <TaskDialog prefill={taskPrefill} open={taskOpen} onOpenChange={setTaskOpen} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover cliente para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              {client.name} deixará de aparecer nas listas e relatórios, mas os dados não são apagados e podem
              ser restaurados depois.
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

function DataRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-medium text-muted-foreground">{label}: </span>
      {value}
    </div>
  );
}
