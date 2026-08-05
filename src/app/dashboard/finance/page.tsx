"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  ArrowRight,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Scale,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import {
  EmptyState,
  FilterChip,
  HelpTip,
  PageHeader,
  SearchBox,
  Toolbar,
} from "@/components/shared/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  createMinimumWage,
  createReceivingAccount,
  setMinimumWageDeleted,
  setReceivingAccountDeleted,
  updateReceivingAccount,
} from "@/lib/db-actions";
import {
  buildAgreementLedger,
  dateInputToDate,
  dateToInput,
  FINANCIAL_PAYMENT_PLAN_LABELS,
  findMinimumWageAt,
  formatCurrency,
  parseCurrencyToCents,
  todayInput,
  type FinancialAgreementLedger,
  type FinancialInstallmentView,
} from "@/lib/finance";
import { dateMillis, formatDate, searchable, toDate } from "@/lib/normalize";
import type {
  Client,
  FinancialAgreement,
  FinancialInstallment,
  MinimumWage,
  ReceivingAccount,
  Update,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type FinanceFilter = "all" | "overdue" | "pending" | "settled";
type AgreementSituation = Exclude<FinanceFilter, "all">;

type FinanceRow = {
  agreement: FinancialAgreement;
  client?: Client;
  ledger: FinancialAgreementLedger;
  situation: AgreementSituation;
  nextInstallment?: FinancialInstallmentView;
  overdueInstallments: FinancialInstallmentView[];
};

type DeleteTarget =
  | { kind: "minimumWage"; item: MinimumWage }
  | { kind: "receivingAccount"; item: ReceivingAccount };

const FILTER_LABELS: Record<FinanceFilter, string> = {
  all: "Todos",
  overdue: "Atrasados",
  pending: "Pendentes",
  settled: "Quitados",
};

function localDayMillis(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function isInstallmentOverdue(
  view: FinancialInstallmentView,
  todayMillis: number
): boolean {
  const dueDate = toDate(view.installment.dueDate);
  return (
    !view.installment.settled &&
    view.amountDueCents > 0 &&
    !!dueDate &&
    localDayMillis(dueDate) < todayMillis
  );
}

function SummaryItem({
  label,
  value,
  detail,
  accent = "border-l-slate-300",
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
}) {
  return (
    <div className={cn("min-w-0 border-l-2 px-2.5 py-1", accent)}>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground" title={value}>
        {value}
      </p>
      {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function SituationBadge({ situation }: { situation: AgreementSituation }) {
  if (situation === "overdue") {
    return (
      <Badge
        variant="outline"
        className="border-red-200 bg-red-100 text-[11px] font-medium text-red-800"
      >
        Atrasado
      </Badge>
    );
  }
  if (situation === "settled") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-100 text-[11px] font-medium text-emerald-800"
      >
        Quitado
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-100 text-[11px] font-medium text-amber-800"
    >
      Pendente
    </Badge>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function FinancePage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: clients, error: clientsError } = useCollection<Client>("clients");
  const { data: agreements, error: agreementsError } =
    useCollection<FinancialAgreement>(
      "financialAgreements",
      isAdmin ? undefined : { where: [["deleted", "==", false]] },
      [isAdmin]
    );
  const { data: installments, error: installmentsError } =
    useCollection<FinancialInstallment>(
      "financialInstallments",
      isAdmin ? undefined : { where: [["deleted", "==", false]] },
      [isAdmin]
    );
  const { data: payments, error: paymentsError } = useCollection<Update>(
    "updates",
    {
      where: isAdmin
        ? [["type", "==", "Financeiro"]]
        : [
            ["type", "==", "Financeiro"],
            ["deleted", "==", false],
          ],
    },
    [isAdmin]
  );
  const { data: minimumWages, error: minimumWagesError } =
    useCollection<MinimumWage>(
      "minimumWages",
      isAdmin ? undefined : { where: [["deleted", "==", false]] },
      [isAdmin]
    );
  const { data: receivingAccounts, error: receivingAccountsError } =
    useCollection<ReceivingAccount>(
      "receivingAccounts",
      isAdmin ? undefined : { where: [["deleted", "==", false]] },
      [isAdmin]
    );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FinanceFilter>("all");
  const [minimumWagesOpen, setMinimumWagesOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [showDeletedWages, setShowDeletedWages] = useState(false);
  const [showDeletedAccounts, setShowDeletedAccounts] = useState(false);

  const [wageAmount, setWageAmount] = useState("");
  const [wageEffectiveFrom, setWageEffectiveFrom] = useState(() => todayInput());
  const [wageNote, setWageNote] = useState("");
  const [savingWage, setSavingWage] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [accountNote, setAccountNote] = useState("");
  const [editingAccount, setEditingAccount] = useState<ReceivingAccount | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const referenceDate = useMemo(() => new Date(), []);
  const todayMillis = localDayMillis(referenceDate);
  const thirtyDaysMillis = todayMillis + 30 * 86_400_000;

  const financeRows = useMemo<FinanceRow[]>(() => {
    const clientById = new Map((clients ?? []).map((client) => [client.id, client]));

    return (agreements ?? [])
      .filter((agreement) => {
        const client = clientById.get(agreement.clientId);
        return !agreement.deleted && !!client && !client.deleted;
      })
      .map((agreement) => {
        const ledger = buildAgreementLedger(
          agreement,
          installments ?? [],
          payments ?? [],
          minimumWages ?? [],
          referenceDate
        );
        const openInstallments = ledger.installments.filter(
          (view) => !view.installment.settled && view.amountDueCents > 0
        );
        const overdueInstallments = openInstallments
          .filter((view) => isInstallmentOverdue(view, todayMillis))
          .sort(
            (left, right) =>
              dateMillis(left.installment.dueDate) -
              dateMillis(right.installment.dueDate)
          );
        const nextInstallment =
          overdueInstallments[0] ??
          openInstallments
            .slice()
            .sort((left, right) => {
              const leftDate = dateMillis(left.installment.dueDate) || Number.MAX_SAFE_INTEGER;
              const rightDate =
                dateMillis(right.installment.dueDate) || Number.MAX_SAFE_INTEGER;
              return leftDate - rightDate || left.installment.sequence - right.installment.sequence;
            })[0];
        const settled = agreement.settled || ledger.pendingCents === 0;
        const situation: AgreementSituation = settled
          ? "settled"
          : overdueInstallments.length > 0
            ? "overdue"
            : "pending";

        return {
          agreement,
          client: clientById.get(agreement.clientId),
          ledger,
          situation,
          nextInstallment,
          overdueInstallments,
        };
      });
  }, [
    agreements,
    clients,
    installments,
    minimumWages,
    payments,
    referenceDate,
    todayMillis,
  ]);

  const counts = useMemo(
    () => ({
      all: financeRows.length,
      overdue: financeRows.filter((row) => row.situation === "overdue").length,
      pending: financeRows.filter((row) => row.situation === "pending").length,
      settled: financeRows.filter((row) => row.situation === "settled").length,
    }),
    [financeRows]
  );

  const summary = useMemo(() => {
    const openInstallments = financeRows.flatMap((row) =>
      row.ledger.installments.filter(
        (view) => !view.installment.settled && view.amountDueCents > 0
      )
    );
    const overdue = openInstallments.filter((view) =>
      isInstallmentOverdue(view, todayMillis)
    );
    const upcoming = openInstallments.filter((view) => {
      const dueDate = toDate(view.installment.dueDate);
      if (!dueDate) return false;
      const dueMillis = localDayMillis(dueDate);
      return dueMillis >= todayMillis && dueMillis <= thirtyDaysMillis;
    });

    return {
      agreements: financeRows.length,
      receivedCents: financeRows.reduce(
        (total, row) => total + row.ledger.receivedCents,
        0
      ),
      pendingCents: financeRows.reduce(
        (total, row) => total + row.ledger.pendingCents,
        0
      ),
      overdueCount: overdue.length,
      overdueCents: overdue.reduce((total, view) => total + view.amountDueCents, 0),
      upcomingCount: upcoming.length,
      upcomingCents: upcoming.reduce((total, view) => total + view.amountDueCents, 0),
    };
  }, [financeRows, thirtyDaysMillis, todayMillis]);

  const visibleRows = useMemo(() => {
    const normalizedSearch = searchable(search.trim());
    return financeRows
      .filter((row) => filter === "all" || row.situation === filter)
      .filter((row) => {
        if (!normalizedSearch) return true;
        return (
          searchable(row.client?.name).includes(normalizedSearch) ||
          searchable(row.client?.code).includes(normalizedSearch) ||
          searchable(row.agreement.description).includes(normalizedSearch) ||
          searchable(row.agreement.customPaymentTerms).includes(normalizedSearch)
        );
      })
      .sort((left, right) => {
        const situationOrder: Record<AgreementSituation, number> = {
          overdue: 0,
          pending: 1,
          settled: 2,
        };
        const bySituation =
          situationOrder[left.situation] - situationOrder[right.situation];
        if (bySituation) return bySituation;
        const leftDue =
          dateMillis(left.nextInstallment?.installment.dueDate) || Number.MAX_SAFE_INTEGER;
        const rightDue =
          dateMillis(right.nextInstallment?.installment.dueDate) || Number.MAX_SAFE_INTEGER;
        return (
          leftDue - rightDue ||
          (left.client?.name ?? "").localeCompare(right.client?.name ?? "", "pt-BR")
        );
      });
  }, [filter, financeRows, search]);

  const visibleWages = useMemo(
    () =>
      (minimumWages ?? [])
        .filter((rate) => (showDeletedWages ? rate.deleted : !rate.deleted))
        .sort((left, right) => dateMillis(right.effectiveFrom) - dateMillis(left.effectiveFrom)),
    [minimumWages, showDeletedWages]
  );
  const visibleAccounts = useMemo(
    () =>
      (receivingAccounts ?? [])
        .filter((account) => (showDeletedAccounts ? account.deleted : !account.deleted))
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [receivingAccounts, showDeletedAccounts]
  );
  const deletedWagesCount = (minimumWages ?? []).filter((rate) => rate.deleted).length;
  const deletedAccountsCount = (receivingAccounts ?? []).filter(
    (account) => account.deleted
  ).length;
  const currentMinimumWage = findMinimumWageAt(minimumWages ?? [], referenceDate);

  const saveMinimumWage = async () => {
    if (!user) return;
    const amountCents = parseCurrencyToCents(wageAmount);
    const effectiveFrom = dateInputToDate(wageEffectiveFrom);
    if (!amountCents || !effectiveFrom) {
      toast({
        variant: "destructive",
        title: "Preencha valor e início da vigência",
      });
      return;
    }
    const duplicateDate = (minimumWages ?? []).some(
      (rate) => !rate.deleted && dateToInput(rate.effectiveFrom) === wageEffectiveFrom
    );
    if (duplicateDate) {
      toast({
        variant: "destructive",
        title: "Já existe um salário nesta data",
        description: "Exclua o lançamento incorreto antes de cadastrar o valor substituto.",
      });
      return;
    }

    setSavingWage(true);
    try {
      await createMinimumWage(
        { amountCents, effectiveFrom, note: wageNote },
        user
      );
      setWageAmount("");
      setWageNote("");
      toast({ title: "Salário mínimo cadastrado" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao cadastrar salário mínimo",
        description: errorMessage(error, "Não foi possível salvar o valor."),
      });
    } finally {
      setSavingWage(false);
    }
  };

  const resetAccountForm = () => {
    setEditingAccount(null);
    setAccountName("");
    setAccountNote("");
  };

  const startEditingAccount = (account: ReceivingAccount) => {
    setEditingAccount(account);
    setAccountName(account.name);
    setAccountNote(account.note ?? "");
    setShowDeletedAccounts(false);
  };

  const handleAccountsOpenChange = (open: boolean) => {
    setAccountsOpen(open);
    if (!open) resetAccountForm();
  };

  const saveReceivingAccount = async () => {
    if (!user) return;
    const name = accountName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Informe o nome da conta" });
      return;
    }
    const duplicateName = (receivingAccounts ?? []).some(
      (account) =>
        !account.deleted &&
        account.id !== editingAccount?.id &&
        searchable(account.name) === searchable(name)
    );
    if (duplicateName) {
      toast({
        variant: "destructive",
        title: "Esta conta já está cadastrada",
      });
      return;
    }

    setSavingAccount(true);
    try {
      if (editingAccount) {
        await updateReceivingAccount(
          editingAccount,
          { name, note: accountNote },
          user
        );
        toast({ title: "Conta de recebimento atualizada" });
      } else {
        await createReceivingAccount({ name, note: accountNote }, user);
        toast({ title: "Conta de recebimento cadastrada" });
      }
      resetAccountForm();
      setShowDeletedAccounts(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: editingAccount ? "Erro ao atualizar conta" : "Erro ao cadastrar conta",
        description: errorMessage(error, "Não foi possível salvar a conta."),
      });
    } finally {
      setSavingAccount(false);
    }
  };

  const confirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "minimumWage") {
        await setMinimumWageDeleted(deleteTarget.item, true, user);
        toast({ title: "Salário mínimo excluído" });
      } else {
        await setReceivingAccountDeleted(deleteTarget.item, true, user);
        toast({ title: "Conta de recebimento excluída" });
      }
      if (
        deleteTarget.kind === "receivingAccount" &&
        editingAccount?.id === deleteTarget.item.id
      ) {
        resetAccountForm();
      }
      setDeleteTarget(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: errorMessage(error, "Não foi possível concluir a exclusão."),
      });
    } finally {
      setDeleting(false);
    }
  };

  const restoreMinimumWage = async (rate: MinimumWage) => {
    if (!user) return;
    setRestoringId(rate.id);
    try {
      await setMinimumWageDeleted(rate, false, user);
      setShowDeletedWages(false);
      toast({ title: "Salário mínimo restaurado" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao restaurar salário mínimo",
        description: errorMessage(error, "Não foi possível restaurar o valor."),
      });
    } finally {
      setRestoringId(null);
    }
  };

  const restoreReceivingAccount = async (account: ReceivingAccount) => {
    if (!user) return;
    setRestoringId(account.id);
    try {
      await setReceivingAccountDeleted(account, false, user);
      setShowDeletedAccounts(false);
      toast({ title: "Conta de recebimento restaurada" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao restaurar conta",
        description: errorMessage(error, "Não foi possível restaurar a conta."),
      });
    } finally {
      setRestoringId(null);
    }
  };

  const loading = [
    clients,
    agreements,
    installments,
    payments,
    minimumWages,
    receivingAccounts,
  ].some((value) => value === null);
  const loadingError =
    clientsError ??
    agreementsError ??
    installmentsError ??
    paymentsError ??
    minimumWagesError ??
    receivingAccountsError;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="page-shell">
        <PageHeader
          eyebrow="recebimentos"
          title="Financeiro"
          description="Acompanhe valores devidos, recebimentos e vencimentos dos clientes."
        />
        <EmptyState
          title="Não foi possível carregar o financeiro"
          description="Confira sua conexão e tente abrir esta página novamente."
          icon={WalletCards}
        />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="recebimentos"
        title="Financeiro"
        description="Acompanhe saldos, parcelas atrasadas e os próximos vencimentos. Abra a ficha para cadastrar valores devidos ou registrar recebimentos."
      >
        {isAdmin && (
          <>
            <HelpTip label="Cadastra os valores e as vigências usadas nos acordos baseados em salário mínimo.">
              <Button variant="outline" size="sm" onClick={() => setMinimumWagesOpen(true)}>
                <Scale className="mr-1.5 size-3.5" />
                Salários mínimos
              </Button>
            </HelpTip>
            <HelpTip label="Mantém a lista de contas que pode ser selecionada ao registrar um recebimento.">
              <Button variant="outline" size="sm" onClick={() => setAccountsOpen(true)}>
                <Landmark className="mr-1.5 size-3.5" />
                Contas de recebimento
              </Button>
            </HelpTip>
          </>
        )}
      </PageHeader>

      <section
        className="surface grid grid-cols-2 gap-y-2 p-2 sm:grid-cols-3 xl:grid-cols-5"
        aria-label="Resumo financeiro"
      >
        <SummaryItem
          label="Acordos"
          value={String(summary.agreements)}
          detail={`${counts.pending + counts.overdue} em aberto`}
          accent="border-l-slate-300"
        />
        <SummaryItem
          label="Total recebido"
          value={formatCurrency(summary.receivedCents)}
          accent="border-l-emerald-300"
        />
        <SummaryItem
          label="Saldo pendente"
          value={formatCurrency(summary.pendingCents)}
          accent="border-l-amber-300"
        />
        <SummaryItem
          label="Parcelas atrasadas"
          value={formatCurrency(summary.overdueCents)}
          detail={`${summary.overdueCount} parcela(s)`}
          accent="border-l-red-300"
        />
        <SummaryItem
          label="Próximos 30 dias"
          value={formatCurrency(summary.upcomingCents)}
          detail={`${summary.upcomingCount} parcela(s)`}
          accent="border-l-sky-300"
        />
      </section>

      <Toolbar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Buscar por cliente ou código..."
        />
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FILTER_LABELS) as FinanceFilter[]).map((item) => (
            <FilterChip key={item} active={filter === item} onClick={() => setFilter(item)}>
              {FILTER_LABELS[item]} {counts[item]}
            </FilterChip>
          ))}
        </div>
      </Toolbar>

      <div className="work-table">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="ledger-header">
              <TableHead className="w-[31%]">Cliente</TableHead>
              <TableHead className="hidden w-[24%] md:table-cell">Plano / parcela</TableHead>
              <TableHead className="w-[27%] md:w-[21%]">Vencimento</TableHead>
              <TableHead className="w-[32%] text-right md:w-[19%]">
                Recebido / saldo
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const nextInstallment = row.nextInstallment;
              const hasPartialReceipt =
                !!nextInstallment && nextInstallment.receivedCents > 0;
              const dueLabel = nextInstallment?.installment.dueDate
                ? formatDate(nextInstallment.installment.dueDate)
                : row.agreement.paymentPlan === "at_end"
                  ? "Fim do processo"
                  : row.situation === "settled"
                    ? "Concluído"
                    : "Sem vencimento";
              const planLabel =
                FINANCIAL_PAYMENT_PLAN_LABELS[row.agreement.paymentPlan];
              const installmentLabel = nextInstallment
                ? `Parcela ${nextInstallment.installment.sequence}/${nextInstallment.installment.installmentCount}`
                : `${row.agreement.installmentCount} parcela(s)`;

              return (
                <TableRow key={row.agreement.id}>
                  <TableCell className="truncate py-2 text-[13px]">
                    {row.client ? (
                      <Link
                        href={`/dashboard/clients/${row.client.id}?tab=financial`}
                        className="block truncate text-primary underline-offset-2 hover:underline"
                        title={`${row.client.name} — abrir financeiro do cliente`}
                      >
                        {row.client.name}
                      </Link>
                    ) : (
                      <span className="block truncate text-muted-foreground">
                        Cliente não localizado
                      </span>
                    )}
                    <span className="block truncate font-code text-[11px] text-muted-foreground">
                      {row.client?.code || row.agreement.description || "Sem código"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden truncate py-2 text-[12px] md:table-cell">
                    <span className="block truncate" title={planLabel}>
                      {planLabel}
                    </span>
                    <span
                      className="block truncate text-[11px] text-muted-foreground"
                      title={row.agreement.customPaymentTerms || installmentLabel}
                    >
                      {row.agreement.customPaymentTerms || installmentLabel}
                    </span>
                  </TableCell>
                  <TableCell className="truncate py-2 text-[12px]">
                    <span className="mb-0.5 block truncate">{dueLabel}</span>
                    <div className="flex min-w-0 items-center gap-1">
                      <SituationBadge situation={row.situation} />
                      {hasPartialReceipt && row.situation !== "settled" && (
                        <span className="hidden truncate text-[10px] text-muted-foreground lg:inline">
                          parcial
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right text-[11px]">
                    <span className="block truncate">
                      <span className="text-muted-foreground">Recebido </span>
                      <span className="font-medium">{formatCurrency(row.ledger.receivedCents)}</span>
                    </span>
                    <span className="block truncate">
                      <span className="text-muted-foreground">Saldo </span>
                      <span
                        className={cn(
                          "font-medium",
                          row.situation === "overdue" && "text-red-700"
                        )}
                      >
                        {formatCurrency(row.ledger.pendingCents)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    {row.client && (
                      <HelpTip
                        label="Abre a aba Financeiro da ficha para ver parcelas e registrar recebimentos."
                        side="left"
                      >
                        <Button asChild variant="ghost" size="icon" className="size-7">
                          <Link
                            href={`/dashboard/clients/${row.client.id}?tab=financial`}
                            aria-label={`Abrir financeiro de ${row.client.name}`}
                          >
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                      </HelpTip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center">
                  <EmptyState
                    title={financeRows.length ? "Nenhum acordo encontrado" : "Nenhum valor devido cadastrado"}
                    description={
                      financeRows.length
                        ? "Ajuste a busca ou escolha outro filtro."
                        : "Abra a ficha de um cliente e use a aba Financeiro para cadastrar o primeiro valor devido."
                    }
                    icon={WalletCards}
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {isAdmin && (
        <>
          <Dialog open={minimumWagesOpen} onOpenChange={setMinimumWagesOpen}>
            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Salários mínimos</DialogTitle>
                <DialogDescription>
                  Cadastre o valor e a data em que começa a vigorar. Datas futuras ficam
                  programadas para os cálculos seguintes.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2 rounded-md border bg-muted/20 p-2.5 sm:grid-cols-[1fr_150px_auto]">
                <div className="space-y-1">
                  <Label htmlFor="minimum-wage-amount" className="text-xs">
                    Valor
                  </Label>
                  <Input
                    id="minimum-wage-amount"
                    value={wageAmount}
                    onChange={(event) => setWageAmount(event.target.value)}
                    placeholder="1.621,00"
                    inputMode="decimal"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="minimum-wage-date" className="text-xs">
                    Início da vigência
                  </Label>
                  <Input
                    id="minimum-wage-date"
                    type="date"
                    value={wageEffectiveFrom}
                    onChange={(event) => setWageEffectiveFrom(event.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="flex items-end">
                  <HelpTip label="Cadastra este valor no histórico sem alterar lançamentos anteriores.">
                    <Button
                      size="sm"
                      onClick={saveMinimumWage}
                      disabled={savingWage || !wageAmount.trim() || !wageEffectiveFrom}
                    >
                      {savingWage ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1.5 size-3.5" />
                      )}
                      Cadastrar
                    </Button>
                  </HelpTip>
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="minimum-wage-note" className="text-xs">
                    Observação
                  </Label>
                  <Input
                    id="minimum-wage-note"
                    value={wageNote}
                    onChange={(event) => setWageNote(event.target.value)}
                    placeholder="Opcional"
                    className="h-8"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {showDeletedWages ? "Valores excluídos" : "Histórico ativo"}
                </p>
                {(showDeletedWages || deletedWagesCount > 0) && (
                  <FilterChip
                    active={showDeletedWages}
                    onClick={() => setShowDeletedWages((current) => !current)}
                  >
                    <Trash2 className="size-3" />
                    {showDeletedWages
                      ? "Ver ativos"
                      : `Ver excluídos (${deletedWagesCount})`}
                  </FilterChip>
                )}
              </div>

              <div className="rounded-md border">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="ledger-header">
                      <TableHead className="w-32">Vigência</TableHead>
                      <TableHead className="w-32">Valor</TableHead>
                      <TableHead className="hidden sm:table-cell">Observação</TableHead>
                      <TableHead className="w-24">Situação</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleWages.map((rate) => {
                      const effectiveMillis = dateMillis(rate.effectiveFrom);
                      const status = rate.deleted
                        ? "Excluído"
                        : currentMinimumWage?.id === rate.id
                          ? "Vigente"
                          : effectiveMillis > referenceDate.getTime()
                            ? "Programado"
                            : "Histórico";
                      return (
                        <TableRow key={rate.id}>
                          <TableCell className="py-2 text-xs">
                            {formatDate(rate.effectiveFrom)}
                          </TableCell>
                          <TableCell className="py-2 text-xs font-medium">
                            {formatCurrency(rate.amountCents)}
                          </TableCell>
                          <TableCell
                            className="hidden truncate py-2 text-xs text-muted-foreground sm:table-cell"
                            title={rate.note || ""}
                          >
                            {rate.note || "—"}
                          </TableCell>
                          <TableCell className="py-2 text-xs">{status}</TableCell>
                          <TableCell className="py-2 text-right">
                            {rate.deleted ? (
                              <HelpTip label="Restaura este valor no histórico de salários mínimos." side="left">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => restoreMinimumWage(rate)}
                                  disabled={restoringId === rate.id}
                                >
                                  {restoringId === rate.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <ArchiveRestore className="size-3.5" />
                                  )}
                                </Button>
                              </HelpTip>
                            ) : (
                              <HelpTip label="Exclui este valor do histórico financeiro." side="left">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive"
                                  onClick={() =>
                                    setDeleteTarget({ kind: "minimumWage", item: rate })
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </HelpTip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {visibleWages.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-xs text-muted-foreground">
                          {showDeletedWages
                            ? "Nenhum salário mínimo excluído."
                            : "Nenhum salário mínimo cadastrado."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={accountsOpen} onOpenChange={handleAccountsOpenChange}>
            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Contas de recebimento</DialogTitle>
                <DialogDescription>
                  Mantenha as contas que aparecem como opções ao registrar Pix,
                  depósito, transferência ou pagamento na maquininha.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2 rounded-md border bg-muted/20 p-2.5 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <Label htmlFor="receiving-account-name" className="text-xs">
                    Nome da conta
                  </Label>
                  <Input
                    id="receiving-account-name"
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                    placeholder="Ex.: Banco do Brasil — escritório"
                    className="h-8"
                    maxLength={200}
                  />
                </div>
                <div className="flex items-end gap-1">
                  {editingAccount && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetAccountForm}
                      disabled={savingAccount}
                      title="Cancelar edição da conta"
                    >
                      <X className="mr-1.5 size-3.5" />
                      Cancelar
                    </Button>
                  )}
                  <HelpTip
                    label={
                      editingAccount
                        ? "Salva as alterações desta conta."
                        : "Adiciona esta conta à lista disponível nos recebimentos."
                    }
                  >
                    <Button
                      size="sm"
                      onClick={saveReceivingAccount}
                      disabled={savingAccount || !accountName.trim()}
                    >
                      {savingAccount ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : editingAccount ? (
                        <Pencil className="mr-1.5 size-3.5" />
                      ) : (
                        <Plus className="mr-1.5 size-3.5" />
                      )}
                      {editingAccount ? "Salvar" : "Cadastrar"}
                    </Button>
                  </HelpTip>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="receiving-account-note" className="text-xs">
                    Observação
                  </Label>
                  <Textarea
                    id="receiving-account-note"
                    value={accountNote}
                    onChange={(event) => setAccountNote(event.target.value)}
                    placeholder="Opcional"
                    rows={2}
                    className="min-h-16 resize-none"
                    maxLength={2000}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {showDeletedAccounts ? "Contas excluídas" : "Contas ativas"}
                </p>
                {(showDeletedAccounts || deletedAccountsCount > 0) && (
                  <FilterChip
                    active={showDeletedAccounts}
                    onClick={() => {
                      const next = !showDeletedAccounts;
                      setShowDeletedAccounts(next);
                      if (next) resetAccountForm();
                    }}
                  >
                    <Trash2 className="size-3" />
                    {showDeletedAccounts
                      ? "Ver ativas"
                      : `Ver excluídas (${deletedAccountsCount})`}
                  </FilterChip>
                )}
              </div>

              <div className="rounded-md border">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="ledger-header">
                      <TableHead className="w-[42%]">Conta</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="truncate py-2 text-xs" title={account.name}>
                          {account.name}
                        </TableCell>
                        <TableCell
                          className="truncate py-2 text-xs text-muted-foreground"
                          title={account.note || ""}
                        >
                          {account.note || "—"}
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          {account.deleted ? (
                            <HelpTip label="Restaura esta conta para a lista de recebimentos." side="left">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => restoreReceivingAccount(account)}
                                disabled={restoringId === account.id}
                              >
                                {restoringId === account.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <ArchiveRestore className="size-3.5" />
                                )}
                              </Button>
                            </HelpTip>
                          ) : (
                            <div className="flex justify-end gap-0.5">
                              <HelpTip label="Edita o nome e a observação desta conta." side="left">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => startEditingAccount(account)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              </HelpTip>
                              <HelpTip label="Exclui esta conta da lista de recebimentos." side="left">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive"
                                  onClick={() =>
                                    setDeleteTarget({ kind: "receivingAccount", item: account })
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </HelpTip>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {visibleAccounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="h-20 text-center text-xs text-muted-foreground">
                          {showDeletedAccounts
                            ? "Nenhuma conta de recebimento excluída."
                            : "Nenhuma conta de recebimento cadastrada."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={
          deleteTarget?.kind === "minimumWage"
            ? "Excluir salário mínimo?"
            : "Excluir conta de recebimento?"
        }
        description={
          deleteTarget?.kind === "minimumWage"
            ? "Deseja excluir este salário mínimo?"
            : "Deseja excluir esta conta de recebimento?"
        }
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}
