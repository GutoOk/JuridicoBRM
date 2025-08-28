
"use server";

import { revalidatePath } from "next/cache";
import type { ClientUpdate } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "firebase/firestore";

type NewClientUpdate = Omit<ClientUpdate, 'id' | 'createdAt'>;

/**
 * Retrieves all updates for a specific client from the database.
 * @param clientId The ID of the client.
 * @returns A promise that resolves to an array of client updates.
 */
export async function getClientUpdates(clientId: string): Promise<ClientUpdate[]> {
    const updatesColRef = collection(db, "clients", clientId, "updates");
    const q = query(updatesColRef, orderBy("createdAt", "desc"));
    const updatesSnapshot = await getDocs(q);
    const updatesList = updatesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        } as ClientUpdate;
    });
    return updatesList;
}

/**
 * Adds a new update to a client's record.
 * @param clientId The ID of the client to add the update to.
 * @param updateData The data for the new update.
 * @returns A promise that resolves when the update is added.
 */
export async function addClientUpdate(clientId: string, updateData: NewClientUpdate): Promise<void> {
    try {
        const updatesColRef = collection(db, "clients", clientId, "updates");
        await addDoc(updatesColRef, {
            ...updateData,
            createdAt: serverTimestamp(),
        });
        revalidatePath(`/dashboard/clients/${clientId}`);
    } catch (error) {
        console.error("Error adding client update: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao adicionar andamento: ${error.message}`);
        }
        throw new Error("Falha ao adicionar andamento ao banco de dados.");
    }
}

/**
 * Deletes a client update from the database.
 * @param clientId The ID of the client.
 * @param updateId The ID of the update to delete.
 * @returns A promise that resolves when the update is deleted.
 */
export async function deleteClientUpdate(clientId: string, updateId: string): Promise<void> {
    try {
        const updateDocRef = doc(db, "clients", clientId, "updates", updateId);
        await deleteDoc(updateDocRef);
        revalidatePath(`/dashboard/clients/${clientId}`);
    } catch (error) {
        console.error("Error deleting client update: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir andamento: ${error.message}`);
        }
        throw new Error("Falha ao excluir andamento no banco de dados.");
    }
}
