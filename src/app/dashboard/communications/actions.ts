
"use server";

import { db } from "@/lib/firebase";
import type { Update } from "@/lib/types";
import { collection, getDocs, query, doc, getDoc, addDoc, serverTimestamp, writeBatch, updateDoc, deleteDoc, where } from "firebase/firestore";
import { revalidatePath } from "next/cache";

type NewCommunicationPayload = Omit<Update, 'id' | 'createdAt'> & {
    selectedClientIds: string[];
}

type UpdateCommunicationPayload = Partial<Omit<Update, 'id' | 'createdAt'>>;

/**
 * Retrieves all updates that are of type 'Atendimento' from the database.
 * @returns A promise that resolves to an array of communications.
 */
export async function getCommunications(): Promise<Update[]> {
    const commsList: Update[] = [];
    const updatesRef = collection(db, 'updates');
    const updatesQuery = query(updatesRef, where('type', '==', 'Atendimento')); 
    const updatesSnapshot = await getDocs(updatesQuery);

    for (const updateDoc of updatesSnapshot.docs) {
        const data = updateDoc.data();
        let clientName: string | undefined;

        if(data.clientId){
            const clientDoc = await getDoc(doc(db, "clients", data.clientId));
            clientName = clientDoc.exists() ? clientDoc.data().name : 'Cliente não encontrado';
        }

        commsList.push({
            id: updateDoc.id,
            ...data,
            clientName,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        } as Update);
    }
    
    // Sort communications by creation date, most recent first
    return commsList.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
}

/**
 * Adds a new communication to multiple clients using a batch write.
 */
export async function createCommunications(commData: NewCommunicationPayload): Promise<void> {
  try {
    const batch = writeBatch(db);
    const updatesRef = collection(db, "updates");

    const dataToAdd: Omit<NewCommunicationPayload, 'selectedClientIds'> = {
        description: commData.description,
        type: 'Atendimento',
        author: commData.author,
        createdAt: serverTimestamp() as any,
    };
    
    if (commData.selectedClientIds.length === 0) {
        throw new Error("Selecione ao menos um cliente para registrar o atendimento.");
    }

    commData.selectedClientIds.forEach(clientId => {
        const updateRef = doc(updatesRef);
        batch.set(updateRef, { ...dataToAdd, clientId });
    });

    await batch.commit();
    revalidatePath("/dashboard/communications");
    commData.selectedClientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));

  } catch (error) {
    console.error("Error creating communications: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao criar atendimento(s): ${error.message}`);
    }
    throw new Error("Falha ao criar atendimento(s) no banco de dados.");
  }
}

/**
 * Updates an existing communication.
 * @param commId The ID of the communication to update.
 * @param payload The data for the communication to update.
 */
export async function updateCommunication(commId: string, payload: UpdateCommunicationPayload): Promise<void> {
  try {
    const commDocRef = doc(db, "updates", commId);
    
    const dataToUpdate: {[key: string]: any} = { ...payload };

    await updateDoc(commDocRef, dataToUpdate);

    const updatedDoc = await getDoc(commDocRef);
    const updatedData = updatedDoc.data();

    revalidatePath("/dashboard/communications");
    if (updatedData?.clientId) {
      revalidatePath(`/dashboard/clients/${updatedData.clientId}`);
    }
  } catch (error) {
    console.error("Error updating communication: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao atualizar atendimento: ${error.message}`);
    }
    throw new Error("Falha ao atualizar atendimento no banco de dados.");
  }
}

/**
 * Deletes multiple communications.
 * @param comms An array of communications to be deleted.
 */
export async function deleteCommunications(comms: Update[]): Promise<void> {
  try {
    const batch = writeBatch(db);

    comms.forEach(comm => {
      const commDocRef = doc(db, "updates", comm.id);
      batch.delete(commDocRef);
    });

    await batch.commit();
    
    revalidatePath("/dashboard/communications");
    const clientIds = [...new Set(comms.map(c => c.clientId).filter(Boolean))];
    clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));

  } catch (error) {
    console.error("Error deleting communications: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao excluir atendimentos: ${error.message}`);
    }
    throw new Error("Falha ao excluir atendimentos no banco de dados.");
  }
}
