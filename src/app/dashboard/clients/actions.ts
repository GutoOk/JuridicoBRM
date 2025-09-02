
"use server";

import { revalidatePath } from "next/cache";
import type { Client, Process, Update } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, getDoc, doc, query, orderBy, serverTimestamp, updateDoc, writeBatch, collectionGroup, where, arrayUnion } from "firebase/firestore";
import { addClientUpdate } from "./[id]/actions";

type NewClient = Omit<Client, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'processIds'>;
type UpdatableClient = Partial<Omit<Client, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>>;

/**
 * Retrieves all clients from the database.
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
      // Convert Firestore Timestamps to ISO strings if they exist
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
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

/**
 * Adds a new client to the database.
 * @param clientData The data for the new client.
 * @param author The name of the user adding the client.
 * @returns A promise that resolves when the client is added.
 */
export async function addClient(clientData: NewClient, author: string): Promise<{id: string}> {
  try {
    const clientsCol = collection(db, "clients");
    const docRef = await addDoc(clientsCol, {
      ...clientData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: author,
      updatedBy: author,
      processIds: [],
    });

    // Revalidate the clients page to show the new client
    revalidatePath("/dashboard/clients");
    return { id: docRef.id };
  } catch (error) {
    console.error("Error adding client: ", error);
    // Re-throw the error with a more descriptive message
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
 * Deletes a client and all their associated data if the user is Áttila.
 * Otherwise, creates a task for Áttila to delete the client.
 * @param clientId The ID of the client to delete.
 * @param authorName The name of the user requesting the deletion.
 */
export async function deleteClient(clientId: string, authorName: string): Promise<void> {
    const clientRef = doc(db, "clients", clientId);
    const clientSnap = await getDoc(clientRef);
    if (!clientSnap.exists()) {
        throw new Error("Cliente não encontrado.");
    }
    const clientData = clientSnap.data() as Client;

    if (authorName !== "Áttila") {
         try {
            const task: Partial<Update> = {
                type: 'Tarefa',
                description: `Excluir o cliente: ${clientData.name}`,
                author: authorName,
                responsible: 'Áttila',
                priority: 'Alta',
                clientId: clientId, // Link task to client for context
            };
            await addClientUpdate(task as any); // Re-using addClientUpdate to create a task
            revalidatePath('/dashboard/tasks');
            // We can also revalidate the client page to show the new task in the timeline
            revalidatePath(`/dashboard/clients/${clientId}`);
        } catch (taskError) {
            console.error("Error creating deletion task: ", taskError);
            if (taskError instanceof Error) {
                throw new Error(`Falha ao criar tarefa de exclusão: ${taskError.message}`);
            }
            throw new Error("Falha ao criar tarefa de exclusão no banco de dados.");
        }
        return;
    }

    // --- Logic for Áttila (actual deletion) ---
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
                    
                    // If the client is the only one in the process, delete the process and its updates
                    if (processData.clientIds.length === 1 && processData.clientIds[0] === clientId) {
                        const processUpdatesQuery = query(collection(db, 'updates'), where('processId', '==', processId));
                        const processUpdatesSnap = await getDocs(processUpdatesQuery);
                        processUpdatesSnap.forEach(updateDoc => {
                            batch.delete(updateDoc.ref);
                        });
                        batch.delete(processRef);
                    } else {
                        // Otherwise, just remove the client from the process
                        const updatedClientIds = processData.clientIds.filter(id => id !== clientId);
                        const updatedClientNames = processData.clientNames.filter(name => name !== clientData.name);
                        
                        const updateData: any = {
                             clientIds: updatedClientIds,
                             clientNames: updatedClientNames
                        };

                        // If the main client was the one being deleted, assign a new main client
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
        console.error("Error deleting client: ", error);
        if (error instanceof Error) {
            if (error.message.includes("requires an index")) {
                throw new Error("Falha ao excluir cliente: O banco de dados requer um índice que não foi criado. Por favor, crie o índice e tente novamente.");
            }
            throw new Error(`Falha ao excluir cliente: ${error.message}`);
        }
        throw new Error("Falha ao excluir cliente no banco de dados.");
    }
}
