"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, MessageCircle, Plus, ExternalLink, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { caseGrade, pendingItems, type PendingItem } from "@/lib/readiness";
import { setCaseGrade } from "@/lib/db-actions";
import { activeChecklistItems, displayStatus, ITEM_STATUS_META } from "@/lib/checklist";
import { formatPhone, telLink, waLink, formatDateTime, formatRelative, dateMillis } from "@/lib/normalize";
import type { CaseFile, Client, ClientType, Update } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CodeBadge, GradeSelect } from "./badges";
import { ChecklistPanel } from "./checklist-panel";
import { CaseFieldsPanel } from "./case-fields-panel";
import { ContactDialog } from "./contact-dialog";
import { TaskDialog, type TaskPrefill } from "./task-dialog";
import { MessagePicker } from "./message-picker";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/shared/page-shell";

/**
 * Painel lateral com tudo do cliente no contexto de uma operação:
 * checklist (3 estados), pendências, dados do caso, contatos e mensagens —
 * sem sair da tela de Operação. A prontidão é definida manualmente aqui.
 */
export function ClientDrawer({
  client,
  type,
  caseFile,
  open,
  onOpenChange,
}: {
  client: Client | null;
  type: ClientType | null;
  caseFile: CaseFile | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contactOpen, setContactOpen] = useState(false);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [hideOk, setHideOk] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);

  const { data: contacts } = useCollection<Update>(
    open && client ? "updates" : null,
    { where: [["clientId", "==", client?.id ?? ""]] },
    [client?.id, open]
  );

  useEffect(() => {
    if (!client) return;
    setShowAllPending(false);
    setHideOk(false);
  }, [client, open]);

  if (!client) return null;

  const grade = caseGrade(caseFile);
  const pending = type ? pendingItems(type, caseFile) : [];
  const activeItems = type ? activeChecklistItems(type) : [];
  const resolvedCount = activeItems.filter((i) => {
    const s = displayStatus(caseFile?.items?.[i.id]?.status);
    return s === "conferido" || s === "nao_se_aplica";
  }).length;

  const phone = client.phone || client.phones?.find((p) => p.isPrimary)?.number || client.phones?.[0]?.number;
  const whats = client.whatsapp || phone;
  const tel = telLink(phone);
  const wa = waLink(whats);

  const clientContacts = (contacts ?? [])
    .filter((u) => !u.deleted && u.type === "Atendimento")
    .sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));

  const changeGrade = async (g: typeof grade) => {
    if (!user || !type) return;
    try {
      await setCaseGrade(client.id, type.id, g, user);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar prontidão" });
    }
  };

  const openTaskFromPendency = (p: PendingItem) => {
    setTaskPrefill({
      description: `${p.name} — ${client.name}${client.code ? ` (${client.code})` : ""}`,
      clientId: client.id,
      clientName: client.name,
      clientCode: client.code,
    });
    setTaskOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-3 overflow-hidden bg-background p-4 sm:max-w-2xl">
          <SheetHeader className="space-y-1 text-left">
            <div className="flex items-center gap-2 pr-8">
              <CodeBadge code={client.code} />
              <SheetTitle className="truncate text-lg">{client.name}</SheetTitle>
              {type && <GradeSelect grade={grade} onChange={changeGrade} />}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {phone ? (
                <span className="font-medium">{formatPhone(phone)}</span>
              ) : (
                <Badge variant="destructive">Sem telefone</Badge>
              )}
              {tel && (
                <HelpTip label="Inicia ligação para este cliente.">
                  <Button size="sm" variant="outline" className="h-7" asChild>
                    <a href={tel}>
                      <Phone className="mr-1 size-3.5" /> Ligar
                    </a>
                  </Button>
                </HelpTip>
              )}
              {wa && (
                <HelpTip label="Abre o WhatsApp do cliente em nova aba.">
                  <Button size="sm" variant="outline" className="h-7 text-emerald-700" asChild>
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-1 size-3.5" /> WhatsApp
                    </a>
                  </Button>
                </HelpTip>
              )}
              <HelpTip label="Registra resultado do contato e atualiza o último contato do cliente.">
                <Button size="sm" className="h-7" onClick={() => setContactOpen(true)}>
                  <Plus className="mr-1 size-3.5" /> Registrar atendimento
                </Button>
              </HelpTip>
              <HelpTip label="Abre a ficha completa para ver todos os dados e andamentos.">
                <Button size="sm" variant="ghost" className="h-7" asChild>
                  <Link href={`/dashboard/clients/${client.id}`}>
                    <ExternalLink className="mr-1 size-3.5" /> Ficha completa
                  </Link>
                </Button>
              </HelpTip>
              <HelpTip label={hideOk ? "Volta a exibir todos os itens, inclusive OK e Não se aplica." : "Mostra somente os itens pendentes deste cliente."}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 text-muted-foreground"
                  onClick={() => setHideOk(!hideOk)}
                >
                  {hideOk ? <Eye className="mr-1 size-3.5" /> : <EyeOff className="mr-1 size-3.5" />}
                  {hideOk ? `exibir todos (${resolvedCount} resolvidos)` : "somente pendentes"}
                </Button>
              </HelpTip>
            </div>
            {(client.lastContactAt || client.nextAction) && (
              <p className="text-xs text-muted-foreground">
                {client.lastContactAt && (
                  <>
                    Último contato {formatRelative(client.lastContactAt)}
                    {client.lastContactResult ? ` — ${client.lastContactResult}` : ""}.{" "}
                  </>
                )}
                {client.nextAction && <span className="font-medium">Próxima ação: {client.nextAction}</span>}
              </p>
            )}
          </SheetHeader>

          <Tabs defaultValue="checklist" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="caso">Caso</TabsTrigger>
              <TabsTrigger value="contatos">Contatos</TabsTrigger>
              <TabsTrigger value="mensagem">Mensagem</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="min-h-0 flex-1">
              <ScrollArea className="h-full pr-3">
                {pending.length > 0 && (
                  <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="mb-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      Pendências ({pending.length})
                    </p>
                    <ul className="space-y-1">
                      {(showAllPending ? pending : pending.slice(0, 10)).map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-xs">
                          <span className={cn("size-1.5 shrink-0 rounded-full", ITEM_STATUS_META[p.status].dot)} />
                          <span className="min-w-0 flex-1 truncate">
                            {p.name}
                            <span className="ml-1 text-muted-foreground">
                              ({ITEM_STATUS_META[p.status].label.toLowerCase()})
                            </span>
                          </span>
                          <HelpTip label="Cria uma tarefa já preenchida com esta pendência.">
                            <button
                              className="shrink-0 text-[11px] text-primary underline-offset-2 hover:underline"
                              onClick={() => openTaskFromPendency(p)}
                            >
                              criar tarefa
                            </button>
                          </HelpTip>
                        </li>
                      ))}
                      {pending.length > 10 && (
                        <li>
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                            onClick={() => setShowAllPending((value) => !value)}
                          >
                            {showAllPending ? "ver menos" : "ver mais"}
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {type ? (
                  <ChecklistPanel clientId={client.id} type={type} caseFile={caseFile} hideOk={hideOk} />
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">Selecione uma operação.</p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="caso" className="min-h-0 flex-1">
              <ScrollArea className="h-full pr-3">
                {type ? (
                  <CaseFieldsPanel clientId={client.id} type={type} caseFile={caseFile} />
                ) : null}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="contatos" className="min-h-0 flex-1">
              <ScrollArea className="h-full pr-3">
                {clientContacts.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground">Nenhum contato registrado ainda.</p>
                )}
                <div className="space-y-2">
                  {clientContacts.map((c) => (
                    <div key={c.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {c.channel ?? "Contato"}
                          {c.result ? ` — ${c.result}` : ""}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDateTime(c.createdAt)}
                        </span>
                      </div>
                      {c.description && <p className="mt-0.5 text-muted-foreground">{c.description}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">por {c.author}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="mensagem" className="min-h-0 flex-1">
              <ScrollArea className="h-full pr-3">
                <MessagePicker client={client} pendencies={pending} />
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {activeItems.length > 0 && (
            <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5" />
              {resolvedCount}/{activeItems.length} itens resolvidos (OK ou não se aplica)
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ContactDialog client={client} open={contactOpen} onOpenChange={setContactOpen} />
      <TaskDialog prefill={taskPrefill} open={taskOpen} onOpenChange={setTaskOpen} />
    </>
  );
}
