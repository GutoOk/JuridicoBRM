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
  allocateOpenInstallmentAmounts,
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

/** Registra um andamento canônico vinculado à tarefa e aos mesmos clientes/processos. */
export async function addTaskProgress(
  task: Update,
  description: string,
  user: UserProfile
): Promise<void> {
  await addDoc(collection(db, "updates"), {
    type: "Anotação",
    taskId: task.id,
    taskDescription: task.description,
    description: description.trim(),
    clientId: task.clientId ?? null,
    clientName: task.clientName ?? null,
    clientCode: task.clientCode ?? "",
    clientIds: task.clientIds ?? (task.clientId ? [task.clientId] : []),
    clientNames: task.clientNames ?? (task.clientName ? [task.clientName] : []),
    clientCodes: task.clientCodes ?? (task.clientCode ? [task.clientCode] : []),
    processId: task.processId ?? null,
    processNumber: task.processNumber ?? null,
    processIds: task.processIds ?? (task.processId ? [task.processId] : []),
    processNumbers: task.processNumbers ?? (task.processNumber ? [task.processNumber] : []),
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

type PreparedFinancialAgreementInput = {
  expectedMultiplier?: 0.5 | 1 | 1.5;
  isCustomValue: boolean;
  regularInstallmentAmountCents: number;
  finalInstallmentAmountCents: number;
  correctionPolicy: "none" | "minimum_wage_at_closing_payment";
};

function prepareFinancialAgreementInput(
  input: CreateFinancialAgreementInput
): PreparedFinancialAgreementInput {
  const wageMultipliers: Partial<
    Record<FinancialValueBasis, 0.5 | 1 | 1.5>
  > = {
    half_minimum_wage: 0.5,
    minimum_wage: 1,
    one_and_half_minimum_wage: 1.5,
  };
  const expectedMultiplier = wageMultipliers[input.valueBasis];
  const isCustomValue = input.valueBasis === "custom";

  if (Number.isNaN(input.agreementDate.getTime())) {
    throw new Error("Informe uma data válida para o acordo.");
  }
  if (!isCustomValue && !expectedMultiplier) {
    throw new Error("Escolha uma base válida para o valor devido.");
  }
  if (
    !isCustomValue &&
    (input.minimumWageMultiplier !== expectedMultiplier ||
      !input.baseMinimumWageRateId ||
      !Number.isInteger(input.baseMinimumWageCents) ||
      (input.baseMinimumWageCents ?? 0) <= 0)
  ) {
    throw new Error("O salário mínimo vigente não pôde ser confirmado.");
  }
  if (!Number.isInteger(input.originalAmountCents) || input.originalAmountCents <= 0) {
    throw new Error("Informe um valor devido válido.");
  }
  if (
    !isCustomValue &&
    Math.round((input.baseMinimumWageCents ?? 0) * expectedMultiplier!) !==
      input.originalAmountCents
  ) {
    throw new Error("O valor devido não corresponde ao salário mínimo selecionado.");
  }
  if (input.installments.length < 1 || input.installments.length > 60) {
    throw new Error("A quantidade de parcelas deve ficar entre 1 e 60.");
  }
  if (input.paymentPlan === "installments" && input.installments.length < 2) {
    throw new Error("O pagamento parcelado deve ter pelo menos duas parcelas.");
  }
  if (
    (input.paymentPlan === "upfront" || input.paymentPlan === "at_end") &&
    input.installments.length !== 1
  ) {
    throw new Error("Essa forma de pagamento deve ter uma única parcela.");
  }
  if (
    input.paymentPlan === "custom" &&
    !(input.customPaymentTerms?.trim())
  ) {
    throw new Error("Descreva a forma personalizada de pagamento.");
  }
  if ((input.customPaymentTerms?.trim().length ?? 0) > 1000) {
    throw new Error("A forma personalizada deve ter no máximo 1.000 caracteres.");
  }
  if (
    input.paymentPlan !== "custom" &&
    (input.customPaymentTerms?.trim() ?? "") !== ""
  ) {
    throw new Error("A descrição personalizada só pode ser usada em outra forma.");
  }
  if (
    input.paymentPlan === "at_end" &&
    input.installments.some((installment) => installment.dueDate !== null)
  ) {
    throw new Error("Pagamento no fim do processo não deve ter data final.");
  }
  if (
    (input.paymentPlan === "upfront" ||
      input.paymentPlan === "installments") &&
    input.installments.some((installment) => installment.dueDate === null)
  ) {
    throw new Error("Informe a data de todas as parcelas.");
  }
  if (
    input.installments.some(
      (installment) =>
        !Number.isInteger(installment.baseAmountCents) ||
        installment.baseAmountCents <= 0 ||
        (!!installment.dueDate &&
          Number.isNaN(installment.dueDate.getTime()))
    )
  ) {
    throw new Error("As parcelas possuem valores inválidos.");
  }
  if (
    input.installments.reduce(
      (total, installment) => total + installment.baseAmountCents,
      0
    ) !== input.originalAmountCents
  ) {
    throw new Error("A soma das parcelas difere do valor devido.");
  }
  if ((input.description?.trim().length ?? 0) > 160) {
    throw new Error("A descrição deve ter no máximo 160 caracteres.");
  }
  if ((input.note?.trim().length ?? 0) > 2000) {
    throw new Error("A observação deve ter no máximo 2.000 caracteres.");
  }

  const regularInstallmentAmountCents =
    input.installments[0].baseAmountCents;
  const finalInstallmentAmountCents =
    input.installments[input.installments.length - 1].baseAmountCents;
  if (
    input.installments
      .slice(0, -1)
      .some(
        (installment) =>
          installment.baseAmountCents !== regularInstallmentAmountCents
      )
  ) {
    throw new Error("As parcelas regulares devem possuir o mesmo valor.");
  }

  return {
    expectedMultiplier,
    isCustomValue,
    regularInstallmentAmountCents,
    finalInstallmentAmountCents,
    correctionPolicy: isCustomValue
      ? "none"
      : "minimum_wage_at_closing_payment",
  };
}

function financialInstallmentDocumentId(
  agreementId: string,
  sequence: number
): string {
  return `${agreementId}_${sequence}`;
}

/** Cadastra um valor devido e todas as suas parcelas no mesmo lote. */
export async function createFinancialAgreement(
  client: Pick<Client, "id">,
  input: CreateFinancialAgreementInput,
  user: UserProfile
): Promise<string> {
  const prepared = prepareFinancialAgreementInput(input);

  const agreementRef = doc(collection(db, "financialAgreements"));
  const installmentRefs = input.installments.map((_, index) =>
    doc(
      db,
      "financialInstallments",
      financialInstallmentDocumentId(agreementRef.id, index + 1)
    )
  );
  const batch = writeBatch(db);

  batch.set(agreementRef, {
    clientId: client.id,
    description: input.description?.trim() ?? "",
    agreementDate: Timestamp.fromDate(input.agreementDate),
    valueBasis: input.valueBasis,
    minimumWageMultiplier: prepared.isCustomValue
      ? null
      : prepared.expectedMultiplier,
    baseMinimumWageRateId: prepared.isCustomValue
      ? null
      : input.baseMinimumWageRateId,
    baseMinimumWageCents: prepared.isCustomValue
      ? null
      : input.baseMinimumWageCents,
    originalAmountCents: input.originalAmountCents,
    paymentPlan: input.paymentPlan,
    installmentCount: input.installments.length,
    installmentIds: installmentRefs.map((ref) => ref.id),
    regularInstallmentAmountCents:
      prepared.regularInstallmentAmountCents,
    finalInstallmentAmountCents:
      prepared.finalInstallmentAmountCents,
    receivedAmountCents: 0,
    activePaymentCount: 0,
    settledInstallmentCount: 0,
    nextOpenSequence: 1,
    lastPaymentId: null,
    customPaymentTerms: input.customPaymentTerms?.trim() ?? "",
    correctionPolicy: prepared.correctionPolicy,
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

export async function updateFinancialAgreementDetails(
  agreementId: string,
  input: Pick<CreateFinancialAgreementInput, "description" | "note">,
  user: UserProfile
): Promise<void> {
  const description = input.description?.trim() ?? "";
  const note = input.note?.trim() ?? "";
  if (description.length > 160) {
    throw new Error("A descrição deve ter no máximo 160 caracteres.");
  }
  if (note.length > 2000) {
    throw new Error("A observação deve ter no máximo 2.000 caracteres.");
  }

  const agreementRef = doc(db, "financialAgreements", agreementId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(agreementRef);
    if (!snapshot.exists()) throw new Error("Valor devido não encontrado.");
    const storedAgreement = {
      id: snapshot.id,
      ...snapshot.data(),
    } as FinancialAgreement;
    if (storedAgreement.deleted) {
      throw new Error("Este valor devido está excluído.");
    }

    transaction.update(agreementRef, {
      description,
      note,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });
  });
}

/**
 * Edita integralmente um acordo ainda sem pagamentos. A versão anterior e suas
 * parcelas permanecem preservadas na auditoria; a nova versão nasce ativa no
 * mesmo commit, sem janela de duplicidade ou perda de dados.
 */
export async function replaceUnpaidFinancialAgreement(
  client: Pick<Client, "id">,
  agreementId: string,
  input: CreateFinancialAgreementInput,
  user: UserProfile
): Promise<string> {
  const prepared = prepareFinancialAgreementInput(input);
  const agreementRef = doc(db, "financialAgreements", agreementId);
  const replacementRef = doc(collection(db, "financialAgreements"));
  const replacementInstallmentRefs = input.installments.map((_, index) =>
    doc(
      db,
      "financialInstallments",
      financialInstallmentDocumentId(replacementRef.id, index + 1)
    )
  );

  await runTransaction(db, async (transaction) => {
    const agreementSnapshot = await transaction.get(agreementRef);
    if (!agreementSnapshot.exists()) {
      throw new Error("Valor devido não encontrado.");
    }
    const storedAgreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (storedAgreement.deleted) {
      throw new Error("Este valor devido está excluído.");
    }
    if (
      storedAgreement.clientId !== client.id ||
      !hasConsistentFinancialAgreementState(storedAgreement)
    ) {
      throw new Error("Os controles deste valor devido estão inconsistentes.");
    }
    if (
      storedAgreement.settled ||
      storedAgreement.receivedAmountCents !== 0 ||
      storedAgreement.activePaymentCount !== 0 ||
      storedAgreement.settledInstallmentCount !== 0 ||
      storedAgreement.lastPaymentId !== null
    ) {
      throw new Error(
        "Este valor já possui pagamento; altere somente descrição e observação."
      );
    }

    const storedInstallmentRefs = Array.from(
      { length: storedAgreement.installmentCount },
      (_, index) =>
        doc(
          db,
          "financialInstallments",
          financialInstallmentDocumentId(storedAgreement.id, index + 1)
        )
    );
    const storedInstallmentSnapshots = await Promise.all(
      storedInstallmentRefs.map((installmentRef) =>
        transaction.get(installmentRef)
      )
    );
    const validInstallments = storedInstallmentSnapshots.every(
      (snapshot, index) => {
        if (!snapshot.exists()) return false;
        const installment = {
          id: snapshot.id,
          ...snapshot.data(),
        } as FinancialInstallment;
        return (
          installment.agreementId === storedAgreement.id &&
          installment.clientId === storedAgreement.clientId &&
          installment.sequence === index + 1 &&
          installment.installmentCount === storedAgreement.installmentCount &&
          !installment.deleted &&
          !installment.settled &&
          installment.paidAmountCents === 0 &&
          (installment.paymentIds ?? []).length === 0
        );
      }
    );
    if (!validInstallments) {
      throw new Error("Não foi possível conferir todas as parcelas.");
    }

    const deletedAudit = {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedById: user.id,
      deletedBy: user.name,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    };
    transaction.update(agreementRef, deletedAudit);
    storedInstallmentRefs.forEach((installmentRef) =>
      transaction.update(installmentRef, deletedAudit)
    );

    transaction.set(replacementRef, {
      clientId: client.id,
      description: input.description?.trim() ?? "",
      agreementDate: Timestamp.fromDate(input.agreementDate),
      valueBasis: input.valueBasis,
      minimumWageMultiplier: prepared.isCustomValue
        ? null
        : prepared.expectedMultiplier,
      baseMinimumWageRateId: prepared.isCustomValue
        ? null
        : input.baseMinimumWageRateId,
      baseMinimumWageCents: prepared.isCustomValue
        ? null
        : input.baseMinimumWageCents,
      originalAmountCents: input.originalAmountCents,
      paymentPlan: input.paymentPlan,
      installmentCount: input.installments.length,
      installmentIds: replacementInstallmentRefs.map((ref) => ref.id),
      regularInstallmentAmountCents:
        prepared.regularInstallmentAmountCents,
      finalInstallmentAmountCents:
        prepared.finalInstallmentAmountCents,
      receivedAmountCents: 0,
      activePaymentCount: 0,
      settledInstallmentCount: 0,
      nextOpenSequence: 1,
      lastPaymentId: null,
      customPaymentTerms: input.customPaymentTerms?.trim() ?? "",
      correctionPolicy: prepared.correctionPolicy,
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
      transaction.set(replacementInstallmentRefs[index], {
        agreementId: replacementRef.id,
        clientId: client.id,
        sequence: index + 1,
        installmentCount: input.installments.length,
        dueDate: installment.dueDate
          ? Timestamp.fromDate(installment.dueDate)
          : null,
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
  });

  return replacementRef.id;
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
  if (Number.isNaN(input.paidAt.getTime())) {
    throw new Error("Informe uma data de pagamento válida.");
  }
  const now = new Date();
  const isToday =
    input.paidAt.getFullYear() === now.getFullYear() &&
    input.paidAt.getMonth() === now.getMonth() &&
    input.paidAt.getDate() === now.getDate();
  const paymentDate =
    isToday && input.paidAt.getTime() > now.getTime() ? now : input.paidAt;
  if (paymentDate.getTime() > now.getTime() + 60_000) {
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

  await runTransaction(db, async (transaction) => {
    const agreementSnapshot = await transaction.get(agreementRef);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    const agreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (agreement.deleted) throw new Error("Este valor devido está excluído.");
    if (agreement.settled) throw new Error("Este valor devido já está quitado.");
    if (
      agreement.clientId !== input.client.id ||
      !hasConsistentFinancialAgreementState(agreement)
    ) {
      throw new Error("Os controles deste valor devido estão inconsistentes.");
    }

    const installmentRefs = agreement.installmentIds.map((installmentId) =>
      doc(db, "financialInstallments", installmentId)
    );
    const installmentSnapshots = await Promise.all(
      installmentRefs.map((installmentRef) =>
        transaction.get(installmentRef)
      )
    );
    if (installmentSnapshots.some((snapshot) => !snapshot.exists())) {
      throw new Error("Uma ou mais parcelas não foram encontradas.");
    }
    const storedInstallments = installmentSnapshots.map(
      (snapshot) =>
        ({
          id: snapshot.id,
          ...snapshot.data(),
        }) as FinancialInstallment
    );
    const installmentsAreConsistent = storedInstallments.every(
      (installment, index) => {
        const sequence = index + 1;
        const expectedBaseAmount =
          sequence === agreement.installmentCount
            ? agreement.finalInstallmentAmountCents
            : agreement.regularInstallmentAmountCents;
        return (
          installment.id ===
            financialInstallmentDocumentId(agreement.id, sequence) &&
          installment.agreementId === agreement.id &&
          installment.clientId === agreement.clientId &&
          installment.sequence === sequence &&
          installment.installmentCount === agreement.installmentCount &&
          installment.baseAmountCents === expectedBaseAmount &&
          Number.isInteger(installment.paidAmountCents) &&
          installment.paidAmountCents >= 0 &&
          Array.isArray(installment.paymentIds) &&
          typeof installment.settled === "boolean" &&
          !installment.deleted &&
          (installment.settled
            ? !!installment.settledByPaymentId &&
              (installment.settlementKind === "full" ||
                installment.settlementKind === "partial_rolled")
            : installment.settledByPaymentId == null &&
              installment.settlementKind == null)
        );
      }
    );
    const aggregatePaidAmount = storedInstallments.reduce(
      (total, installment) => total + installment.paidAmountCents,
      0
    );
    const aggregatePaymentCount = storedInstallments.reduce(
      (total, installment) => total + installment.paymentIds.length,
      0
    );
    const aggregateSettledCount = storedInstallments.filter(
      (installment) => installment.settled
    ).length;
    if (
      !installmentsAreConsistent ||
      aggregatePaidAmount !== agreement.receivedAmountCents ||
      aggregatePaymentCount !== agreement.activePaymentCount ||
      aggregateSettledCount !== agreement.settledInstallmentCount
    ) {
      throw new Error("Os controles das parcelas estão inconsistentes.");
    }
    const selected = storedInstallments.find(
      (installment) => installment.id === input.installmentId
    );
    if (!selected || selected.settled) {
      throw new Error("Esta parcela não possui saldo pendente.");
    }

    let wageAtPayment: MinimumWage | undefined;
    if (agreement.minimumWageMultiplier) {
      const selectedMinimumWage = findMinimumWageAt(
        input.minimumWages,
        paymentDate
      );
      if (!selectedMinimumWage) {
        throw new Error("Cadastre o salário mínimo vigente na data do pagamento.");
      }
      const wageSnapshot = await transaction.get(
        doc(db, "minimumWages", selectedMinimumWage.id)
      );
      if (!wageSnapshot.exists()) {
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

    const targetCents =
      agreement.minimumWageMultiplier && wageAtPayment
        ? Math.max(
            agreement.originalAmountCents,
            Math.round(wageAtPayment.amountCents * agreement.minimumWageMultiplier)
          )
        : agreement.originalAmountCents;
    const pendingCents = targetCents - agreement.receivedAmountCents;
    const openInstallments = storedInstallments.filter(
      (installment) => !installment.settled
    );
    const openInstallmentCount = openInstallments.length;
    const requiredAmount =
      allocateOpenInstallmentAmounts(storedInstallments, pendingCents).get(
        selected.id
      ) ?? 0;
    const maximumPaymentCents =
      pendingCents - Math.max(0, openInstallmentCount - 1);
    if (
      pendingCents <= 0 ||
      openInstallmentCount < 1 ||
      openInstallmentCount !==
        agreement.installmentCount - agreement.settledInstallmentCount ||
      pendingCents < openInstallmentCount ||
      requiredAmount <= 0
    ) {
      throw new Error("Esta parcela não possui saldo pendente.");
    }
    if (input.amountCents > maximumPaymentCents) {
      throw new Error(
        `Nesta parcela, registre no máximo ${formatCurrency(
          maximumPaymentCents
        )} para manter saldo nas demais parcelas pendentes.`
      );
    }
    const isPartial = input.amountCents < requiredAmount;
    const settlesInstallment =
      openInstallmentCount > 1 || input.amountCents === pendingCents;
    const receivedAmountCents =
      agreement.receivedAmountCents + input.amountCents;
    const settledInstallmentCount =
      agreement.settledInstallmentCount + (settlesInstallment ? 1 : 0);
    const closesAgreement =
      receivedAmountCents === targetCents &&
      settledInstallmentCount === agreement.installmentCount;
    const nextOpenSequence = agreement.nextOpenSequence;
    if (
      receivedAmountCents > targetCents ||
      settledInstallmentCount > agreement.installmentCount ||
      (receivedAmountCents === targetCents) !== closesAgreement ||
      (!settlesInstallment && closesAgreement)
    ) {
      throw new Error("O pagamento não corresponde ao saldo desta parcela.");
    }
    const paidAt = Timestamp.fromDate(paymentDate);
    const methodLabel =
      input.receiptMethod === "other"
        ? receiptMethodOther
        : RECEIPT_METHOD_LABELS[input.receiptMethod];
    const description = [
      `Pagamento recebido: ${formatCurrency(input.amountCents)}`,
      `Data do pagamento: ${paymentDate.toLocaleDateString("pt-BR")}`,
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
      previousAgreementPaymentId: agreement.lastPaymentId,
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

    transaction.update(agreementRef, {
      receivedAmountCents,
      activePaymentCount: agreement.activePaymentCount + 1,
      settledInstallmentCount,
      nextOpenSequence,
      lastPaymentId: paymentRef.id,
      ...(closesAgreement
        ? {
            settled: true,
            settledAt: paidAt,
            settledByPaymentId: paymentRef.id,
            settledTargetCents: targetCents,
            settledMinimumWageRateId: wageAtPayment?.id ?? null,
            settledMinimumWageCents: wageAtPayment?.amountCents ?? null,
          }
        : {}),
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });
  });

  return paymentRef.id;
}

function hasConsistentFinancialAgreementState(
  agreement: FinancialAgreement
): boolean {
  const validLastPaymentId =
    agreement.lastPaymentId === null ||
    (typeof agreement.lastPaymentId === "string" &&
      agreement.lastPaymentId.length > 0);
  if (
    typeof agreement.settled !== "boolean" ||
    !Number.isInteger(agreement.originalAmountCents) ||
    agreement.originalAmountCents <= 0 ||
    !Number.isInteger(agreement.installmentCount) ||
    agreement.installmentCount < 1 ||
    agreement.installmentCount > 60 ||
    !Array.isArray(agreement.installmentIds) ||
    agreement.installmentIds.length !== agreement.installmentCount ||
    agreement.installmentIds.some(
      (installmentId, index) =>
        installmentId !==
        financialInstallmentDocumentId(agreement.id, index + 1)
    ) ||
    !Number.isInteger(agreement.regularInstallmentAmountCents) ||
    agreement.regularInstallmentAmountCents <= 0 ||
    !Number.isInteger(agreement.finalInstallmentAmountCents) ||
    agreement.finalInstallmentAmountCents <= 0 ||
    agreement.regularInstallmentAmountCents *
        (agreement.installmentCount - 1) +
        agreement.finalInstallmentAmountCents !==
      agreement.originalAmountCents ||
    !Number.isInteger(agreement.receivedAmountCents) ||
    agreement.receivedAmountCents < 0 ||
    !Number.isInteger(agreement.activePaymentCount) ||
    agreement.activePaymentCount < 0 ||
    !Number.isInteger(agreement.settledInstallmentCount) ||
    agreement.settledInstallmentCount < 0 ||
    agreement.settledInstallmentCount > agreement.installmentCount ||
    !Number.isInteger(agreement.nextOpenSequence) ||
    agreement.nextOpenSequence < 1 ||
    agreement.nextOpenSequence > agreement.installmentCount ||
    !validLastPaymentId ||
    (agreement.activePaymentCount === 0) !==
      (agreement.lastPaymentId === null) ||
    (agreement.receivedAmountCents === 0) !==
      (agreement.activePaymentCount === 0) ||
    agreement.activePaymentCount < agreement.settledInstallmentCount
  ) {
    return false;
  }
  if (agreement.settled) {
    return (
      agreement.settledInstallmentCount === agreement.installmentCount &&
      Number.isInteger(agreement.settledTargetCents) &&
      agreement.settledTargetCents === agreement.receivedAmountCents &&
      agreement.settledTargetCents >= agreement.originalAmountCents &&
      agreement.settledByPaymentId === agreement.lastPaymentId
    );
  }
  return (
    agreement.settledAt === null &&
    agreement.settledByPaymentId === null &&
    agreement.settledTargetCents === null &&
    agreement.settledMinimumWageRateId === null &&
    agreement.settledMinimumWageCents === null
  );
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
    if (
      payment.type !== "Financeiro" ||
      !payment.financialInstallmentId ||
      !payment.financialAgreementId
    ) {
      throw new Error("Registro financeiro inválido.");
    }
    if (payment.deleted) return;

    const agreementRef = doc(
      db,
      "financialAgreements",
      payment.financialAgreementId
    );
    const installmentRef = doc(
      db,
      "financialInstallments",
      payment.financialInstallmentId
    );
    const [agreementSnapshot, installmentSnapshot] = await Promise.all([
      transaction.get(agreementRef),
      transaction.get(installmentRef),
    ]);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    if (!installmentSnapshot.exists()) throw new Error("Parcela não encontrada.");
    const agreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    const installment = {
      id: installmentSnapshot.id,
      ...installmentSnapshot.data(),
    } as FinancialInstallment;
    if (
      agreement.deleted ||
      !hasConsistentFinancialAgreementState(agreement)
    ) {
      throw new Error("Os controles deste valor devido estão inconsistentes.");
    }
    if (agreement.lastPaymentId !== payment.id) {
      throw new Error(
        "Exclua primeiro o pagamento mais recente deste valor devido."
      );
    }
    const previousPaymentId = payment.previousAgreementPaymentId;
    if (
      previousPaymentId !== null &&
      (typeof previousPaymentId !== "string" || previousPaymentId.length === 0)
    ) {
      throw new Error("A sequência dos pagamentos está inconsistente.");
    }
    const amount = payment.amountCents ?? 0;
    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      (payment.paymentKind !== "full" &&
        payment.paymentKind !== "partial") ||
      typeof payment.settlesInstallment !== "boolean" ||
      typeof payment.closesAgreement !== "boolean" ||
      agreement.receivedAmountCents < amount ||
      agreement.activePaymentCount < 1 ||
      payment.clientId !== agreement.clientId ||
      installment.agreementId !== agreement.id ||
      installment.clientId !== agreement.clientId ||
      !Number.isInteger(installment.sequence) ||
      installment.sequence < 1 ||
      installment.sequence > agreement.installmentCount ||
      installment.installmentCount !== agreement.installmentCount ||
      installment.id !==
        financialInstallmentDocumentId(agreement.id, installment.sequence) ||
      installment.baseAmountCents !==
        (installment.sequence === agreement.installmentCount
          ? agreement.finalInstallmentAmountCents
          : agreement.regularInstallmentAmountCents) ||
      !Number.isInteger(installment.paidAmountCents) ||
      installment.paidAmountCents < amount ||
      installment.deleted
    ) {
      throw new Error("Os dados do pagamento estão inconsistentes.");
    }
    const paymentSettlesInstallment = payment.settlesInstallment === true;
    if (
      (paymentSettlesInstallment &&
        agreement.settledInstallmentCount < 1) ||
      installment.settled !== paymentSettlesInstallment ||
      (paymentSettlesInstallment &&
        (installment.settledByPaymentId !== payment.id ||
          installment.settlementKind !==
            (payment.paymentKind === "partial"
              ? "partial_rolled"
              : "full"))) ||
      (payment.closesAgreement === true) !== agreement.settled ||
      (agreement.settled &&
        agreement.settledByPaymentId !== payment.id)
    ) {
      throw new Error("A sequência dos pagamentos está inconsistente.");
    }
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

    const paymentIds = activePaymentIds.slice(0, -1);
    const reopensInstallment =
      payment.settlesInstallment || installment.settledByPaymentId === payment.id;
    const activePaymentCount = agreement.activePaymentCount - 1;
    const receivedAmountCents = agreement.receivedAmountCents - amount;
    const settledInstallmentCount =
      agreement.settledInstallmentCount -
      (paymentSettlesInstallment ? 1 : 0);
    if (
      activePaymentCount < 0 ||
      receivedAmountCents < 0 ||
      settledInstallmentCount < 0 ||
      (activePaymentCount === 0) !== (previousPaymentId === null)
    ) {
      throw new Error("A sequência dos pagamentos está inconsistente.");
    }

    transaction.update(paymentRef, {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: user.name,
      deletedById: user.id,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    });
    transaction.update(installmentRef, {
      paidAmountCents: installment.paidAmountCents - amount,
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
    transaction.update(agreementRef, {
      receivedAmountCents,
      activePaymentCount,
      settledInstallmentCount,
      nextOpenSequence: agreement.nextOpenSequence,
      lastPaymentId: previousPaymentId,
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
  });
}

/** Restaura um pagamento excluído sem sobrescrever pagamentos posteriores. */
export async function restoreFinancialPayment(
  paymentId: string,
  _installmentIds: string[],
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
    const agreementSnapshot = await transaction.get(agreementRef);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    const agreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (agreement.deleted) throw new Error("Restaure primeiro o valor devido.");
    if (agreement.settled || !hasConsistentFinancialAgreementState(agreement)) {
      throw new Error("Os controles deste valor devido estão inconsistentes.");
    }
    if (payment.previousAgreementPaymentId !== agreement.lastPaymentId) {
      throw new Error(
        "Restaure os pagamentos na mesma ordem em que foram excluídos."
      );
    }
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
    if (
      installment.deleted ||
      installment.settled ||
      installment.agreementId !== agreement.id ||
      installment.clientId !== agreement.clientId ||
      installment.id !==
        financialInstallmentDocumentId(agreement.id, installment.sequence) ||
      installment.installmentCount !== agreement.installmentCount ||
      installment.baseAmountCents !==
        (installment.sequence === agreement.installmentCount
          ? agreement.finalInstallmentAmountCents
          : agreement.regularInstallmentAmountCents) ||
      !Number.isInteger(installment.paidAmountCents) ||
      installment.paidAmountCents < 0 ||
      (installment.paymentIds ?? []).includes(payment.id)
    ) {
      throw new Error("Os dados da parcela estão inconsistentes.");
    }
    const amount = payment.amountCents ?? 0;
    const targetCents = payment.agreementTargetCentsAtPayment ?? 0;
    const requiredAmount = payment.requiredInstallmentAmountCents ?? 0;
    const pendingCents = targetCents - agreement.receivedAmountCents;
    const openInstallmentCount =
      agreement.installmentCount - agreement.settledInstallmentCount;
    const maximumPaymentCents =
      pendingCents - Math.max(0, openInstallmentCount - 1);
    const isPartial = amount < requiredAmount;
    const settlesInstallment =
      openInstallmentCount > 1 || amount === pendingCents;
    const receivedAmountCents = agreement.receivedAmountCents + amount;
    const activePaymentCount = agreement.activePaymentCount + 1;
    const settledInstallmentCount =
      agreement.settledInstallmentCount + (settlesInstallment ? 1 : 0);
    const nextOpenSequence = agreement.nextOpenSequence;
    const closesAgreement =
      receivedAmountCents === targetCents &&
      settledInstallmentCount === agreement.installmentCount;
    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      !Number.isInteger(targetCents) ||
      targetCents < agreement.originalAmountCents ||
      !Number.isInteger(pendingCents) ||
      pendingCents <= 0 ||
      !Number.isInteger(openInstallmentCount) ||
      openInstallmentCount < 1 ||
      !Number.isInteger(requiredAmount) ||
      requiredAmount <= 0 ||
      requiredAmount > pendingCents ||
      amount > maximumPaymentCents ||
      payment.paymentKind !== (isPartial ? "partial" : "full") ||
      payment.settlesInstallment !== settlesInstallment ||
      payment.closesAgreement !== closesAgreement ||
      (settlesInstallment && !payment.paidAt)
    ) {
      throw new Error("Os dados do pagamento estão inconsistentes.");
    }

    transaction.update(paymentRef, {
      deleted: false,
      deletedAt: null,
      deletedBy: null,
      deletedById: null,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    });
    transaction.update(installmentRef, {
      paidAmountCents: (installment.paidAmountCents ?? 0) + amount,
      paymentIds: [...(installment.paymentIds ?? []), payment.id],
      settled: settlesInstallment,
      settledAt: settlesInstallment ? payment.paidAt : null,
      settledByPaymentId: settlesInstallment ? payment.id : null,
      settlementKind: settlesInstallment
        ? isPartial
          ? "partial_rolled"
          : "full"
        : null,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });
    transaction.update(agreementRef, {
      receivedAmountCents,
      activePaymentCount,
      settledInstallmentCount,
      nextOpenSequence,
      lastPaymentId: payment.id,
      ...(closesAgreement
        ? {
            settled: true,
            settledAt: payment.paidAt,
            settledByPaymentId: payment.id,
            settledTargetCents: targetCents,
            settledMinimumWageRateId:
              payment.minimumWageRateIdAtPayment || null,
            settledMinimumWageCents:
              payment.minimumWageCentsAtPayment ?? null,
          }
        : {}),
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });
  });
}

/** Exclui um valor devido somente quando não há pagamentos ativos. */
export async function softDeleteFinancialAgreement(
  agreement: FinancialAgreement,
  _installments: FinancialInstallment[],
  user: UserProfile
): Promise<void> {
  const agreementRef = doc(db, "financialAgreements", agreement.id);
  await runTransaction(db, async (transaction) => {
    const agreementSnapshot = await transaction.get(agreementRef);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    const storedAgreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (storedAgreement.deleted) return;
    if (
      !hasConsistentFinancialAgreementState(storedAgreement) ||
      storedAgreement.settled ||
      storedAgreement.receivedAmountCents !== 0 ||
      storedAgreement.activePaymentCount !== 0 ||
      storedAgreement.settledInstallmentCount !== 0 ||
      storedAgreement.lastPaymentId !== null
    ) {
      throw new Error("Exclua primeiro os pagamentos deste valor devido.");
    }
    const installmentRefs = Array.from(
      { length: storedAgreement.installmentCount },
      (_, index) =>
        doc(
          db,
          "financialInstallments",
          financialInstallmentDocumentId(storedAgreement.id, index + 1)
        )
    );
    const installmentSnapshots = await Promise.all(
      installmentRefs.map((installmentRef) =>
        transaction.get(installmentRef)
      )
    );
    const validInstallments = installmentSnapshots.every(
      (snapshot, index) => {
        if (!snapshot.exists()) return false;
        const installment = {
          id: snapshot.id,
          ...snapshot.data(),
        } as FinancialInstallment;
        return (
          installment.agreementId === storedAgreement.id &&
          installment.clientId === storedAgreement.clientId &&
          installment.sequence === index + 1 &&
          installment.installmentCount === storedAgreement.installmentCount &&
          !installment.deleted &&
          !installment.settled &&
          installment.paidAmountCents === 0 &&
          (installment.paymentIds ?? []).length === 0
        );
      }
    );
    if (!validInstallments) {
      throw new Error("Não foi possível conferir todas as parcelas.");
    }
    const audit = {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedById: user.id,
      deletedBy: user.name,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    };
    transaction.update(agreementRef, audit);
    installmentRefs.forEach((installmentRef) =>
      transaction.update(installmentRef, audit)
    );
  });
}

export async function restoreFinancialAgreement(
  agreement: FinancialAgreement,
  _installments: FinancialInstallment[],
  user: UserProfile
): Promise<void> {
  const agreementRef = doc(db, "financialAgreements", agreement.id);
  await runTransaction(db, async (transaction) => {
    const agreementSnapshot = await transaction.get(agreementRef);
    if (!agreementSnapshot.exists()) throw new Error("Valor devido não encontrado.");
    const storedAgreement = {
      id: agreementSnapshot.id,
      ...agreementSnapshot.data(),
    } as FinancialAgreement;
    if (!storedAgreement.deleted) return;
    if (
      !hasConsistentFinancialAgreementState(storedAgreement) ||
      storedAgreement.settled ||
      storedAgreement.receivedAmountCents !== 0 ||
      storedAgreement.activePaymentCount !== 0 ||
      storedAgreement.settledInstallmentCount !== 0 ||
      storedAgreement.lastPaymentId !== null
    ) {
      throw new Error("Este valor devido não pode ser restaurado.");
    }
    const installmentRefs = Array.from(
      { length: storedAgreement.installmentCount },
      (_, index) =>
        doc(
          db,
          "financialInstallments",
          financialInstallmentDocumentId(storedAgreement.id, index + 1)
        )
    );
    const installmentSnapshots = await Promise.all(
      installmentRefs.map((installmentRef) =>
        transaction.get(installmentRef)
      )
    );
    const validInstallments = installmentSnapshots.every(
      (snapshot, index) => {
        if (!snapshot.exists()) return false;
        const installment = {
          id: snapshot.id,
          ...snapshot.data(),
        } as FinancialInstallment;
        return (
          installment.agreementId === storedAgreement.id &&
          installment.clientId === storedAgreement.clientId &&
          installment.sequence === index + 1 &&
          installment.installmentCount === storedAgreement.installmentCount &&
          installment.deleted &&
          !installment.settled &&
          installment.paidAmountCents === 0 &&
          (installment.paymentIds ?? []).length === 0
        );
      }
    );
    if (!validInstallments) {
      throw new Error("Não foi possível conferir todas as parcelas.");
    }
    const audit = {
      deleted: false,
      deletedAt: null,
      deletedById: null,
      deletedBy: null,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    };
    transaction.update(agreementRef, audit);
    installmentRefs.forEach((installmentRef) =>
      transaction.update(installmentRef, audit)
    );
  });
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

export async function updateReceivingAccount(
  account: Pick<ReceivingAccount, "id" | "deleted">,
  data: { name: string; note?: string },
  user: UserProfile
): Promise<void> {
  if (account.deleted) {
    throw new Error("Restaure a conta antes de editá-la.");
  }
  const name = data.name.trim();
  const note = data.note?.trim() ?? "";
  if (!name) throw new Error("Informe o nome da conta.");
  if (name.length > 200) {
    throw new Error("O nome da conta deve ter até 200 caracteres.");
  }
  if (note.length > 2000) {
    throw new Error("A observação deve ter até 2.000 caracteres.");
  }
  await updateDoc(doc(db, "receivingAccounts", account.id), {
    name,
    note,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
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
