

"use server";

import { revalidatePath } from "next/cache";
import type { Client, Process, Update, User } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, getDoc, doc, query, orderBy, serverTimestamp, updateDoc, writeBatch, collectionGroup, where, arrayUnion, deleteDoc } from "firebase/firestore";
import { addClientUpdate } from "./[id]/actions";

type NewClient = Omit<Client, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'processIds' | 'deleted' | 'deletedAt' | 'deletedBy'>;
type UpdatableClient = Partial<Omit<Client, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>>;

/**
 * Retrieves all clients from the database, including soft-deleted ones.
 * Filtering of soft-deleted clients should happen on the client-side.
 * @returns A promise that resolves to an array of clients.
 */
export async function getClients(): Promise<Client[]> {
  const clientsCol = collection(db, "clients");
  const q = query(clientsCol, orderBy("createdAt", "desc"));
  const clientSnapshot = await getDocs(q);
  const clientList = clientSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
      deletedAt: data.deletedAt?.toDate?.().toISOString() || null,
    } as Client;
  });
  return clientList;
}

/**
 * Retrieves a single client by their ID from the database.
 * @param id The ID of the client to retrieve.
 * @returns A promise that resolves to the client object or null if not found.
 */
export async function getClientById(id: string): Promise<Client | null> {
  try {
    const clientDocRef = doc(db, "clients", id);
    const clientSnap = await getDoc(clientDocRef);

    if (clientSnap.exists()) {
      const data = clientSnap.data();
      return {
        id: clientSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
        deletedAt: data.deletedAt?.toDate?.().toISOString() || null,
      } as Client;
    } else {
      console.warn(`Cliente com ID "${id}" não encontrado.`);
      return null;
    }
  } catch (error) {
    console.error("Erro ao buscar cliente por ID: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao buscar cliente: ${error.message}`);
    }
    throw new Error("Falha ao buscar cliente no banco de dados.");
  }
}

export class DuplicateClientError extends Error {
    constructor(message: string, public clientId: string) {
        super(message);
        this.name = "DuplicateClientError";
    }
}

export class ExistingClientNameError extends Error {
    constructor(message: string, public existingClients: Client[]) {
        super(message);
        this.name = "ExistingClientNameError";
    }
}

/**
 * Adds a new client to the database.
 * Checks for duplicate CPF/CNPJ and duplicate names.
 * @param clientData The data for the new client.
 * @param author The name of the user adding the client.
 * @param force A boolean to bypass the name check if the user confirms.
 * @returns A promise that resolves to the new client's ID.
 */
export async function addClient(clientData: NewClient, author: string, force: boolean = false): Promise<{id: string}> {
  try {
    const clientsCol = collection(db, "clients");

    // Hard check for unique CPF/CNPJ
    if (clientData.cpfCnpj) {
        const qCpf = query(clientsCol, where("cpfCnpj", "==", clientData.cpfCnpj));
        const cpfSnapshot = await getDocs(qCpf);
        if (!cpfSnapshot.empty) {
            const existingClient = cpfSnapshot.docs[0];
            throw new DuplicateClientError(
                `Cliente já cadastrado com este CPF/CNPJ.`,
                existingClient.id
            );
        }
    }

    // Soft check for existing name, can be bypassed with `force`
    if (!force) {
        const qName = query(clientsCol, where("name", "==", clientData.name));
        const nameSnapshot = await getDocs(qName);
        if (!nameSnapshot.empty) {
            const existingClients = nameSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
            throw new ExistingClientNameError(
                "Já existe(m) cliente(s) com este nome.",
                existingClients
            );
        }
    }

    const docRef = await addDoc(clientsCol, {
      ...clientData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: author,
      updatedBy: author,
      processIds: [],
      deleted: false,
      deletedAt: null,
      deletedBy: null,
    });

    revalidatePath("/dashboard/clients");
    return { id: docRef.id };
  } catch (error) {
    console.error("Error adding client: ", error);
    if (error instanceof DuplicateClientError || error instanceof ExistingClientNameError) {
        throw error; // Re-throw custom errors to be handled by the frontend
    }
    if (error instanceof Error) {
        throw new Error(`Falha ao adicionar cliente: ${error.message}`);
    }
    throw new Error("Falha ao adicionar cliente ao banco de dados.");
  }
}


/**
 * Updates an existing client in the database.
 * @param id The ID of the client to update.
 * @param clientData The data to update.
 * @param author The name of the user updating the client.
 * @returns A promise that resolves when the client is updated.
 */
