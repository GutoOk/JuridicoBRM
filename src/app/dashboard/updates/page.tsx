"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { registerContact } from "@/lib/db-actions";
import { dateMillis, formatDateTime, searchable } from "@/lib/normalize";
import {
  CONTACT_CHANNELS,
  type ContactChannel,
  type Update,
  type Client,
  type Process,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CodeBadge } from "@/components/shared/badges";
import { EmptyState, FilterChip, HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";
import { ProcessReference } from "@/components/shared/process-reference";
import { EditUpdateDialog, canEditUpdate } from "@/components/shared/edit-update-dialog";
import { cn } from "@/lib/utils";

const TYPES = ["Todos", "Atendimento", "Anotação", "Tarefa", "Andamento Processual", "Financeiro"] as const;

/** Linha do tempo geral: contatos, anotações, tarefas e andamentos de todos os clientes. */
export default function UpdatesPage() {
  const { data: updates } = useCollection<Update>("updates", {
    orderBy: [["createdAt", "desc"]],
    limit: 500,
  });
  const { data: processes } = useCollection<Process>("processes");
  const { data: clients } = useCollection<Client>("clients");

  const { user, isAdmin } = useAuth();
  const [typeFilter, setTypeFilter] = useState<(typeof TYPES)[number]>("Todos");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<Update | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

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

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients ?? []) {
      map.set(c.id, c);
    }
    return map;
  }, [clients]);

  const rows = useMemo(() => {
    let out = (updates ?? []).filter((u) => showDeleted ? u.deleted : !u.deleted);
    if (typeFilter !== "Todos") out = out.filter((u) => u.type === typeFilter);
    const q = searchable(search.trim());
    if (q) {
      out = out.filter((u) => {
        const proc =
          (u.processId ? processMap.get(u.processId) : undefined) ||
          (u.processNumber ? processMap.get(u.processNumber) : undefined);
        const resolvedClientId = u.clientId || proc?.mainClientId || proc?.clientIds?.[0];
        const cl = resolvedClientId ? clientMap.get(resolvedClientId) : undefined;
        const cName = cl?.name || u.clientName || proc?.clientNames?.[0] || "";
        const cCode = cl?.code || u.clientCode || "";
        const processParties = [...(proc?.clientNames ?? []), proc?.parteContraria ?? ""].join(" ");

        return (
          searchable(cName).includes(q) ||
          searchable(u.description).includes(q) ||
          searchable(u.author).includes(q) ||
          searchable(processParties).includes(q) ||
          cCode.toLowerCase().includes(search.trim().toLowerCase()) ||
          (u.processNumber ?? "").toLowerCase().includes(search.trim().toLowerCase()) ||
          (proc?.processNumber ?? "").toLowerCase().includes(search.trim().toLowerCase())
        );
      });
    }
    return out.sort((a, b) => dateMillis(b.updateDate ?? b.createdAt) - dateMillis(a.updateDate ?? a.createdAt));
  }, [updates, typeFilter, search, processMap, clientMap, showDeleted]);
  const deletedCount = (updates ?? []).filter((update) => update.deleted).length;

  if (!updates || !processes || !clients) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="histórico"
        title="Andamentos"
        description="Últimos registros de contato, anotações, tarefas e andamentos processuais. Use a busca para localizar rapidamente cliente, autor ou trecho do registro."
        badge={<span className="kbd-hint">500 mais recentes</span>}
      >
        <HelpTip label="Registra uma anotação, um atendimento ou um andamento processual vinculado a um cliente.">
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 size-4" /> Novo andamento
          </Button>
        </HelpTip>
      </PageHeader>

      <Toolbar>
        <SearchBox
          placeholder="Buscar por cliente, código, texto ou autor..."
          value={search}
          onChange={setSearch}
        />
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <FilterChip
              key={t}
              onClick={() => setTypeFilter(t)}
              active={typeFilter === t}
            >
              {t}
            </FilterChip>
          ))}
        </div>
        {isAdmin && deletedCount > 0 && (
          <FilterChip active={showDeleted} onClick={() => setShowDeleted((current) => !current)}>
            <Trash2 className="size-3" /> {showDeleted ? "Ver ativos" : `Ver apagados (${deletedCount})`}
          </FilterChip>
        )}
      </Toolbar>

      <div className="space-y-2">
        {rows.map((u) => {
          const proc =
            (u.processId ? processMap.get(u.processId) : undefined) ||
            (u.processNumber ? processMap.get(u.processNumber) : undefined);
          const resolvedClientId = u.clientId || proc?.mainClientId || proc?.clientIds?.[0];
          const client = resolvedClientId ? clientMap.get(resolvedClientId) : undefined;
          const clientName = client?.name || u.clientName || proc?.clientNames?.[0];
          const clientCode = client?.code || u.clientCode;

          const typeStyles: Record<string, string> = {
            Atendimento: "bg-blue-50/70 text-blue-700 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
            Anotação: "bg-amber-50/70 text-amber-800 border-amber-200/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
            Tarefa: "bg-violet-50/70 text-violet-700 border-violet-200/50 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/40",
            "Andamento Processual": "bg-emerald-50/70 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
            Financeiro: "bg-cyan-50/70 text-cyan-800 border-cyan-200/50 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/40",
          };

          return (
            <div key={u.id} className="surface p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn("font-medium shadow-none", typeStyles[u.type] || "bg-muted text-muted-foreground")}>
                    {u.type}
                  </Badge>
                  {clientName && (
                    resolvedClientId ? (
                      <Link href={`/dashboard/clients/${resolvedClientId}${u.type === "Financeiro" ? "?tab=financial" : ""}`} className="flex items-center gap-1.5 font-medium hover:underline">
                        <CodeBadge code={clientCode || undefined} />
                        {clientName}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 font-medium">
                        <CodeBadge code={clientCode || undefined} />
                        {clientName}
                      </span>
                    )
                  )}
                  {u.type === "Atendimento" && u.channel && (
                    <span className="text-muted-foreground">
                      {u.channel}
                      {u.result ? ` — ${u.result}` : ""}
                    </span>
                  )}
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
              <p className="mt-1 whitespace-pre-wrap">{u.description}</p>

              {u.type === "Andamento Processual" && (
                <ProcessReference process={proc} processNumber={u.processNumber} />
              )}

              <p className="mt-1 text-xs text-muted-foreground">por {u.author}</p>
            </div>
          );
        })}
        {rows.length === 0 && (
          <EmptyState
            title="Nenhum andamento encontrado"
            description="Ajuste a busca ou escolha outro tipo de registro."
          />
        )}
      </div>

      <NewUpdateDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        clients={(clients ?? []).filter((c) => !c.deleted)}
        processes={(processes ?? []).filter((p) => !p.deleted)}
      />
      <EditUpdateDialog
        update={editingUpdate}
        open={!!editingUpdate}
        onOpenChange={(o) => !o && setEditingUpdate(null)}
      />
    </div>
  );
}

