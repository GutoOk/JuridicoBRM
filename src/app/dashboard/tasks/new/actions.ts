
"use server";

import { revalidatePath } from "next/cache";
import { addClientUpdate } from "../../clients/[id]/actions";
import { addTask } from "../actions";

interface NewTaskData {
    title: string;
    author: string;
    clientId?: string;
    responsible?: string;
    priority?: 'Alta' | 'Média' | 'Baixa';
    dueDate?: string | null;
}

/**
 * Creates a new task, either linked to a client or as a general task.
 * @param taskData The data for the new task.
 */
export async function createNewTask(taskData: NewTaskData) {
  try {
    if (taskData.clientId) {
      // Task linked to a client
      await addClientUpdate(taskData.clientId, {
          type: 'Tarefa',
          description: taskData.title,
          author: taskData.author,
          responsible: taskData.responsible,
          priority: taskData.priority,
          dueDate: taskData.dueDate
      });
    } else {
      // General task
      await addTask({
          title: taskData.title,
          author: taskData.author,
          responsible: taskData.responsible,
          priority: taskData.priority,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null
      });
    }
    // Revalidate both pages to ensure lists are up to date
    revalidatePath("/dashboard/tasks");
    if (taskData.clientId) {
        revalidatePath(`/dashboard/clients/${taskData.clientId}`);
    }
  } catch (error) {
    console.error("Error creating new task: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao criar nova tarefa: ${error.message}`);
    }
    throw new Error("Falha ao criar nova tarefa no banco de dados.");
  }
}
