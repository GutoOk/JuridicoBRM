/**
 * Teste das Firestore Security Rules do histórico de versões jurídicas.
 *
 * A segurança real do sistema mora nas rules, não no cliente, então mudanças nelas
 * precisam de prova e não de leitura atenta. Este script exercita os caminhos que o
 * editor usa de verdade — marco explícito, marco com rótulo e as duas formas de
 * restaurar — além das tentativas que devem ser recusadas.
 *
 * Requisitos: JDK 21 (emulador do Firestore) e @firebase/rules-unit-testing.
 *
 *   npm run test:rules
 */

import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const PROJECT_ID = "juridicobrm-rules-test";
const UID = "operador-1";
const ENTITY_ID = "doc-teste";

const CONTENT = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
const STYLES = JSON.stringify({ body: { id: "body" } });
const PAGE = JSON.stringify({ paperSize: "A4" });

let passed = 0;
let failed = 0;

async function check(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`ok      ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FALHOU  ${name}\n        ${error.message}`);
  }
}

/** Documento de versão no formato exato que `versionSnapshot` produz no cliente. */
function versionDoc(version, overrides = {}) {
  return {
    entityId: ENTITY_ID,
    entityType: "document",
    version,
    name: "teste",
    contentJson: CONTENT,
    plainText: "",
    stylesJson: STYLES,
    pageSettingsJson: PAGE,
    reason: "explicit",
    label: "",
    restoredFromVersion: null,
    // As rules exigem `createdAt == request.time`, então tem de ser o carimbo do
    // servidor, exatamente como o cliente faz em `versionSnapshot`.
    createdAt: serverTimestamp(),
    createdById: UID,
    createdBy: "Operador",
    deleted: false,
    deletedAt: null,
    deletedById: null,
    deletedBy: null,
    ...overrides,
  };
}

function entityDoc(version, overrides = {}) {
  return {
    name: "teste",
    nameLower: "teste",
    clientId: "cliente-1",
    clientName: "Cliente",
    sourceTemplateId: null,
    sourceTemplateName: "",
    sourceTemplateVersion: null,
    contentJson: CONTENT,
    plainText: "",
    stylesJson: STYLES,
    pageSettingsJson: PAGE,
    version,
    createdAt: new Date(),
    createdById: UID,
    createdBy: "Operador",
    updatedAt: new Date(),
    updatedById: UID,
    updatedBy: "Operador",
    deleted: false,
    deletedAt: null,
    deletedById: null,
    deletedBy: null,
    ...overrides,
  };
}

const testEnvironment = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: readFileSync("firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});

/** Reposiciona o documento na versão 1 antes de cada caso. */
async function reset() {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, "users", UID), {
      name: "Operador",
      email: "operador@example.com",
      role: "operator",
      active: true,
    });
    await setDoc(doc(database, "legalDocuments", ENTITY_ID), entityDoc(1));
    await setDoc(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), versionDoc(1, { reason: "initial" }));
  });
  return testEnvironment.authenticatedContext(UID, { email: "operador@example.com" }).firestore();
}

/** Marco novo + atualização do documento, na mesma atomicidade da transação real. */
function markerBatch(database, versions, entityVersion, entityOverrides = {}) {
  const batch = writeBatch(database);
  versions.forEach((version) => {
    batch.set(doc(database, "legalDocumentVersions", `${ENTITY_ID}_${version.version}`), version);
  });
  batch.update(doc(database, "legalDocuments", ENTITY_ID), {
    version: entityVersion,
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
    ...entityOverrides,
  });
  return batch.commit();
}

console.log("Regras do histórico de versões\n");

await check("marco explícito é aceito", async () => {
  const database = await reset();
  await assertSucceeds(markerBatch(database, [versionDoc(2)], 2));
});

await check("marco com rótulo é aceito", async () => {
  const database = await reset();
  await assertSucceeds(markerBatch(database, [versionDoc(2, { label: "antes de enviar ao cliente" })], 2));
});

await check("restauração com origem registrada é aceita", async () => {
  const database = await reset();
  await assertSucceeds(
    markerBatch(database, [versionDoc(2, { reason: "restored", restoredFromVersion: 1 })], 2)
  );
});

await check("restauração com rascunho preservado (dois marcos) é aceita", async () => {
  const database = await reset();
  await assertSucceeds(
    markerBatch(
      database,
      [
        versionDoc(2, { reason: "before_restore" }),
        versionDoc(3, { reason: "restored", restoredFromVersion: 1 }),
      ],
      3
    )
  );
});

await check("gravar o rascunho sem criar marco é aceito", async () => {
  const database = await reset();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocuments", ENTITY_ID), {
    contentJson: CONTENT,
    plainText: "",
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
  });
  await assertSucceeds(batch.commit());
});

await check("rótulo acima de 120 caracteres é recusado", async () => {
  const database = await reset();
  await assertFails(markerBatch(database, [versionDoc(2, { label: "x".repeat(121) })], 2));
});

await check("origem de restauração em marco que não é restauração é recusada", async () => {
  const database = await reset();
  await assertFails(markerBatch(database, [versionDoc(2, { restoredFromVersion: 1 })], 2));
});

await check("origem de restauração igual ou posterior à própria versão é recusada", async () => {
  const database = await reset();
  await assertFails(
    markerBatch(database, [versionDoc(2, { reason: "restored", restoredFromVersion: 2 })], 2)
  );
});

await check("campo desconhecido no marco é recusado", async () => {
  const database = await reset();
  await assertFails(markerBatch(database, [versionDoc(2, { qualquerCoisa: "x" })], 2));
});

await check("alterar o conteúdo de um marco continua recusado", async () => {
  const database = await reset();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), { label: "tentativa" });
  await assertFails(batch.commit());
});

