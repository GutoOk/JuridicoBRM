
"use server";

import { revalidatePath } from "next/cache";
import type { Process, Client } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, getDoc, query, orderBy, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";

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
      id: processDocRef.id, // Store the ID within the document itself if needed
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastUpdate: serverTimestamp(),
    });

    // 2. Update each selected client to link them to the new process
    for (const clientId of processData.clientIds) {
        const clientDocRef = doc(db, "clients", clientId);
        const clientDoc = await getDoc(clientDocRef);
        if (clientDoc.exists()) {
            const clientData = clientDoc.data() as Client;
            const existingProcessIds = clientData.processIds || [];
            batch.update(clientDocRef, {
                processIds: [...existingProcessIds, processDocRef.id]
            });
        }
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
    await updateDoc(processDocRef, {
      ...processData,
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
