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
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";

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

await check("alterar um marco já gravado é recusado", async () => {
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

await testEnvironment.cleanup();

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