await check("excluir um marco é recusado", async () => {
  const database = await reset();
  const batch = writeBatch(database);
  batch.delete(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`));
  await assertFails(batch.commit());
});

await check("usuário inativo não cria marco", async () => {
  await reset();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", UID), {
      name: "Operador",
      email: "operador@example.com",
      role: "operator",
      active: false,
    });
  });
  const database = testEnvironment.authenticatedContext(UID, { email: "operador@example.com" }).firestore();
  await assertFails(markerBatch(database, [versionDoc(2)], 2));
});

// ------------------------------------------------------------------
// Exclusão lógica do marco: admin e criador, nunca a versão em uso
// ------------------------------------------------------------------

/** Deixa o documento na versão 2, com a 1 disponível para exclusão. */
async function resetComDuasVersoes() {
  const database = await reset();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await setDoc(doc(admin, "legalDocuments", ENTITY_ID), entityDoc(2));
    await setDoc(doc(admin, "legalDocumentVersions", `${ENTITY_ID}_2`), {
      ...versionDoc(2),
      createdAt: new Date(),
    });
  });
  return database;
}

function deletionPatch(deleted) {
  return deleted
    ? { deleted: true, deletedAt: serverTimestamp(), deletedById: UID, deletedBy: "Operador" }
    : { deleted: false, deletedAt: null, deletedById: null, deletedBy: null };
}

await check("criador exclui logicamente um marco fora de uso", async () => {
  const database = await resetComDuasVersoes();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), deletionPatch(true));
  await assertSucceeds(batch.commit());
});

await check("administrador exclui marco de outro usuário", async () => {
  await resetComDuasVersoes();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "admin-1"), {
      name: "Administradora",
      email: "admin@example.com",
      role: "admin",
      active: true,
    });
  });
  const database = testEnvironment
    .authenticatedContext("admin-1", { email: "admin@example.com" })
    .firestore();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedById: "admin-1",
    deletedBy: "Administradora",
  });
  await assertSucceeds(batch.commit());
});

await check("marco excluído volta ao histórico", async () => {
  const database = await resetComDuasVersoes();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "legalDocumentVersions", `${ENTITY_ID}_1`), {
      ...versionDoc(1, { reason: "initial" }),
      createdAt: new Date(),
      deleted: true,
      deletedAt: new Date(),
      deletedById: UID,
      deletedBy: "Operador",
    });
  });
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), deletionPatch(false));
  await assertSucceeds(batch.commit());
});

await check("excluir a versão em uso é recusado", async () => {
  const database = await resetComDuasVersoes();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_2`), deletionPatch(true));
  await assertFails(batch.commit());
});

await check("quem não criou o marco nem é admin não exclui", async () => {
  await resetComDuasVersoes();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "outro-1"), {
      name: "Outro",
      email: "outro@example.com",
      role: "operator",
      active: true,
    });
  });
  const database = testEnvironment
    .authenticatedContext("outro-1", { email: "outro@example.com" })
    .firestore();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedById: "outro-1",
    deletedBy: "Outro",
  });
  await assertFails(batch.commit());
});

await check("excluir alterando o conteúdo junto é recusado", async () => {
  const database = await resetComDuasVersoes();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), {
    ...deletionPatch(true),
    contentJson: JSON.stringify({ type: "doc", content: [] }),
  });
  await assertFails(batch.commit());
});

await check("exclusão sem carimbo de auditoria é recusada", async () => {
  const database = await resetComDuasVersoes();
  const batch = writeBatch(database);
  batch.update(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedById: "outro-uid",
    deletedBy: "Operador",
  });
  await assertFails(batch.commit());
});

await check("apagar de vez o marco continua recusado", async () => {
  const database = await resetComDuasVersoes();
  const batch = writeBatch(database);
  batch.delete(doc(database, "legalDocumentVersions", `${ENTITY_ID}_1`));
  await assertFails(batch.commit());
});

// ------------------------------------------------------------------
// Custas e despesas do processo
// ------------------------------------------------------------------

const PROCESS_ID = "processo-teste";

function costDoc(overrides = {}) {
  return {
    processId: PROCESS_ID,
    processNumber: "1000000-00.2026.8.26.0348",
    kind: "Custas",
    description: "Guia de custas iniciais",
    amountCents: 12345,
    costDate: new Date(),
    paidBy: "Operador",
    reimbursed: false,
    notes: "",
    createdAt: serverTimestamp(),
    createdById: UID,
    createdBy: "Operador",
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
    deleted: false,
    deletedAt: null,
    deletedById: null,
    deletedBy: null,
    ...overrides,
  };
}

async function resetComProcesso() {
  const database = await reset();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "processes", PROCESS_ID), {
      processNumber: "1000000-00.2026.8.26.0348",
      clientIds: [],
      clientNames: [],
      actionType: "Procedimento Comum",
      status: "Ativo",
      polo: "Ativo",
      deleted: false,
    });
  });
  return database;
}

await check("lançar custa em processo existente é aceito", async () => {
  const database = await resetComProcesso();
  await assertSucceeds(setDoc(doc(database, "processCosts", "custa-1"), costDoc()));
});

await check("custa em processo inexistente é recusada", async () => {
  const database = await resetComProcesso();
  await assertFails(
    setDoc(doc(database, "processCosts", "custa-x"), costDoc({ processId: "nao-existe" }))
  );
});

await check("valor zero ou negativo é recusado", async () => {
  const database = await resetComProcesso();
  await assertFails(setDoc(doc(database, "processCosts", "custa-2"), costDoc({ amountCents: 0 })));
});

await check("natureza fora da lista é recusada", async () => {
  const database = await resetComProcesso();
  await assertFails(setDoc(doc(database, "processCosts", "custa-3"), costDoc({ kind: "Qualquer" })));
});

await check("custa nasce ativa: criar já excluída é recusado", async () => {
  const database = await resetComProcesso();
  await assertFails(setDoc(doc(database, "processCosts", "custa-4"), costDoc({ deleted: true })));
});

await check("excluir logicamente a custa é aceito", async () => {
  const database = await resetComProcesso();
  await assertSucceeds(setDoc(doc(database, "processCosts", "custa-5"), costDoc()));
  const batch = writeBatch(database);
  batch.update(doc(database, "processCosts", "custa-5"), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedById: UID,
    deletedBy: "Operador",
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
  });
  await assertSucceeds(batch.commit());
});