export async function updateClient(id: string, clientData: UpdatableClient, author: string): Promise<void> {
  try {
    const clientDocRef = doc(db, "clients", id);
    await updateDoc(clientDocRef, {
      ...clientData,
      updatedAt: serverTimestamp(),
      updatedBy: author,
    });

    revalidatePath(`/dashboard/clients`);
    revalidatePath(`/dashboard/clients/${id}`);
    revalidatePath(`/dashboard/clients/${id}/edit`);

  } catch (error) {
    console.error("Error updating client: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao atualizar cliente: ${error.message}`);
    }
    throw new Error("Falha ao atualizar cliente no banco de dados.");
  }
}

/**
 * Soft deletes a client by marking them as 'deleted'.
 * @param clientId The ID of the client to soft delete.
 * @param authorName The name of the user performing the deletion.
 */
export async function softDeleteClient(clientId: string, authorName: string): Promise<void> {
    const clientRef = doc(db, "clients", clientId);
    try {
        await updateDoc(clientRef, {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: authorName,
        });
        revalidatePath('/dashboard/clients');
        revalidatePath(`/dashboard/clients/${clientId}`);
    } catch (error) {
        console.error("Error soft deleting client: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir cliente: ${error.message}`);
        }
        throw new Error("Falha ao excluir cliente no banco de dados.");
    }
}

/**
 * Restores a soft-deleted client.
 * @param clientId The ID of the client to restore.
 */
export async function restoreClient(clientId: string): Promise<void> {
    const clientRef = doc(db, "clients", clientId);
    try {
        await updateDoc(clientRef, {
            deleted: false,
            deletedAt: null,
            deletedBy: null,
        });
        revalidatePath('/dashboard/clients');
        revalidatePath(`/dashboard/clients/${clientId}`);
    } catch (error) {
        console.error("Error restoring client: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao restaurar cliente: ${error.message}`);
        }
        throw new Error("Falha ao restaurar cliente no banco de dados.");
    }
}

/**
 * Permanently deletes a client and all their associated data. This action is irreversible.
 * Only intended for admin use.
 * @param clientId The ID of the client to delete permanently.
 */
export async function permanentlyDeleteClient(clientId: string): Promise<void> {
    const clientRef = doc(db, "clients", clientId);
    const clientSnap = await getDoc(clientRef);
    if (!clientSnap.exists()) {
        throw new Error("Cliente não encontrado.");
    }
    const clientData = clientSnap.data() as Client;
    const batch = writeBatch(db);

    try {
        // 1. Delete all updates associated with this client
        const updatesQuery = query(collection(db, "updates"), where("clientId", "==", clientId));
        const updatesSnapshot = await getDocs(updatesQuery);
        updatesSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        // 2. Handle associated processes
        if (clientData.processIds && clientData.processIds.length > 0) {
            for (const processId of clientData.processIds) {
                const processRef = doc(db, "processes", processId);
                const processSnap = await getDoc(processRef);

                if (processSnap.exists()) {
                    const processData = processSnap.data() as Process;

                    if (processData.clientIds.length === 1 && processData.clientIds[0] === clientId) {
                        const processUpdatesQuery = query(collection(db, 'updates'), where('processId', '==', processId));
                        const processUpdatesSnap = await getDocs(processUpdatesQuery);
                        processUpdatesSnap.forEach(updateDoc => {
                            batch.delete(updateDoc.ref);
                        });
                        batch.delete(processRef);
                    } else {
                        const updatedClientIds = processData.clientIds.filter(id => id !== clientId);
                        const updatedClientNames = processData.clientNames.filter(name => name !== clientData.name);

                        const updateData: any = {
                             clientIds: updatedClientIds,
                             clientNames: updatedClientNames
                        };

                        if (processData.mainClientId === clientId) {
                            updateData.mainClientId = updatedClientIds[0] || '';
                        }

                        batch.update(processRef, updateData);
                    }
                }
            }
        }

        // 3. Delete the client document itself
        batch.delete(clientRef);

        // 4. Commit the batch
        await batch.commit();

        revalidatePath('/dashboard/clients');
        revalidatePath('/dashboard/processes');
        revalidatePath('/dashboard/tasks');

    } catch (error) {
        console.error("Error permanently deleting client: ", error);
        if (error instanceof Error) {
            if (error.message.includes("requires an index")) {
                throw new Error("Falha ao excluir cliente: O banco de dados requer um índice que não foi criado. Por favor, crie o índice e tente novamente.");
            }
            throw new Error(`Falha ao excluir cliente: ${error.message}`);
        }
        throw new Error("Falha ao excluir cliente no banco de dados.");
    }
}
