"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { formatDateTime } from "@/lib/normalize";
import type { Process, Update } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/shared/badges";
import { ProcessReference } from "@/components/shared/process-reference";
import { canEditUpdate } from "@/components/shared/edit-update-dialog";

/**
 * Um registro da linha do tempo — atendimento, anotação, tarefa, andamento ou
 * financeiro. Vive aqui, e não dentro de uma tela, porque a ficha do cliente e a
 * página do processo mostram exatamente a mesma coisa: uma lista geral de tudo, com
 * a tarefa exibida por inteiro (status, responsável, prioridade, prazo, processos
 * vinculados e os andamentos próprios dela).
 */

export const UPDATE_TYPE_STYLES: Record<string, string> = {
  Atendimento: "bg-blue-50/70 text-blue-700 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
  Anotação: "bg-amber-50/70 text-amber-800 border-amber-200/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
  Tarefa: "bg-violet-50/70 text-violet-700 border-violet-200/50 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/40",
  "Andamento Processual": "bg-emerald-50/70 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
  Financeiro: "bg-cyan-50/70 text-cyan-800 border-cyan-200/50 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/40",
};

/** Processos vinculados a um registro, tolerando o formato antigo de campo único. */
export function linkedProcessRefs(
  update: Update,
  processMap: Map<string, Process>
): { key: string; number: string; process?: Process }[] {
  const ids = update.processIds?.length ? update.processIds : update.processId ? [update.processId] : [];
  const numbers = update.processNumbers?.length
    ? update.processNumbers
    : update.processNumber ? [update.processNumber] : [];
  const count = Math.max(ids.length, numbers.length);
  return Array.from({ length: count }, (_, index) => {
    const process =
      (ids[index] ? processMap.get(ids[index]) : undefined) ||
      (numbers[index] ? processMap.get(numbers[index]) : undefined);
    return {
      key: `${ids[index] ?? numbers[index] ?? "processo"}-${index}`,
      number: numbers[index] || process?.processNumber || "Processo",
      process,
    };
  });
}

export function UpdateTimelineItem({
  update,
  processMap,
  taskProgress,
  expanded,
  onToggleExpanded,
  onEdit,
  userId,
  isAdmin,
  className,
}: {
  update: Update;
  processMap: Map<string, Process>;
  /** Andamentos gravados dentro da própria tarefa (`taskId`). */
  taskProgress: Update[];
  expanded: boolean;
  onToggleExpanded: (id: string) => void;
  onEdit: (update: Update) => void;
  userId?: string;
  isAdmin: boolean;
  className?: string;
}) {
  const isTask = update.type === "Tarefa";
  const process =
    (update.processId ? processMap.get(update.processId) : undefined) ||
    (update.processNumber ? processMap.get(update.processNumber) : undefined);
  const processRefs = isTask ? linkedProcessRefs(update, processMap) : [];

  return (
    <div className={cn("surface p-3 text-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          <Badge
            variant="outline"
            className={cn("mr-2 font-medium shadow-none", UPDATE_TYPE_STYLES[update.type] || "bg-muted text-muted-foreground")}
          >
            {update.type}
          </Badge>
          {update.type === "Atendimento" && update.channel ? `${update.channel} — ${update.result ?? ""}` : null}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {formatDateTime(update.updateDate ?? update.createdAt)}
          {!isTask && canEditUpdate(update, userId, isAdmin) && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => onEdit(update)}
              title="Editar ou excluir este registro"
            >
              <Pencil className="size-3" />
            </Button>
          )}
        </span>
      </div>

      {isTask ? (
        <Link
          href={`/dashboard/tasks/${update.id}`}
          className="mt-1 block whitespace-pre-wrap font-medium hover:underline"
          title="Abrir acompanhamento da tarefa"
        >
          {update.description}
        </Link>
      ) : (
        <p className="mt-1 whitespace-pre-wrap">{update.description}</p>
      )}

      {isTask && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            Status:{" "}
            <Badge variant={update.status === "Concluída" ? "outline" : "secondary"} className="ml-1 h-5">
              {update.status ?? "Pendente"}
            </Badge>
          </span>
          <span>
            Responsável:{" "}
            <span className="text-foreground">
              {update.responsibleNames?.join(", ") || update.responsible || "Não definido"}
            </span>
          </span>
          <span>Prioridade: <PriorityBadge priority={update.priority} /></span>
          <span>
            Prazo:{" "}
            <span className="text-foreground">
              {update.dueDate ? formatDateTime(update.dueDate).split(" ")[0] : "Sem prazo"}
            </span>
          </span>
          {update.completedAt && (
            <span>
              Concluída por {update.completedBy || "usuário não informado"} em {formatDateTime(update.completedAt)}
            </span>
          )}
        </div>
      )}

      {isTask && processRefs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {processRefs.map((ref) =>
            ref.process ? (
              <Link
                key={ref.key}
                href={`/dashboard/processes/${ref.process.id}`}
                className="text-xs text-primary hover:underline"
              >
                {ref.number}
              </Link>
            ) : (
              <span key={ref.key} className="text-xs text-muted-foreground">{ref.number}</span>
            )
          )}
        </div>
      )}

      {update.type === "Andamento Processual" && (
        <ProcessReference process={process} processNumber={update.processNumber} />
      )}

      <p className="mt-1 text-xs text-muted-foreground">por {update.author}</p>

      {isTask && (
        <div className="mt-2 border-t border-border/50 pt-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onToggleExpanded(update.id)}
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {expanded ? "Ocultar andamentos" : "Ver andamentos"} ({taskProgress.length})
          </button>
          {expanded && (
            <div className="ml-2 mt-2 space-y-1.5 border-l border-violet-200 pl-3">
              {taskProgress.map((item) => (
                <div key={item.id} className="rounded-r-md bg-muted/20 px-2 py-1.5 text-[13px]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap">{item.description}</p>
                    {canEditUpdate(item, userId, isAdmin) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        title="Editar ou excluir este andamento da tarefa"
                        onClick={() => onEdit(item)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.author || "Autor não informado"} · {formatDateTime(item.updateDate ?? item.createdAt)}
                  </p>
                </div>
              ))}
              {taskProgress.length === 0 && (
                <p className="py-1 text-xs text-muted-foreground">Nenhum andamento específico desta tarefa.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