await check("mover a custa para outro processo é recusado", async () => {
  const database = await resetComProcesso();
  await assertSucceeds(setDoc(doc(database, "processCosts", "custa-6"), costDoc()));
  const batch = writeBatch(database);
  batch.update(doc(database, "processCosts", "custa-6"), {
    processId: "outro-processo",
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
  });
  await assertFails(batch.commit());
});

await check("apagar de vez a custa é recusado", async () => {
  const database = await resetComProcesso();
  await assertSucceeds(setDoc(doc(database, "processCosts", "custa-7"), costDoc()));
  const batch = writeBatch(database);
  batch.delete(doc(database, "processCosts", "custa-7"));
  await assertFails(batch.commit());
});

// ---------------------------------------------------------------------------
// Publicações judiciais (DJEN): advogados monitorados, comunicações e log
// ---------------------------------------------------------------------------

const ADMIN_UID = "admin-1";

/** Operador continua sendo o UID padrão; aqui também existe um administrador. */
async function resetComAdmin() {
  const database = await reset();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", ADMIN_UID), {
      name: "Administradora",
      email: "admin@example.com",
      role: "admin",
      active: true,
    });
  });
  return database;
}

function adminDatabase() {
  return testEnvironment.authenticatedContext(ADMIN_UID, { email: "admin@example.com" }).firestore();
}

function lawyerDoc(overrides = {}) {
  return {
    name: "Áttila",
    oabNumber: "123456",
    oabUf: "SP",
    monitored: true,
    notes: "",
    deleted: false,
    ...overrides,
  };
}

function publicationDoc(externalId, overrides = {}) {
  return {
    source: "DJEN",
    externalId,
    disponibilizacaoDate: "2026-08-14",
    lawyerIds: ["adv-1"],
    lawyerNames: ["Áttila"],
    triageStatus: "nova",
    deleted: false,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

await check("operador não cadastra advogado monitorado", async () => {
  const database = await resetComAdmin();
  await assertFails(setDoc(doc(database, "lawyers", "adv-1"), lawyerDoc()));
});

await check("administrador cadastra advogado monitorado", async () => {
  await resetComAdmin();
  await assertSucceeds(setDoc(doc(adminDatabase(), "lawyers", "adv-1"), lawyerDoc()));
});

await check("UF inválida na OAB é recusada", async () => {
  await resetComAdmin();
  await assertFails(
    setDoc(doc(adminDatabase(), "lawyers", "adv-2"), lawyerDoc({ oabUf: "sp" }))
  );
});

await check("OAB com letra é recusada", async () => {
  await resetComAdmin();
  await assertFails(
    setDoc(doc(adminDatabase(), "lawyers", "adv-3"), lawyerDoc({ oabNumber: "12A456" }))
  );
});

await check("operador lê os advogados para filtrar publicações", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(adminDatabase(), "lawyers", "adv-1"), lawyerDoc()));
  await assertSucceeds(getDoc(doc(database, "lawyers", "adv-1")));
});

await check("coletor grava publicação com ID determinístico", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(doc(database, "publications", "djen_692384513"), publicationDoc("692384513"))
  );
});

await check("ID que não casa com o externalId é recusado", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(doc(database, "publications", "djen_999"), publicationDoc("692384513"))
  );
});

await check("publicação nasce como nova: criar já tratada é recusado", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(
      doc(database, "publications", "djen_1"),
      publicationDoc("1", { triageStatus: "tratada" })
    )
  );
});

await check("situação de triagem fora da lista é recusada", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(
      doc(database, "publications", "djen_2"),
      publicationDoc("2", { triageStatus: "arquivada" })
    )
  );
});

await check("marcar publicação em análise é aceito", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_3"), publicationDoc("3")));
  await assertSucceeds(
    updateDoc(doc(database, "publications", "djen_3"), {
      triageStatus: "em_analise",
      triageNote: "em conferência",
      triagedAt: serverTimestamp(),
      triagedBy: "Operador",
    })
  );
});

await check("classificação jurídica conhecida é aceita", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_31"), publicationDoc("31")));
  await assertSucceeds(
    updateDoc(doc(database, "publications", "djen_31"), {
      classification: "decisao_interlocutoria",
      triagedAt: serverTimestamp(),
      triagedBy: "Operador",
    })
  );
});

await check("classificação jurídica desconhecida é recusada", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_32"), publicationDoc("32")));
  await assertFails(
    updateDoc(doc(database, "publications", "djen_32"), { classification: "urgente" })
  );
});

await check("tarefa de prazo com equipe e prioridade alta é aceita", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "updates", "prazo-valido"), {
    type: "Tarefa",
    taskKind: "prazo",
    responsible: "Todos",
    responsibleId: "",
    responsibleNames: [],
    responsibleIds: [],
    priority: "Alta",
  }));
});

await check("tarefa de prazo com prioridade diferente é recusada", async () => {
  const database = await resetComAdmin();
  await assertFails(setDoc(doc(database, "updates", "prazo-prioridade-invalida"), {
    type: "Tarefa",
    taskKind: "prazo",
    responsible: "Todos",
    responsibleId: "",
    responsibleNames: [],
    responsibleIds: [],
    priority: "Média",
  }));
});

await check("tarefa de prazo com responsável individual é recusada", async () => {
  const database = await resetComAdmin();
  await assertFails(setDoc(doc(database, "updates", "prazo-responsavel-invalido"), {
    type: "Tarefa",
    taskKind: "prazo",
    responsible: "Operador",
    responsibleId: UID,
    responsibleNames: ["Operador"],
    responsibleIds: [UID],
    priority: "Alta",
  }));
});

await check("natureza, equipe e prioridade da tarefa de prazo são imutáveis", async () => {
  const database = await resetComAdmin();
  const reference = doc(database, "updates", "prazo-imutavel");
  await assertSucceeds(setDoc(reference, {
    type: "Tarefa",
    taskKind: "prazo",
    responsible: "Todos",
    responsibleId: "",
    responsibleNames: [],
    responsibleIds: [],
    priority: "Alta",
  }));
  await assertFails(updateDoc(reference, { priority: "Baixa" }));
  await assertFails(updateDoc(reference, { taskKind: "comum" }));
});

