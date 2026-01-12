
"use server";

import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp, collectionGroup, getCountFromServer } from "firebase/firestore";
import type { Process, Task, Client, Update } from "@/lib/types";
import { startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, startOfDay, subDays } from 'date-fns';

export interface DashboardData {
    activeProcessesCount: number;
    processesThisMonthCount: number;
    clientsCount: number;
    clientsThisWeekCount: number;
    pendingTasksCount: number;
    overdueTasksCount: number;
    recentUpdatesCount: number;
    processesByStatus: { name: string, total: number }[];
    completedTasksByMonth: { name: string, total: number }[];
}

const safeDateParse = (date: any): Date | null => {
    if (!date) return null;
    if (typeof date === 'string') {
        const parsed = new Date(date);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (date && typeof date.toDate === 'function') { // Firestore Timestamp
        return date.toDate();
    }
    if (date instanceof Date) {
        return date;
    }
    return null;
}

export async function getDashboardData(): Promise<DashboardData> {
    try {
        const now = new Date();
        
        // Processes Data
        const processesRef = collection(db, "processes");
        const processesSnapshot = await getDocs(processesRef);
        const allProcesses = processesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Process));
        
        const activeProcessesCount = allProcesses.filter(p => p.status === 'Ativo').length;
        
        const startOfThisMonth = startOfMonth(now);
        const processesThisMonthCount = allProcesses.filter(p => {
            const createdAtDate = safeDateParse(p.createdAt);
            return createdAtDate && createdAtDate >= startOfThisMonth;
        }).length;

        const processesByStatusMap = allProcesses.reduce((acc, p) => {
            if (p.status) {
                acc[p.status] = (acc[p.status] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        const processesByStatus = Object.entries(processesByStatusMap).map(([name, total]) => ({ name, total }));

        // Clients Data
        const clientsRef = collection(db, "clients");
        const clientsSnapshot = await getDocs(clientsRef);
        const allClients = clientsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Client));

        const clientsCount = allClients.length;

        const startOfThisWeek = startOfWeek(now);
        const clientsThisWeekCount = allClients.filter(c => {
            const createdAtDate = safeDateParse(c.createdAt);
            return createdAtDate && createdAtDate >= startOfThisWeek;
        }).length;

        // Optimized Task and Update Queries
        const updatesRef = collection(db, 'updates');

        // Count pending tasks
        const pendingTasksQuery = query(updatesRef, where('type', '==', 'Tarefa'), where('status', '==', 'Pendente'));
        const pendingTasksSnapshot = await getCountFromServer(pendingTasksQuery);
        const pendingTasksCount = pendingTasksSnapshot.data().count;

        // Count overdue tasks (more complex, might require reading docs if too slow)
        const overdueTasksQuery = query(updatesRef, where('type', '==', 'Tarefa'), where('status', '==', 'Pendente'), where('dueDate', '<', Timestamp.now()));
        const overdueTasksSnapshot = await getCountFromServer(overdueTasksQuery);
        const overdueTasksCount = overdueTasksSnapshot.data().count;
        
        // Count recent updates
        const twentyFourHoursAgo = subDays(now, 1);
        const recentUpdatesQuery = query(updatesRef, where('createdAt', '>=', Timestamp.fromDate(twentyFourHoursAgo)));
        const recentUpdatesSnapshot = await getCountFromServer(recentUpdatesQuery);
        const recentUpdatesCount = recentUpdatesSnapshot.data().count;

        // Get completed tasks for chart (this still requires reading docs, but is scoped)
        const sixMonthsAgo = startOfMonth(subMonths(now, 5));
        const completedTasksQuery = query(updatesRef, where('type', '==', 'Tarefa'), where('status', '==', 'Concluída'), where('completedAt', '>=', Timestamp.fromDate(sixMonthsAgo)));
        const completedTasksSnapshot = await getDocs(completedTasksQuery);
        const completedTasks = completedTasksSnapshot.docs.map(doc => doc.data() as Task);

        const completedTasksByMonth = Array.from({ length: 6 }).map((_, i) => {
            const date = subMonths(now, i);
            const monthStart = startOfMonth(date);
            const monthEnd = endOfMonth(date);
            const monthName = date.toLocaleString('pt-BR', { month: 'short' });

            const total = completedTasks.filter(t => {
                const completedDate = safeDateParse(t.completedAt);
                return completedDate && completedDate >= monthStart && completedDate <= monthEnd;
            }).length;

            return { name: monthName.charAt(0).toUpperCase() + monthName.slice(1), total };
        }).reverse();

        return {
            activeProcessesCount,
            processesThisMonthCount,
            clientsCount,
            clientsThisWeekCount,
            pendingTasksCount,
            overdueTasksCount,
            recentUpdatesCount,
            processesByStatus,
            completedTasksByMonth
        };

    } catch (error: any) {
        console.error("Error fetching dashboard data: ", error);
        // Lança um erro com uma mensagem mais descritiva.
        // Isso ajuda a diferenciar um erro de cota/permissão de um bug no código.
        if (error.code === 'resource-exhausted' || error.message.includes('rate exceeded')) {
            throw new Error("A cota do Firebase foi excedida (Rate exceeded). Verifique o uso no Console do Firebase.");
        }
        if (error.code === 'permission-denied') {
             throw new Error("Permissão negada para acessar o banco de dados. Verifique as regras de segurança e as permissões da conta de serviço.");
        }
        throw new Error(`Falha ao buscar dados do dashboard: ${error.message}`);
    }
}
