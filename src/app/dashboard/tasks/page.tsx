"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2, Plus, CheckCircle2, RotateCcw } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { dateMillis, formatDate, toDate } from "@/lib/normalize";
import type { Update, UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBadge, PriorityBadge } from "@/components/shared/badges";
import { TaskDialog } from "@/components/shared/task-dialog";
import { cn } from "@/lib/utils";
import { EmptyState, HelpTip, PageHeader, Toolbar } from "@/components/shared/page-shell";

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: tasksData } = useCollection<Update>("updates", { where: [["type", "==", "Tarefa"]] });
  const { data: users } = useCollection<UserProfile>("users");

  const [showDone, setShowDone] = useState(false);
  const [responsibleFilter, setResponsibleFilter] = useState<string>("todos");
  const [taskOpen, setTaskOpen] = useState(false);

  const activeUsers = (users ?? []).filter((u) => u.email && u.active !== false);

  const tasks = useMemo(() => {
    let out = (tasksData ?? []).filter((t) => !t.deleted);
    if (!showDone) out = out.filter((t) => t.status !== "Concluída");
    if (responsibleFilter !== "todos") {
      out = out.filter((t) => t.responsibleId === responsibleFilter || t.responsible === responsibleFilter);
    }
    return out.sort((a, b) => {
      const da = a.dueDate ? dateMillis(a.dueDate) : Infinity;
      const dbv = b.dueDate ? dateMillis(b.dueDate) : Infinity;
      if (da !== dbv) return da - dbv;
      return dateMillis(b.createdAt) - dateMillis(a.createdAt);
    });
  }, [tasksData, showDone, responsibleFilter]);

  const toggleDone = async (t: Update) => {
    if (!user) return;
    try {
      if (t.status === "Concluída") {
        await updateDoc(doc(db, "updates", t.id), { status: "Pendente", completedAt: null, completedBy: null });
      } else {
        await updateDoc(doc(db, "updates", t.id), {
          status: "Concluída",
          completedAt: serverTimestamp(),
          completedBy: user.name,
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar tarefa" });
    }
  };

  if (!tasksData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLate = (t: Update) => {
    const d = toDate(t.dueDate);
    return t.status !== "Concluída" && d && d.getTime() < Date.now() - 86400000;
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="execução"
        title="Tarefas"
        description={`${tasks.length} tarefa(s) na lista atual. Use prazo e prioridade para manter a fila de cobrança e revisão andando.`}
      >
        <HelpTip label="Cria uma tarefa geral ou vinculada a cliente quando aberta pela ficha/Operação.">
        <Button onClick={() => setTaskOpen(true)}>
          <Plus className="mr-2 size-4" /> Nova tarefa
        </Button>
        </HelpTip>
      </PageHeader>

      <Toolbar>
        <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {activeUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(!!v)} />
          Mostrar concluídas
        </label>
      </Toolbar>

      <div className="work-table">
        <Table>
          <TableHeader>
            <TableRow className="ledger-header">
              <TableHead className="w-10" />
              <TableHead>Tarefa</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id} className={cn(t.status === "Concluída" && "opacity-50")}>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => toggleDone(t)}
                  >
                    <HelpTip label={t.status === "Concluída" ? "Reabre a tarefa para voltar à fila." : "Marca a tarefa como concluída."}>
                      <span>
                        {t.status === "Concluída" ? (
                          <RotateCcw className="size-4" />
                        ) : (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        )}
                      </span>
                    </HelpTip>
                  </Button>
                </TableCell>
                <TableCell className={cn("font-medium", t.status === "Concluída" && "line-through")}>
                  {t.description}
                </TableCell>
                <TableCell>
                  {t.clientId ? (
                    <Link href={`/dashboard/clients/${t.clientId}`} className="flex items-center gap-1.5 hover:underline">
                      <CodeBadge code={t.clientCode || undefined} />
                      <span className="text-sm">{t.clientName}</span>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{t.responsible ?? "—"}</TableCell>
                <TableCell>
                  <PriorityBadge priority={t.priority} />
                </TableCell>
                <TableCell className={cn("whitespace-nowrap text-sm", isLate(t) && "font-semibold text-destructive")}>
                  {t.dueDate ? formatDate(t.dueDate) : "—"}
                  {isLate(t) && " (vencida)"}
                </TableCell>
                <TableCell>
                  <Badge variant={t.status === "Concluída" ? "outline" : "secondary"}>{t.status ?? "Pendente"}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <EmptyState
                    title={`Nenhuma tarefa ${showDone ? "" : "pendente"}`}
                    description="Quando uma pendência exigir ação, crie uma tarefa com responsável e prazo."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TaskDialog prefill={null} open={taskOpen} onOpenChange={setTaskOpen} />
    </div>
  );
}