await check("publicação não vira tratada sem criar tarefa", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_33"), publicationDoc("33")));
  await assertFails(
    updateDoc(doc(database, "publications", "djen_33"), {
      triageStatus: "tratada",
      triagedAt: serverTimestamp(),
      triagedBy: "Operador",
    })
  );
});

await check("tarefa vinculada ao processo marca publicação como tratada no mesmo lote", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(
      doc(database, "publications", "djen_34"),
      publicationDoc("34", { processId: "processo-34", linkStatus: "vinculada" })
    )
  );
  const batch = writeBatch(database);
  batch.set(doc(database, "updates", "tarefa-publicacao-34"), {
    type: "Tarefa",
    processId: "processo-34",
    publicationId: "djen_34",
  });
  batch.update(doc(database, "publications", "djen_34"), {
    triageStatus: "tratada",
    taskId: "tarefa-publicacao-34",
    triagedAt: serverTimestamp(),
    triagedBy: "Operador",
  });
  await assertSucceeds(batch.commit());
});

await check("tarefa de outro processo não trata a publicação", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(
      doc(database, "publications", "djen_35"),
      publicationDoc("35", { processId: "processo-35", linkStatus: "vinculada" })
    )
  );
  const batch = writeBatch(database);
  batch.set(doc(database, "updates", "tarefa-publicacao-35"), {
    type: "Tarefa",
    processId: "outro-processo",
    publicationId: "djen_35",
  });
  batch.update(doc(database, "publications", "djen_35"), {
    triageStatus: "tratada",
    taskId: "tarefa-publicacao-35",
  });
  await assertFails(batch.commit());
});

await check("taskId da publicação tratada é imutável", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(
      doc(database, "publications", "djen_36"),
      publicationDoc("36", { processId: "processo-36", linkStatus: "vinculada" })
    )
  );
  const batch = writeBatch(database);
  batch.set(doc(database, "updates", "tarefa-publicacao-36"), {
    type: "Tarefa",
    processId: "processo-36",
    publicationId: "djen_36",
  });
  batch.update(doc(database, "publications", "djen_36"), {
    triageStatus: "tratada",
    taskId: "tarefa-publicacao-36",
  });
  await assertSucceeds(batch.commit());
  await assertFails(
    updateDoc(doc(database, "publications", "djen_36"), { taskId: "outra-tarefa" })
  );
});

await check("reprocessar a janela atualiza a publicação sem duplicar", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_4"), publicationDoc("4")));
  await assertSucceeds(
    setDoc(
      doc(database, "publications", "djen_4"),
      { cancelada: true, motivoCancelamento: "erro do cartório", syncedAt: serverTimestamp() },
      { merge: true }
    )
  );
});

await check("trocar a origem da publicação é recusado", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_5"), publicationDoc("5")));
  await assertFails(updateDoc(doc(database, "publications", "djen_5"), { externalId: "999" }));
});

await check("apagar de vez a publicação é recusado", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_6"), publicationDoc("6")));
  const batch = writeBatch(database);
  batch.delete(doc(database, "publications", "djen_6"));
  await assertFails(batch.commit());
});

await check("log da busca registra quem rodou", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(doc(database, "publicationSyncs", "sync-1"), {
      source: "DJEN",
      status: "ok",
      windowStart: "2026-08-11",
      windowEnd: "2026-08-18",
      lawyerCount: 1,
      found: 3,
      created: 3,
      updated: 0,
      error: null,
      runBy: "Operador",
      runById: UID,
      automatic: true,
      finishedAt: serverTimestamp(),
    })
  );
});

await check("log em nome de outro usuário é recusado", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(doc(database, "publicationSyncs", "sync-2"), {
      source: "DJEN",
      status: "ok",
      windowStart: "2026-08-11",
      windowEnd: "2026-08-18",
      lawyerCount: 1,
      found: 0,
      created: 0,
      updated: 0,
      error: null,
      runBy: "Outro",
      runById: "outro-uid",
      automatic: true,
      finishedAt: serverTimestamp(),
    })
  );
});

await check("log da busca é imutável", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(doc(database, "publicationSyncs", "sync-3"), {
      source: "DJEN",
      status: "ok",
      windowStart: "2026-08-11",
      windowEnd: "2026-08-18",
      lawyerCount: 1,
      found: 1,
      created: 1,
      updated: 0,
      error: null,
      runBy: "Operador",
      runById: UID,
      automatic: false,
      finishedAt: serverTimestamp(),
    })
  );
  await assertFails(updateDoc(doc(database, "publicationSyncs", "sync-3"), { created: 99 }));
});

await check("publicação legada sem linkStatus continua aceitando triagem", async () => {
  const database = await resetComAdmin();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    // Documento no formato anterior ao vínculo, como os já gravados em produção.
    await setDoc(doc(context.firestore(), "publications", "djen_700"), {
      source: "DJEN",
      externalId: "700",
      disponibilizacaoDate: "2026-08-14",
      lawyerIds: [],
      lawyerNames: [],
      triageStatus: "nova",
      deleted: false,
      createdAt: new Date(),
    });
  });
  await assertSucceeds(
    updateDoc(doc(database, "publications", "djen_700"), { triageStatus: "em_analise" })
  );
});

await check("publicação nasce vinculada quando o processo já foi decidido", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(
      doc(database, "publications", "djen_701"),
      publicationDoc("701", { linkStatus: "vinculada", processId: "processo-x" })
    )
  );
});

await check("estado de vínculo fora da lista é recusado", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(
      doc(database, "publications", "djen_702"),
      publicationDoc("702", { linkStatus: "arquivado" })
    )
  );
});

await check("vincular a publicação a um processo é aceito", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "publications", "djen_703"), publicationDoc("703")));
  await assertSucceeds(
    updateDoc(doc(database, "publications", "djen_703"), {
      linkStatus: "vinculada",
      processId: PROCESS_ID,
      processNumber: "1000000-00.2026.8.26.0348",
      clientIds: ["cliente-1"],
      clientNames: ["Fulano"],
      linkedAt: serverTimestamp(),
      linkedBy: "Operador",
    })
  );
});

