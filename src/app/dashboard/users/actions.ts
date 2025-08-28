
"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "firebase/firestore";

// Note: This is a simplified user management system.
// In a real-world scenario, you should NEVER store plain text passwords.
// Use a secure authentication provider like Firebase Authentication.

type NewUser = Omit<User, 'id' | 'createdAt'>;
type UpdatableUser = Partial<Omit<User, 'id' | 'createdAt'>>;

/**
 * Retrieves all users from the database.
 * IMPORTANT: This function returns passwords and should only be used in a trusted server environment.
 * @returns A promise that resolves to an array of users.
 */
export async function getUsers(): Promise<(User & { password?: string })[]> {
  const usersCol = collection(db, "users");
  const q = query(usersCol, orderBy("createdAt", "desc"));
  const userSnapshot = await getDocs(q);
  const userList = userSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      // Convert Firestore Timestamps to ISO strings
      createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
    } as User & { password?: string };
  });
  return userList;
}

/**
 * Adds a new user to the database.
 * @param userData The data for the new user, including a plain text password.
 * @returns A promise that resolves when the user is added.
 */
export async function addUser(userData: NewUser): Promise<{ id: string }> {
  try {
    if (!userData.password) {
        throw new Error("A senha é obrigatória ao criar um novo usuário.");
    }
    const usersCol = collection(db, "users");
    const docRef = await addDoc(usersCol, {
      ...userData,
      createdAt: serverTimestamp(),
    });
    revalidatePath("/dashboard/users");
    return { id: docRef.id };
  } catch (error) {
    console.error("Error adding user: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao adicionar usuário: ${error.message}`);
    }
    throw new Error("Falha ao adicionar usuário ao banco de dados.");
  }
}

/**
 * Updates an existing user in the database.
 * @param id The ID of the user to update.
 * @param userData The data to update.
 * @returns A promise that resolves when the user is updated.
 */
export async function updateUser(id: string, userData: UpdatableUser): Promise<void> {
    try {
        const userDocRef = doc(db, "users", id);
        // If password is an empty string, don't update it.
        // In a real app, password changes would be handled separately.
        const dataToUpdate = { ...userData };
        if (dataToUpdate.password === "" || dataToUpdate.password === null || dataToUpdate.password === undefined) {
            delete dataToUpdate.password;
        }
        await updateDoc(userDocRef, dataToUpdate);
        revalidatePath("/dashboard/users");
    } catch (error) {
        console.error("Error updating user: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao atualizar usuário: ${error.message}`);
        }
        throw new Error("Falha ao atualizar usuário no banco de dados.");
    }
}


/**
 * Deletes a user from the database.
 * @param id The ID of the user to delete.
 * @returns A promise that resolves when the user is deleted.
 */
export async function deleteUser(id: string): Promise<void> {
    try {
        const userDocRef = doc(db, "users", id);
        await deleteDoc(userDocRef);
        revalidatePath("/dashboard/users");
    } catch (error) {
        console.error("Error deleting user: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir usuário: ${error.message}`);
        }
        throw new Error("Falha ao excluir usuário no banco de dados.");
    }
}
