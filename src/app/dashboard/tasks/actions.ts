

"use server";

import { db } from "@/lib/firebase";
import type { Task, User, Process, Update, Client } from "@/lib/types";
import { collection, getDocs, query, where, getDoc, doc, addDoc, serverTimestamp, writeBatch, updateDoc, deleteDoc, orderBy, Timestamp } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { addClient } from "../clients/actions";

type NewTaskPayload = Omit<Update, 'id' | 'createdAt' | 'status' | 'clientName'| 'title' | 'type'> & {
    description: string;
    selectedClientIds?: string[];
    author: string;
}

type UpdateTaskPayload = Partial<Omit<Update, 'id' | 'createdAt'>> & {
    description?: string;
};


type BatchUpdatePayload = {
    tasks: Update[];
    updates: {
        responsible?: string;
        priority?: 'Alta' | 'Média' | 'Baixa';
        dueDate?: string | null;
        status?: 'Pendente' | 'Concluída';
    };
    currentUser: User;
}

/**
 * Retrieves all updates that are tasks from the database.
 * @returns A promise that resolves to an array of tasks.
 */
export async function getAllTasks(): Promise<Task[]> {
    const tasksList: Task[] = [];

    const updatesRef = collection(db, 'updates');
    const updatesQuery = query(updatesRef, where('type', '==', 'Tarefa'), orderBy('createdAt', 'desc')); 
    const updatesSnapshot = await getDocs(updatesQuery);

    for (const updateDoc of updatesSnapshot.docs) {
        const data = updateDoc.data() as Update;

        let clientName: string | undefined = undefined;
        if (data.clientId) {
            const clientDocRef = doc(db, "clients", data.clientId);
            const clientSnap = await getDoc(clientDocRef);
            clientName = clientSnap.exists() ? clientSnap.data().name : 'Cliente não encontrado';
        }

        let processNumber: string | undefined = undefined;
        if (data.processId) {
            const processDocRef = doc(db, 'processes', data.processId);
            const processSnap = await getDoc(processDocRef);
            if (processSnap.exists()) {
                processNumber = (processSnap.data() as Process).processNumber;
            }
        }

         tasksList.push({
            id: updateDoc.id,
            ...data,
            clientName: clientName,
            processNumber: processNumber,
            title: data.description,
            // Ensure defaults for tasks
            status: data.status || 'Pendente',
            responsible: data.responsible || 'Todos',
            priority: data.priority || 'Média',
            author: data.author || 'Desconhecido',
            // Convert timestamps
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            completedAt: data.completedAt?.toDate?.().toISOString() || null,
        } as Task);
    }
    return tasksList;
}

/**
 * Retrieves a single task by its ID from the 'updates' collection.
 * @param taskId The ID of the task.
 * @returns A promise that resolves to the task object or null if not found.
 */
export async function getTaskById(taskId: string): Promise<Task | null> {
    try {
        const taskDocRef = doc(db, "updates", taskId);
        const taskDoc = await getDoc(taskDocRef);

        if (!taskDoc.exists() || taskDoc.data()?.type !== 'Tarefa') {
            console.warn(`Tarefa com ID "${taskId}" não encontrada na coleção 'updates'.`);
            return null;
        }
        
        const data = taskDoc.data() as Update;
        
        const task: Task = {
            id: taskDoc.id,
            ...data,
            title: data.description,
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            completedAt: data.completedAt?.toDate?.().toISOString() || null,
        };

        // Fetch client/process names for context
        if (data.clientId) {
            const clientSnap = await getDoc(doc(db, "clients", data.clientId));
            task.clientName = clientSnap.exists() ? clientSnap.data().name : undefined;
        }
        if (data.processId) {
           const processSnap = await getDoc(doc(db, "processes", data.processId));
           task.processNumber = processSnap.exists() ? processSnap.data().processNumber : undefined;
        }

        return task;

    } catch (error) {
        console.error("Erro ao buscar tarefa por ID:", error);
        throw new Error("Falha ao buscar a tarefa.");
    }
}


/**
 * Creates new tasks in the 'updates' collection.
 * If no client is selected, it creates a general task under a special client "Tarefas Gerais".
 * @param taskData The payload for creating tasks.
 */