/**
 * Novo andamento avulso: anotação, atendimento (com canal opcional) ou
 * andamento processual (com processo vinculado). Atendimento também atualiza
 * o "último contato" do cliente.
 */
function NewUpdateDialog({
  open,
  onOpenChange,
  clients,
  processes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  processes: Process[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<"Anotação" | "Atendimento" | "Andamento Processual">("Anotação");
  const [clientQuery, setClientQuery] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [processId, setProcessId] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("Ligação");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const clientMatches = useMemo(() => {
    const q = searchable(clientQuery.trim());
    if (q.length < 2 || client) return [];
    return clients
      .filter((c) => searchable(c.name).includes(q) || (c.code ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [clientQuery, clients, client]);

  const clientProcesses = client
    ? processes.filter((p) => (p.clientIds ?? []).includes(client.id))
    : processes;

  const reset = () => {
    setType("Anotação");
    setClient(null);
    setClientQuery("");
    setProcessId("");
    setChannel("Ligação");
    setDescription("");
  };

  const save = async () => {
    if (!user || !description.trim()) return;
    if (!client) {
      toast({ variant: "destructive", title: "Selecione o cliente do registro" });
      return;
    }
    setSaving(true);
    try {
      if (type === "Atendimento") {
        await registerContact(
          client,
          { channel, record: description.trim() },
          user
        );
      } else {
        const proc = processes.find((p) => p.id === processId);
        await addDoc(collection(db, "updates"), {
          type,
          clientId: client.id,
          clientName: client.name,
          clientCode: client.code ?? "",
          ...(type === "Andamento Processual" && proc
            ? { processId: proc.id, processNumber: proc.processNumber }
            : {}),
          description: description.trim(),
          author: user.name,
          authorId: user.id,
          createdAt: serverTimestamp(),
          deleted: false,
        });
      }
      toast({ title: "Andamento registrado" });
      reset();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao registrar andamento" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo andamento</DialogTitle>
          <DialogDescription>
            Anotação registra informação; atendimento registra contato (e atualiza o último contato do
            cliente); andamento processual registra movimentação de processo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(["Anotação", "Atendimento", "Andamento Processual"] as const).map((t) => (
              <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
                {t}
              </FilterChip>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            {client ? (
              <div className="flex items-center gap-2">
                <CodeBadge code={client.code} />
                <span className="text-sm font-medium">{client.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setClient(null)}>
                  trocar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  placeholder="Buscar por nome ou código…"
                  className="h-8"
                />
                {clientMatches.length > 0 && (
                  <div className="overflow-hidden rounded-md border">
                    {clientMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setClient(c);
                          setClientQuery("");
                        }}
                      >
                        <CodeBadge code={c.code} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {type === "Atendimento" && (
            <div className="space-y-1.5">
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as ContactChannel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {type === "Andamento Processual" && (
            <div className="space-y-1.5">
              <Label>Processo (opcional)</Label>
              <Select value={processId || undefined} onValueChange={setProcessId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vincular a um processo" />
                </SelectTrigger>
                <SelectContent>
                  {clientProcesses.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.processNumber} — {(p.clientNames ?? []).join(", ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{type === "Atendimento" ? "Registro do atendimento" : "Descrição"}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="O que aconteceu…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !description.trim()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
