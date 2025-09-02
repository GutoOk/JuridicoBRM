
"use server";

import { revalidatePath } from "next/cache";
import type { Process, Client } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, getDoc, query, orderBy, serverTimestamp, updateDoc, writeBatch, arrayRemove, collectionGroup, where, arrayUnion, deleteDoc } from "firebase/firestore";

type NewProcess = Omit<Process, 'id' | 'createdAt' | 'updatedAt' | 'lastUpdate'>;
type UpdatableProcess = Partial<Omit<Process, 'id' | 'createdAt' | 'updatedAt' | 'lastUpdate'>> & {
    clientNames?: string[];
};

/**
 * Retrieves all processes from the database.
 * @returns A promise that resolves to an array of processes.
 */
export async function getProcesses(): Promise<Process[]> {
  const processesCol = collection(db, "processes");
  const q = query(processesCol, orderBy("createdAt", "desc"));
  const processSnapshot = await getDocs(q);
  const processList = processSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      // Convert Firestore Timestamps to ISO strings if they exist
      createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
      lastUpdate: data.lastUpdate?.toDate?.().toISOString() || new Date().toISOString(),
       deletedAt: data.deletedAt?.toDate?.()?.toISOString() || null,
    } as Process;
  });
  return processList;
}

/**
 * Retrieves a single process by its ID from the database.
 * @param id The ID of the process to retrieve.
 * @returns A promise that resolves to the process object or null if not found.
 */
export async function getProcessById(id: string): Promise<Process | null> {
  try {
    const processDocRef = doc(db, "processes", id);
    const processSnap = await getDoc(processDocRef);

    if (processSnap.exists()) {
      const data = processSnap.data();
      return {
        id: processSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
        lastUpdate: data.lastUpdate?.toDate?.().toISOString() || new Date().toISOString(),
      } as Process;
    } else {
      console.warn(`Processo com ID "${id}" não encontrado.`);
      return null;
    }
  } catch (error) {
    console.error("Erro ao buscar processo por ID: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao buscar processo: ${error.message}`);
    }
    throw new Error("Falha ao buscar processo no banco de dados.");
  }
}


/**
 * Adds a new process to the database.
 * @param processData The data for the new process.
 * @returns A promise that resolves when the process is added.
 */
export async function addProcess(processData: NewProcess): Promise<{ id: string }> {
  try {
    const batch = writeBatch(db);

    // 1. Create the new process document
    const processCol = collection(db, "processes");
    const processDocRef = doc(processCol); // Create a new doc ref with a unique ID
    
    batch.set(processDocRef, {
      ...processData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastUpdate: serverTimestamp(),
      deleted: false,
      deletedAt: null,
      deletedBy: null,
    });

    // 2. Update each selected client to link them to the new process
    for (const clientId of processData.clientIds) {
        const clientDocRef = doc(db, "clients", clientId);
        batch.update(clientDocRef, {
            processIds: arrayUnion(processDocRef.id)
        });
    }

    // 3. Commit all the writes at once
    await batch.commit();

    revalidatePath("/dashboard/processes");
    processData.clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));
    
    return { id: processDocRef.id };

  } catch (error) {
    console.error("Error adding process: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao adicionar processo: ${error.message}`);
    }
    throw new Error("Falha ao adicionar processo ao banco de dados.");
  }
}

/**
 * Updates an existing process in the database.
 * @param id The ID of the process to update.
 * @param processData The data to update.
 * @returns A promise that resolves when the process is updated.
 */
export async function updateProcess(id: string, processData: UpdatableProcess): Promise<void> {
  try {
    const processDocRef = doc(db, "processes", id);
    const dataToUpdate = { ...processData };

    // Ensure mainClientId is valid or reset it
    if (dataToUpdate.clientIds && !dataToUpdate.clientIds.includes(dataToUpdate.mainClientId || '')) {
      dataToUpdate.mainClientId = dataToUpdate.clientIds[0] || '';
    }
    
    await updateDoc(processDocRef, {
      ...dataToUpdate,
      updatedAt: serverTimestamp(),
      lastUpdate: serverTimestamp(), // Also update lastUpdate on any change
    });

    revalidatePath(`/dashboard/processes`);
    revalidatePath(`/dashboard/processes/${id}`);
    revalidatePath(`/dashboard/processes/${id}/edit`);

  } catch (error) {
    console.error("Error updating process: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao atualizar processo: ${error.message}`);
    }
    throw new Error("Falha ao atualizar processo no banco de dados.");
  }
}

