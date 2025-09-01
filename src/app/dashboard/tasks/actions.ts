

"use server";

import { db } from "@/lib/firebase";
import type { Task, User, Process, ClientUpdate, Client } from "@/lib/types";
import { collection, collectionGroup, getDocs, query, where, getDoc, doc, addDoc, serverTimestamp, writeBatch, updateDoc, deleteDoc } from "firebase/firestore";
import { revalidatePath } from "next/cache";

type NewTaskPayload = Omit<Task, 'id' | 'createdAt' | 'status' | 'clientName'| 'title'> & {
    description: string;
    selectedClientIds: string[];
    author: string;
}

type UpdateTaskPayload = Partial<Omit<Task, 'id' | 'createdAt'>> & {
    description?: string;
};


type BatchUpdatePayload = {
    tasks: Task[];
    updates: {
        responsible?: string;
        priority?: 'Alta' | 'Média' | 'Baixa';
        dueDate?: string | null;
        status?: 'Pendente' | 'Concluída';
    };
    currentUser: User;
}

/**
 * Ensures a "Tarefas Gerais" client exists and returns its ID.
 * If it doesn't exist, it creates one.
 */
async function getGeneralTasksClientId(): Promise<string> {
    const clientsRef = collection(db, "clients");
    const q = query(clientsRef, where("name", "==", "Tarefas Gerais"));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        // Return existing client ID
        return querySnapshot.docs[0].id;
    } else {
        // Create a new one
        const newClient: Omit<Client, 'id' | 'processIds'> = {
            name: "Tarefas Gerais",
            type: "Pessoa Jurídica",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: "Sistema",
            updatedBy: "Sistema",
            notes: "Este é um cliente de sistema para armazenar tarefas gerais não associadas a um cliente específico."
        };
        const docRef = await addDoc(clientsRef, {
            ...newClient,
            processIds: [],
        });
        return docRef.id;
    }
}


/**
 * Retrieves all updates that are tasks from the database across all clients.
 * @returns A promise that resolves to an array of tasks.
 */
export async function getAllTasks(): Promise<Task[]> {
    const tasksList: Task[] = [];

    const updatesRef = collectionGroup(db, 'updates');
    const updatesQuery = query(updatesRef, where('type', '==', 'Tarefa')); 
    const updatesSnapshot = await getDocs(updatesQuery);

    for (const updateDoc of updatesSnapshot.docs) {
        const data = updateDoc.data() as ClientUpdate;
        const clientId = updateDoc.ref.parent.parent?.id;

        if (clientId) {
            const clientDocRef = doc(db, "clients", clientId);
            const clientSnap = await getDoc(clientDocRef);
            
            const clientName = clientSnap.exists() ? clientSnap.data().name : 'Cliente não encontrado';

            // Skip tasks from the system-generated "Tarefas Gerais" client unless it is the only client.
            if (clientName === "Tarefas Gerais" && updatesSnapshot.docs.length > 1) {
                // This logic could be refined based on user needs, for now, we show them if that is all we have.
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
                clientId: clientId,
                clientName: clientName === "Tarefas Gerais" ? undefined : clientName, // Treat as general task if under "Tarefas Gerais"
                processId: data.processId,
                processNumber: processNumber,
                title: data.description,
                description: data.description,
                responsible: data.responsible || 'Todos',
                status: data.status || 'Pendente',
                priority: data.priority || 'Média', 
                dueDate: data.dueDate?.toDate?.().toISOString() || null,
                createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
                author: data.author || 'Desconhecido',
                completedAt: data.completedAt?.toDate?.().toISOString() || null,
                completedBy: data.completedBy || null,
            });
        }
    }

    // Sort tasks by creation date, most recent first
    return tasksList.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
}

/**
 * Retrieves a single task by its ID by searching through all client update subcollections.
 * @param taskId The ID of the task.
 * @returns A promise that resolves to the task object or null if not found.
 */
