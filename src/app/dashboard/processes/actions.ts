
"use server";

import { revalidatePath } from "next/cache";
import type { Process } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, query, orderBy, serverTimestamp, updateDoc } from "firebase/firestore";

type NewProcess = Omit<Process, 'id' | 'createdAt' | 'updatedAt' | 'lastUpdate'>;
type UpdatableProcess = Partial<Omit<Process, 'id' | 'createdAt' | 'updatedAt'>>;

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
 * Adds a new process to the database.
 * @param processData The data for the new process.
 * @returns A promise that resolves when the process is added.
 */
export async function addProcess(processData: NewProcess): Promise<{ id: string }> {
  try {
    const processesCol = collection(db, "processes");
    const docRef = await addDoc(processesCol, {
      ...processData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastUpdate: serverTimestamp(),
    });

    // TODO: Associate process with client
    
    revalidatePath("/dashboard/processes");
    return { id: docRef.id };

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
    // revalidatePath(`/dashboard/processes/${id}`); // Uncomment when detail page exists

  } catch (error) {
    console.error("Error updating process: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao atualizar processo: ${error.message}`);
    }
    throw new Error("Falha ao atualizar processo no banco de dados.");
  }
}