await check("decisão de vínculo é gravada pelo número do processo", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(doc(database, "publicationProcessRules", "10000000020268260348"), {
      numeroProcessoDigits: "10000000020268260348",
      kind: "escritorio",
      processId: PROCESS_ID,
      processNumber: "1000000-00.2026.8.26.0348",
      clientIds: ["cliente-1"],
      clientNames: ["Fulano"],
      ownerUserId: null,
      ownerUserName: null,
      createdAt: serverTimestamp(),
      createdBy: "Operador",
      updatedAt: serverTimestamp(),
      updatedBy: "Operador",
    })
  );
});

await check("decisão com ID diferente do número é recusada", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(doc(database, "publicationProcessRules", "outro-id"), {
      numeroProcessoDigits: "10000000020268260348",
      kind: "escritorio",
      clientIds: [],
      clientNames: [],
    })
  );
});

await check("natureza de vínculo desconhecida é recusada", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(doc(database, "publicationProcessRules", "10000000020268260348"), {
      numeroProcessoDigits: "10000000020268260348",
      kind: "terceirizado",
      clientIds: [],
      clientNames: [],
    })
  );
});

await check("apagar de vez a decisão de vínculo é recusado", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(doc(database, "publicationProcessRules", "10000000020268260348"), {
      numeroProcessoDigits: "10000000020268260348",
      kind: "particular",
      clientIds: [],
      clientNames: [],
      ownerUserId: ADMIN_UID,
      ownerUserName: "Administradora",
    })
  );
  const batch = writeBatch(database);
  batch.delete(doc(database, "publicationProcessRules", "10000000020268260348"));
  await assertFails(batch.commit());
});

function partyDoc(overrides = {}) {
  return {
    name: "GSI Serviços Administrativos",
    searchTerm: "GSI SERVICOS ADMINISTRATIVOS",
    clientId: null,
    clientName: null,
    monitored: true,
    notes: "",
    deleted: false,
    ...overrides,
  };
}

await check("operador não cadastra parte monitorada", async () => {
  const database = await resetComAdmin();
  await assertFails(setDoc(doc(database, "monitoredParties", "parte-1"), partyDoc()));
});

await check("administrador cadastra parte monitorada", async () => {
  await resetComAdmin();
  await assertSucceeds(setDoc(doc(adminDatabase(), "monitoredParties", "parte-1"), partyDoc()));
});

await check("termo de busca curto demais é recusado", async () => {
  await resetComAdmin();
  await assertFails(
    setDoc(doc(adminDatabase(), "monitoredParties", "parte-2"), partyDoc({ searchTerm: "GSI" }))
  );
});

await check("operador lê as partes para filtrar publicações", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(adminDatabase(), "monitoredParties", "parte-1"), partyDoc()));
  await assertSucceeds(getDoc(doc(database, "monitoredParties", "parte-1")));
});

await check("apagar de vez a parte monitorada é recusado", async () => {
  await resetComAdmin();
  const database = adminDatabase();
  await assertSucceeds(setDoc(doc(database, "monitoredParties", "parte-3"), partyDoc()));
  const batch = writeBatch(database);
  batch.delete(doc(database, "monitoredParties", "parte-3"));
  await assertFails(batch.commit());
});

await check("publicação achada pela parte, sem advogado do escritório, é aceita", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(
      doc(database, "publications", "djen_800"),
      publicationDoc("800", {
        lawyerIds: [],
        lawyerNames: [],
        partyIds: ["parte-1"],
        partyNames: ["GSI Serviços Administrativos"],
      })
    )
  );
});

function processoDoc(overrides = {}) {
  return {
    processNumber: "2000000-00.2026.8.26.0348",
    clientIds: [],
    clientNames: [],
    actionType: "Procedimento Comum",
    status: "Ativo",
    polo: "Ativo",
    deleted: false,
    ...overrides,
  };
}

await check("processo particular exige o advogado dono", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(
      doc(database, "processes", "proc-part-1"),
      processoDoc({ ownership: "particular", ownerUserId: null })
    )
  );
});

await check("processo particular com dono é aceito", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(
      doc(database, "processes", "proc-part-2"),
      processoDoc({
        ownership: "particular",
        ownerUserId: ADMIN_UID,
        ownerUserName: "Administradora",
      })
    )
  );
});

await check("titularidade desconhecida é recusada", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(doc(database, "processes", "proc-part-3"), processoDoc({ ownership: "terceiro" }))
  );
});

await check("processo particular também pode ser arquivado", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(
      doc(database, "processes", "proc-part-4"),
      processoDoc({ ownership: "particular", ownerUserId: ADMIN_UID, ownerUserName: "Administradora" })
    )
  );
  await assertSucceeds(
    updateDoc(doc(database, "processes", "proc-part-4"), { status: "Arquivado" })
  );
});

await check("processo sem titularidade continua sendo aceito", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(setDoc(doc(database, "processes", "proc-legado"), processoDoc()));
});

await check("operador cria a operação particular do advogado", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(doc(database, "clientTypes", "tipo-part-1"), {
      name: "Particular — Administradora",
      color: "#64748b",
      order: 9,
      archived: false,
      privateOwnerUserId: ADMIN_UID,
      privateOwnerUserName: "Administradora",
      checklist: [],
      checklistGroups: [],
      caseFields: [],
    })
  );
});

await check("operador não cria operação comum do escritório", async () => {
  const database = await resetComAdmin();
  await assertFails(
    setDoc(doc(database, "clientTypes", "tipo-comum"), {
      name: "Barão de Mauá",
      color: "#123456",
      order: 1,
      archived: false,
      checklist: [],
      checklistGroups: [],
      caseFields: [],
    })
  );
});

