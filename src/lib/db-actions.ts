"use client";

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type WriteBatch,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  findMinimumWageAt,
  formatCurrency,
  RECEIPT_METHOD_LABELS,
} from "./finance";
import type {
  Client,
  ContactChannel,
  FinancialAgreement,
  FinancialInstallment,
  FinancialPaymentPlan,
  FinancialValueBasis,
  ItemStatus,
  MinimumWage,
  Priority,
  ReceiptMethod,
  ReceivingAccount,
  Update,
  UserProfile,
} from "./types";

export function caseFileId(clientId: string, typeId: string): string {
  return `${clientId}_${typeId}`;
}

type ClientHistorySource = Pick<Client, "id" | "name" | "code" | "nextAction" | "notes">;

function nextActionTaskData(
  client: Pick<Client, "id" | "name" | "code">,
  description: string,
  user: UserProfile
): Record<string, unknown> {
  return {
    type: "Tarefa",
    description,
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    clientIds: [client.id],
    clientNames: [client.name],
    clientCodes: [client.code ?? ""],
    processId: null,
    processNumber: null,
    processIds: [],
    processNumbers: [],
    status: "Pendente",
    responsible: "Todos",
    responsibleId: "",
    responsibleNames: [],
    responsibleIds: [],
    priority: "Média",
    dueDate: null,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  };
}

/**
 * Acrescenta ao lote a tarefa histórica correspondente a uma Próxima ação.
 * Exportada apenas para fluxos de importação que já controlam seu próprio lote.
 */
export function addNextActionTaskToBatch(
  batch: WriteBatch,
  client: Pick<Client, "id" | "name" | "code">,
  nextAction: string,
  user: UserProfile
): void {
  const description = nextAction.trim();
  if (!description) return;
  batch.set(doc(collection(db, "updates")), nextActionTaskData(client, description, user));
}

function addClientFieldHistoryToBatch(
  batch: WriteBatch,
  client: ClientHistorySource,
  data: Record<string, unknown>,
  user: UserProfile
): void {
  if (typeof data.nextAction === "string") {
    const nextAction = data.nextAction.trim();
    if (nextAction && nextAction !== (client.nextAction ?? "").trim()) {
      addNextActionTaskToBatch(batch, client, nextAction, user);
    }
  }

  if (typeof data.notes === "string") {
    const generalInfo = data.notes.trim();
    if (generalInfo && generalInfo !== (client.notes ?? "").trim()) {
      batch.set(doc(collection(db, "updates")), {
        type: "Anotação",
        clientId: client.id,
        clientName: client.name,
        clientCode: client.code ?? "",
        description: `Informações gerais:\n${generalInfo}`,
        author: user.name,
        authorId: user.id,
        createdAt: serverTimestamp(),
        deleted: false,
      });
    }
  }
}

/**
 * Atualiza campos do cliente com carimbo de auditoria. Quando recebe os dados
 * do cliente, também registra alterações de Próxima ação e Informações gerais.
 */
export async function updateClient(
  clientOrId: string | ClientHistorySource,
  data: Record<string, unknown>,
  user: UserProfile
): Promise<void> {
  const clientId = typeof clientOrId === "string" ? clientOrId : clientOrId.id;
  const batch = writeBatch(db);
  batch.update(doc(db, "clients", clientId), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
  if (typeof clientOrId !== "string") {
    addClientFieldHistoryToBatch(batch, clientOrId, data, user);
  }
  await batch.commit();
}

/** Cria um cliente e os registros iniciais de Próxima ação/Informações gerais. */
export async function createClient(
  data: Record<string, unknown> & { name: string; code?: string; nextAction?: string; notes?: string },
  user: UserProfile
): Promise<string> {
  const ref = doc(collection(db, "clients"));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...data,
    processIds: [],
    createdAt: serverTimestamp(),
    createdBy: user.name,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
    deleted: false,
    deletedAt: null,
    deletedBy: null,
  });
  addClientFieldHistoryToBatch(
    batch,
    { id: ref.id, name: data.name, code: data.code, nextAction: "", notes: "" },
    data,
    user
  );
  await batch.commit();
  return ref.id;
}

/** Cria um vínculo de aninhamento sem sobrescrever vínculos concorrentes. */
export async function addNestedClient(
  parentClientId: string,
  nestedClientId: string,
  user: UserProfile,
  relationship?: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    nestedClientIds: arrayUnion(nestedClientId),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  };
  if (relationship?.trim()) patch[`nestedClientRelationships.${nestedClientId}`] = relationship.trim();
  await updateDoc(doc(db, "clients", parentClientId), patch as Record<string, any>);
}

