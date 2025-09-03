

"use server";

import { db } from "@/lib/firebase";
import type { Task, User, Process, Update, Client } from "@/lib/types";
import { collection, getDocs, query, where, getDoc, doc, addDoc, serverTimestamp, writeBatch, updateDoc, deleteDoc, orderBy, Timestamp } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { addClient } from "../clients/actions";

type NewTaskPayload = Omit<Update, 'id' | 'createdAt' | 'status' | 'clientName' | 'type'> & {
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
            try {
                const clientDocRef = doc(db, "clients", data.clientId);
                const clientSnap = await getDoc(clientDocRef);
                clientName = clientSnap.exists() ? clientSnap.data().name : 'Cliente não encontrado';
            } catch (e) {
                clientName = "Erro ao buscar cliente"
            }
        }

        let processNumber: string | undefined = undefined;
        if (data.processId) {
            try {
                const processDocRef = doc(db, 'processes', data.processId);
                const processSnap = await getDoc(processDocRef);
                if (processSnap.exists()) {
                    processNumber = (processSnap.data() as Process).processNumber;
                }
            } catch(e) {
                processNumber = "Erro ao buscar processo"
            }
        }

         tasksList.push({
            id: updateDoc.id,
            description: data.description,
            type: 'Tarefa',
            author: data.author,
            ...data,
            clientName: clientName,
            processNumber: processNumber,
            // Ensure defaults for tasks
            status: data.status || 'Pendente',
            responsible: data.responsible || 'Todos',
            priority: data.priority || 'Média',
            // Convert timestamps
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            completedAt: data.completedAt?.toDate?.().toISOString() || null,
            deleted: data.deleted || false,
            deletedAt: data.deletedAt?.toDate?.().toISOString() || null,
            deletedBy: data.deletedBy || null,
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

        if (!taskDoc.exists()) {
            console.warn(`Tarefa com ID "${taskId}" não encontrada.`);
            return null;
        }

        const data = taskDoc.data();

        if (data.type !== 'Tarefa') {
            console.warn(`Documento com ID "${taskId}" não é uma tarefa.`);
            return null;
        }
        
        const task: Task = {
            id: taskDoc.id,
            ...data,
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            completedAt: data.completedAt?.toDate?.().toISOString() || null,
        } as Task;

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
        deleted: false,
        deletedAt: null,
        deletedBy: null,
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

    const dataToUpdate: { [key: string]: any } = { ...newValues };

    if(newValues.dueDate && typeof newValues.dueDate === 'string'){
        dataToUpdate.dueDate = new Date(newValues.dueDate);
    }
    
    // Handle status change logic
    if (newValues.status) {
        dataToUpdate.status = newValues.status;
        if (newValues.status === 'Concluída') {
            dataToUpdate.completedAt = serverTimestamp();
            dataToUpdate.completedBy = newValues.completedBy; // Assumes completedBy is passed
        } else {
            dataToUpdate.completedAt = null;
            dataToUpdate.completedBy = null;
        }
    }

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
    if (taskId) {
        revalidatePath(`/dashboard/tasks/${taskId}/edit`);
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
        if (updates.dueDate !== undefined) {
             dataToUpdate.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
        }
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
 * Soft deletes multiple tasks by marking them as 'deleted'.
 * @param tasks An array of tasks to be soft-deleted.
 * @param authorName The name of the user performing the deletion.
 */
export async function softDeleteTasks(tasks: Update[], authorName: string): Promise<void> {
  try {
    const batch = writeBatch(db);

    for (const task of tasks) {
        const taskDocRef = doc(db, "updates", task.id);
        batch.update(taskDocRef, {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: authorName,
        });
    }

    await batch.commit();
    revalidatePath("/dashboard/tasks");
    
    const clientIds = [...new Set(tasks.map(t => t.clientId).filter(Boolean))];
    clientIds.forEach(id => revalidatePath(`/dashboard/clients/${id}`));

  } catch (error) {
    console.error("Error soft deleting tasks: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao excluir tarefas: ${error.message}`);
    }
    throw new Error("Falha ao excluir tarefas no banco de dados.");
  }
}

/**
 * Restores a soft-deleted task.
 * @param taskId The ID of the task to restore.
 */
export async function restoreTask(taskId: string): Promise<void> {
    try {
        const taskDocRef = doc(db, "updates", taskId);
        await updateDoc(taskDocRef, {
            deleted: false,
            deletedAt: null,
            deletedBy: null,
        });
        revalidatePath("/dashboard/tasks");
        
        const taskSnap = await getDoc(taskDocRef);
        const taskData = taskSnap.data();
        if (taskData?.clientId) {
            revalidatePath(`/dashboard/clients/${taskData.clientId}`);
        }
    } catch (error) {
        console.error("Error restoring task: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao restaurar tarefa: ${error.message}`);
        }
        throw new Error("Falha ao restaurar tarefa no banco de dados.");
    }
}

/**
 * Permanently deletes a task.
 * @param taskId The ID of the task to permanently delete.
 */
export async function permanentlyDeleteTask(taskId: string): Promise<void> {
    try {
        const taskDocRef = doc(db, "updates", taskId);
        await deleteDoc(taskDocRef);
        revalidatePath("/dashboard/tasks");
    } catch (error) {
        console.error("Error permanently deleting task: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir tarefa permanentemente: ${error.message}`);
        }
        throw new Error("Falha ao excluir tarefa permanentemente no banco de dados.");
    }
}
