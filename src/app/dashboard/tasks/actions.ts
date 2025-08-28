
"use server";

import { db } from "@/lib/firebase";
import type { Task } from "@/lib/types";
import { collectionGroup, getDocs, query, where, getDoc, doc } from "firebase/firestore";

/**
 * Retrieves all updates that are tasks from the database across all clients.
 * @returns A promise that resolves to an array of tasks.
 */
export async function getAllTasks(): Promise<Task[]> {
    // The where clause requires a composite index. It's better to filter in code
    // to avoid manual Firebase console configuration for the user.
    const updatesRef = collectionGroup(db, 'updates');
    const q = query(updatesRef); // Remove the where clause
    const querySnapshot = await getDocs(q);

    const tasksList: Task[] = [];

    for (const updateDoc of querySnapshot.docs) {
        const data = updateDoc.data();
        
        // Filter for tasks in code
        if (data.type !== 'Tarefa') {
            continue;
        }

        // The update document has a path like /clients/{clientId}/updates/{updateId}
        const clientId = updateDoc.ref.parent.parent?.id;

        if (clientId) {
            const clientDocRef = doc(db, "clients", clientId);
            const clientSnap = await getDoc(clientDocRef);
            const clientName = clientSnap.exists() ? clientSnap.data().name : 'Cliente não encontrado';

             tasksList.push({
                id: updateDoc.id,
                clientId: clientId,
                clientName: clientName,
                title: data.description,
                responsible: data.responsible || 'Todos',
                status: data.status || 'Pendente',
                priority: data.priority || 'Média', // Default priority
                dueDate: data.dueDate?.toDate?.().toISOString() || null,
                createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            });
        }
    }

    // Sort tasks by creation date, most recent first
    return tasksList.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
}

