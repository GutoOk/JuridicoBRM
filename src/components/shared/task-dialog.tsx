"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, CheckSquare } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { createTask } from "@/lib/db-actions";
import { toDate } from "@/lib/normalize";
import { PRIORITIES, type Priority, type Update, type UserProfile } from "@/lib/types";
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

export type TaskPrefill = {
  description?: string;
  clientId?: string;
  clientName?: string;
  clientCode?: string;
  /** vários clientes de uma vez (ação em lote) */
  clients?: { id: string; name: string; code?: string }[];
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
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [responsibleId, setResponsibleId] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("Média");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (task) {
        setDescription(task.description ?? "");
        setResponsibleId(task.responsible === "Todos" ? ALL_RESPONSIBLE : (task.responsibleId ?? ""));
        setPriority((task.priority as Priority) ?? "Média");
        setDueDate(toDateInput(task.dueDate));
      } else {
        setDescription(prefill?.description ?? "");
        setResponsibleId(user?.id ?? "");
        setPriority("Média");
        setDueDate("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const activeUsers = (users ?? []).filter((u) => u.email && u.active !== false);
  const targets =
    prefill?.clients ??
    (prefill?.clientId
      ? [{ id: prefill.clientId, name: prefill.clientName ?? "", code: prefill.clientCode }]
      : [null]);

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
      <DialogContent className="sm:max-w-md">
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
