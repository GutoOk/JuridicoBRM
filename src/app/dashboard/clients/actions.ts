"use server";

import { revalidatePath } from "next/cache";
import type { Client } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";

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
    // Optionally, re-throw the error or handle it as needed
    throw new Error("Failed to add client to the database.");
  }
}
