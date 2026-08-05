"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2, CheckSquare, Search, UsersRound } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

export type TaskEditField =
  | "description"
  | "responsible"
  | "priority"
  | "dueDate"
  | "clients"
  | "processes";

const TASK_EDIT_LABELS: Record<TaskEditField, string> = {
  description: "descrição",
  responsible: "responsável",
  priority: "prioridade",
  dueDate: "prazo",
  clients: "clientes",
  processes: "processos",
};

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
  editField,
  open,
  onOpenChange,
}: {
  prefill: TaskPrefill | null;
  /** quando presente, o diálogo edita esta tarefa em vez de criar. */
  task?: Update | null;
  /** na edição local, exibe somente o campo escolhido. */
  editField?: TaskEditField | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: users } = useCollection<UserProfile>("users");
  const { data: clients } = useCollection<Client>("clients");
  const { data: processes } = useCollection<Process>("processes");
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [allResponsible, setAllResponsible] = useState(false);
  const [priority, setPriority] = useState<Priority>("Média");
  const [dueDate, setDueDate] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (task) {
        setDescription(task.description ?? "");
        setAllResponsible(task.responsible === "Todos");
        setResponsibleIds(
          task.responsible === "Todos"
            ? []
            : task.responsibleIds?.length
              ? task.responsibleIds
              : task.responsibleId
                ? [task.responsibleId]
                : []
        );
        setPriority((task.priority as Priority) ?? "Média");
        setDueDate(toDateInput(task.dueDate));
        setSelectedClientIds(task.clientIds?.length ? task.clientIds : task.clientId ? [task.clientId] : []);
        setSelectedProcessIds(task.processIds?.length ? task.processIds : task.processId ? [task.processId] : []);
      } else {
        setDescription(prefill?.description ?? "");
        setAllResponsible(false);
        setResponsibleIds(user?.id ? [user.id] : []);
        setPriority("Média");
        setDueDate("");
        setSelectedClientIds(
          prefill?.clients?.map((client) => client.id) ?? (prefill?.clientId ? [prefill.clientId] : [])
        );
        setSelectedProcessIds(prefill?.processId ? [prefill.processId] : []);
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
  const selectedProcesses = (processes ?? []).filter((process) => selectedProcessIds.includes(process.id));
  const shows = (field: TaskEditField) => !task || !editField || editField === field;

  const resolveResponsible = () => {
    if (allResponsible) return { name: "Todos", id: "", names: [] as string[], ids: [] as string[] };
    const selected = activeUsers.filter((candidate) => responsibleIds.includes(candidate.id));
    if (selected.length === 0 && user) selected.push(user);
    return {
      name: selected.map((candidate) => candidate.name).join(", "),
      id: selected[0]?.id ?? "",
      names: selected.map((candidate) => candidate.name),
      ids: selected.map((candidate) => candidate.id),
    };
  };

  const handleSave = async () => {
    if (!user || !description.trim()) return;
    setSaving(true);
    try {
      const responsible = resolveResponsible();
      if (task) {
        const patch: Record<string, any> = {
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        };
        if (shows("description")) patch.description = description.trim();
        if (shows("responsible")) {
          patch.responsible = responsible.name;
          patch.responsibleId = responsible.id;
          patch.responsibleNames = responsible.names;
          patch.responsibleIds = responsible.ids;
        }
        if (shows("priority")) patch.priority = priority;
        if (shows("dueDate")) {
          patch.dueDate = dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null;
        }
        if (shows("clients")) {
          patch.clientId = selectedClients[0]?.id ?? null;
          patch.clientName = selectedClients[0]?.name ?? null;
          patch.clientCode = selectedClients[0]?.code ?? "";
          patch.clientIds = selectedClients.map((client) => client.id);
          patch.clientNames = selectedClients.map((client) => client.name);
          patch.clientCodes = selectedClients.map((client) => client.code ?? "");
        }
        if (shows("processes")) {
          patch.processId = selectedProcesses[0]?.id ?? null;
          patch.processNumber = selectedProcesses[0]?.processNumber ?? null;
          patch.processIds = selectedProcesses.map((process) => process.id);
          patch.processNumbers = selectedProcesses.map((process) => process.processNumber);
        }
        await updateDoc(doc(db, "updates", task.id), patch);
        toast({ title: "Tarefa atualizada" });
      } else {
        for (const t of targets) {
          await createTask(
            {
              description: description.trim(),
              clientId: t?.id,
              clientName: t?.name,
              clientCode: t?.code,
              processId: selectedProcesses[0]?.id,
              processNumber: selectedProcesses[0]?.processNumber,
              processIds: selectedProcesses.map((process) => process.id),
              processNumbers: selectedProcesses.map((process) => process.processNumber),
              responsible: responsible.name,
              responsibleId: responsible.id,
              responsibleNames: responsible.names,
              responsibleIds: responsible.ids,
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

  const Root = task ? Sheet : Dialog;
  const Content = task ? SheetContent : DialogContent;
  const Header = task ? SheetHeader : DialogHeader;
  const Title = task ? SheetTitle : DialogTitle;
  const Description = task ? SheetDescription : DialogDescription;
  const Footer = task ? SheetFooter : DialogFooter;

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Content
        className={cn(
          task
            ? "flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
            : "max-h-[90vh] overflow-y-auto sm:max-w-xl"
        )}
      >
        <Header className={cn(task && "shrink-0 border-b p-4 pr-12")}>
          <Title className="flex items-center gap-2">
            <CheckSquare className="size-4" />{" "}
            {task
              ? editField
                ? `Editar ${TASK_EDIT_LABELS[editField]}`
                : "Editar tarefa"
              : "Nova tarefa"}
          </Title>
          <Description>
            {task
              ? task.clientName
                ? `Cliente: ${task.clientName}`
                : "Tarefa geral"
              : prefill?.clients
                ? `Para ${prefill.clients.length} cliente(s) selecionado(s)`
                : prefill?.clientName
                  ? `Cliente: ${prefill.clientName}`
                  : "Tarefa geral (sem cliente vinculado)"}
          </Description>
        </Header>
        <div className={cn("space-y-4", task && "min-h-0 flex-1 overflow-y-auto p-4")}>
          {shows("clients") && !prefill?.clients && !prefill?.clientId && (
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
                              if (checked || selectedClientIds.length >= 1) setSelectedProcessIds([]);
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
          {shows("description") && <div className="space-y-2">
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
          </div>}
          {(shows("responsible") || shows("priority")) && (
          <div className={cn("grid gap-3", shows("responsible") && shows("priority") && "grid-cols-2")}>
            {shows("responsible") && <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Responsável
                <HelpTip label='Pessoa que deve executar a tarefa. "Todos" deixa a tarefa visível para toda a equipe.' />
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start px-3 font-normal">
                    <UsersRound className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {allResponsible
                        ? "Todos (equipe)"
                        : responsibleIds.length === 0
                          ? "Escolher"
                          : responsibleIds.length === 1
                            ? activeUsers.find((candidate) => candidate.id === responsibleIds[0])?.name ?? "1 usuário"
                            : `${responsibleIds.length} usuários`}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60">
                    <Checkbox
                      checked={allResponsible}
                      onCheckedChange={(checked) => {
                        setAllResponsible(checked === true);
                        if (checked === true) setResponsibleIds([]);
                      }}
                    />
                    <span>Todos (equipe)</span>
                  </label>
                  <div className="my-1 border-t" />
                  <div className="max-h-52 overflow-y-auto">
                    {activeUsers.map((candidate) => (
                      <label key={candidate.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60">
                        <Checkbox
                          checked={!allResponsible && responsibleIds.includes(candidate.id)}
                          onCheckedChange={(checked) => {
                            setAllResponsible(false);
                            setResponsibleIds((current) => checked === true
                              ? Array.from(new Set([...current, candidate.id]))
                              : current.filter((id) => id !== candidate.id));
                          }}
                        />
                        <span className="truncate">{candidate.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>}
            {shows("priority") && <div className="space-y-2">
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
            </div>}
          </div>
          )}
          {shows("dueDate") && <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Prazo (opcional)
              <HelpTip label="Use quando a tarefa precisa ser resolvida até uma data específica. Tarefas com prazo passado aparecem como vencidas." />
            </Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>}
          {shows("processes") && <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Processo (opcional)
              <HelpTip label="Vincula a tarefa a um processo para abrir seus detalhes diretamente pela fila." />
            </Label>
            <div className={cn("rounded-md border", selectedClientIds.length > 1 && "opacity-60")}>
              <ScrollArea className="h-28">
                <div className="space-y-0.5 p-1.5">
                  {availableProcesses.map((process) => (
                    <label key={process.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60">
                      <Checkbox
                        checked={selectedProcessIds.includes(process.id)}
                        disabled={selectedClientIds.length > 1}
                        onCheckedChange={(checked) => setSelectedProcessIds((current) => checked ? [...current, process.id] : current.filter((id) => id !== process.id))}
                      />
                      <span className="truncate">{process.processNumber}</span>
                    </label>
                  ))}
                  {availableProcesses.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">Nenhum processo disponível.</p>}
                </div>
              </ScrollArea>
            </div>
            {selectedClientIds.length > 1 && (
              <p className="text-[11px] text-muted-foreground">O vínculo com processo fica disponível para tarefa geral ou de um único cliente.</p>
            )}
          </div>}
        </div>
        <Footer className={cn(task && "shrink-0 border-t p-4")}>
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
        </Footer>
      </Content>
    </Root>
  );
}