await check("operador não troca o dono da operação particular", async () => {
  const database = await resetComAdmin();
  await assertSucceeds(
    setDoc(doc(database, "clientTypes", "tipo-part-2"), {
      name: "Particular — Administradora",
      color: "#64748b",
      order: 9,
      archived: false,
      privateOwnerUserId: ADMIN_UID,
      privateOwnerUserName: "Administradora",
      checklist: [],
      checklistGroups: [],
      caseFields: [],
    })
  );
  await assertFails(
    updateDoc(doc(database, "clientTypes", "tipo-part-2"), { privateOwnerUserId: UID })
  );
});

function financialAuditDoc(overrides = {}) {
  return {
    clientId: "cliente-1",
    entityType: "payment",
    entityId: "pagamento-1",
    agreementId: "acordo-1",
    action: "edit",
    previousData: {
      type: "Financeiro",
      clientId: "cliente-1",
      financialAgreementId: "acordo-1",
      amountCents: 25000,
      receiptMethod: "pix",
    },
    createdAt: serverTimestamp(),
    createdById: ADMIN_UID,
    createdBy: "Administradora",
    ...overrides,
  };
}

async function seedFinancialAuditPaymentSource() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "updates", "pagamento-1"), {
      type: "Financeiro",
      clientId: "cliente-1",
      financialAgreementId: "acordo-1",
      amountCents: 25000,
      receiptMethod: "pix",
    });
  });
}

async function seedFinancialAuditLog(id) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "financialAuditLogs", id),
      financialAuditDoc({ createdAt: new Date("2026-01-10T12:00:00Z") })
    );
  });
}

async function seedOpenFinancialAgreement() {
  const agreementDate = new Date("2026-01-10T12:00:00Z");
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, "clients", "cliente-financeiro"), {
      name: "Cliente Financeiro",
      code: "N0001",
      deleted: false,
    });
    await setDoc(doc(database, "financialAgreements", "acordo-pagamento"), {
      clientId: "cliente-financeiro",
      description: "Honorários contratuais",
      agreementDate,
      valueBasis: "custom",
      minimumWageMultiplier: null,
      baseMinimumWageRateId: null,
      baseMinimumWageCents: null,
      originalAmountCents: 10000,
      paymentPlan: "upfront",
      installmentCount: 1,
      installmentIds: ["acordo-pagamento_1"],
      regularInstallmentAmountCents: 10000,
      finalInstallmentAmountCents: 10000,
      receivedAmountCents: 0,
      activePaymentCount: 0,
      settledInstallmentCount: 0,
      nextOpenSequence: 1,
      lastPaymentId: null,
      customPaymentTerms: "",
      correctionPolicy: "none",
      note: "",
      settled: false,
      settledAt: null,
      settledByPaymentId: null,
      settledTargetCents: null,
      settledMinimumWageRateId: null,
      settledMinimumWageCents: null,
      createdAt: agreementDate,
      createdById: ADMIN_UID,
      createdBy: "Administradora",
      updatedAt: agreementDate,
      updatedById: ADMIN_UID,
      updatedBy: "Administradora",
      deleted: false,
      deletedAt: null,
      deletedById: null,
      deletedBy: null,
    });
    await setDoc(doc(database, "financialInstallments", "acordo-pagamento_1"), {
      agreementId: "acordo-pagamento",
      clientId: "cliente-financeiro",
      sequence: 1,
      installmentCount: 1,
      dueDate: agreementDate,
      baseAmountCents: 10000,
      paidAmountCents: 0,
      paymentIds: [],
      settled: false,
      settledAt: null,
      settledByPaymentId: null,
      settlementKind: null,
      createdAt: agreementDate,
      createdById: ADMIN_UID,
      createdBy: "Administradora",
      updatedAt: agreementDate,
      updatedById: ADMIN_UID,
      updatedBy: "Administradora",
      deleted: false,
      deletedAt: null,
      deletedById: null,
      deletedBy: null,
    });
  });
}

function registerPaymentBatch(database) {
  const paidAt = new Date("2026-02-10T12:00:00Z");
  const paymentId = "pagamento-regra";
  const batch = writeBatch(database);
  batch.set(doc(database, "updates", paymentId), {
    type: "Financeiro",
    financialAgreementId: "acordo-pagamento",
    financialInstallmentId: "acordo-pagamento_1",
    clientId: "cliente-financeiro",
    clientName: "Cliente Financeiro",
    clientCode: "N0001",
    description: "Pagamento recebido: R$ 100,00",
    amountCents: 10000,
    paidAt,
    updateDate: paidAt,
    receiptMethod: "cash",
    receiptMethodOther: "",
    receiptAccountId: "",
    receiptAccountName: "",
    financialNote: "",
    paymentKind: "full",
    settlesInstallment: true,
    closesAgreement: true,
    minimumWageRateIdAtPayment: "",
    minimumWageCentsAtPayment: null,
    requiredInstallmentAmountCents: 10000,
    agreementTargetCentsAtPayment: 10000,
    previousAgreementPaymentId: null,
    author: "Administradora",
    authorId: ADMIN_UID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: "Administradora",
    deleted: false,
    deletedAt: null,
    deletedBy: null,
  });
  batch.update(doc(database, "financialInstallments", "acordo-pagamento_1"), {
    paidAmountCents: 10000,
    paymentIds: [paymentId],
    settled: true,
    settledAt: paidAt,
    settledByPaymentId: paymentId,
    settlementKind: "full",
    updatedAt: serverTimestamp(),
    updatedById: ADMIN_UID,
    updatedBy: "Administradora",
  });
  batch.update(doc(database, "financialAgreements", "acordo-pagamento"), {
    receivedAmountCents: 10000,
    activePaymentCount: 1,
    settledInstallmentCount: 1,
    nextOpenSequence: 1,
    lastPaymentId: paymentId,
    settled: true,
    settledAt: paidAt,
    settledByPaymentId: paymentId,
    settledTargetCents: 10000,
    settledMinimumWageRateId: null,
    settledMinimumWageCents: null,
    updatedAt: serverTimestamp(),
    updatedById: ADMIN_UID,
    updatedBy: "Administradora",
  });
  return batch.commit();
}

await check("administrador registra pagamento pelo fluxo real do cliente", async () => {
  await resetComAdmin();
  await seedOpenFinancialAgreement();
  await assertSucceeds(registerPaymentBatch(adminDatabase()));
});

