

"use server";

import { revalidatePath } from "next/cache";
import type { Update, Process } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp, Timestamp, getDoc, where } from "firebase/firestore";

type NewClientUpdate = Omit<Update, 'id' | 'createdAt'>;
// Allow serverTimestamp for date fields during updates
type UpdatableClientUpdate = Omit<Partial<Update>, 'id' | 'createdAt' | 'completedAt' | 'dueDate'> & {
    completedAt?: any; // Allow serverTimestamp or boolean signal or null
    dueDate?: any;
    clientId?: string;
};

/**
 * Retrieves all updates for a specific client from the database.
 * This includes updates linked only to the client and updates linked to the client's processes.
 * @param clientId The ID of the client.
 * @returns A promise that resolves to an array of client updates.
 */
export async function getClientUpdates(clientId: string): Promise<Update[]> {
    const updatesColRef = collection(db, "updates");
    // Query for updates where the clientId matches
    const q = query(
        updatesColRef,
        where("clientId", "==", clientId)
    );
    const updatesSnapshot = await getDocs(q);

    const updatesList = await Promise.all(updatesSnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let processNumber: string | undefined = undefined;

        if (data.processId) {
            const processDocRef = doc(db, 'processes', data.processId);
            const processSnap = await getDoc(processDocRef);
            if (processSnap.exists()) {
                processNumber = (processSnap.data() as Process).processNumber;
            }
        }
        
        return {
            id: docSnap.id,
            ...data,
            processNumber,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            completedAt: data.completedAt?.toDate?.()?.toISOString() || null,
            dueDate: data.dueDate?.toDate?.()?.toISOString() || null,
            deletedAt: data.deletedAt?.toDate?.()?.toISOString() || null,
        } as Update;
    }));

    // Sort in code to avoid composite index requirement
    return updatesList.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return dateB - dateA;
    });
}


/**
 * Retrieves a single update by its ID from the database.
 * @param id The ID of the update to retrieve.
 * @returns A promise that resolves to the Update object or null if not found.
 */
export async function getUpdateById(id: string): Promise<Update | null> {
  try {
    const updateDocRef = doc(db, "updates", id);
    const updateSnap = await getDoc(updateDocRef);

    if (updateSnap.exists()) {
      const data = updateSnap.data();
       let clientName: string | undefined;

        if (data.clientId) {
            const clientDocRef = doc(db, "clients", data.clientId);
            const clientDoc = await getDoc(clientDocRef);
            clientName = clientDoc.exists() ? clientDoc.data().name : 'Cliente não encontrado';
        }
      return {
        id: updateSnap.id,
        ...data,
        clientName,
        createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
        completedAt: data.completedAt?.toDate?.()?.toISOString() || null,
        dueDate: data.dueDate?.toDate?.()?.toISOString() || null,
        deletedAt: data.deletedAt?.toDate?.()?.toISOString() || null,
      } as Update;
    } else {
      console.warn(`Update com ID "${id}" não encontrado.`);
      return null;
    }
  } catch (error) {
    console.error("Erro ao buscar update por ID: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao buscar andamento: ${error.message}`);
    }
    throw new Error("Falha ao buscar andamento no banco de dados.");
  }
}

/**
 * Retrieves all updates related to a specific process.
 * @param processId The ID of the process to fetch updates for.
 * @returns A promise that resolves to an array of client updates.
 */
export async function getProcessUpdates(processId: string): Promise<Update[]> {
    try {
        const processDocRef = doc(db, "processes", processId);
        const processSnap = await getDoc(processDocRef);
        
        if (!processSnap.exists()) {
            console.warn(`Processo com ID "${processId}" não encontrado.`);
            return [];
        }
        const processData = processSnap.data() as Process;

        const updatesRef = collection(db, "updates");
        // Removed orderBy from query to avoid needing a composite index
        const q = query(updatesRef, where('processId', '==', processId));
        const updatesSnapshot = await getDocs(q);

        const allUpdates: Update[] = [];
        
        for(const updateDoc of updatesSnapshot.docs) {
             const data = updateDoc.data();
             let clientName: string | undefined = undefined;
             if (data.clientId) {
                const clientDocRef = doc(db, "clients", data.clientId);
                const clientSnap = await getDoc(clientDocRef);
                clientName = clientSnap.exists() ? clientSnap.data().name : 'Cliente não encontrado';
             }

             allUpdates.push({
                id: updateDoc.id,
                ...data,
                clientName: clientName,
                processNumber: processData.processNumber,
                createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
                completedAt: data.completedAt?.toDate?.()?.toISOString() || null,
                dueDate: data.dueDate?.toDate?.()?.toISOString() || null,
                deletedAt: data.deletedAt?.toDate?.()?.toISOString() || null,
            } as Update);
        }
        
        // Sort in code instead of in the query
        return allUpdates.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
            return dateB - dateA;
        });

    } catch (error: any) {
        console.error("Error fetching process updates: ", error);
        throw new Error(`Falha ao buscar andamentos do processo: ${error.message}`);
    }
}


/**
 * Adds a new update to a client's record.
 * @param updateData The data for the new update.
 * @returns A promise that resolves when the update is added.
 */
