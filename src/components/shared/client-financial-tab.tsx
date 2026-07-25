"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Loader2,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  createFinancialAgreement,
  registerFinancialPayment,
  restoreFinancialAgreement,
  restoreFinancialPayment,
  softDeleteFinancialAgreement,
  softDeleteFinancialPayment,
} from "@/lib/db-actions";
import {
  addMonthsToDateInput,
  buildAgreementLedger,
  centsToInput,
  dateInputToDate,
  dateToInput,
  FINANCIAL_PAYMENT_PLAN_LABELS,
  FINANCIAL_VALUE_BASIS_LABELS,
  findMinimumWageAt,
  formatCurrency,
  minimumWageMultiplier,
  parseCurrencyToCents,
  RECEIPT_METHOD_LABELS,
  splitAmountIntoInstallments,
  todayInput,
  type FinancialAgreementLedger,
  type FinancialInstallmentView,
} from "@/lib/finance";
import { formatDate } from "@/lib/normalize";
import type {
  Client,
  FinancialAgreement,
  FinancialInstallment,
  FinancialPaymentPlan,
  FinancialValueBasis,
  MinimumWage,
  ReceiptMethod,
  ReceivingAccount,
  Update,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, FilterChip, HelpTip, Toolbar } from "@/components/shared/page-shell";

const STATUS_LABELS = {
  pending: "Pendente",
  overdue: "Em atraso",
  partial: "Parcial",
  partial_overdue: "Parcial em atraso",
  paid: "Pago",
  paid_late: "Pago com atraso",
  paid_partial_rolled: "Pago parcialmente",
} as const;

const STATUS_STYLES = {
  pending: "border-slate-200 bg-slate-100 text-slate-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  partial_overdue: "border-red-200 bg-red-50 text-red-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paid_late: "border-orange-200 bg-orange-50 text-orange-800",
  paid_partial_rolled: "border-blue-200 bg-blue-50 text-blue-700",
} as const;

