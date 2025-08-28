
"use server";

import { db } from "@/lib/firebase";
import type { Task } from "@/lib/types";
import { collection, collectionGroup, getDocs, query, where, getDoc, doc, addDoc, serverTimestamp } from "firebase/firestore";

type NewTask = Omit<Task, 'id' | 'createdAt' | 'status' | 'clientName'> & { author: string };


/**
 * Retrieves all updates that are tasks from the database across all clients, and all general tasks.
 * @returns A promise that resolves to an array of tasks.
 */
export async function getAllTasks(): Promise<Task[]> {
    const tasksList: Task[] = [];

    // 1. Get tasks from client updates
    const updatesRef = collectionGroup(db, 'updates');
    const updatesQuery = query(updatesRef); 
    const updatesSnapshot = await getDocs(updatesQuery);

    for (const updateDoc of updatesSnapshot.docs) {
        const data = updateDoc.data();
        
        if (data.type !== 'Tarefa') {
            continue;
        }

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
                priority: data.priority || 'Média', 
                dueDate: data.dueDate?.toDate?.().toISOString() || null,
                createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            });
        }
    }

    // 2. Get general tasks
    const generalTasksRef = collection(db, 'tasks');
    const generalTasksQuery = query(generalTasksRef);
    const generalTasksSnapshot = await getDocs(generalTasksQuery);

    for (const taskDoc of generalTasksSnapshot.docs) {
        const data = taskDoc.data();
        tasksList.push({
            id: taskDoc.id,
            ...data,
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        } as Task);
    }


    // Sort tasks by creation date, most recent first
    return tasksList.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
}

/**
 * Adds a new general task to the `tasks` collection.
 * @param taskData The data for the new task.
 */
export async function addTask(taskData: NewTask): Promise<{ id: string }> {
    try {
        const tasksCol = collection(db, 'tasks');
        
        const dataToAdd = {
          ...taskData,
          status: 'Pendente',
          createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(tasksCol, dataToAdd);
        return { id: docRef.id };
    } catch (error) {
        console.error("Error adding task: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao adicionar tarefa: ${error.message}`);
        }
        throw new Error("Falha ao adicionar tarefa ao banco de dados.");
    }
}
