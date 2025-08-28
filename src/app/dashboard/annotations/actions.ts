
"use server";

import { db } from "@/lib/firebase";
import type { ClientUpdate, User } from "@/lib/types";
import { collection, collectionGroup, getDocs, query, doc, getDoc, addDoc, serverTimestamp, writeBatch, updateDoc, deleteDoc } from "firebase/firestore";
import { revalidatePath } from "next/cache";

type NewAnnotationPayload = Omit<ClientUpdate, 'id' | 'createdAt'> & {
    selectedClientIds: string[];
}

type UpdateAnnotationPayload = Partial<Omit<ClientUpdate, 'id' | 'createdAt'>>;

/**
 * Retrieves all updates that are of type 'Anotacao' from the database across all clients.
 * @returns A promise that resolves to an array of annotations.
 */
export async function getAnnotations(): Promise<ClientUpdate[]> {
    const annotationsList: ClientUpdate[] = [];

    const updatesRef = collectionGroup(db, 'updates');
    const updatesQuery = query(updatesRef); 
    const updatesSnapshot = await getDocs(updatesQuery);

    for (const updateDoc of updatesSnapshot.docs) {
        const data = updateDoc.data();
        
        if (data.type !== 'Anotação') {
            continue;
        }

        const clientId = updateDoc.ref.parent.parent?.id;
        if (!clientId) continue;

        const clientDocRef = doc(db, "clients", clientId);
        const clientDoc = await getDoc(clientDocRef);
        const clientName = clientDoc.exists() ? clientDoc.data().name : 'Cliente não encontrado';

        annotationsList.push({
            id: updateDoc.id,
            clientId,
            clientName,
            ...data,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        } as ClientUpdate);
    }
    
    // Sort annotations by creation date, most recent first
    return annotationsList.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
}

/**
 * Adds a new annotation to multiple clients using a batch write.
 */
export async function createAnnotations(annoData: NewAnnotationPayload): Promise<void> {
  try {
    const batch = writeBatch(db);

    const dataToAdd: Omit<NewAnnotationPayload, 'selectedClientIds'> = {
        description: annoData.description,
        type: 'Anotação',
        author: annoData.author,
        createdAt: serverTimestamp() as any,
    };
    
    if (annoData.selectedClientIds.length === 0) {
        throw new Error("Selecione ao menos um cliente para registrar a anotação.");
    }

    annoData.selectedClientIds.forEach(clientId => {
        const updateRef = doc(collection(db, "clients", clientId, "updates"));
        batch.set(updateRef, dataToAdd);
    });

    await batch.commit();
    revalidatePath("/dashboard/annotations");
    annoData.selectedClientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));

  } catch (error) {
    console.error("Error creating annotations: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao criar anotação(ões): ${error.message}`);
    }
    throw new Error("Falha ao criar anotação(ões) no banco de dados.");
  }
}

/**
 * Updates an existing annotation.
 * @param annoData The data for the annotation to update.
 */
export async function updateAnnotation(annoId: string, clientId: string, payload: UpdateAnnotationPayload): Promise<void> {
  try {
    if (!clientId) {
        throw new Error("ID do cliente é inválido.");
    }
    
    const annoDocRef = doc(db, "clients", clientId, "updates", annoId);
    
    const dataToUpdate: {[key: string]: any} = { ...payload };

    await updateDoc(annoDocRef, dataToUpdate);

    revalidatePath("/dashboard/annotations");
    revalidatePath(`/dashboard/clients/${clientId}`);

  } catch (error) {
    console.error("Error updating annotation: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao atualizar anotação: ${error.message}`);
    }
    throw new Error("Falha ao atualizar anotação no banco de dados.");
  }
}

/**
 * Deletes multiple annotations.
 * @param annos An array of annotations to be deleted.
 */
export async function deleteAnnotations(annos: ClientUpdate[]): Promise<void> {
  try {
    const batch = writeBatch(db);

    annos.forEach(anno => {
      if (anno.clientId) {
         const annoDocRef = doc(db, "clients", anno.clientId, "updates", anno.id);
         batch.delete(annoDocRef);
      }
    });

    await batch.commit();
    
    revalidatePath("/dashboard/annotations");
    const clientIds = [...new Set(annos.map(c => c.clientId).filter(Boolean))];
    clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));

  } catch (error) {
    console.error("Error deleting annotations: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao excluir anotações: ${error.message}`);
    }
    throw new Error("Falha ao excluir anotações no banco de dados.");
  }
}
    