export async function getTaskById(taskId: string): Promise<Task | null> {
    try {
        const q = query(collectionGroup(db, 'updates'), where('__name__', 'ends-with', `/${taskId}`));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.warn(`Tarefa com ID "${taskId}" não encontrada em nenhuma subcoleção 'updates'.`);
            return null;
        }

        const taskDoc = snapshot.docs[0];
        const data = taskDoc.data() as ClientUpdate;
        const clientId = taskDoc.ref.parent.parent?.id;

        if (!clientId) {
            console.error(`Não foi possível determinar o clientId para a tarefa ${taskId}`);
            return null;
        }

        const task: Task = {
            id: taskDoc.id,
            clientId: clientId,
            title: data.description,
            description: data.description,
            type: data.type,
            ...data,
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            completedAt: data.completedAt?.toDate?.().toISOString() || null,
        };

        // Fetch client/process names for context
        const clientSnap = await getDoc(doc(db, "clients", clientId));
        task.clientName = clientSnap.exists() ? clientSnap.data().name : 'Cliente desconhecido';
         if (task.clientName === "Tarefas Gerais") {
            task.clientName = undefined;
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



export async function createTasks(taskData: NewTaskPayload): Promise<void> {
  try {
    const batch = writeBatch(db);
    let clientIds = taskData.selectedClientIds;

    // If no client is selected, we create it under the "Tarefas Gerais" client.
    if (clientIds.length === 0) {
        clientIds = [await getGeneralTasksClientId()];
    }

    const dataToAdd: Omit<ClientUpdate, 'id' | 'processId' | 'clientName' | 'processNumber' > = {
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

    clientIds.forEach(clientId => {
        const updateRef = doc(collection(db, "clients", clientId, "updates"));
        batch.set(updateRef, dataToAdd);
    });

    await batch.commit();

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/clients");

  } catch (error) {
    console.error("Error creating tasks: ", error);
    if (error instanceof Error) {
      throw new Error(`Falha ao criar tarefa(s): ${error.message}`);
    }
    throw new Error("Falha ao criar tarefa(s) no banco de dados.");
  }
}

/**
 * Updates an existing task.
 * @param originalTask The original task object, which MUST include the clientId.
 * @param newValues The new values from the form.
 */
export async function updateTask(originalTask: Task, newValues: UpdateTaskPayload): Promise<void> {
  try {
    if (!originalTask.clientId) {
      throw new Error("O ID do cliente é necessário para atualizar a tarefa, mas não foi fornecido.");
    }
    
    const taskDocRef = doc(db, "clients", originalTask.clientId, "updates", originalTask.id);
    
    const docSnap = await getDoc(taskDocRef);
    if (!docSnap.exists()) {
        throw new Error(`5 NOT_FOUND: No document to update: ${taskDocRef.path}`);
    }

    const dataToUpdate: { [key: string]: any } = {
        description: newValues.description,
        responsible: newValues.responsible,
        priority: newValues.priority,
        dueDate: newValues.dueDate ? new Date(newValues.dueDate as string) : null,
    };
    
    await updateDoc(taskDocRef, dataToUpdate);

    revalidatePath("/dashboard/tasks");
    revalidatePath(`/dashboard/clients/${originalTask.clientId}`);
    if (originalTask.processId) {
      revalidatePath(`/dashboard/processes/${originalTask.processId}`);
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
            if (task.clientId) {
                const taskDocRef = doc(db, "clients", task.clientId, "updates", task.id);
                const docSnap = await getDoc(taskDocRef);
                if (docSnap.exists()) {
                   batch.update(taskDocRef, dataToUpdate);
                } else {
                    console.warn(`Skipping update for task ${task.id} as it was not found under client ${task.clientId}`);
                }
            } else {
                 console.warn(`Skipping update for task ${task.id} as it has no clientId.`);
            }
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
export async function deleteTasksWithPermissionCheck(tasks: Task[], currentUser: User): Promise<void> {
  try {
    // Permission Check
    const canDeleteAll = tasks.every(task => task.author === currentUser.name);
    if (!canDeleteAll) {
        throw new Error("Você não tem permissão para excluir uma ou mais das tarefas selecionadas, pois não é o autor delas.");
    }

    const batch = writeBatch(db);

    for (const task of tasks) {
      if (task.clientId) {
        const taskDocRef = doc(db, "clients", task.clientId, "updates", task.id);
        const docSnap = await getDoc(taskDocRef);
        if (docSnap.exists()){
           batch.delete(taskDocRef);
        } else {
           console.warn(`Skipping delete for task ${task.id} as it was not found at path ${taskDocRef.path}`);
        }
      } else {
         console.warn(`Skipping delete for task ${task.id} as it has no clientId.`);
      }
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
    