/**
 * Updates only the notes for a specific process.
 * @param processId The ID of the process to update.
 * @param notes The new notes string.
 */
export async function updateProcessNotes(processId: string, notes: string): Promise<void> {
    try {
        const processDocRef = doc(db, "processes", processId);
        await updateDoc(processDocRef, {
            notes: notes,
            updatedAt: serverTimestamp()
        });
        revalidatePath(`/dashboard/processes/${processId}`);
    } catch (error) {
        console.error("Error updating process notes: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao atualizar observações do processo: ${error.message}`);
        }
        throw new Error("Falha ao atualizar observações do processo no banco de dados.");
    }
}


/**
 * Soft deletes a process by marking it as 'deleted'.
 * @param processId The ID of the process to soft delete.
 * @param authorName The name of the user performing the deletion.
 */
export async function softDeleteProcess(processId: string, authorName: string): Promise<void> {
    const processRef = doc(db, "processes", processId);
    try {
        await updateDoc(processRef, {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: authorName,
        });
        revalidatePath('/dashboard/processes');
        const processSnap = await getDoc(processRef);
        const processData = processSnap.data() as Process;
        if (processData.clientIds) {
            processData.clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));
        }
    } catch (error) {
        console.error("Error soft deleting process: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir processo: ${error.message}`);
        }
        throw new Error("Falha ao excluir processo no banco de dados.");
    }
}

/**
 * Restores a soft-deleted process.
 * @param processId The ID of the process to restore.
 */
export async function restoreProcess(processId: string): Promise<void> {
    const processRef = doc(db, "processes", processId);
    try {
        await updateDoc(processRef, {
            deleted: false,
            deletedAt: null,
            deletedBy: null,
        });
        revalidatePath('/dashboard/processes');
         const processSnap = await getDoc(processRef);
        const processData = processSnap.data() as Process;
        if (processData.clientIds) {
            processData.clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));
        }
    } catch (error) {
        console.error("Error restoring process: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao restaurar processo: ${error.message}`);
        }
        throw new Error("Falha ao restaurar processo no banco de dados.");
    }
}


/**
 * Permanently deletes a process and all its associated data. Restricted to admin user.
 * @param processId The ID of the process to delete.
 * @param authorName The name of the user attempting deletion.
 */
export async function permanentlyDeleteProcess(processId: string, authorName: string): Promise<void> {
    if (authorName !== "Áttila") {
        throw new Error("Apenas o usuário 'Áttila' pode excluir processos permanentemente.");
    }
    
    const batch = writeBatch(db);
    const processRef = doc(db, "processes", processId);

    try {
        const processSnap = await getDoc(processRef);
        if (!processSnap.exists()) {
            throw new Error("Processo não encontrado.");
        }
        const processData = processSnap.data() as Process;

        // 1. Delete all updates related to this process
        const updatesQuery = query(collection(db, 'updates'), where('processId', '==', processId));
        const updatesSnap = await getDocs(updatesQuery);
        updatesSnap.forEach(updateDoc => {
            batch.delete(updateDoc.ref);
        });

        // 2. Unlink the process from all associated clients
        if (processData.clientIds && processData.clientIds.length > 0) {
            for (const clientId of processData.clientIds) {
                const clientRef = doc(db, "clients", clientId);
                const clientSnap = await getDoc(clientRef);
                if (clientSnap.exists()) { // Check if client exists before updating
                   batch.update(clientRef, { processIds: arrayRemove(processId) });
                }
            }
        }
        
        // 3. Delete the process document itself
        batch.delete(processRef);

        // 4. Commit the batch
        await batch.commit();

        revalidatePath('/dashboard/processes');
        revalidatePath('/dashboard/tasks');
        if (processData.clientIds && processData.clientIds.length > 0) {
            processData.clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));
        }
        
    } catch (error: any) {
        console.error("Error permanently deleting process: ", error);
        if (error.message && error.message.includes("requires an index")) {
            throw new Error(`Falha ao excluir processo: O Firestore requer um índice para esta consulta. Por favor, crie o índice e tente novamente.`);
        }
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir processo: ${error.message}`);
        }
        throw new Error("Falha ao excluir processo no banco de dados.");
    }
}