export async function addClientUpdate(updateData: NewClientUpdate): Promise<void> {
    try {
        const updatesColRef = collection(db, "updates");
        
        const dataToAdd: Partial<NewClientUpdate> & {[key:string]: any} = {
            description: updateData.description,
            type: updateData.type,
            author: updateData.author,
            clientId: updateData.clientId,
            createdAt: serverTimestamp(),
            deleted: false,
        };

        // Only add processId if it exists to avoid undefined errors
        if (updateData.processId) {
            dataToAdd.processId = updateData.processId;
        }
        
        // Only add task-specific fields if the type is 'Tarefa'
        if (updateData.type === 'Tarefa') {
            dataToAdd.status = 'Pendente';
            dataToAdd.responsible = updateData.responsible || 'Todos';
            dataToAdd.priority = updateData.priority || 'Média';
            dataToAdd.completedAt = null;
            dataToAdd.completedBy = null;
            dataToAdd.dueDate = updateData.dueDate ? new Date(updateData.dueDate as string) : null;
        }

        await addDoc(updatesColRef, dataToAdd);
        
        if (updateData.clientId) {
          revalidatePath(`/dashboard/clients/${updateData.clientId}`);
        }
        if (updateData.processId) {
            revalidatePath(`/dashboard/processes/${updateData.processId}`);
        }
        revalidatePath('/dashboard/tasks');
        revalidatePath('/dashboard/annotations');
        revalidatePath('/dashboard/communications');
    } catch (error) {
        console.error("Error adding client update: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao adicionar andamento: ${error.message}`);
        }
        throw new Error("Falha ao adicionar andamento ao banco de dados.");
    }
}

/**
 * Updates an existing client update in the database.
 * @param updateId The ID of the update to modify.
 * @param updateData The data to update.
 */
export async function updateClientUpdate(updateId: string, updateData: UpdatableClientUpdate): Promise<void> {
    try {
        const updateDocRef = doc(db, "updates", updateId);
        
        const dataToUpdate: { [key: string]: any } = { ...updateData };

        // If we receive `true`, it's a signal to set the server timestamp.
        if (updateData.completedAt === true) {
             dataToUpdate.completedAt = serverTimestamp();
        } else if (updateData.completedAt === null) {
             dataToUpdate.completedAt = null;
        }

        if (updateData.dueDate && typeof updateData.dueDate === 'string') {
            dataToUpdate.dueDate = Timestamp.fromDate(new Date(updateData.dueDate));
        } else if (updateData.dueDate === null) {
            dataToUpdate.dueDate = null;
        }

        await updateDoc(updateDocRef, dataToUpdate);
        
        const docSnap = await getDoc(updateDocRef);
        const freshData = docSnap.data();

        if (freshData?.clientId) {
            revalidatePath(`/dashboard/clients/${freshData.clientId}`);
        }
        if (freshData?.processId) {
            revalidatePath(`/dashboard/processes/${freshData.processId}`);
        }
        revalidatePath('/dashboard/tasks');
        revalidatePath('/dashboard/annotations');
        revalidatePath('/dashboard/communications');
    } catch (error) {
        console.error("Error updating client update: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao atualizar andamento: ${error.message}`);
        }
        throw new Error("Falha ao atualizar andamento no banco de dados.");
    }
}


/**
 * Soft deletes a client update by marking it as 'deleted'.
 * @param updateId The ID of the update to delete.
 * @param authorName The name of the user performing the deletion.
 */
export async function softDeleteClientUpdate(updateId: string, authorName: string): Promise<void> {
    const updateDocRef = doc(db, "updates", updateId);
    try {
        const docSnap = await getDoc(updateDocRef);
        const data = docSnap.data();

        await updateDoc(updateDocRef, {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: authorName,
        });
        
       if (data?.clientId) {
            revalidatePath(`/dashboard/clients/${data.clientId}`);
        }
        if (data?.processId) {
            revalidatePath(`/dashboard/processes/${data.processId}`);
        }
        revalidatePath('/dashboard/tasks');
        revalidatePath('/dashboard/annotations');
        revalidatePath('/dashboard/communications');

    } catch (error) {
        console.error("Error soft deleting client update: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao enviar andamento para a lixeira: ${error.message}`);
        }
        throw new Error("Falha ao enviar andamento para a lixeira no banco de dados.");
    }
}

/**
 * Restores a soft-deleted client update.
 * @param updateId The ID of the update to restore.
 */
export async function restoreClientUpdate(updateId: string): Promise<void> {
    const updateDocRef = doc(db, "updates", updateId);
    try {
        const docSnap = await getDoc(updateDocRef);
        const data = docSnap.data();

        await updateDoc(updateDocRef, {
            deleted: false,
            deletedAt: null,
            deletedBy: null,
        });

       if (data?.clientId) {
            revalidatePath(`/dashboard/clients/${data.clientId}`);
        }
        if (data?.processId) {
            revalidatePath(`/dashboard/processes/${data.processId}`);
        }
        revalidatePath('/dashboard/tasks');
        revalidatePath('/dashboard/annotations');
        revalidatePath('/dashboard/communications');
    } catch (error) {
        console.error("Error restoring client update: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao restaurar andamento: ${error.message}`);
        }
        throw new Error("Falha ao restaurar andamento no banco de dados.");
    }
}

/**
 * Permanently deletes a client update from the database.
 * @param updateId The ID of the update to delete permanently.
 */
export async function permanentlyDeleteClientUpdate(updateId: string): Promise<void> {
    try {
        const updateDocRef = doc(db, "updates", updateId);
        const docSnap = await getDoc(updateDocRef);
        const data = docSnap.data();

        await deleteDoc(updateDocRef);
        
        if (data?.clientId) {
            revalidatePath(`/dashboard/clients/${data.clientId}`);
        }
        if (data?.processId) {
            revalidatePath(`/dashboard/processes/${data.processId}`);
        }
        revalidatePath('/dashboard/tasks');
        revalidatePath('/dashboard/annotations');
        revalidatePath('/dashboard/communications');

    } catch (error) {
        console.error("Error permanently deleting client update: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir andamento permanentemente: ${error.message}`);
        }
        throw new Error("Falha ao excluir andamento permanentemente no banco de dados.");
    }
}
