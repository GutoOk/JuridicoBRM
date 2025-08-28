"use server";

import { revalidatePath } from "next/cache";
import type { Client } from "@/lib/types";
import db from "@/lib/db";

// As we don't have a real database, we'll simulate it with an in-memory array.
// Note: This data will be reset with every server restart.

type NewClient = Omit<Client, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'processIds'>;

/**
 * Retrieves all clients from the database.
 * @returns A promise that resolves to an array of clients.
 */
export async function getClients(): Promise<Client[]> {
  // In a real app, you would fetch this from your database.
  return Promise.resolve(db.clients);
}

/**
 * Adds a new client to the database.
 * @param clientData The data for the new client.
 * @returns A promise that resolves when the client is added.
 */
export async function addClient(clientData: NewClient): Promise<void> {
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 500));

  const newClient: Client = {
    ...clientData,
    id: String(db.clients.length + 1),
    createdAt: new Date().toISOString(),
    createdBy: "Advogado Master", // In a real app, this would be the logged-in user
    updatedAt: new Date().toISOString(),
    updatedBy: "Advogado Master",
  };

  db.clients.unshift(newClient); // Add to the beginning of the array

  // Revalidate the clients page to show the new client
  revalidatePath("/dashboard/clients");

  return Promise.resolve();
}