await check("acordo já auditado continua aceitando novo pagamento", async () => {
  await resetComAdmin();
  await seedOpenFinancialAgreement();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "financialAgreements", "acordo-pagamento"), {
      financialAuditId: "auditoria-anterior",
    });
  });
  await assertSucceeds(registerPaymentBatch(adminDatabase()));
});

await check("restauração de pagamento registra usuário e data", async () => {
  await resetComAdmin();
  await seedOpenFinancialAgreement();
  const database = adminDatabase();
  await assertSucceeds(registerPaymentBatch(database));

  const deleteBatch = writeBatch(database);
  deleteBatch.update(doc(database, "updates", "pagamento-regra"), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedById: ADMIN_UID,
    deletedBy: "Administradora",
    updatedAt: serverTimestamp(),
    updatedBy: "Administradora",
  });
  deleteBatch.update(doc(database, "financialInstallments", "acordo-pagamento_1"), {
    paidAmountCents: 0,
    paymentIds: [],
    settled: false,
    settledAt: null,
    settledByPaymentId: null,
    settlementKind: null,
    updatedAt: serverTimestamp(),
    updatedById: ADMIN_UID,
    updatedBy: "Administradora",
  });
  deleteBatch.update(doc(database, "financialAgreements", "acordo-pagamento"), {
    receivedAmountCents: 0,
    activePaymentCount: 0,
    settledInstallmentCount: 0,
    nextOpenSequence: 1,
    lastPaymentId: null,
    settled: false,
    settledAt: null,
    settledByPaymentId: null,
    settledTargetCents: null,
    settledMinimumWageRateId: null,
    settledMinimumWageCents: null,
    updatedAt: serverTimestamp(),
    updatedById: ADMIN_UID,
    updatedBy: "Administradora",
  });
  await assertSucceeds(deleteBatch.commit());

  const paidAt = new Date("2026-02-10T12:00:00Z");
  const restoreBatch = writeBatch(database);
  restoreBatch.update(doc(database, "updates", "pagamento-regra"), {
    deleted: false,
    deletedAt: null,
    deletedById: null,
    deletedBy: null,
    restoredAt: serverTimestamp(),
    restoredById: ADMIN_UID,
    restoredBy: "Administradora",
    updatedAt: serverTimestamp(),
    updatedBy: "Administradora",
  });
  restoreBatch.update(doc(database, "financialInstallments", "acordo-pagamento_1"), {
    paidAmountCents: 10000,
    paymentIds: ["pagamento-regra"],
    settled: true,
    settledAt: paidAt,
    settledByPaymentId: "pagamento-regra",
    settlementKind: "full",
    updatedAt: serverTimestamp(),
    updatedById: ADMIN_UID,
    updatedBy: "Administradora",
  });
  restoreBatch.update(doc(database, "financialAgreements", "acordo-pagamento"), {
    receivedAmountCents: 10000,
    activePaymentCount: 1,
    settledInstallmentCount: 1,
    nextOpenSequence: 1,
    lastPaymentId: "pagamento-regra",
    settled: true,
    settledAt: paidAt,
    settledByPaymentId: "pagamento-regra",
    settledTargetCents: 10000,
    settledMinimumWageRateId: null,
    settledMinimumWageCents: null,
    updatedAt: serverTimestamp(),
    updatedById: ADMIN_UID,
    updatedBy: "Administradora",
  });
  await assertSucceeds(restoreBatch.commit());
  const restored = await getDoc(doc(database, "updates", "pagamento-regra"));
  if (restored.data().restoredBy !== "Administradora" || !restored.data().restoredAt) {
    throw new Error("a autoria da restauração não foi preservada");
  }
});

await check("administrador lê auditoria financeira", async () => {
  await resetComAdmin();
  await seedFinancialAuditLog("auditoria-1");
  const database = adminDatabase();
  await assertSucceeds(getDoc(doc(database, "financialAuditLogs", "auditoria-1")));
});

await check("operador não lê auditoria financeira", async () => {
  const operatorDatabase = await resetComAdmin();
  await seedFinancialAuditLog("auditoria-2");
  await assertFails(getDoc(doc(operatorDatabase, "financialAuditLogs", "auditoria-2")));
});

await check("auditoria financeira é imutável", async () => {
  await resetComAdmin();
  await seedFinancialAuditLog("auditoria-3");
  const database = adminDatabase();
  await assertFails(
    updateDoc(doc(database, "financialAuditLogs", "auditoria-3"), {
      previousData: { amountCents: 1 },
    })
  );
});

await check("auditoria financeira isolada é recusada", async () => {
  const database = await resetComAdmin();
  await seedFinancialAuditPaymentSource();
  await assertFails(
    setDoc(
      doc(database, "financialAuditLogs", "auditoria-isolada"),
      financialAuditDoc({ createdById: UID, createdBy: "Operador" })
    )
  );
});

await check("operador não cria auditoria falsa de pagamento", async () => {
  const database = await resetComAdmin();
  await seedFinancialAuditPaymentSource();
  await assertFails(
    setDoc(
      doc(database, "financialAuditLogs", "auditoria-4"),
      financialAuditDoc({
        previousData: { amountCents: 1, receiptMethod: "pix" },
        createdById: UID,
        createdBy: "Operador",
      })
    )
  );
});

