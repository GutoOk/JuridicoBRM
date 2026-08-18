"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { centsToInput, formatCurrency, parseCurrencyToCents } from "@/lib/finance";
import { dateMillis, formatDateTime } from "@/lib/normalize";
import {
  PROCESS_COST_KINDS,
  createProcessCost,
  processCostTotals,
  setProcessCostDeleted,
  updateProcessCost,
  type ProcessCostInput,
} from "@/lib/process-cost-actions";
import type { Process, ProcessCost, ProcessCostKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, HelpTip } from "@/components/shared/page-shell";

/** Data de hoje no formato do input, sem escorregar de dia por fuso. */
function todayInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyForm(): ProcessCostInput {
  return {
    kind: "Custas",
    description: "",
    amountCents: 0,
    costDate: todayInput(),
    paidBy: "",
    reimbursed: false,
    notes: "",
  };
}

const KIND_STYLES: Record<ProcessCostKind, string> = {
  Custas: "bg-sky-100 text-sky-800",
  Despesa: "bg-amber-100 text-amber-800",
  Honorários: "bg-violet-100 text-violet-800",
  Outro: "bg-slate-100 text-slate-800",
};

/**
 * Custas, despesas e demais desembolsos do processo. Separado do módulo financeiro,
 * que cuida do que o cliente deve ao escritório: aqui é o que o escritório gastou.
 */