export async function createTasks(taskData: NewTaskPayload): Promise<void> {
  try {
    const batch = writeBatch(db);
    const updatesRef = collection(db, "updates");

    const dataToAdd: Omit<Update, 'id' | 'clientId'> = {
        description: taskData.description,
        type: 'Tarefa',
        author: taskData.author,
        responsible: taskData.responsible,
        priority: taskData.priority,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate as string) : null,
        status: 'Pendente',
        completedAt: null,
        completedBy: null,
        createdAt: serverTimestamp(),
    };
    
    // If no client is selected, create one general task.
    if (!taskData.selectedClientIds || taskData.selectedClientIds.length === 0) {
        const updateDocRef = doc(updatesRef);
        batch.set(updateDocRef, dataToAdd);
    } else {
        // Create a task for each selected client.
        taskData.selectedClientIds.forEach(clientId => {
            const updateDocRef = doc(updatesRef);
            batch.set(updateDocRef, { ...dataToAdd, clientId });
        });
    }

    await batch.commit();

    revalidatePath("/dashboard/tasks");
    if (taskData.selectedClientIds) {
      taskData.selectedClientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));
    }

  } catch (error) {
    console.error("Error creating tasks: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao criar tarefa(s): ${error.message}`);
    }
    throw new Error("Falha ao criar tarefa(s) no banco de dados.");
  }
}

/**
 * Updates an existing task in the 'updates' collection.
 * @param taskId The ID of the task to update.
 * @param newValues The new values from the form.
 */
export async function updateTask(taskId: string, newValues: UpdateTaskPayload): Promise<void> {
  try {
    const taskDocRef = doc(db, "updates", taskId);
    
    const docSnap = await getDoc(taskDocRef);
    if (!docSnap.exists()) {
        throw new Error(`Tarefa não encontrada com o ID: ${taskId}`);
    }

    const dataToUpdate: { [key: string]: any } = {
        description: newValues.description,
        responsible: newValues.responsible,
        priority: newValues.priority,
        dueDate: newValues.dueDate ? new Date(newValues.dueDate as string) : null,
    };
    
    await updateDoc(taskDocRef, dataToUpdate);
    const updatedDoc = await getDoc(taskDocRef);
    const updatedData = updatedDoc.data();

    revalidatePath("/dashboard/tasks");
    if (updatedData?.clientId) {
      revalidatePath(`/dashboard/clients/${updatedData.clientId}`);
    }
    if (updatedData?.processId) {
      revalidatePath(`/dashboard/processes/${updatedData.processId}`);
    }

  } catch (error) {
    console.error("Error updating task: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao atualizar tarefa: ${error.message}`);
    }
    throw new Error("Falha ao atualizar tarefa no banco de dados.");
  }
}

/**
 * Updates a batch of tasks with the provided data.
 */
export async function updateTasksInBatch(payload: BatchUpdatePayload): Promise<void> {
    const { tasks, updates, currentUser } = payload;
    try {
        const batch = writeBatch(db);
        const dataToUpdate: { [key: string]: any } = {};

        if (updates.responsible) dataToUpdate.responsible = updates.responsible;
        if (updates.priority) dataToUpdate.priority = updates.priority;
        if (updates.dueDate !== undefined) dataToUpdate.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
        if (updates.status) {
            dataToUpdate.status = updates.status;
            if (updates.status === 'Concluída') {
                dataToUpdate.completedAt = serverTimestamp();
                dataToUpdate.completedBy = currentUser.name;
            } else {
                dataToUpdate.completedAt = null;
                dataToUpdate.completedBy = null;
            }
        }

        if (Object.keys(dataToUpdate).length === 0) {
            throw new Error("Nenhuma alteração foi especificada.");
        }

        for (const task of tasks) {
            const taskDocRef = doc(db, "updates", task.id);
            batch.update(taskDocRef, dataToUpdate);
        }

        await batch.commit();
        revalidatePath("/dashboard/tasks");
        
        const clientIds = [...new Set(tasks.map(t => t.clientId).filter(Boolean))];
        clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));

    } catch (error) {
        console.error("Error updating tasks in batch: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao atualizar tarefas em lote: ${error.message}`);
        }
        throw new Error("Falha ao atualizar tarefas em lote no banco de dados.");
    }
}


/**
 * Deletes multiple tasks, but only if the current user is the author of all tasks.
 */
export async function deleteTasksWithPermissionCheck(tasks: Update[], currentUser: User): Promise<void> {
  try {
    // Permission Check
    const canDeleteAll = tasks.every(task => task.author === currentUser.name);
    if (!canDeleteAll) {
        throw new Error("Você não tem permissão para excluir uma ou mais das tarefas selecionadas, pois não é o autor delas.");
    }

    const batch = writeBatch(db);

    for (const task of tasks) {
        const taskDocRef = doc(db, "updates", task.id);
        batch.delete(taskDocRef);
    }

    await batch.commit();
    revalidatePath("/dashboard/tasks");
    
    const clientIds = [...new Set(tasks.map(t => t.clientId).filter(Boolean))];
    clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));

  } catch (error) {
    console.error("Error deleting tasks: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao excluir tarefas: ${error.message}`);
    }
    throw new Error("Falha ao excluir tarefas no banco de dados.");
  }
}
