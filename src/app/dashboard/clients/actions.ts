"use server";

import { revalidatePath } from "next/cache";
import type { Client } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, getDoc, doc, query, orderBy, serverTimestamp } from "firebase/firestore";

type NewClient = Omit<Client, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'processIds'>;

/**
 * Retrieves all clients from the database.
 * @returns A promise that resolves to an array of clients.
 */
export async function getClients(): Promise<Client[]> {
  const clientsCol = collection(db, "clients");
  const q = query(clientsCol, orderBy("createdAt", "desc"));
  const clientSnapshot = await getDocs(q);
  const clientList = clientSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      // Convert Firestore Timestamps to ISO strings if they exist
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    } as Client;
  });
  return clientList;
}

/**
 * Retrieves a single client by their ID from the database.
 * @param id The ID of the client to retrieve.
 * @returns A promise that resolves to the client object or null if not found.
 */
export async function getClientById(id: string): Promise<Client | null> {
  try {
    const clientDocRef = doc(db, "clients", id);
    const clientSnap = await getDoc(clientDocRef);

    if (clientSnap.exists()) {
      const data = clientSnap.data();
      return {
        id: clientSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
      } as Client;
    } else {
      console.warn(`Cliente com ID "${id}" não encontrado.`);
      return null;
    }
  } catch (error) {
    console.error("Erro ao buscar cliente por ID: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao buscar cliente: ${error.message}`);
    }
    throw new Error("Falha ao buscar cliente no banco de dados.");
  }
}

/**
 * Adds a new client to the database.
 * @param clientData The data for the new client.
 * @returns A promise that resolves when the client is added.
 */
export async function addClient(clientData: NewClient): Promise<void> {
  try {
    const clientsCol = collection(db, "clients");
    await addDoc(clientsCol, {
      ...clientData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: "Advogado Master", // In a real app, this would be the logged-in user
      updatedBy: "Advogado Master",
    });

    // Revalidate the clients page to show the new client
    revalidatePath("/dashboard/clients");
  } catch (error) {
    console.error("Error adding client: ", error);
    // Re-throw the error with a more descriptive message
    if (error instanceof Error) {
        throw new Error(`Falha ao adicionar cliente: ${error.message}`);
    }
    throw new Error("Falha ao adicionar cliente ao banco de dados.");
  }
}