export function ProcessCostsPanel({ process }: { process: Process }) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: costs } = useCollection<ProcessCost>(
    "processCosts",
    { where: [["processId", "==", process.id]] },
    [process.id]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProcessCost | null>(null);
  const [form, setForm] = useState<ProcessCostInput>(emptyForm);
  const [amountText, setAmountText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ cost: ProcessCost; deleted: boolean } | null>(null);

  const activeCosts = useMemo(
    () => (costs ?? [])
      .filter((cost) => !cost.deleted)
      .sort((first, second) => dateMillis(second.costDate) - dateMillis(first.costDate)),
    [costs]
  );
  const deletedCosts = useMemo(() => (costs ?? []).filter((cost) => cost.deleted), [costs]);
  const visibleCosts = showDeleted ? deletedCosts : activeCosts;
  const totals = processCostTotals(activeCosts);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setAmountText("");
    setFormOpen(true);
  };

  const openEdit = (cost: ProcessCost) => {
    setEditing(cost);
    setForm({
      kind: cost.kind,
      description: cost.description,
      amountCents: cost.amountCents,
      costDate: new Date(dateMillis(cost.costDate)).toISOString().slice(0, 10),
      paidBy: cost.paidBy ?? "",
      reimbursed: !!cost.reimbursed,
      notes: cost.notes ?? "",
    });
    setAmountText(centsToInput(cost.amountCents));
    setFormOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const amountCents = parseCurrencyToCents(amountText);
    if (amountCents === null || amountCents <= 0) {
      toast({ variant: "destructive", title: "Informe um valor maior que zero" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amountCents };
      if (editing) await updateProcessCost(editing, payload, user);
      else await createProcessCost(process, payload, user);
      toast({ title: editing ? "Lançamento atualizado" : "Lançamento registrado" });
      setFormOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Confira os dados e tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  const applyDeletion = async () => {
    if (!user || !deleteTarget) return;
    try {
      await setProcessCostDeleted(deleteTarget.cost, deleteTarget.deleted, user);
      setDeleteTarget(null);
      toast({ title: deleteTarget.deleted ? "Lançamento excluído" : "Lançamento restaurado" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Não foi possível concluir a ação" });
    }
  };

  if (!costs) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 size-4" /> Novo lançamento
        </Button>
        {isAdmin && deletedCosts.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant={showDeleted ? "secondary" : "outline"}
            className="h-8"
            onClick={() => setShowDeleted((current) => !current)}
            title="Mostrar ou ocultar lançamentos excluídos"
          >
            <Trash2 className="mr-1.5 size-3.5" />
            {showDeleted ? "Ocultar excluídos" : `Ver excluídos (${deletedCosts.length})`}
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Total desembolsado: <span className="font-medium text-foreground">{formatCurrency(totals.totalCents)}</span>
          </span>
          <span className="text-muted-foreground">
            A reembolsar: <span className="font-medium text-foreground">{formatCurrency(totals.pendingCents)}</span>
          </span>
        </div>
      </div>

      {visibleCosts.length === 0 && (
        <EmptyState
          title={showDeleted ? "Nenhum lançamento excluído" : "Nenhuma custa lançada"}
          description={
            showDeleted
              ? "Os lançamentos excluídos aparecem aqui."
              : "Registre guias recolhidas, diligências e demais gastos deste processo."
          }
        />
      )}

      <div className="space-y-1.5">
        {visibleCosts.map((cost) => (
          <div key={cost.id} className={cn("surface p-3 text-sm", cost.deleted && "bg-muted/40")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("shadow-none", KIND_STYLES[cost.kind])}>{cost.kind}</Badge>
                  <span className="font-medium">{cost.description}</span>
                  {cost.reimbursed && (
                    <span className="rounded bg-emerald-100 px-1 py-px text-[10px] text-emerald-800">reembolsado</span>
                  )}
                  {cost.deleted && (
                    <span className="rounded bg-rose-100 px-1 py-px text-[10px] text-rose-800">excluído</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(cost.costDate).split(" ")[0]}
                  {cost.paidBy ? ` · pago por ${cost.paidBy}` : ""}
                  {` · lançado por ${cost.createdBy}`}
                </p>
                {cost.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{cost.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="font-medium">{formatCurrency(cost.amountCents)}</span>
                {cost.deleted ? (
                  isAdmin && (
                    <HelpTip label="Restaurar este lançamento">
                      <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => setDeleteTarget({ cost, deleted: false })}>
                        <Undo2 className="size-3.5" />
                      </Button>
                    </HelpTip>
                  )
                ) : (
                  <>
                    <HelpTip label="Editar lançamento">
                      <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => openEdit(cost)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </HelpTip>
                    <HelpTip label="Excluir lançamento">
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => setDeleteTarget({ cost, deleted: true })}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </HelpTip>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <DialogHeader>
              <DialogTitle className="text-base">
                {editing ? "Editar lançamento" : "Novo lançamento"}
              </DialogTitle>
              <DialogDescription>
                Gasto do escritório neste processo. Não entra no financeiro do cliente.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Natureza</Label>
                <Select value={form.kind} onValueChange={(kind: ProcessCostKind) => setForm((c) => ({ ...c, kind }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROCESS_COST_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost-date" className="text-xs">Data</Label>
                <Input
                  id="cost-date"
                  type="date"
                  value={form.costDate}
                  onChange={(event) => setForm((c) => ({ ...c, costDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cost-description" className="text-xs">Descrição</Label>
              <Input
                id="cost-description"
                value={form.description}
                onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
                placeholder="Ex.: guia de custas iniciais"
                maxLength={300}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="cost-amount" className="text-xs">Valor</Label>
                <Input
                  id="cost-amount"
                  value={amountText}
                  onChange={(event) => setAmountText(event.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost-paid-by" className="text-xs">Pago por (opcional)</Label>
                <Input
                  id="cost-paid-by"
                  value={form.paidBy}
                  onChange={(event) => setForm((c) => ({ ...c, paidBy: event.target.value }))}
                  placeholder="Quem desembolsou"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-xs">
              <Checkbox
                checked={form.reimbursed}
                onCheckedChange={(checked) => setForm((c) => ({ ...c, reimbursed: checked === true }))}
              />
              Já reembolsado
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="cost-notes" className="text-xs">Observação (opcional)</Label>
              <Textarea
                id="cost-notes"
                value={form.notes}
                onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={deleteTarget?.deleted ? "Excluir lançamento?" : "Restaurar lançamento?"}
        description={
          deleteTarget?.deleted
            ? "O lançamento sai da lista e do total, mas continua guardado e auditável."
            : "O lançamento volta a contar no total do processo."
        }
        onConfirm={applyDeletion}
      />
    </div>
  );
}
