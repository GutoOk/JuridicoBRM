import type {
  Dateish,
  FinancialAgreement,
  FinancialInstallment,
  FinancialPaymentPlan,
  FinancialValueBasis,
  MinimumWage,
  ReceiptMethod,
  Update,
} from "./types";
import { dateMillis, toDate } from "./normalize";

export const FINANCIAL_VALUE_BASIS_LABELS: Record<FinancialValueBasis, string> = {
  half_minimum_wage: "Meio salário mínimo",
  minimum_wage: "Um salário mínimo",
  one_and_half_minimum_wage: "Um salário mínimo e meio",
  custom: "Valor personalizado",
};

export const FINANCIAL_PAYMENT_PLAN_LABELS: Record<FinancialPaymentPlan, string> = {
  upfront: "No ato",
  installments: "Parcelado",
  at_end: "No fim do processo",
  custom: "Outra forma",
};

export const RECEIPT_METHOD_LABELS: Record<ReceiptMethod, string> = {
  cash: "Espécie",
  pix: "Pix",
  bank_deposit: "Depósito/transferência",
  card_machine: "Maquininha",
  other: "Outro",
};

export function minimumWageMultiplier(
  basis: FinancialValueBasis
): 0.5 | 1 | 1.5 | undefined {
  if (basis === "half_minimum_wage") return 0.5;
  if (basis === "minimum_wage") return 1;
  if (basis === "one_and_half_minimum_wage") return 1.5;
  return undefined;
}

export function formatCurrency(cents: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents ?? 0) / 100);
}

export function parseCurrencyToCents(value: string): number | null {
  const raw = value.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Converte uma data civil em horário local ao meio-dia, evitando troca de dia por UTC. */
export function dateInputToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const result = new Date(year, month, day, 12, 0, 0, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month ||
    result.getDate() !== day
  ) {
    return null;
  }
  return result;
}