await check("operador edita pagamento com recálculo e auditoria", async () => {
  const database = await resetComAdmin();
  await seedOpenFinancialAgreement();
  await assertSucceeds(registerPaymentBatch(adminDatabase()));
  const paymentSnapshot = await getDoc(doc(database, "updates", "pagamento-regra"));
  const paidAt = paymentSnapshot.data().paidAt;
  const auditId = "auditoria-edicao-operador";
  const batch = writeBatch(database);
  batch.set(doc(database, "financialAuditLogs", auditId), {
    clientId: "cliente-financeiro",
    entityType: "payment",
    entityId: "pagamento-regra",
    agreementId: "acordo-pagamento",
    action: "edit",
    previousData: paymentSnapshot.data(),
    createdAt: serverTimestamp(),
    createdById: UID,
    createdBy: "Operador",
  });
  batch.update(doc(database, "updates", "pagamento-regra"), {
    description: "Pagamento recebido: R$ 90,00",
    amountCents: 9000,
    paidAt,
    updateDate: paidAt,
    receiptMethod: "cash",
    receiptMethodOther: "",
    receiptAccountId: "",
    receiptAccountName: "",
    financialNote: "",
    paymentKind: "partial",
    settlesInstallment: false,
    closesAgreement: false,
    requiredInstallmentAmountCents: 10000,
    agreementTargetCentsAtPayment: 10000,
    previousAgreementPaymentId: null,
    updatedAt: serverTimestamp(),
    updatedBy: "Operador",
  });
  batch.update(doc(database, "financialInstallments", "acordo-pagamento_1"), {
    paidAmountCents: 9000,
    paymentIds: ["pagamento-regra"],
    settled: false,
    settledAt: null,
    settledByPaymentId: null,
    settlementKind: null,
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
  });
  batch.update(doc(database, "financialAgreements", "acordo-pagamento"), {
    financialAuditId: auditId,
    receivedAmountCents: 9000,
    activePaymentCount: 1,
    settledInstallmentCount: 0,
    nextOpenSequence: 1,
    lastPaymentId: "pagamento-regra",
    settled: false,
    settledAt: null,
    settledByPaymentId: null,
    settledTargetCents: null,
    settledMinimumWageRateId: null,
    settledMinimumWageCents: null,
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
  });
  await assertSucceeds(batch.commit());
});

await check("auditoria de acordo não autoriza alterar o valor de pagamento", async () => {
  const database = await resetComAdmin();
  await seedOpenFinancialAgreement();
  await assertSucceeds(registerPaymentBatch(adminDatabase()));
  const agreementSnapshot = await getDoc(doc(database, "financialAgreements", "acordo-pagamento"));
  const installmentSnapshot = await getDoc(doc(database, "financialInstallments", "acordo-pagamento_1"));
  const auditId = "auditoria-acordo-nao-edita-pagamento";
  const batch = writeBatch(database);
  batch.set(doc(database, "financialAuditLogs", auditId), {
    clientId: "cliente-financeiro",
    entityType: "agreement",
    entityId: "acordo-pagamento",
    agreementId: "acordo-pagamento",
    action: "edit",
    previousData: {
      agreement: agreementSnapshot.data(),
      installments: [installmentSnapshot.data()],
    },
    createdAt: serverTimestamp(),
    createdById: UID,
    createdBy: "Operador",
  });
  batch.update(doc(database, "financialAgreements", "acordo-pagamento"), {
    financialAuditId: auditId,
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
  });
  batch.update(doc(database, "updates", "pagamento-regra"), {
    amountCents: 9000,
    description: "Pagamento recebido: R$ 90,00",
    updatedAt: serverTimestamp(),
    updatedBy: "Operador",
  });
  await assertFails(batch.commit());
});

await check("operador altera valor de acordo parcelado e preserva crédito", async () => {
  await resetComAdmin();
  let previousAgreement;
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    previousAgreement = {
      clientId: "cliente-1",
      description: "Honorários",
      agreementDate: new Date("2026-01-10T12:00:00Z"),
      valueBasis: "custom",
      minimumWageMultiplier: null,
      baseMinimumWageRateId: null,
      baseMinimumWageCents: null,
      originalAmountCents: 20000,
      paymentPlan: "installments",
      installmentCount: 2,
      installmentIds: ["acordo-credito_1", "acordo-credito_2"],
      regularInstallmentAmountCents: 10000,
      finalInstallmentAmountCents: 10000,
      receivedAmountCents: 15000,
      activePaymentCount: 1,
      settledInstallmentCount: 0,
      nextOpenSequence: 2,
      lastPaymentId: "pagamento-credito",
      customPaymentTerms: "",
      correctionPolicy: "none",
      note: "",
      settled: false,
      settledAt: null,
      settledByPaymentId: null,
      settledTargetCents: null,
      settledMinimumWageRateId: null,
      settledMinimumWageCents: null,
      createdAt: new Date("2026-01-10T12:00:00Z"),
      createdById: ADMIN_UID,
      createdBy: "Administradora",
      updatedAt: new Date("2026-01-10T12:00:00Z"),
      updatedById: ADMIN_UID,
      updatedBy: "Administradora",
      deleted: false,
      deletedAt: null,
      deletedById: null,
      deletedBy: null,
    };
    await setDoc(doc(context.firestore(), "financialAgreements", "acordo-credito"), previousAgreement);
  });
  const database = testEnvironment.authenticatedContext(UID, { email: "operador@example.com" }).firestore();
  const batch = writeBatch(database);
  batch.set(
    doc(database, "financialAuditLogs", "auditoria-credito"),
    financialAuditDoc({
      entityType: "agreement",
      entityId: "acordo-credito",
      agreementId: "acordo-credito",
      previousData: {
        agreement: previousAgreement,
        installments: [{ sequence: 1 }, { sequence: 2 }],
      },
      createdById: UID,
      createdBy: "Operador",
    })
  );
  batch.update(doc(database, "financialAgreements", "acordo-credito"), {
    originalAmountCents: 10000,
    regularInstallmentAmountCents: 5000,
    finalInstallmentAmountCents: 5000,
    settled: true,
    settledAt: new Date("2026-02-10T12:00:00Z"),
    settledByPaymentId: "pagamento-credito",
    settledTargetCents: 10000,
    settledInstallmentCount: 2,
    financialAuditId: "auditoria-credito",
    updatedAt: serverTimestamp(),
    updatedById: UID,
    updatedBy: "Operador",
  });
  await assertSucceeds(batch.commit());
  const result = await getDoc(doc(database, "financialAgreements", "acordo-credito"));
  if (result.data().receivedAmountCents - result.data().originalAmountCents !== 5000) {
    throw new Error("o crédito remanescente não foi preservado");
  }
});

await testEnvironment.cleanup();

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
