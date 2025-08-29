
"use server";

import { getClients } from "@/app/dashboard/clients/actions";
import { getProcesses } from "@/app/dashboard/processes/actions";
import { getAllTasks } from "@/app/dashboard/tasks/actions";
import type { Client, Process, Task } from "@/lib/types";

export async function getClientReportData(): Promise<Client[]> {
    return await getClients();
}

export async function getProcessReportData(): Promise<Process[]> {
    return await getProcesses();
}

export async function getTaskReportData(): Promise<Task[]> {
    return await getAllTasks();
}

export async function getDeadlineReportData(): Promise<Task[]> {
    const allTasks = await getAllTasks();
    return allTasks.filter(task => task.dueDate);
}