export function ClientFinancialTab({
  client,
  updates,
}: {
  client: Client;
  updates: Update[];
}) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: agreements } = useCollection<FinancialAgreement>(
    "financialAgreements",
    { where: [["clientId", "==", client.id]] },
    [client.id]
  );
  const { data: installments } = useCollection<FinancialInstallment>(
    "financialInstallments",
    { where: [["clientId", "==", client.id]] },
    [client.id]
  );
  const { data: minimumWages } = useCollection<MinimumWage>("minimumWages");
  const { data: receivingAccounts } =
    useCollection<ReceivingAccount>("receivingAccounts");

  const [agreementOpen, setAgreementOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{
    ledger: FinancialAgreementLedger;
    installment: FinancialInstallmentView;
  } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteAgreement, setDeleteAgreement] =
    useState<FinancialAgreementLedger | null>(null);
  const [deletePayment, setDeletePayment] = useState<Update | null>(null);
  const [working, setWorking] = useState(false);

  const financePayments = useMemo(
    () =>
      updates.filter(
        (update) =>
          update.type === "Financeiro" &&
          update.clientId === client.id &&
          !!update.financialAgreementId
      ),
    [client.id, updates]
  );

  const ledgers = useMemo(
    () =>
      (agreements ?? [])
        .filter((agreement) => (showDeleted && isAdmin ? true : !agreement.deleted))
        .map((agreement) =>
          buildAgreementLedger(
            agreement,
            installments ?? [],
            financePayments,
            minimumWages ?? []
          )
        )
        .sort((a, b) => {
          if (!!a.agreement.deleted !== !!b.agreement.deleted) {
            return a.agreement.deleted ? 1 : -1;
          }
          if (!!a.agreement.settled !== !!b.agreement.settled) {
            return a.agreement.settled ? 1 : -1;
          }
          return (a.agreement.description ?? "").localeCompare(
            b.agreement.description ?? ""
          );
        }),
    [
      agreements,
      financePayments,
      installments,
      isAdmin,
      minimumWages,
      showDeleted,
    ]
  );

  if (!agreements || !installments || !minimumWages || !receivingAccounts) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeLedgers = ledgers.filter((ledger) => !ledger.agreement.deleted);
  const totalReceived = activeLedgers.reduce(
    (sum, ledger) => sum + ledger.receivedCents,
    0
  );
  const totalPending = activeLedgers.reduce(
    (sum, ledger) => sum + ledger.pendingCents,
    0
  );
  const overdueCount = activeLedgers.reduce(
    (sum, ledger) =>
      sum +
      ledger.installments.filter(
        (installment) =>
          installment.status === "overdue" ||
          installment.status === "partial_overdue"
      ).length,
    0
  );
  const deletedCount =
    agreements.filter((agreement) => agreement.deleted).length +
    financePayments.filter((payment) => payment.deleted).length;

  const handleDeleteAgreement = async () => {
    if (!user || !deleteAgreement) return;
    setWorking(true);
    try {
      await softDeleteFinancialAgreement(
        deleteAgreement.agreement,
        installments,
        user
      );
      toast({ title: "Valor devido excluído" });
      setDeleteAgreement(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setWorking(false);
    }
  };

  const handleRestoreAgreement = async (ledger: FinancialAgreementLedger) => {
    if (!user || !isAdmin) return;
    setWorking(true);
    try {
      await restoreFinancialAgreement(ledger.agreement, installments, user);
      toast({ title: "Valor devido restaurado" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao restaurar",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setWorking(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!user || !deletePayment) return;
    setWorking(true);
    try {
      await softDeleteFinancialPayment(deletePayment.id, user);
      toast({ title: "Pagamento excluído" });
      setDeletePayment(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setWorking(false);
    }
  };

  const handleRestorePayment = async (
    payment: Update,
    ledger: FinancialAgreementLedger
  ) => {
    if (!user || !isAdmin) return;
    setWorking(true);
    try {
      await restoreFinancialPayment(
        payment.id,
        ledger.installments.map((item) => item.installment.id),
        user
      );
      toast({ title: "Pagamento restaurado" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível restaurar",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-3">
      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>
            <span className="text-muted-foreground">Recebido:</span>{" "}
            <span className="font-medium text-emerald-700">
              {formatCurrency(totalReceived)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Pendente:</span>{" "}
            <span className="font-medium">{formatCurrency(totalPending)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Em atraso:</span>{" "}
            <span className={cn("font-medium", overdueCount > 0 && "text-red-700")}>
              {overdueCount}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && deletedCount > 0 && (
            <FilterChip
              active={showDeleted}
              onClick={() => setShowDeleted((current) => !current)}
              title="Exibe ou oculta os registros excluídos"
            >
              <Trash2 className="size-3" /> Excluídos ({deletedCount})
            </FilterChip>
          )}
          <HelpTip label="Cadastra um novo valor devido e define sua forma de pagamento.">
            <Button size="sm" onClick={() => setAgreementOpen(true)}>
              <Plus className="mr-1.5 size-4" /> Novo valor devido
            </Button>
          </HelpTip>
        </div>
      </Toolbar>

      {ledgers.length === 0 && (
        <EmptyState
          icon={CircleDollarSign}
          title="Nenhum valor devido cadastrado"
          description="Cadastre o primeiro acordo financeiro deste cliente."
        >
          <Button size="sm" onClick={() => setAgreementOpen(true)}>
            <Plus className="mr-1.5 size-4" /> Novo valor devido
          </Button>
        </EmptyState>
      )}

      {ledgers.map((ledger) => (
        <AgreementCard
          key={ledger.agreement.id}
          ledger={ledger}
          allPayments={financePayments}
          showDeleted={showDeleted && isAdmin}
          isAdmin={isAdmin}
          userId={user?.id}
          working={working}
          onPayment={(installment) => setPaymentTarget({ ledger, installment })}
          onDeleteAgreement={() => setDeleteAgreement(ledger)}
          onRestoreAgreement={() => handleRestoreAgreement(ledger)}
          onDeletePayment={setDeletePayment}
          onRestorePayment={(payment) => handleRestorePayment(payment, ledger)}
        />
      ))}

      <AgreementDialog
        open={agreementOpen}
        onOpenChange={setAgreementOpen}
        client={client}
        minimumWages={minimumWages}
      />
      <PaymentDialog
        target={paymentTarget}
        open={!!paymentTarget}
        onOpenChange={(open) => !open && setPaymentTarget(null)}
        client={client}
        installments={installments}
        payments={financePayments}
        minimumWages={minimumWages}
        accounts={receivingAccounts.filter((account) => !account.deleted)}
      />
      <ConfirmDeleteDialog
        open={!!deleteAgreement}
        onOpenChange={(open) => !open && setDeleteAgreement(null)}
        title="Excluir valor devido?"
        description="Deseja excluir este valor devido?"
        onConfirm={handleDeleteAgreement}
        loading={working}
      />
      <ConfirmDeleteDialog
        open={!!deletePayment}
        onOpenChange={(open) => !open && setDeletePayment(null)}
        title="Excluir pagamento?"
        description="Deseja excluir este pagamento?"
        onConfirm={handleDeletePayment}
        loading={working}
      />
    </div>
  );
}

function AgreementCard({
  ledger,
  allPayments,
  showDeleted,
  isAdmin,
  userId,
  working,
  onPayment,
  onDeleteAgreement,
  onRestoreAgreement,
  onDeletePayment,
  onRestorePayment,
}: {
  ledger: FinancialAgreementLedger;
  allPayments: Update[];
  showDeleted: boolean;
  isAdmin: boolean;
  userId?: string;
  working: boolean;
  onPayment: (installment: FinancialInstallmentView) => void;
  onDeleteAgreement: () => void;
  onRestoreAgreement: () => void;
  onDeletePayment: (payment: Update) => void;
  onRestorePayment: (payment: Update) => void;
}) {
  const agreement = ledger.agreement;
  const deletedPayments = showDeleted
    ? allPayments.filter(
        (payment) =>
          payment.financialAgreementId === agreement.id && payment.deleted
      )
    : [];
  const hasActivePayments = allPayments.some(
    (payment) =>
      payment.financialAgreementId === agreement.id && !payment.deleted
  );

  return (
    <Card
      className={cn(
        "surface overflow-hidden",
        agreement.deleted && "border-dashed opacity-75"
      )}
    >
      <CardHeader className="ledger-header px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">
              {agreement.description || "Valor devido"}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="h-5 bg-card text-[11px]">
                {FINANCIAL_VALUE_BASIS_LABELS[agreement.valueBasis]}
              </Badge>
              <Badge variant="outline" className="h-5 bg-card text-[11px]">
                {FINANCIAL_PAYMENT_PLAN_LABELS[agreement.paymentPlan]}
              </Badge>
              {agreement.deleted ? (
                <Badge variant="outline" className="h-5 text-[11px]">
                  Excluído
                </Badge>
              ) : agreement.settled ? (
                <Badge
                  variant="outline"
                  className="h-5 border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700"
                >
                  Quitado
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {agreement.deleted ? (
              isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRestoreAgreement}
                  disabled={working}
                  title="Restaurar este valor devido"
                >
                  <ArchiveRestore className="mr-1.5 size-4" /> Restaurar
                </Button>
              )
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={onDeleteAgreement}
                disabled={working || hasActivePayments}
                title={
                  hasActivePayments
                    ? "Exclua primeiro os pagamentos deste valor devido"
                    : "Excluir este valor devido"
                }
              >
                <Trash2 className="mr-1.5 size-4" /> Excluir
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
          <LedgerValue label="Valor inicial" value={formatCurrency(agreement.originalAmountCents)} />
          <LedgerValue label="Valor atualizado" value={formatCurrency(ledger.targetCents)} />
          <LedgerValue label="Recebido" value={formatCurrency(ledger.receivedCents)} />
          <LedgerValue
            label="Saldo pendente"
            value={formatCurrency(ledger.pendingCents)}
            className={ledger.pendingCents > 0 ? "text-foreground" : "text-emerald-700"}
          />
        </div>
        {ledger.correctionCents > 0 && !agreement.settled && (
          <p className="text-[11px] text-muted-foreground">
            A última parcela pendente inclui {formatCurrency(ledger.correctionCents)} de
            atualização pelo salário mínimo vigente.
          </p>
        )}
        {agreement.customPaymentTerms && (
          <p className="text-xs text-muted-foreground">
            Forma combinada: {agreement.customPaymentTerms}
          </p>
        )}
        {agreement.note && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {agreement.note}
          </p>
        )}

        <div className="work-table">
          <Table className="table-fixed text-xs">
            <TableHeader className="ledger-header">
              <TableRow>
                <TableHead className="h-8 w-[17%] px-2">Parcela</TableHead>
                <TableHead className="hidden h-8 w-[18%] px-2 sm:table-cell">
                  Vencimento
                </TableHead>
                <TableHead className="h-8 w-[20%] px-2 text-right">Previsto</TableHead>
                <TableHead className="hidden h-8 w-[18%] px-2 text-right md:table-cell">
                  Recebido
                </TableHead>
                <TableHead className="h-8 w-[16%] px-2">Situação</TableHead>
                <TableHead className="h-8 w-[29%] px-2 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.installments.map((view) => {
                const deletedForInstallment = deletedPayments.filter(
                  (payment) =>
                    payment.financialInstallmentId === view.installment.id
                );
                return (
                  <InstallmentRows
                    key={view.installment.id}
                    view={view}
                    deletedPayments={deletedForInstallment}
                    isAdmin={isAdmin}
                    userId={userId}
                    agreementSettled={!!agreement.settled}
                    agreementSettledByPaymentId={agreement.settledByPaymentId}
                    disabled={working || !!agreement.deleted}
                    onPayment={() => onPayment(view)}
                    onDeletePayment={onDeletePayment}
                    onRestorePayment={onRestorePayment}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function InstallmentRows({
  view,
  deletedPayments,
  isAdmin,
  userId,
  agreementSettled,
  agreementSettledByPaymentId,
  disabled,
  onPayment,
  onDeletePayment,
  onRestorePayment,
}: {
  view: FinancialInstallmentView;
  deletedPayments: Update[];
  isAdmin: boolean;
  userId?: string;
  agreementSettled: boolean;
  agreementSettledByPaymentId?: string | null;
  disabled: boolean;
  onPayment: () => void;
  onDeletePayment: (payment: Update) => void;
  onRestorePayment: (payment: Update) => void;
}) {
  const payments = [...view.payments, ...deletedPayments];
  return (
    <>
      <TableRow>
        <TableCell className="px-2 py-1.5">
          <span className="font-medium">
            {view.installment.sequence}/{view.installment.installmentCount}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground sm:hidden">
            {view.installment.dueDate
              ? formatDate(view.installment.dueDate)
              : "Fim do processo"}
          </span>
        </TableCell>
        <TableCell className="hidden truncate px-2 py-1.5 sm:table-cell">
          {view.installment.dueDate
            ? formatDate(view.installment.dueDate)
            : "Fim do processo"}
        </TableCell>
        <TableCell className="px-2 py-1.5 text-right tabular-nums">
          {formatCurrency(view.expectedCents)}
          {view.isCorrectionTarget && view.amountDueCents > 0 && (
            <span className="block truncate text-[10px] text-muted-foreground">
              saldo final
            </span>
          )}
        </TableCell>
        <TableCell className="hidden px-2 py-1.5 text-right tabular-nums md:table-cell">
          {formatCurrency(view.receivedCents)}
        </TableCell>
        <TableCell className="px-2 py-1.5">
          <Badge
            variant="outline"
            className={cn(
              "h-5 max-w-full truncate px-1.5 text-[10px] shadow-none",
              STATUS_STYLES[view.status]
            )}
          >
            {STATUS_LABELS[view.status]}
          </Badge>
        </TableCell>
        <TableCell className="px-2 py-1.5 text-right">
          {!view.installment.settled && (
            <Button
              size="sm"
              variant={
                view.status === "overdue" || view.status === "partial_overdue"
                  ? "default"
                  : "outline"
              }
              className="h-7 px-2 text-xs"
              onClick={onPayment}
              disabled={disabled || !view.canReceivePayment || view.amountDueCents <= 0}
              title={
                !view.canReceivePayment
                  ? "Registre primeiro a parcela pendente mais antiga"
                  : "Registrar pagamento desta parcela"
              }
            >
              <Banknote className="mr-1 size-3.5" /> Pagar
            </Button>
          )}
        </TableCell>
      </TableRow>
      {view.rolledForwardCents > 0 && (
        <TableRow className="bg-blue-50/30">
          <TableCell colSpan={6} className="px-2 py-1 text-[11px] text-blue-800">
            {formatCurrency(view.rolledForwardCents)} foram transferidos para a última
            parcela pendente.
          </TableCell>
        </TableRow>
      )}
      {payments.length > 0 && (
        <TableRow className="bg-muted/15">
          <TableCell colSpan={6} className="px-2 py-1.5">
            <div className="flex flex-wrap gap-1.5">
              {payments.map((payment) => {
                const canDelete =
                  !payment.deleted &&
                  view.installment.paymentIds.at(-1) === payment.id &&
                  (!agreementSettled ||
                    agreementSettledByPaymentId === payment.id) &&
                  (isAdmin || (!!userId && payment.authorId === userId));
                const method = payment.receiptMethod
                  ? payment.receiptMethod === "other"
                    ? payment.receiptMethodOther || "Outro"
                    : RECEIPT_METHOD_LABELS[payment.receiptMethod]
                  : "Não informado";
                return (
                  <span
                    key={payment.id}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[11px]",
                      payment.deleted && "border-dashed text-muted-foreground line-through"
                    )}
                    title={[
                      formatCurrency(payment.amountCents),
                      formatDate(payment.paidAt),
                      method,
                      payment.receiptAccountName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    <ReceiptText className="size-3 shrink-0" />
                    <span className="truncate">
                      {formatCurrency(payment.amountCents)} · {formatDate(payment.paidAt)} ·{" "}
                      {method}
                      {payment.receiptAccountName
                        ? ` · ${payment.receiptAccountName}`
                        : ""}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        className="ml-0.5 text-destructive hover:text-destructive/80"
                        onClick={() => onDeletePayment(payment)}
                        title="Excluir este pagamento"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                    {payment.deleted && isAdmin && (
                      <button
                        type="button"
                        className="ml-0.5 text-foreground hover:text-primary"
                        onClick={() => onRestorePayment(payment)}
                        title="Restaurar este pagamento"
                      >
                        <ArchiveRestore className="size-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function LedgerValue({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] text-muted-foreground">{label}</span>
      <span className={cn("block truncate font-medium tabular-nums", className)}>
        {value}
      </span>
    </div>
  );
}

function AgreementDialog({
  open,
  onOpenChange,
  client,
  minimumWages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  minimumWages: MinimumWage[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [agreementDate, setAgreementDate] = useState(todayInput());
  const [basis, setBasis] = useState<FinancialValueBasis>("minimum_wage");
  const [customAmount, setCustomAmount] = useState("");
  const [plan, setPlan] = useState<FinancialPaymentPlan>("upfront");
  const [count, setCount] = useState(1);
  const [dates, setDates] = useState<string[]>([todayInput()]);
  const [customTerms, setCustomTerms] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = todayInput();
    setDescription("");
    setAgreementDate(today);
    setBasis("minimum_wage");
    setCustomAmount("");
    setPlan("upfront");
    setCount(1);
    setDates([today]);
    setCustomTerms("");
    setNote("");
  }, [open]);

  const agreementDateValue = dateInputToDate(agreementDate);
  const effectiveWage = agreementDateValue
    ? findMinimumWageAt(minimumWages, agreementDateValue)
    : undefined;
  const multiplier = minimumWageMultiplier(basis);
  const customCents = parseCurrencyToCents(customAmount);
  const totalCents = multiplier
    ? effectiveWage
      ? Math.round(effectiveWage.amountCents * multiplier)
      : null
    : customCents;

  const updatePlan = (value: FinancialPaymentPlan) => {
    setPlan(value);
    const today = agreementDate || todayInput();
    if (value === "installments") {
      setCount(2);
      setDates([today, addMonthsToDateInput(today, 1)]);
    } else {
      setCount(1);
      setDates([value === "at_end" ? "" : today]);
    }
  };

  const updateCount = (raw: number) => {
    const next = Math.max(1, Math.min(60, Math.trunc(raw || 1)));
    setCount(next);
    const start = dates[0] || agreementDate || todayInput();
    setDates((current) =>
      Array.from(
        { length: next },
        (_, index) => current[index] ?? addMonthsToDateInput(start, index)
      )
    );
  };

  const save = async () => {
    if (!user || !agreementDateValue || !totalCents || totalCents <= 0) return;
    if (multiplier && !effectiveWage) {
      toast({
        variant: "destructive",
        title: "Cadastre o salário mínimo vigente",
      });
      return;
    }
    if (plan === "installments" && dates.some((date) => !dateInputToDate(date))) {
      toast({
        variant: "destructive",
        title: "Informe a data de todas as parcelas",
      });
      return;
    }
    if (plan === "upfront" && !dateInputToDate(dates[0])) {
      toast({ variant: "destructive", title: "Informe a data do pagamento no ato" });
      return;
    }
    if (plan === "custom" && !customTerms.trim()) {
      toast({ variant: "destructive", title: "Descreva a forma de pagamento" });
      return;
    }

    const amounts = splitAmountIntoInstallments(totalCents, count);
    setSaving(true);
    try {
      await createFinancialAgreement(
        client,
        {
          description,
          agreementDate: agreementDateValue,
          valueBasis: basis,
          minimumWageMultiplier: multiplier,
          baseMinimumWageRateId: effectiveWage?.id,
          baseMinimumWageCents: effectiveWage?.amountCents,
          originalAmountCents: totalCents,
          paymentPlan: plan,
          customPaymentTerms: customTerms,
          note,
          installments: amounts.map((baseAmountCents, index) => ({
            dueDate:
              plan === "at_end"
                ? null
                : plan === "custom" && !dates[index]
                  ? null
                  : dateInputToDate(dates[index]),
            baseAmountCents,
          })),
        },
        user
      );
      toast({ title: "Valor devido cadastrado" });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao cadastrar valor devido",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo valor devido</DialogTitle>
          <DialogDescription>
            Defina o valor e como {client.name} fará o pagamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Descrição" className="sm:col-span-2">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: honorários do processo"
              maxLength={160}
            />
          </Field>
          <Field label="Data do acordo">
            <Input
              type="date"
              value={agreementDate}
              onChange={(event) => setAgreementDate(event.target.value)}
            />
          </Field>
          <Field label="Valor devido">
            <Select
              value={basis}
              onValueChange={(value) => setBasis(value as FinancialValueBasis)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FINANCIAL_VALUE_BASIS_LABELS) as FinancialValueBasis[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {FINANCIAL_VALUE_BASIS_LABELS[value]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </Field>
          {basis === "custom" ? (
            <Field label="Valor personalizado">
              <Input
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </Field>
          ) : (
            <div className="rounded-md border bg-muted/20 p-2 text-xs">
              <p className="text-muted-foreground">Salário vigente na data</p>
              <p className="mt-0.5 font-medium">
                {effectiveWage
                  ? `${formatCurrency(effectiveWage.amountCents)} desde ${formatDate(
                      effectiveWage.effectiveFrom
                    )}`
                  : "Nenhum salário cadastrado"}
              </p>
            </div>
          )}
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <p className="text-muted-foreground">Total inicial</p>
            <p className="mt-0.5 font-medium">
              {totalCents ? formatCurrency(totalCents) : "—"}
            </p>
          </div>
          <Field label="Forma de pagamento">
            <Select
              value={plan}
              onValueChange={(value) => updatePlan(value as FinancialPaymentPlan)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FINANCIAL_PAYMENT_PLAN_LABELS) as FinancialPaymentPlan[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {FINANCIAL_PAYMENT_PLAN_LABELS[value]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </Field>
          {(plan === "installments" || plan === "custom") && (
            <Field label="Quantidade de parcelas">
              <Input
                type="number"
                min={plan === "installments" ? 2 : 1}
                max={60}
                value={count}
                onChange={(event) => updateCount(Number(event.target.value))}
              />
            </Field>
          )}
          {plan === "custom" && (
            <Field label="Forma personalizada" className="sm:col-span-2">
              <Textarea
                value={customTerms}
                onChange={(event) => setCustomTerms(event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Descreva como o cliente fará o pagamento"
              />
            </Field>
          )}
          {plan !== "at_end" && (
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs">
                  {count === 1 ? "Data do pagamento" : "Datas das parcelas"}
                </Label>
                <HelpTip label="As datas sugeridas podem ser alteradas individualmente." />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: count }, (_, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">
                      {index + 1}/{count}
                    </span>
                    <Input
                      type="date"
                      value={dates[index] ?? ""}
                      onChange={(event) =>
                        setDates((current) => {
                          const next = [...current];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      required={plan !== "custom"}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {plan === "at_end" && (
            <div className="rounded-md border bg-muted/20 p-2 text-xs sm:col-span-2">
              O valor ficará pendente sem vencimento até o encerramento do processo.
            </div>
          )}
          <Field label="Observação complementar" className="sm:col-span-2">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={2000}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving || !agreementDateValue || !totalCents || totalCents <= 0}
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  target,
  open,
  onOpenChange,
  client,
  installments,
  payments,
  minimumWages,
  accounts,
}: {
  target: {
    ledger: FinancialAgreementLedger;
    installment: FinancialInstallmentView;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  installments: FinancialInstallment[];
  payments: Update[];
  minimumWages: MinimumWage[];
  accounts: ReceivingAccount[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [paidDate, setPaidDate] = useState(todayInput());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ReceiptMethod>("pix");
  const [methodOther, setMethodOther] = useState("");
  const [accountChoice, setAccountChoice] = useState("");
  const [customAccount, setCustomAccount] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const paidDateValue = dateInputToDate(paidDate);
  const recalculated = useMemo(() => {
    if (!target || !paidDateValue) return null;
    const ledger = buildAgreementLedger(
      target.ledger.agreement,
      installments,
      payments,
      minimumWages,
      paidDateValue
    );
    const installment = ledger.installments.find(
      (item) => item.installment.id === target.installment.installment.id
    );
    return installment ? { ledger, installment } : null;
  }, [installments, minimumWages, paidDateValue, payments, target]);

  useEffect(() => {
    if (!open || !target) return;
    setPaidDate(todayInput());
    setAmount(centsToInput(target.installment.amountDueCents));
    setMethod("pix");
    setMethodOther("");
    setAccountChoice(accounts[0]?.id ?? "__other__");
    setCustomAccount("");
    setNote("");
    setConfirming(false);
  }, [accounts, open, target]);

  useEffect(() => {
    if (open && recalculated) {
      setAmount(centsToInput(recalculated.installment.amountDueCents));
    }
  }, [open, recalculated]);

  if (!target || !recalculated) return null;

  const amountCents = parseCurrencyToCents(amount) ?? 0;
  const dueCents = recalculated.installment.amountDueCents;
  const isPartial = amountCents > 0 && amountCents < dueCents;
  const account =
    accountChoice === "__other__"
      ? customAccount.trim()
      : accounts.find((item) => item.id === accountChoice)?.name ?? "";
  const valid =
    !!paidDateValue &&
    amountCents > 0 &&
    amountCents <= dueCents &&
    (method === "cash" || !!account) &&
    (method !== "other" || !!methodOther.trim());
  const remaining = Math.max(0, dueCents - amountCents);
  const transfersToLast =
    isPartial &&
    recalculated.ledger.installments.filter((item) => !item.installment.settled)
      .length > 1;

  const save = async () => {
    if (!user || !paidDateValue || !valid) return;
    setSaving(true);
    try {
      await registerFinancialPayment(
        {
          client,
          agreement: recalculated.ledger.agreement,
          installments: installments.filter(
            (installment) =>
              installment.agreementId === recalculated.ledger.agreement.id
          ),
          minimumWages,
          installmentId: recalculated.installment.installment.id,
          amountCents,
          paidAt: paidDateValue,
          receiptMethod: method,
          receiptMethodOther: methodOther,
          receiptAccountId:
            method === "cash" || accountChoice === "__other__"
              ? undefined
              : accountChoice,
          receiptAccountName: method === "cash" ? undefined : account,
          note,
        },
        user
      );
      toast({ title: "Pagamento registrado" });
      setConfirming(false);
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível registrar",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              Parcela {recalculated.installment.installment.sequence}/
              {recalculated.installment.installment.installmentCount} de{" "}
              {recalculated.ledger.agreement.description || "valor devido"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Data do pagamento">
              <Input
                type="date"
                max={todayInput()}
                value={paidDate}
                onChange={(event) => setPaidDate(event.target.value)}
              />
            </Field>
            <Field label="Valor pago">
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
              />
              <p className="text-[11px] text-muted-foreground">
                Saldo desta parcela: {formatCurrency(dueCents)}
              </p>
            </Field>
            <Field label="Forma de recebimento">
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as ReceiptMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECEIPT_METHOD_LABELS) as ReceiptMethod[]).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {RECEIPT_METHOD_LABELS[value]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </Field>
            {method === "other" && (
              <Field label="Outra forma">
                <Input
                  value={methodOther}
                  onChange={(event) => setMethodOther(event.target.value)}
                  maxLength={120}
                />
              </Field>
            )}
            {method !== "cash" && (
              <>
                <Field label="Conta de recebimento">
                  <Select value={accountChoice} onValueChange={setAccountChoice}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__other__">Outra conta</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {accountChoice === "__other__" && (
                  <Field label="Conta não cadastrada">
                    <Input
                      value={customAccount}
                      onChange={(event) => setCustomAccount(event.target.value)}
                      maxLength={160}
                      placeholder="Informe a conta"
                    />
                  </Field>
                )}
              </>
            )}
            <Field label="Observação complementar" className="sm:col-span-2">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={2000}
              />
            </Field>
            {isPartial && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2">
                {transfersToLast
                  ? `${formatCurrency(
                      remaining
                    )} serão acrescentados à última parcela pendente.`
                  : `Restarão ${formatCurrency(remaining)} nesta última parcela.`}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!valid}>
              Revisar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar pagamento?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>
                  Registrar {formatCurrency(amountCents)} em{" "}
                  {paidDateValue?.toLocaleDateString("pt-BR") ?? "data inválida"} por{" "}
                  {method === "other"
                    ? methodOther
                    : RECEIPT_METHOD_LABELS[method]}
                  {account ? ` na conta ${account}` : ""}?
                </p>
                {isPartial && (
                  <p>
                    {transfersToLast
                      ? `${formatCurrency(
                          remaining
                        )} serão transferidos para a última parcela pendente.`
                      : `A última parcela continuará pendente em ${formatCurrency(
                          remaining
                        )}.`}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Registrar pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