/** Atualiza somente a descrição livre do vínculo de aninhamento. */
export async function updateNestedClientRelationship(
  parentClientId: string,
  nestedClientId: string,
  relationship: string,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "clients", parentClientId), {
    [`nestedClientRelationships.${nestedClientId}`]: relationship.trim() || deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  } as Record<string, any>);
}

/** Remove somente o vínculo; nenhum dos dois cadastros é apagado. */
export async function removeNestedClient(
  parentClientId: string,
  nestedClientId: string,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "clients", parentClientId), {
    nestedClientIds: arrayRemove(nestedClientId),
    [`nestedClientRelationships.${nestedClientId}`]: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}

/** Marca o status de um item do checklist de um cliente em um tipo. */
export async function setChecklistItem(
  clientId: string,
  typeId: string,
  itemId: string,
  status: ItemStatus,
  user: UserProfile,
  note?: string
): Promise<void> {
  const ref = doc(db, "caseFiles", caseFileId(clientId, typeId));
  const itemState: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: user.name,
  };
  if (note !== undefined) itemState.note = note;
  await setDoc(
    ref,
    {
      clientId,
      typeId,
      items: { [itemId]: itemState },
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/**
 * Salva a observação do checklist e cria seu registro histórico na ficha do
 * cliente. As duas gravações são atômicas para que nenhuma fique sem a outra.
 */
export async function saveChecklistNote(
  client: { id: string; name: string; code?: string },
  typeId: string,
  typeName: string,
  itemId: string,
  itemName: string,
  status: ItemStatus,
  statusLabel: string,
  note: string,
  user: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  batch.set(
    doc(db, "caseFiles", caseFileId(client.id, typeId)),
    {
      clientId: client.id,
      typeId,
      items: {
        [itemId]: {
          status,
          note,
          updatedAt: now,
          updatedBy: user.name,
        },
      },
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );

  batch.set(doc(collection(db, "updates")), {
    type: "Anotação",
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    description: [
      `Checklist da operação: ${typeName}`,
      `Pendência: ${itemName}`,
      `Status: ${statusLabel}`,
      `Observação: ${note || "(observação removida)"}`,
    ].join("\n"),
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  });

  await batch.commit();
}

/** Salva um campo operacional do caso (ex.: bloco/lote do Barão de Mauá). */
/** Grava a prontidão MANUAL (A/B/C/D/P ou nenhuma) da ficha cliente×operação. */
export async function setCaseGrade(
  clientId: string,
  typeId: string,
  grade: "A" | "B" | "C" | "D" | "P" | null,
  user: UserProfile
): Promise<void> {
  const ref = doc(db, "caseFiles", caseFileId(clientId, typeId));
  await setDoc(
    ref,
    {
      clientId,
      typeId,
      grade: grade ?? deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

export async function setCaseField(
  clientId: string,
  typeId: string,
  fieldId: string,
  value: string,
  user: UserProfile
): Promise<void> {
  const ref = doc(db, "caseFiles", caseFileId(clientId, typeId));
  await setDoc(
    ref,
    {
      clientId,
      typeId,
      fields: value === "" ? { [fieldId]: deleteField() } : { [fieldId]: value },
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/**
 * Oculta ou restaura apenas a exibição de uma definição antiga na ficha.
 * O estado do item e a definição aposentada continuam armazenados.
 */
export async function setLegacyItemHidden(
  clientId: string,
  typeId: string,
  itemId: string,
  hidden: boolean,
  user: UserProfile
): Promise<void> {
  await setDoc(
    doc(db, "caseFiles", caseFileId(clientId, typeId)),
    {
      clientId,
      typeId,
      hiddenLegacyItemIds: hidden ? arrayUnion(itemId) : arrayRemove(itemId),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/** Mesma regra de ocultação reversível para campos antigos do caso. */
export async function setLegacyFieldHidden(
  clientId: string,
  typeId: string,
  fieldId: string,
  hidden: boolean,
  user: UserProfile
): Promise<void> {
  await setDoc(
    doc(db, "caseFiles", caseFileId(clientId, typeId)),
    {
      clientId,
      typeId,
      hiddenLegacyFieldIds: hidden ? arrayUnion(fieldId) : arrayRemove(fieldId),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/** Registra um atendimento e atualiza seu resumo no cliente. */
export async function registerContact(
  client: Client,
  data: {
    channel?: ContactChannel;
    record: string;
    nextAction?: string;
  },
  user: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  const attendance: Record<string, unknown> = {
    type: "Atendimento",
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    description: data.record,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  };
  if (data.channel) attendance.channel = data.channel;
  batch.set(doc(collection(db, "updates")), attendance);
  const clientPatch: Record<string, unknown> = {
    lastContactAt: serverTimestamp(),
    lastContactResult: data.record.slice(0, 160),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  };
  if (data.nextAction !== undefined) {
    clientPatch.nextAction = data.nextAction;
    if (data.nextAction.trim()) {
      addNextActionTaskToBatch(batch, client, data.nextAction, user);
    }
  }
  batch.update(doc(db, "clients", client.id), clientPatch as Record<string, any>);
  await batch.commit();
}

/** Cria uma tarefa vinculada (ou não) a um cliente. */
export async function createTask(
  data: {
    description: string;
    clientId?: string;
    clientName?: string;
    clientCode?: string;
    clientIds?: string[];
    clientNames?: string[];
    clientCodes?: string[];
    processId?: string;
    processNumber?: string;
    processIds?: string[];
    processNumbers?: string[];
    responsible?: string;
    responsibleId?: string;
    responsibleNames?: string[];
    responsibleIds?: string[];
    priority?: Priority;
    dueDate?: Date | null;
  },
  user: UserProfile
): Promise<void> {
  await addDoc(collection(db, "updates"), {
    type: "Tarefa",
    description: data.description,
    clientId: data.clientId ?? null,
    clientName: data.clientName ?? null,
    clientCode: data.clientCode ?? "",
    clientIds: data.clientIds ?? (data.clientId ? [data.clientId] : []),
    clientNames: data.clientNames ?? (data.clientName ? [data.clientName] : []),
    clientCodes: data.clientCodes ?? (data.clientCode ? [data.clientCode] : []),
    processId: data.processId ?? null,
    processNumber: data.processNumber ?? null,
    processIds: data.processIds ?? (data.processId ? [data.processId] : []),
    processNumbers: data.processNumbers ?? (data.processNumber ? [data.processNumber] : []),
    status: "Pendente",
    responsible: data.responsible ?? user.name,
    responsibleId: data.responsibleId ?? user.id,
    responsibleNames: data.responsibleNames ?? [data.responsible ?? user.name],
    responsibleIds: data.responsibleIds ?? [data.responsibleId ?? user.id],
    priority: data.priority ?? "Média",
    dueDate: data.dueDate ? data.dueDate.toISOString() : null,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  });
}

/** Adiciona uma anotação/andamento ao cliente. */
export async function addNote(
  client: { id: string; name: string; code?: string },
  description: string,
  user: UserProfile
): Promise<void> {
  await addDoc(collection(db, "updates"), {
    type: "Anotação",
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    description,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  });
}

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

export type CreateFinancialAgreementInput = {
  description?: string;
  agreementDate: Date;
  valueBasis: FinancialValueBasis;
  minimumWageMultiplier?: 0.5 | 1 | 1.5;
  baseMinimumWageRateId?: string;
  baseMinimumWageCents?: number;
  originalAmountCents: number;
  paymentPlan: FinancialPaymentPlan;
  customPaymentTerms?: string;
  note?: string;
  installments: Array<{ dueDate: Date | null; baseAmountCents: number }>;
};

/** Cadastra um valor devido e todas as suas parcelas no mesmo lote. */
export async function createFinancialAgreement(
  client: Pick<Client, "id">,
  input: CreateFinancialAgreementInput,
  user: UserProfile
): Promise<string> {
  if (!Number.isInteger(input.originalAmountCents) || input.originalAmountCents <= 0) {
    throw new Error("Informe um valor devido válido.");
  }
  if (input.installments.length < 1 || input.installments.length > 60) {
    throw new Error("A quantidade de parcelas deve ficar entre 1 e 60.");
  }
  if (
    input.installments.some(
      (installment) =>
        !Number.isInteger(installment.baseAmountCents) || installment.baseAmountCents < 0
    )
  ) {
    throw new Error("As parcelas possuem valores inválidos.");
  }

  const agreementRef = doc(collection(db, "financialAgreements"));
  const installmentRefs = input.installments.map(() =>
    doc(collection(db, "financialInstallments"))
  );
  const batch = writeBatch(db);
  const correctionPolicy =
    input.valueBasis === "custom" ? "none" : "minimum_wage_at_closing_payment";

  batch.set(agreementRef, {
    clientId: client.id,
    description: input.description?.trim() ?? "",
    agreementDate: Timestamp.fromDate(input.agreementDate),
    valueBasis: input.valueBasis,
    minimumWageMultiplier: input.minimumWageMultiplier ?? null,
    baseMinimumWageRateId: input.baseMinimumWageRateId ?? null,
    baseMinimumWageCents: input.baseMinimumWageCents ?? null,
    originalAmountCents: input.originalAmountCents,
    paymentPlan: input.paymentPlan,
    installmentCount: input.installments.length,
    installmentIds: installmentRefs.map((ref) => ref.id),
    customPaymentTerms: input.customPaymentTerms?.trim() ?? "",
    correctionPolicy,
    note: input.note?.trim() ?? "",
    settled: false,
    settledAt: null,
    settledByPaymentId: null,
    settledTargetCents: null,
    settledMinimumWageRateId: null,
    settledMinimumWageCents: null,
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

  input.installments.forEach((installment, index) => {
    const installmentRef = installmentRefs[index];
    batch.set(installmentRef, {
      agreementId: agreementRef.id,
      clientId: client.id,
      sequence: index + 1,
      installmentCount: input.installments.length,
      dueDate: installment.dueDate ? Timestamp.fromDate(installment.dueDate) : null,
      baseAmountCents: installment.baseAmountCents,
      paidAmountCents: 0,
      paymentIds: [],
      settled: false,
      settledAt: null,
      settledByPaymentId: null,
      settlementKind: null,
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
  });

  await batch.commit();
  return agreementRef.id;
}

export type RegisterFinancialPaymentInput = {
  client: Pick<Client, "id" | "name" | "code">;
  agreement: FinancialAgreement;
  installments: FinancialInstallment[];
  minimumWages: MinimumWage[];
  installmentId: string;
  amountCents: number;
  paidAt: Date;
  receiptMethod: ReceiptMethod;
  receiptMethodOther?: string;
  receiptAccountId?: string;
  receiptAccountName?: string;
  note?: string;
};

/**
 * Registra o recebimento e altera a parcela em uma transação. Uma parcela
 * anterior paga parcialmente é encerrada e sua diferença passa, por cálculo,
 * para a última parcela pendente. A última aceita quantos pagamentos parciais
 * forem necessários até alcançar o saldo corrigido.
 */
export async function registerFinancialPayment(
  input: RegisterFinancialPaymentInput,
  user: UserProfile
): Promise<string> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Informe um valor de pagamento válido.");
  }
  if (input.paidAt.getTime() > Date.now() + 60_000) {
    throw new Error("A data do pagamento não pode estar no futuro.");
  }
  const accountName = input.receiptAccountName?.trim() ?? "";
  if (input.receiptMethod !== "cash" && !accountName) {
    throw new Error("Informe a conta de recebimento.");
  }
  const receiptMethodOther = input.receiptMethodOther?.trim() ?? "";
  if (input.receiptMethod === "other" && !receiptMethodOther) {
    throw new Error("Informe a forma de recebimento.");
  }

  const paymentRef = doc(collection(db, "updates"));
  const agreementRef = doc(db, "financialAgreements", input.agreement.id);
  const installmentRefs = input.installments.map((installment) =>
    doc(db, "financialInstallments", installment.id)
  );
  const selectedMinimumWage = input.agreement.minimumWageMultiplier
    ? findMinimumWageAt(input.minimumWages, input.paidAt)
    : undefined;
  const wageRef = selectedMinimumWage
    ? doc(db, "minimumWages", selectedMinimumWage.id)
    : null;

  await runTransaction(db, async (transaction) => {
    const [agreementSnapshot, installmentSnapshots, wageSnapshot] = await Promise.all([
      transaction.get(agreementRef),
      Promise.all(installmentRefs.map((ref) => transaction.get(ref))),
      wageRef ? transaction.get(wageRef) : Promise.resolve(null),
    ]);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    const agreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (agreement.deleted) throw new Error("Este valor devido está excluído.");
    if (agreement.settled) throw new Error("Este valor devido já está quitado.");
    const providedInstallmentIds = input.installments.map((installment) => installment.id);
    if (
      providedInstallmentIds.length !== agreement.installmentCount ||
      new Set(providedInstallmentIds).size !== providedInstallmentIds.length ||
      !Array.isArray(agreement.installmentIds) ||
      agreement.installmentIds.length !== agreement.installmentCount ||
      agreement.installmentIds.some(
        (installmentId) => !providedInstallmentIds.includes(installmentId)
      )
    ) {
      throw new Error("Não foi possível conferir a lista de parcelas.");
    }

    const installments = installmentSnapshots
      .filter((snapshot) => snapshot.exists())
      .map(
        (snapshot) =>
          ({ id: snapshot.id, ...snapshot.data() }) as FinancialInstallment
      )
      .filter(
        (installment) =>
          installment.agreementId === agreement.id &&
          installment.clientId === agreement.clientId &&
          !installment.deleted
      )
      .sort((a, b) => a.sequence - b.sequence);
    if (installments.length !== agreement.installmentCount) {
      throw new Error("Não foi possível conferir todas as parcelas.");
    }

    const openInstallments = installments.filter((installment) => !installment.settled);
    const selected = openInstallments.find(
      (installment) => installment.id === input.installmentId
    );
    if (!selected) throw new Error("Esta parcela já está paga ou não existe.");
    if (selected.id !== openInstallments[0]?.id) {
      throw new Error("Registre primeiro a parcela pendente mais antiga.");
    }

    let wageAtPayment: MinimumWage | undefined;
    if (agreement.minimumWageMultiplier) {
      if (!selectedMinimumWage || !wageSnapshot?.exists()) {
        throw new Error("Cadastre o salário mínimo vigente na data do pagamento.");
      }
      wageAtPayment = {
        id: wageSnapshot.id,
        ...wageSnapshot.data(),
      } as MinimumWage;
      if (
        wageAtPayment.deleted ||
        wageAtPayment.amountCents !== selectedMinimumWage.amountCents
      ) {
        throw new Error("O salário mínimo vigente foi alterado. Tente novamente.");
      }
    }

    const totalReceived = installments.reduce(
      (sum, installment) => sum + Math.max(0, installment.paidAmountCents ?? 0),
      0
    );
    const targetCents =
      agreement.minimumWageMultiplier && wageAtPayment
        ? Math.max(
            agreement.originalAmountCents,
            Math.round(wageAtPayment.amountCents * agreement.minimumWageMultiplier)
          )
        : agreement.originalAmountCents;
    const totalPending = Math.max(0, targetCents - totalReceived);
    const correctionTarget = openInstallments.at(-1);
    const otherOpenBase = openInstallments
      .filter((installment) => installment.id !== correctionTarget?.id)
      .reduce((sum, installment) => sum + installment.baseAmountCents, 0);
    const requiredAmount =
      selected.id === correctionTarget?.id
        ? Math.max(0, totalPending - otherOpenBase)
        : selected.baseAmountCents;

    if (requiredAmount <= 0) throw new Error("Esta parcela não possui saldo pendente.");
    if (input.amountCents > requiredAmount) {
      throw new Error(`O pagamento não pode ultrapassar ${formatCurrency(requiredAmount)}.`);
    }

    const isPartial = input.amountCents < requiredAmount;
    const isClosingInstallment = openInstallments.length === 1;
    const settlesInstallment = !isClosingInstallment || !isPartial;
    const closesAgreement = isClosingInstallment && settlesInstallment;
    const paidAt = Timestamp.fromDate(input.paidAt);
    const methodLabel =
      input.receiptMethod === "other"
        ? receiptMethodOther
        : RECEIPT_METHOD_LABELS[input.receiptMethod];
    const description = [
      `Pagamento recebido: ${formatCurrency(input.amountCents)}`,
      `Data do pagamento: ${input.paidAt.toLocaleDateString("pt-BR")}`,
      `Forma de recebimento: ${methodLabel}`,
      accountName ? `Conta de recebimento: ${accountName}` : "",
      input.note?.trim() ? `Observação: ${input.note.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    transaction.set(paymentRef, {
      type: "Financeiro",
      financialAgreementId: agreement.id,
      financialInstallmentId: selected.id,
      clientId: input.client.id,
      clientName: input.client.name,
      clientCode: input.client.code ?? "",
      description,
      amountCents: input.amountCents,
      paidAt,
      updateDate: paidAt,
      receiptMethod: input.receiptMethod,
      receiptMethodOther,
      receiptAccountId: input.receiptAccountId ?? "",
      receiptAccountName: accountName,
      financialNote: input.note?.trim() ?? "",
      paymentKind: isPartial ? "partial" : "full",
      settlesInstallment,
      closesAgreement,
      minimumWageRateIdAtPayment: wageAtPayment?.id ?? "",
      minimumWageCentsAtPayment: wageAtPayment?.amountCents ?? null,
      requiredInstallmentAmountCents: requiredAmount,
      agreementTargetCentsAtPayment: targetCents,
      author: user.name,
      authorId: user.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
      deleted: false,
      deletedAt: null,
      deletedBy: null,
    });

    transaction.update(doc(db, "financialInstallments", selected.id), {
      paidAmountCents: (selected.paidAmountCents ?? 0) + input.amountCents,
      paymentIds: [...(selected.paymentIds ?? []), paymentRef.id],
      settled: settlesInstallment,
      settledAt: settlesInstallment ? paidAt : null,
      settledByPaymentId: settlesInstallment ? paymentRef.id : null,
      settlementKind: settlesInstallment
        ? isPartial
          ? "partial_rolled"
          : "full"
        : null,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });

    if (closesAgreement) {
      transaction.update(agreementRef, {
        settled: true,
        settledAt: paidAt,
        settledByPaymentId: paymentRef.id,
        settledTargetCents: targetCents,
        settledMinimumWageRateId: wageAtPayment?.id ?? null,
        settledMinimumWageCents: wageAtPayment?.amountCents ?? null,
        updatedAt: serverTimestamp(),
        updatedById: user.id,
        updatedBy: user.name,
      });
    }
  });

  return paymentRef.id;
}

/** Exclui um pagamento e reabre a parcela correspondente quando necessário. */
export async function softDeleteFinancialPayment(
  paymentId: string,
  user: UserProfile
): Promise<void> {
  const paymentRef = doc(db, "updates", paymentId);
  await runTransaction(db, async (transaction) => {
    const paymentSnapshot = await transaction.get(paymentRef);
    if (!paymentSnapshot.exists()) throw new Error("Pagamento não encontrado.");
    const payment = { id: paymentSnapshot.id, ...paymentSnapshot.data() } as Update;
    if (payment.type !== "Financeiro" || !payment.financialInstallmentId) {
      throw new Error("Registro financeiro inválido.");
    }
    if (payment.deleted) return;

    const installmentRef = doc(
      db,
      "financialInstallments",
      payment.financialInstallmentId
    );
    const installmentSnapshot = await transaction.get(installmentRef);
    if (!installmentSnapshot.exists()) throw new Error("Parcela não encontrada.");
    const installment = {
      id: installmentSnapshot.id,
      ...installmentSnapshot.data(),
    } as FinancialInstallment;
    const activePaymentIds = installment.paymentIds ?? [];
    if (activePaymentIds.at(-1) !== payment.id) {
      throw new Error(
        "Exclua primeiro o pagamento mais recente desta parcela."
      );
    }
    if (
      installment.settled &&
      installment.settledByPaymentId &&
      installment.settledByPaymentId !== payment.id
    ) {
      throw new Error(
        "Exclua primeiro o pagamento que quitou esta parcela."
      );
    }
    const agreementRef = doc(db, "financialAgreements", installment.agreementId);
    const agreementSnapshot = await transaction.get(agreementRef);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    const agreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (
      agreement.settled &&
      agreement.settledByPaymentId !== payment.id
    ) {
      throw new Error(
        "Exclua primeiro o pagamento que quitou este valor devido."
      );
    }

    const amount = Math.max(0, payment.amountCents ?? 0);
    const paymentIds = activePaymentIds.slice(0, -1);
    const reopensInstallment =
      payment.settlesInstallment || installment.settledByPaymentId === payment.id;

    transaction.update(paymentRef, {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: user.name,
      deletedById: user.id,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    });
    transaction.update(installmentRef, {
      paidAmountCents: Math.max(0, (installment.paidAmountCents ?? 0) - amount),
      paymentIds,
      ...(reopensInstallment
        ? {
            settled: false,
            settledAt: null,
            settledByPaymentId: null,
            settlementKind: null,
          }
        : {}),
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });
    if (agreement.settled && (reopensInstallment || payment.closesAgreement)) {
      transaction.update(agreementRef, {
        settled: false,
        settledAt: null,
        settledByPaymentId: null,
        settledTargetCents: null,
        settledMinimumWageRateId: null,
        settledMinimumWageCents: null,
        updatedAt: serverTimestamp(),
        updatedById: user.id,
        updatedBy: user.name,
      });
    }
  });
}

/** Restaura um pagamento excluído sem sobrescrever pagamentos posteriores. */
export async function restoreFinancialPayment(
  paymentId: string,
  installmentIds: string[],
  user: UserProfile
): Promise<void> {
  const paymentRef = doc(db, "updates", paymentId);
  await runTransaction(db, async (transaction) => {
    const paymentSnapshot = await transaction.get(paymentRef);
    if (!paymentSnapshot.exists()) throw new Error("Pagamento não encontrado.");
    const payment = { id: paymentSnapshot.id, ...paymentSnapshot.data() } as Update;
    if (
      payment.type !== "Financeiro" ||
      !payment.deleted ||
      !payment.financialInstallmentId ||
      !payment.financialAgreementId
    ) {
      throw new Error("Este pagamento não pode ser restaurado.");
    }
    const agreementRef = doc(db, "financialAgreements", payment.financialAgreementId);
    const installmentRefs = installmentIds.map((id) =>
      doc(db, "financialInstallments", id)
    );
    const [agreementSnapshot, installmentSnapshots] = await Promise.all([
      transaction.get(agreementRef),
      Promise.all(installmentRefs.map((ref) => transaction.get(ref))),
    ]);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    const agreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (agreement.deleted) throw new Error("Restaure primeiro o valor devido.");
    if (
      installmentIds.length !== agreement.installmentCount ||
      new Set(installmentIds).size !== installmentIds.length ||
      !Array.isArray(agreement.installmentIds) ||
      agreement.installmentIds.length !== agreement.installmentCount ||
      agreement.installmentIds.some((id) => !installmentIds.includes(id))
    ) {
      throw new Error("Não foi possível conferir a lista de parcelas.");
    }

    const installments = installmentSnapshots
      .filter((snapshot) => snapshot.exists())
      .map(
        (snapshot) =>
          ({ id: snapshot.id, ...snapshot.data() }) as FinancialInstallment
      )
      .filter(
        (installment) =>
          installment.agreementId === agreement.id && !installment.deleted
      );
    const installment = installments.find(
      (item) => item.id === payment.financialInstallmentId
    );
    if (!installment) throw new Error("Parcela não encontrada.");
    if (
      installment.settled ||
      (payment.settlesInstallment && (installment.paymentIds ?? []).length > 0)
    ) {
      throw new Error("A parcela já possui outro pagamento ativo.");
    }

    const amount = Math.max(0, payment.amountCents ?? 0);
    const restoredInstallment = {
      ...installment,
      paidAmountCents: (installment.paidAmountCents ?? 0) + amount,
      paymentIds: [...(installment.paymentIds ?? []), payment.id],
      settled: payment.settlesInstallment === true,
    };
    const allSettled = installments.every((item) =>
      item.id === restoredInstallment.id ? restoredInstallment.settled : item.settled
    );
    if (payment.closesAgreement === true && !allSettled) {
      throw new Error(
        "Restaure primeiro os pagamentos anteriores e deixe o pagamento final por último."
      );
    }
    if (allSettled && payment.closesAgreement !== true) {
      throw new Error(
        "Restaure primeiro os pagamentos anteriores e deixe o pagamento final por último."
      );
    }

    transaction.update(paymentRef, {
      deleted: false,
      deletedAt: null,
      deletedBy: null,
      deletedById: null,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    });
    transaction.update(
      doc(db, "financialInstallments", restoredInstallment.id),
      {
        paidAmountCents: restoredInstallment.paidAmountCents,
        paymentIds: restoredInstallment.paymentIds,
        settled: restoredInstallment.settled,
        settledAt: restoredInstallment.settled ? payment.paidAt ?? serverTimestamp() : null,
        settledByPaymentId: restoredInstallment.settled ? payment.id : null,
        settlementKind: restoredInstallment.settled
          ? payment.paymentKind === "partial"
            ? "partial_rolled"
            : "full"
          : null,
        updatedAt: serverTimestamp(),
        updatedById: user.id,
        updatedBy: user.name,
      }
    );
    if (allSettled) {
      const target = installments.reduce(
        (sum, item) =>
          sum +
          (item.id === restoredInstallment.id
            ? restoredInstallment.paidAmountCents
            : item.paidAmountCents ?? 0),
        0
      );
      transaction.update(agreementRef, {
        settled: true,
        settledAt: payment.paidAt ?? serverTimestamp(),
        settledByPaymentId: payment.id,
        settledTargetCents: target,
        settledMinimumWageRateId: payment.minimumWageRateIdAtPayment || null,
        settledMinimumWageCents: payment.minimumWageCentsAtPayment ?? null,
        updatedAt: serverTimestamp(),
        updatedById: user.id,
        updatedBy: user.name,
      });
    }
  });
}

/** Exclui um valor devido somente quando não há pagamentos ativos. */
export async function softDeleteFinancialAgreement(
  agreement: FinancialAgreement,
  installments: FinancialInstallment[],
  user: UserProfile
): Promise<void> {
  const agreementInstallments = installments.filter(
    (installment) => installment.agreementId === agreement.id
  );
  if (
    !Array.isArray(agreement.installmentIds) ||
    agreementInstallments.length !== agreement.installmentCount ||
    agreement.installmentIds.length !== agreement.installmentCount ||
    agreement.installmentIds.some(
      (id) => !agreementInstallments.some((installment) => installment.id === id)
    )
  ) {
    throw new Error("Não foi possível conferir a lista de parcelas.");
  }
  const paymentSnapshot = await getDocs(
    query(
      collection(db, "updates"),
      where("financialAgreementId", "==", agreement.id)
    )
  );
  if (paymentSnapshot.docs.some((snapshot) => snapshot.data().deleted !== true)) {
    throw new Error("Exclua primeiro os pagamentos deste valor devido.");
  }
  const batch = writeBatch(db);
  const audit = {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedById: user.id,
    deletedBy: user.name,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  };
  batch.update(doc(db, "financialAgreements", agreement.id), audit);
  agreementInstallments.forEach((installment) =>
    batch.update(doc(db, "financialInstallments", installment.id), audit)
  );
  await batch.commit();
}

export async function restoreFinancialAgreement(
  agreement: FinancialAgreement,
  installments: FinancialInstallment[],
  user: UserProfile
): Promise<void> {
  const agreementInstallments = installments.filter(
    (installment) => installment.agreementId === agreement.id
  );
  if (
    !Array.isArray(agreement.installmentIds) ||
    agreementInstallments.length !== agreement.installmentCount ||
    agreement.installmentIds.length !== agreement.installmentCount ||
    agreement.installmentIds.some(
      (id) => !agreementInstallments.some((installment) => installment.id === id)
    )
  ) {
    throw new Error("Não foi possível conferir a lista de parcelas.");
  }
  const batch = writeBatch(db);
  const audit = {
    deleted: false,
    deletedAt: null,
    deletedById: null,
    deletedBy: null,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  };
  batch.update(doc(db, "financialAgreements", agreement.id), audit);
  agreementInstallments.forEach((installment) =>
    batch.update(doc(db, "financialInstallments", installment.id), audit)
  );
  await batch.commit();
}

export async function createMinimumWage(
  data: { amountCents: number; effectiveFrom: Date; note?: string },
  user: UserProfile
): Promise<void> {
  if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) {
    throw new Error("Informe um valor válido.");
  }
  const effectiveFrom = Timestamp.fromDate(data.effectiveFrom);
  const existing = await getDocs(
    query(collection(db, "minimumWages"), where("effectiveFrom", "==", effectiveFrom))
  );
  if (existing.docs.some((snapshot) => snapshot.data().deleted !== true)) {
    throw new Error("Já existe um salário mínimo vigente nessa data.");
  }
  await addDoc(collection(db, "minimumWages"), {
    amountCents: data.amountCents,
    effectiveFrom,
    note: data.note?.trim() ?? "",
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
}

export async function setMinimumWageDeleted(
  rate: MinimumWage,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "minimumWages", rate.id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedById: deleted ? user.id : null,
    deletedBy: deleted ? user.name : null,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

export async function createReceivingAccount(
  data: { name: string; note?: string },
  user: UserProfile
): Promise<void> {
  const name = data.name.trim();
  if (!name) throw new Error("Informe o nome da conta.");
  await addDoc(collection(db, "receivingAccounts"), {
    name,
    note: data.note?.trim() ?? "",
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
}

export async function setReceivingAccountDeleted(
  account: ReceivingAccount,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "receivingAccounts", account.id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedById: deleted ? user.id : null,
    deletedBy: deleted ? user.name : null,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}
