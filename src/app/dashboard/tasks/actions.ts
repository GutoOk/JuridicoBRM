

"use server";

import { db } from "@/lib/firebase";
import type { Task, User, Process, ClientUpdate } from "@/lib/types";
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
                clientName: clientName,
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
            description: data.title, // ensure description field is populated
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            author: data.author || 'Desconhecido',
        } as Task);
    }


    // Sort tasks by creation date, most recent first
    return tasksList.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
}

/**
 * Retrieves a single task by its ID. It intelligently searches in both general tasks
 * and client-specific updates subcollections.
 * @param taskId The ID of the task.
 * @param contextClientId Optional. The ID of the client if the search context is a client page.
 * @returns A promise that resolves to the task object or null if not found.
 */
export async function getTaskById(taskId: string, contextClientId?: string | null): Promise<Task | null> {
    try {
        let taskDoc;
        let taskRef;
        let isClientTask = false;

        // Strategy:
        // 1. If contextClientId is provided, check there first. This is the most likely location.
        if (contextClientId) {
            taskRef = doc(db, "clients", contextClientId, "updates", taskId);
            taskDoc = await getDoc(taskRef);
            if (taskDoc.exists()) {
                isClientTask = true;
            }
        }
        
        // 2. If not found, check the general /tasks collection.
        if (!taskDoc || !taskDoc.exists()) {
            taskRef = doc(db, "tasks", taskId);
            taskDoc = await getDoc(taskRef);
            isClientTask = false; // It's a general task
        }

        // 3. If still not found, we must iterate through all clients' updates subcollections.
        // This is a fallback and can be slow, but ensures task is found if it exists anywhere.
        if (!taskDoc || !taskDoc.exists()) {
             const updatesQuery = query(collectionGroup(db, 'updates'), where('__name__', '==', `updates/${taskId}`));
             const snapshot = await getDocs(updatesQuery);
             if (!snapshot.empty) {
                 taskDoc = snapshot.docs[0];
                 taskRef = taskDoc.ref;
                 isClientTask = true;
             }
        }
        
        // 4. If not found after all checks, return null.
        if (!taskDoc || !taskDoc.exists()) {
            console.warn(`Tarefa com ID "${taskId}" não encontrada em nenhuma coleção.`);
            return null;
        }

        const data = taskDoc.data() as ClientUpdate;

        const task: Task = {
            id: taskDoc.id,
            clientId: isClientTask ? taskDoc.ref.parent.parent?.id : undefined,
            title: isClientTask ? data.description : (data as any).title,
            description: data.description || (data as any).title,
            ...data,
            dueDate: data.dueDate?.toDate?.().toISOString() || null,
            createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            completedAt: data.completedAt?.toDate?.().toISOString() || null,
        };

        // If it's a client task, we might need to fetch client/process names
        if (task.clientId) {
             const clientSnap = await getDoc(doc(db, "clients", task.clientId));
             task.clientName = clientSnap.exists() ? clientSnap.data().name : 'Cliente desconhecido';
             if (data.processId) {
                const processSnap = await getDoc(doc(db, "processes", data.processId));
                task.processNumber = processSnap.exists() ? processSnap.data().processNumber : undefined;
             }
        }

        return task;

    } catch (error) {
        console.error("Erro ao buscar tarefa por ID:", error);
        throw new Error("Falha ao buscar a tarefa.");
    }
}


/**
 * Adds a new general task to the `tasks` collection.
 */
async function addGeneralTask(taskData: Omit<NewTaskPayload, 'selectedClientIds'>) {
    const tasksCol = collection(db, 'tasks');
    const dataToAdd = {
        title: taskData.description,
        responsible: taskData.responsible,
        priority: taskData.priority,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate as string) : null,
        author: taskData.author,
        status: 'Pendente',
        createdAt: serverTimestamp(),
    };
    await addDoc(tasksCol, dataToAdd);
}

/**
 * Adds a new task update to multiple clients using a batch write.
 */
async function addTaskToClients(taskData: NewTaskPayload) {
    const batch = writeBatch(db);

    const dataToAdd = {
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

    taskData.selectedClientIds.forEach(clientId => {
        const updateRef = doc(collection(db, "clients", clientId, "updates"));
        batch.set(updateRef, dataToAdd);
    });

    await batch.commit();
}


export async function createTasks(taskData: NewTaskPayload): Promise<void> {
  try {
    if (taskData.selectedClientIds.length === 0) {
      // Create a single general task
      await addGeneralTask(taskData);
    } else {
      // Create a task for each selected client
      await addTaskToClients(taskData);
    }
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
 * Updates an existing task, whether it's a general task or a client-specific one.
 * @param originalTask The original task object fetched from the DB, used to determine its location.
 * @param newValues The new values from the form.
 */
export async function updateTask(originalTask: Task, newValues: UpdateTaskPayload): Promise<void> {
  try {
    let taskDocRef;
    
    // Use the originalTask's clientId to determine if it's a client task.
    if (originalTask.clientId) {
      taskDocRef = doc(db, "clients", originalTask.clientId, "updates", originalTask.id);
    } else {
      // It's a general task in the root 'tasks' collection
      taskDocRef = doc(db, "tasks", originalTask.id);
    }
    
    // Check if the document actually exists before trying to update it.
    const docSnap = await getDoc(taskDocRef);
    if (!docSnap.exists()) {
        throw new Error(`5 NOT_FOUND: No document to update: ${taskDocRef.path}`);
    }

    const dataToUpdate: { [key: string]: any } = {
        responsible: newValues.responsible,
        priority: newValues.priority,
        dueDate: newValues.dueDate ? new Date(newValues.dueDate as string) : null,
    };
    
    // Use 'description' for client updates and 'title' for general tasks
    if (originalTask.clientId) {
        dataToUpdate.description = newValues.description;
    } else {
        dataToUpdate.title = newValues.description;
    }
    
    await updateDoc(taskDocRef, dataToUpdate);

    revalidatePath("/dashboard/tasks");
    if (originalTask.clientId) {
        revalidatePath(`/dashboard/clients/${originalTask.clientId}`);
    }
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
            let taskDocRef;
            if (task.clientId) {
                taskDocRef = doc(db, "clients", task.clientId, "updates", task.id);
            } else {
                taskDocRef = doc(db, "tasks", task.id);
                 if (dataToUpdate.description) {
                    dataToUpdate.title = dataToUpdate.description;
                    delete dataToUpdate.description;
                }
            }
            const docSnap = await getDoc(taskDocRef);
            if (docSnap.exists()) {
               batch.update(taskDocRef, dataToUpdate);
            } else {
                console.warn(`Skipping update for task ${task.id} as it was not found at path ${taskDocRef.path}`);
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
 * @param tasks An array of tasks to be deleted.
 * @param currentUser The user attempting the deletion.
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
      let taskDocRef;
      if (task.clientId) {
        taskDocRef = doc(db, "clients", task.clientId, "updates", task.id);
      } else {
        taskDocRef = doc(db, "tasks", task.id);
      }
      const docSnap = await getDoc(taskDocRef);
      if (docSnap.exists()){
         batch.delete(taskDocRef);
      } else {
         console.warn(`Skipping delete for task ${task.id} as it was not found at path ${taskDocRef.path}`);
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
    