export function dateToInput(value: Dateish): string {
  const date = toDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayInput(): string {
  return dateToInput(new Date());
}

export function addMonthsToDateInput(value: string, months: number): string {
  const date = dateInputToDate(value);
  if (!date) return "";
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return dateToInput(date);
}

export function splitAmountIntoInstallments(totalCents: number, count: number): number[] {
  const safeCount = Math.max(1, Math.min(60, Math.trunc(count)));
  const base = Math.floor(totalCents / safeCount);
  const amounts = Array.from({ length: safeCount }, () => base);
  amounts[safeCount - 1] += totalCents - base * safeCount;
  return amounts;
}

export function findMinimumWageAt(
  rates: MinimumWage[],
  reference: Date
): MinimumWage | undefined {
  const referenceMillis = reference.getTime();
  return rates
    .filter(
      (rate) =>
        !rate.deleted &&
        Number.isInteger(rate.amountCents) &&
        rate.amountCents > 0 &&
        dateMillis(rate.effectiveFrom) <= referenceMillis
    )
    .sort((a, b) => dateMillis(b.effectiveFrom) - dateMillis(a.effectiveFrom))[0];
}

export function agreementTargetAt(
  agreement: FinancialAgreement,
  rates: MinimumWage[],
  reference: Date
): {
  amountCents: number;
  minimumWage?: MinimumWage;
} {
  if (agreement.settled && agreement.settledTargetCents != null) {
    return { amountCents: agreement.settledTargetCents };
  }
  const multiplier = agreement.minimumWageMultiplier;
  if (!multiplier || agreement.correctionPolicy === "none") {
    return { amountCents: agreement.originalAmountCents };
  }
  const rate = findMinimumWageAt(rates, reference);
  if (!rate) return { amountCents: agreement.originalAmountCents };
  return {
    amountCents: Math.max(
      agreement.originalAmountCents,
      Math.round(rate.amountCents * multiplier)
    ),
    minimumWage: rate,
  };
}

export type FinancialInstallmentStatus =
  | "pending"
  | "overdue"
  | "partial"
  | "partial_overdue"
  | "paid"
  | "paid_late"
  | "paid_partial_rolled";

export type FinancialInstallmentView = {
  installment: FinancialInstallment;
  payments: Update[];
  receivedCents: number;
  expectedCents: number;
  amountDueCents: number;
  rolledForwardCents: number;
  status: FinancialInstallmentStatus;
  isCorrectionTarget: boolean;
  canReceivePayment: boolean;
};

export type FinancialAgreementLedger = {
  agreement: FinancialAgreement;
  targetCents: number;
  receivedCents: number;
  pendingCents: number;
  correctionCents: number;
  minimumWage?: MinimumWage;
  installments: FinancialInstallmentView[];
};

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Distribui o saldo global entre as parcelas ainda abertas.
 *
 * As parcelas anteriores conservam o valor-base sempre que houver saldo
 * suficiente. Diferenças para menos ou para mais são absorvidas a partir da
 * última parcela aberta, sem deixar uma parcela aberta com valor negativo.
 */
export function allocateOpenInstallmentAmounts(
  installments: FinancialInstallment[],
  pendingCents: number
): Map<string, number> {
  const openInstallments = installments
    .filter((installment) => !installment.deleted && !installment.settled)
    .sort((left, right) => left.sequence - right.sequence);
  const allocation = new Map<string, number>();
  let remainingCents = Math.max(0, pendingCents);

  openInstallments.forEach((installment, index) => {
    const remainingInstallments = openInstallments.length - index - 1;
    const amountCents =
      remainingInstallments === 0
        ? remainingCents
        : Math.min(
            installment.baseAmountCents,
            Math.max(0, remainingCents - remainingInstallments)
          );
    allocation.set(installment.id, amountCents);
    remainingCents -= amountCents;
  });

  return allocation;
}

export function buildAgreementLedger(
  agreement: FinancialAgreement,
  installments: FinancialInstallment[],
  payments: Update[],
  rates: MinimumWage[],
  reference = new Date()
): FinancialAgreementLedger {
  const activeInstallments = installments
    .filter((installment) => installment.agreementId === agreement.id && !installment.deleted)
    .sort((a, b) => a.sequence - b.sequence);
  const activePayments = payments.filter(
    (payment) =>
      payment.type === "Financeiro" &&
      payment.financialAgreementId === agreement.id &&
      !payment.deleted
  );
  const receivedCents = activePayments.reduce(
    (sum, payment) => sum + Math.max(0, payment.amountCents ?? 0),
    0
  );
  const target = agreementTargetAt(agreement, rates, reference);
  const pendingCents = agreement.settled
    ? 0
    : Math.max(0, target.amountCents - receivedCents);
  const openInstallments = activeInstallments.filter((installment) => !installment.settled);
  const openAmounts = allocateOpenInstallmentAmounts(
    activeInstallments,
    pendingCents
  );
  const correctionTarget = openInstallments.at(-1);
  const today = startOfLocalDay(reference);

  const installmentViews = activeInstallments.map((installment) => {
    const installmentPayments = activePayments
      .filter((payment) => payment.financialInstallmentId === installment.id)
      .sort((a, b) => dateMillis(a.paidAt ?? a.createdAt) - dateMillis(b.paidAt ?? b.createdAt));
    const installmentReceived = installmentPayments.reduce(
      (sum, payment) => sum + Math.max(0, payment.amountCents ?? 0),
      0
    );
    const closingPayment = installmentPayments.find(
      (payment) => payment.id === installment.settledByPaymentId
    );
    const isCorrectionTarget = installment.id === correctionTarget?.id;
    const amountDueCents = installment.settled
      ? 0
      : openAmounts.get(installment.id) ?? 0;
    const expectedCents = installment.settled
      ? installment.baseAmountCents
      : installmentReceived + amountDueCents;
    const rolledForwardCents =
      installment.settled && installment.settlementKind === "partial_rolled"
        ? Math.max(
            0,
            (closingPayment?.requiredInstallmentAmountCents ??
              installment.baseAmountCents) -
              (closingPayment?.amountCents ?? 0)
          )
        : 0;

    let status: FinancialInstallmentStatus;
    if (installment.settled) {
      const due = toDate(installment.dueDate);
      const paid = toDate(closingPayment?.paidAt);
      status =
        rolledForwardCents > 0
          ? "paid_partial_rolled"
          : due && paid && startOfLocalDay(paid) > startOfLocalDay(due)
            ? "paid_late"
            : "paid";
    } else if (installmentReceived > 0) {
      const due = toDate(installment.dueDate);
      status =
        due && startOfLocalDay(due) < today ? "partial_overdue" : "partial";
    } else {
      const due = toDate(installment.dueDate);
      status = due && startOfLocalDay(due) < today ? "overdue" : "pending";
    }

    return {
      installment,
      payments: installmentPayments,
      receivedCents: installmentReceived,
      expectedCents,
      amountDueCents,
      rolledForwardCents,
      status,
      isCorrectionTarget,
      canReceivePayment: !installment.settled && amountDueCents > 0,
    };
  });

  return {
    agreement,
    targetCents: target.amountCents,
    receivedCents,
    pendingCents,
    correctionCents: Math.max(0, target.amountCents - agreement.originalAmountCents),
    minimumWage: target.minimumWage,
    installments: installmentViews,
  };
}
