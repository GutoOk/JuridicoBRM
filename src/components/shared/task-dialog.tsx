"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, CheckSquare, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { createTask } from "@/lib/db-actions";
import { toDate } from "@/lib/normalize";
import {
  PRIORITIES,
  type Client,
  type Priority,
  type Process,
  type Update,
  type UserProfile,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { HelpTip } from "@/components/shared/page-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

export type TaskPrefill = {
  description?: string;
  clientId?: string;
  clientName?: string;
  clientCode?: string;
  /** vários clientes de uma vez (ação em lote) */
  clients?: { id: string; name: string; code?: string }[];
  processId?: string;
  processNumber?: string;
};

/** Valor especial: tarefa para toda a equipe. */
const ALL_RESPONSIBLE = "__todos";

function toDateInput(v: Update["dueDate"]): string {
  const d = toDate(v);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Criação e edição de tarefa com responsável (incluindo "Todos") e prazo.
 * Usada avulsa, por pendência, em lote (Operação) e na edição pela lista.
 */
export function TaskDialog({
  prefill,
  task,
  open,
  onOpenChange,
}: {
  prefill: TaskPrefill | null;
  /** quando presente, o diálogo edita esta tarefa em vez de criar. */
  task?: Update | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: users } = useCollection<UserProfile>("users");
  const { data: clients } = useCollection<Client>("clients");
  const { data: processes } = useCollection<Process>("processes");
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [responsibleId, setResponsibleId] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("Média");
  const [dueDate, setDueDate] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [processId, setProcessId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (task) {
        setDescription(task.description ?? "");
        setResponsibleId(task.responsible === "Todos" ? ALL_RESPONSIBLE : (task.responsibleId ?? ""));
        setPriority((task.priority as Priority) ?? "Média");
        setDueDate(toDateInput(task.dueDate));
        setSelectedClientIds(task.clientId ? [task.clientId] : []);
        setProcessId(task.processId ?? "");
      } else {
        setDescription(prefill?.description ?? "");
        setResponsibleId(user?.id ?? "");
        setPriority("Média");
        setDueDate("");
        setSelectedClientIds(
          prefill?.clients?.map((client) => client.id) ?? (prefill?.clientId ? [prefill.clientId] : [])
        );
        setProcessId(prefill?.processId ?? "");
      }
      setClientSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const activeUsers = (users ?? []).filter((u) => u.email && u.active !== false);
  const activeClients = (clients ?? []).filter((client) => !client.deleted);
  const selectedClients = activeClients.filter((client) => selectedClientIds.includes(client.id));
  const prefilledTargets =
    prefill?.clients ??
    (prefill?.clientId
      ? [{ id: prefill.clientId, name: prefill.clientName ?? "", code: prefill.clientCode }]
      : []);
  const targets = selectedClients.length > 0 ? selectedClients : prefilledTargets.length > 0 ? prefilledTargets : [null];
  const filteredClients = activeClients
    .filter((client) => {
      const q = clientSearch.trim().toLocaleLowerCase("pt-BR");
      return !q || client.name.toLocaleLowerCase("pt-BR").includes(q) || client.code?.toLocaleLowerCase("pt-BR").includes(q);
    })
    .sort((a, b) => {
      const selectedDiff = Number(selectedClientIds.includes(b.id)) - Number(selectedClientIds.includes(a.id));
      return selectedDiff || a.name.localeCompare(b.name, "pt-BR");
    });
  const availableProcesses = (processes ?? [])
    .filter((process) => !process.deleted)
    .filter((process) => selectedClientIds.length === 0 || process.clientIds?.includes(selectedClientIds[0]))
    .sort((a, b) => a.processNumber.localeCompare(b.processNumber, "pt-BR"));
  const selectedProcess = (processes ?? []).find((process) => process.id === processId);

  const resolveResponsible = () => {
    if (responsibleId === ALL_RESPONSIBLE) return { name: "Todos", id: "" };
    const u = activeUsers.find((x) => x.id === responsibleId);
    return { name: u?.name ?? user?.name ?? "", id: u?.id ?? user?.id ?? "" };
  };

  const handleSave = async () => {
    if (!user || !description.trim()) return;
    setSaving(true);
    try {
      const responsible = resolveResponsible();
      if (task) {
        await updateDoc(doc(db, "updates", task.id), {
          description: description.trim(),
          responsible: responsible.name,
          responsibleId: responsible.id,
          priority,
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
          clientId: selectedClients[0]?.id ?? task.clientId ?? null,
          clientName: selectedClients[0]?.name ?? task.clientName ?? null,
          clientCode: selectedClients[0]?.code ?? task.clientCode ?? "",
          processId: processId || null,
          processNumber: selectedProcess?.processNumber ?? null,
        });
        toast({ title: "Tarefa atualizada" });
      } else {
        for (const t of targets) {
          await createTask(
            {
              description: description.trim(),
              clientId: t?.id,
              clientName: t?.name,
              clientCode: t?.code,
              processId: processId || undefined,
              processNumber: selectedProcess?.processNumber,
              responsible: responsible.name,
              responsibleId: responsible.id,
              priority,
              dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : null,
            },
            user
          );
        }
        toast({
          title: targets.length > 1 ? `${targets.length} tarefas criadas` : "Tarefa criada",
        });
      }
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: task ? "Erro ao salvar tarefa" : "Erro ao criar tarefa" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="size-4" /> {task ? "Editar tarefa" : "Nova tarefa"}
          </DialogTitle>
          <DialogDescription>
            {task
              ? task.clientName
                ? `Cliente: ${task.clientName}`
                : "Tarefa geral"
              : prefill?.clients
                ? `Para ${prefill.clients.length} cliente(s) selecionado(s)`
                : prefill?.clientName
                  ? `Cliente: ${prefill.clientName}`
                  : "Tarefa geral (sem cliente vinculado)"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!prefill?.clients && !prefill?.clientId && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Clientes (opcional)
                <HelpTip label="Sem seleção, cria uma tarefa geral. Com vários clientes, cria uma tarefa separada para cada um." />
              </Label>
              <div className="rounded-md border">
                <div className="relative border-b">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Buscar por nome ou código"
                    className="h-8 border-0 pl-8 shadow-none"
                  />
                </div>
                <ScrollArea className="h-32">
                  <div className="space-y-0.5 p-1.5">
                    {filteredClients.map((client) => {
                      const checked = selectedClientIds.includes(client.id);
                      return (
                        <label key={client.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setSelectedClientIds((current) =>
                                value ? [...current, client.id] : current.filter((id) => id !== client.id)
                              );
                              if (checked || selectedClientIds.length >= 1) setProcessId("");
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{client.name}</span>
                          {client.code && <span className="text-muted-foreground">{client.code}</span>}
                        </label>
                      );
                    })}
                    {filteredClients.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {selectedClientIds.length === 0 ? "Tarefa geral" : `${selectedClientIds.length} cliente(s) selecionado(s)`}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Descrição
              <HelpTip label="Escreva uma ação objetiva. Exemplo: ligar, cobrar documento, revisar minuta." />
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Ligar para pedir termo de responsabilidade"
              rows={2}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Responsável
                <HelpTip label='Pessoa que deve executar a tarefa. "Todos" deixa a tarefa visível para toda a equipe.' />
              </Label>
              <Select value={responsibleId} onValueChange={setResponsibleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_RESPONSIBLE}>Todos (equipe)</SelectItem>
                  {activeUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Prioridade
                <HelpTip label="Alta aparece como atenção urgente nas filas." />
              </Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Prazo (opcional)
              <HelpTip label="Use quando a tarefa precisa ser resolvida até uma data específica. Tarefas com prazo passado aparecem como vencidas." />
            </Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Processo (opcional)
              <HelpTip label="Vincula a tarefa a um processo para abrir seus detalhes diretamente pela fila." />
            </Label>
            <Select
              value={processId || "__sem_processo"}
              onValueChange={(value) => setProcessId(value === "__sem_processo" ? "" : value)}
              disabled={selectedClientIds.length > 1}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem processo vinculado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sem_processo">Sem processo vinculado</SelectItem>
                {availableProcesses.map((process) => (
                  <SelectItem key={process.id} value={process.id}>{process.processNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedClientIds.length > 1 && (
              <p className="text-[11px] text-muted-foreground">O vínculo com processo fica disponível para tarefa geral ou de um único cliente.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <HelpTip
            label={
              task
                ? "Salva as alterações desta tarefa."
                : "Cria a tarefa para o responsável escolhido. Em lote, cria uma tarefa para cada cliente selecionado."
            }
          >
            <Button onClick={handleSave} disabled={!description.trim() || saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {task ? "Salvar" : "Criar"}
            </Button>
          </HelpTip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
