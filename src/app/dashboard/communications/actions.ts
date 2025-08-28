
"use server";

import { db } from "@/lib/firebase";
import type { ClientUpdate, User } from "@/lib/types";
import { collection, collectionGroup, getDocs, query, doc, addDoc, serverTimestamp, writeBatch, updateDoc, deleteDoc } from "firebase/firestore";
import { revalidatePath } from "next/cache";

type NewCommunicationPayload = Omit<ClientUpdate, 'id' | 'createdAt'> & {
    selectedClientIds: string[];
}

type UpdateCommunicationPayload = Partial<Omit<ClientUpdate, 'id' | 'createdAt'>>;

/**
 * Retrieves all updates that are of type 'Atendimento' from the database across all clients.
 * @returns A promise that resolves to an array of communications.
 */
export async function getCommunications(): Promise<ClientUpdate[]> {
    const commsList: ClientUpdate[] = [];

    const updatesRef = collectionGroup(db, 'updates');
    const updatesQuery = query(updatesRef); 
    const updatesSnapshot = await getDocs(updatesQuery);

    for (const updateDoc of updatesSnapshot.docs) {
        const data = updateDoc.data();
        
        if (data.type !== 'Atendimento') {
            continue;
        }

        const clientId = updateDoc.ref.parent.parent?.id;
        if (!clientId) continue;

        const clientDoc = await getDoc(doc(db, "clients", clientId));
        const clientName = clientDoc.exists() ? clientDoc.data().name : 'Cliente não encontrado';

        commsList.push({
            id: updateDoc.id,
            clientId,
            clientName,
            ...data,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        } as ClientUpdate);
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

    const dataToAdd: Omit<NewCommunicationPayload, 'selectedClientIds'> = {
        description: commData.description,
        type: 'Atendimento',
        author: commData.author,
        createdAt: serverTimestamp() as any,
    };
    
    // For now, communications are always linked to a client.
    // Logic for general communications can be added here if needed.
    if (commData.selectedClientIds.length === 0) {
        throw new Error("Selecione ao menos um cliente para registrar o atendimento.");
    }

    commData.selectedClientIds.forEach(clientId => {
        const updateRef = doc(collection(db, "clients", clientId, "updates"));
        batch.set(updateRef, dataToAdd);
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
 * @param commData The data for the communication to update.
 */
export async function updateCommunication(commId: string, clientId: string, payload: UpdateCommunicationPayload): Promise<void> {
  try {
    if (!clientId) {
        throw new Error("ID do cliente é inválido.");
    }
    
    const commDocRef = doc(db, "clients", clientId, "updates", commId);
    
    const dataToUpdate: {[key: string]: any} = { ...payload };

    await updateDoc(commDocRef, dataToUpdate);

    revalidatePath("/dashboard/communications");
    revalidatePath(`/dashboard/clients/${clientId}`);

  } catch (error) {
    console.error("Error updating communication: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao atualizar atendimento: ${error.message}`);
    }
    throw new Error("Falha ao atualizar atendimento no banco de dados.");
  }
}

    