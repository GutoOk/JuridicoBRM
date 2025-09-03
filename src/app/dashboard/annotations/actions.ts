

"use server";

import { db } from "@/lib/firebase";
import type { Update, User } from "@/lib/types";
import { collection, getDocs, query, doc, getDoc, addDoc, serverTimestamp, writeBatch, updateDoc, deleteDoc, where } from "firebase/firestore";
import { revalidatePath } from "next/cache";

type NewAnnotationPayload = Omit<Update, 'id' | 'createdAt'> & {
    selectedClientIds: string[];
}

type UpdateAnnotationPayload = Partial<Omit<Update, 'id' | 'createdAt'>>;

/**
 * Retrieves all updates that are of type 'Anotacao' from the database across all clients.
 * @returns A promise that resolves to an array of annotations.
 */
export async function getAnnotations(): Promise<Update[]> {
    const annotationsList: Update[] = [];
    const updatesRef = collection(db, 'updates');
    const updatesQuery = query(updatesRef, where('type', '==', 'Anotação')); 
    const updatesSnapshot = await getDocs(updatesQuery);

    for (const updateDoc of updatesSnapshot.docs) {
        const data = updateDoc.data();
        let clientName: string | undefined;

        if (data.clientId) {
            const clientDocRef = doc(db, "clients", data.clientId);
            const clientDoc = await getDoc(clientDocRef);
            clientName = clientDoc.exists() ? clientDoc.data().name : 'Cliente não encontrado';
        }

        annotationsList.push({
            id: updateDoc.id,
            ...data,
            clientName,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        } as Update);
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

    const dataToCreate: Omit<Update, 'id' | 'clientId'> = {
        description: annoData.description,
        type: 'Anotação',
        author: annoData.author,
        createdAt: serverTimestamp() as any,
    };
    
    if (annoData.selectedClientIds.length === 0) {
        throw new Error("Selecione ao menos um cliente para registrar a anotação.");
    }
    const updatesRef = collection(db, "updates");

    annoData.selectedClientIds.forEach(clientId => {
        const updateRef = doc(updatesRef);
        batch.set(updateRef, { ...dataToCreate, clientId: clientId });
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
export async function updateAnnotation(annoId: string, payload: UpdateAnnotationPayload): Promise<void> {
  try {
    const annoDocRef = doc(db, "updates", annoId);
    
    const dataToUpdate: {[key: string]: any} = { ...payload };

    await updateDoc(annoDocRef, dataToUpdate);

    const updatedDoc = await getDoc(annoDocRef);
    const updatedData = updatedDoc.data();

    revalidatePath("/dashboard/annotations");
    if (updatedData?.clientId) {
      revalidatePath(`/dashboard/clients/${updatedData.clientId}`);
    }

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
export async function deleteAnnotations(annos: Update[]): Promise<void> {
  try {
    const batch = writeBatch(db);

    annos.forEach(anno => {
      const annoDocRef = doc(db, "updates", anno.id);
      batch.delete(annoDocRef);
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
