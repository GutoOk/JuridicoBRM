
"use server";

import { db } from "@/lib/firebase";
import type { Update } from "@/lib/types";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { revalidatePath } from "next/cache";

type UpdateProcessUpdatePayload = Partial<Omit<Update, 'id' | 'createdAt'>>;

/**
 * Updates an existing process update (an 'Update' of type 'Andamento Processual').
 * @param updateId The ID of the update to modify.
 * @param payload The data to update.
 */
export async function updateProcessUpdate(updateId: string, payload: UpdateProcessUpdatePayload): Promise<void> {
  try {
    const updateDocRef = doc(db, "updates", updateId);
    
    const dataToUpdate: {[key: string]: any} = { ...payload };

    await updateDoc(updateDocRef, dataToUpdate);

    // Revalidate paths to reflect changes
    const updatedDoc = await getDoc(updateDocRef);
    const updatedData = updatedDoc.data();
    
    if (updatedData?.processId) {
      revalidatePath(`/dashboard/processes/${updatedData.processId}`);
    }
     if (updatedData?.clientId) {
      revalidatePath(`/dashboard/clients/${updatedData.clientId}`);
    }

  } catch (error) {
    console.error("Error updating process update: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao atualizar andamento: ${error.message}`);
    }
    throw new Error("Falha ao atualizar andamento no banco de dados.");
  }
}
