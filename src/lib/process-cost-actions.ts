"use client";

import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { dateInputToDate } from "./finance";
import type { Process, ProcessCost, ProcessCostKind, UserProfile } from "./types";

/**
 * Custas e despesas do processo.
 *
 * Mora em coleção própria (`processCosts`) e não no módulo financeiro: aqui é dinheiro
 * que o escritório desembolsou pelo processo — guia recolhida, cópia, diligência —,
 * enquanto `financialAgreements` trata do que o cliente deve ao escritório. Misturar
 * os dois faria o relatório de recebimentos incluir gasto.
 */

export const PROCESS_COST_KINDS: readonly ProcessCostKind[] = [
  "Custas",
  "Despesa",
  "Honorários",
  "Outro",
];

export const PROCESS_COST_MAX_CENTS = 100_000_000_00;

export type ProcessCostInput = {
  kind: ProcessCostKind;
  description: string;
  amountCents: number;
  /** Data civil digitada no formato brasileiro (dd/mm/aaaa). */
  costDate: string;
  paidBy: string;
  reimbursed: boolean;
  notes: string;
};

function assertInput(input: ProcessCostInput): Date {
  if (!input.description.trim()) throw new Error("Informe a descrição do lançamento.");
  if (input.description.trim().length > 300) throw new Error("A descrição deve ter no máximo 300 caracteres.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Informe um valor maior que zero.");
  }
  if (input.amountCents > PROCESS_COST_MAX_CENTS) throw new Error("Valor acima do limite permitido.");
  const costDate = dateInputToDate(input.costDate);
  if (!costDate) throw new Error("Informe a data do lançamento.");
  return costDate;
}

export async function createProcessCost(
  process: Process,
  input: ProcessCostInput,
  user: UserProfile
): Promise<string> {
  const costDate = assertInput(input);
  const reference = await addDoc(collection(db, "processCosts"), {
    processId: process.id,
    processNumber: process.processNumber,
    kind: input.kind,
    description: input.description.trim(),
    amountCents: input.amountCents,
    costDate,
    paidBy: input.paidBy.trim(),
    reimbursed: input.reimbursed,
    notes: input.notes.trim(),
    createdAt: serverTimestamp(),
    createdById: user.id,
    createdBy: user.name,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
    deleted: false,
    deletedAt: null,
    deletedById: null,
    deletedBy: null,
  });
  return reference.id;
}

export async function updateProcessCost(
  cost: ProcessCost,
  input: ProcessCostInput,
  user: UserProfile
): Promise<void> {
  const costDate = assertInput(input);
  await updateDoc(doc(db, "processCosts", cost.id), {
    kind: input.kind,
    description: input.description.trim(),
    amountCents: input.amountCents,
    costDate,
    paidBy: input.paidBy.trim(),
    reimbursed: input.reimbursed,
    notes: input.notes.trim(),
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

/** Exclusão lógica, como todo o resto do sistema. */
export async function setProcessCostDeleted(
  cost: ProcessCost,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "processCosts", cost.id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedById: deleted ? user.id : null,
    deletedBy: deleted ? user.name : null,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

/** Total desembolsado e o que ainda não foi reembolsado. */
export function processCostTotals(costs: ProcessCost[]): {
  totalCents: number;
  pendingCents: number;
} {
  return costs.reduce(
    (accumulator, cost) => ({
      totalCents: accumulator.totalCents + cost.amountCents,
      pendingCents: accumulator.pendingCents + (cost.reimbursed ? 0 : cost.amountCents),
    }),
    { totalCents: 0, pendingCents: 0 }
  );
}
