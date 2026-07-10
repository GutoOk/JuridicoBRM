"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { setChecklistItem } from "@/lib/db-actions";
import { groupByCategory, ITEM_STATUS_META, REQUIREMENT_META } from "@/lib/checklist";
import { ITEM_STATUSES, type CaseFile, type ClientType, type ItemStatus } from "@/lib/types";
import { formatDate } from "@/lib/normalize";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/shared/page-shell";

/**
 * Checklist do cliente dentro de um tipo: cada item com status colorido,
 * observação e carimbo de quem/quando atualizou. Edição em 2 cliques.
 */
export function ChecklistPanel({
  clientId,
  type,
  caseFile,
}: {
  clientId: string;
  type: ClientType;
  caseFile: CaseFile | null | undefined;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const groups = groupByCategory(type.checklist ?? []);
  const states = caseFile?.items ?? {};

  const setStatus = async (itemId: string, status: ItemStatus) => {
    if (!user) return;
    try {
      await setChecklistItem(clientId, type.id, itemId, status, user);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar item" });
    }
  };

  if (groups.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Este tipo não tem checklist configurado. O administrador pode criar em Administração → Tipos &
        Checklists.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category}>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            {group.category}
          </h4>
          <div className="divide-y rounded-lg border bg-card">
            {group.items.map((item) => {
              const state = states[item.id];
              const status = state?.status ?? "nao_verificado";
              const meta = ITEM_STATUS_META[status];
              return (
                <div key={item.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" title={item.description || item.name}>
                      {item.name}
                      {item.requirement !== "opcional" && (
                        <span
                          className={cn(
                            "ml-1.5 text-[10px]",
                            item.requirement === "obrigatorio" ? "text-red-500" : "text-amber-600"
                          )}
                        >
                          {REQUIREMENT_META[item.requirement].short}
                        </span>
                      )}
                      {item.blocking && (
                        <HelpTip label="Este item bloqueia o protocolo enquanto não estiver resolvido.">
                          <span className="ml-1 text-[10px] text-red-500">bloq.</span>
                        </HelpTip>
                      )}
                    </p>
                    {(state?.note || state?.updatedBy) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {state?.note && <span>“{state.note}” — </span>}
                        {state?.updatedBy} {state?.updatedAt ? formatDate(state.updatedAt) : ""}
                      </p>
                    )}
                  </div>
                  <NoteButton
                    note={state?.note ?? ""}
                    onSave={(note) => {
                      if (!user) return;
                      setChecklistItem(clientId, type.id, item.id, status, user, note).catch(() =>
                        toast({ variant: "destructive", title: "Erro ao salvar observação" })
                      );
                    }}
                  />
                  <Select value={status} onValueChange={(v) => setStatus(item.id, v as ItemStatus)}>
                    <SelectTrigger
                      className={cn("h-7 w-[130px] shrink-0 border-0 text-xs font-medium", meta.className)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {ITEM_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          <span className="flex items-center gap-2">
                            <span className={cn("size-2 rounded-full", ITEM_STATUS_META[s].dot)} />
                            {ITEM_STATUS_META[s].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function NoteButton({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(note);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(note);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7 shrink-0", note ? "text-sky-600" : "text-muted-foreground/50")}
        >
          <HelpTip label={note ? `Observação: ${note}` : "Adicionar uma observação neste item."}>
            <span><MessageSquarePlus className="size-4" /></span>
          </HelpTip>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="end">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Observação do item…"
          rows={3}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(value.trim());
              setOpen(false);
            }}
          >
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
