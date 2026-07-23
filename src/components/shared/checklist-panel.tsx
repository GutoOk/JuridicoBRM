"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, History, Loader2, MessageSquarePlus, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { saveChecklistNote, setChecklistItem, setLegacyItemHidden } from "@/lib/db-actions";
import {
  activeChecklistItems,
  displayStatus,
  groupByCategory,
  SIMPLE_STATUSES,
  SIMPLE_STATUS_META,
} from "@/lib/checklist";
import {
  type CaseFile,
  type ChecklistItemDef,
  type ClientType,
  type ItemState,
  type ItemStatus,
} from "@/lib/types";
import { formatDate } from "@/lib/normalize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/shared/page-shell";

/**
 * Checklist do cliente. O padrão atual aparece primeiro; definições
 * aposentadas vinculadas a esta ficha aparecem no fim até serem ocultadas.
 */
export function ChecklistPanel({
  client,
  type,
  caseFile,
  hideOk = false,
}: {
  client: { id: string; name: string; code?: string };
  type: ClientType;
  caseFile: CaseFile | null | undefined;
  /** oculta itens já marcados como OK (que deixaram de ser pendência) */
  hideOk?: boolean;
}) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [showHidden, setShowHidden] = useState(false);
  const states = caseFile?.items ?? {};

  const currentItems = activeChecklistItems(type);
  const currentIds = useMemo(() => new Set(currentItems.map((item) => item.id)), [currentItems]);
  const definitionById = useMemo(
    () => new Map((type.checklist ?? []).map((item) => [item.id, item])),
    [type.checklist]
  );
  const hiddenIds = new Set(caseFile?.hiddenLegacyItemIds ?? []);
  const legacyIds = Array.from(
    new Set([
      ...(caseFile?.legacyItemIds ?? []),
      ...Object.keys(states).filter((id) => !currentIds.has(id)),
    ])
  ).filter((id) => !currentIds.has(id));

  const legacyItems = legacyIds.map((id): ChecklistItemDef => {
    const known = definitionById.get(id);
    return (
      known ?? {
        id,
        name: `Item antigo (${id})`,
        category: "Itens antigos",
        requirement: "opcional",
        blocking: false,
        generatesPendency: false,
        active: false,
        deleted: true,
      }
    );
  });

  const notHiddenByOk = (item: ChecklistItemDef) => {
    if (!hideOk) return true;
    const s = displayStatus(states[item.id]?.status);
    return s !== "conferido" && s !== "nao_se_aplica";
  };

  const visibleLegacy = legacyItems.filter((item) => !hiddenIds.has(item.id)).filter(notHiddenByOk);
  const hiddenLegacy = legacyItems.filter((item) => hiddenIds.has(item.id));
  const groups = groupByCategory(currentItems, type.checklistGroups ?? [])
    .map((g) => ({ ...g, items: g.items.filter(notHiddenByOk) }))
    .filter((g) => g.items.length > 0);

  const setStatus = async (itemId: string, status: ItemStatus) => {
    if (!user) return;
    try {
      await setChecklistItem(client.id, type.id, itemId, status, user);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar item" });
    }
  };

  const setHidden = async (itemId: string, hidden: boolean) => {
    if (!user) return;
    try {
      await setLegacyItemHidden(client.id, type.id, itemId, hidden, user);
      toast({ title: hidden ? "Item antigo ocultado" : "Item antigo restaurado" });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao alterar a visibilidade" });
    }
  };

  if (groups.length === 0 && visibleLegacy.length === 0 && (!isAdmin || hiddenLegacy.length === 0)) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        {hideOk && activeChecklistItems(type).length > 0
          ? "Tudo OK ou não se aplica por aqui — nenhum item pendente. Use o botão acima para exibir os itens ocultos."
          : "Esta operação não tem checklist configurado. O administrador pode criar pelo botão Editar operações, na tela Operação."}
      </p>
    );
  }

  const renderItem = (item: ChecklistItemDef, legacy = false, hidden = false) => (
    <ChecklistRow
      key={item.id}
      item={item}
      state={states[item.id]}
      legacy={legacy}
      hidden={hidden}
      onSetStatus={(status) => setStatus(item.id, status)}
      onSaveNote={async (note) => {
        if (!user) return;
        const status = states[item.id]?.status ?? "nao_verificado";
        const statusLabel = SIMPLE_STATUS_META[displayStatus(status)].label;
        try {
          await saveChecklistNote(
            client,
            type.id,
            type.name,
            item.id,
            item.name,
            status,
            statusLabel,
            note,
            user
          );
        } catch (error) {
          console.error(error);
          toast({ variant: "destructive", title: "Erro ao salvar observação e histórico" });
          throw error;
        }
      }}
      onToggleHidden={legacy ? () => setHidden(item.id, !hidden) : undefined}
    />
  );

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category}>
          <div className="mb-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">{group.category}</h4>
            {group.description && <p className="text-[11px] text-muted-foreground/80">{group.description}</p>}
          </div>
          <div className="divide-y rounded-lg border bg-card">
            {group.items.map((item) => renderItem(item))}
          </div>
        </div>
      ))}

      {visibleLegacy.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-2 dark:border-amber-900 dark:bg-amber-950/10">
          <div className="mb-2 flex items-start gap-2">
            <History className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div>
              <h4 className="text-xs font-medium text-amber-900 dark:text-amber-200">Itens antigos desta ficha</h4>
              <p className="text-[11px] text-muted-foreground">
                Permanecem por segurança após uma mudança no padrão. Ocultar não apaga respostas nem observações.
              </p>
            </div>
          </div>
          <div className="divide-y rounded-md border bg-card">
            {visibleLegacy.map((item) => renderItem(item, true))}
          </div>
        </div>
      )}

      {isAdmin && hiddenLegacy.length > 0 && (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setShowHidden((value) => !value)}>
            <Eye className="mr-1.5 size-3.5" />
            {showHidden ? "Esconder ocultos" : `Ver ocultos (${hiddenLegacy.length})`}
          </Button>
          {showHidden && (
            <div className="divide-y rounded-md border border-dashed bg-muted/30 opacity-75">
              {hiddenLegacy.map((item) => renderItem(item, true, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SIMPLE_TITLE: Record<(typeof SIMPLE_STATUSES)[number], string> = {
  pendente: "Pendente — falta resolver (vira pendência do cliente)",
  nao_se_aplica: "Não se aplica — não é pendência, fica junto com os itens OK",
  conferido: "OK — resolvido, não é pendência",
};

const SIMPLE_SELECTED_CLASS: Record<(typeof SIMPLE_STATUSES)[number], string> = {
  pendente: "bg-red-300 font-semibold text-red-950 ring-1 ring-inset ring-red-500 dark:bg-red-900/75 dark:text-red-50 dark:ring-red-600",
  nao_se_aplica: "bg-slate-400 font-semibold text-slate-950 ring-1 ring-inset ring-slate-500 dark:bg-slate-700 dark:text-slate-50 dark:ring-slate-400",
  conferido: "bg-emerald-300 font-semibold text-emerald-950 ring-1 ring-inset ring-emerald-500 dark:bg-emerald-900/75 dark:text-emerald-50 dark:ring-emerald-600",
};

function ChecklistRow({
  item,
  state,
  legacy,
  hidden,
  onSetStatus,
  onSaveNote,
  onToggleHidden,
}: {
  item: ChecklistItemDef;
  state: ItemState | undefined;
  legacy: boolean;
  hidden: boolean;
  onSetStatus: (status: ItemStatus) => void;
  onSaveNote: (note: string) => Promise<void>;
  onToggleHidden?: () => void;
}) {
  const simple = displayStatus(state?.status);

  return (
    <div className={cn("flex items-center gap-2 px-2 py-1", hidden && "bg-muted/40")}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]" title={item.description || item.name}>
          {item.name}
          {legacy && <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[9px]">antigo</Badge>}
        </p>
        {(state?.note || state?.updatedBy) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {state?.note && <span>“{state.note}” — </span>}
            {state?.updatedBy} {state?.updatedAt ? formatDate(state.updatedAt) : ""}
          </p>
        )}
      </div>
      <NoteButton itemName={item.name} note={state?.note ?? ""} onSave={onSaveNote} />
      <div className="flex shrink-0 overflow-hidden rounded-md border">
        {SIMPLE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            title={SIMPLE_TITLE[s]}
            onClick={() => simple !== s && onSetStatus(s)}
            className={cn(
              "border-l px-2 py-0.5 text-[11px] transition-colors first:border-l-0",
              simple === s
                ? SIMPLE_SELECTED_CLASS[s]
                : "bg-white font-normal text-foreground hover:bg-slate-50 dark:bg-background dark:hover:bg-muted"
            )}
          >
            {SIMPLE_STATUS_META[s].label}
          </button>
        ))}
      </div>
      {onToggleHidden && (
        <HelpTip label={hidden ? "Restaura a exibição deste item antigo." : "Oculta este item antigo sem apagar seus dados."}>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onToggleHidden}>
            {hidden ? <RotateCcw className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </Button>
        </HelpTip>
      )}
    </div>
  );
}

function NoteButton({
  itemName,
  note,
  onSave,
}: {
  itemName: string;
  note: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
      setOpen(false);
    } catch {
      // O erro é apresentado pelo painel e o modal permanece aberto.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setValue("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7 shrink-0", note ? "text-sky-600" : "text-muted-foreground/50")}
          title={note ? `Observação: ${note}` : "Adicionar observação"}
        >
          <MessageSquarePlus className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar observação ao checklist</DialogTitle>
          <DialogDescription>
            {itemName}. A nova observação será registrada também nos Andamentos do cliente.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Observação do item…"
          rows={3}
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!value.trim() || saving}
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
