
"use server";

import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp, collectionGroup } from "firebase/firestore";
import type { Process, Task, Client } from "@/lib/types";
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
    // Handle both ISO string and Firestore Timestamp object
    if (typeof date === 'string') {
        return new Date(date);
    }
    if (date && typeof date.toDate === 'function') { // Check for Firestore Timestamp
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
            acc[p.status] = (acc[p.status] || 0) + 1;
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

        // Tasks Data
        const allTasks: Task[] = [];
        const tasksQuery = query(collectionGroup(db, 'updates'), where('type', '==', 'Tarefa'));
        const tasksSnapshot = await getDocs(tasksQuery);
        tasksSnapshot.forEach(doc => {
            const data = doc.data();
            allTasks.push({
                ...data,
                id: doc.id,
                dueDate: data.dueDate,
                status: data.status,
                completedAt: data.completedAt,
            } as Task);
        });

        const pendingTasks = allTasks.filter(t => t.status === 'Pendente');
        const pendingTasksCount = pendingTasks.length;
        const nowForOverdue = startOfDay(new Date()); // Compare with the start of today
        const overdueTasksCount = pendingTasks.filter(t => {
            const dueDate = safeDateParse(t.dueDate);
            return dueDate && dueDate < nowForOverdue;
        }).length;

        const completedTasksByMonth = Array.from({ length: 6 }).map((_, i) => {
            const date = subMonths(now, i);
            const monthStart = startOfMonth(date);
            const monthEnd = endOfMonth(date);
            const monthName = date.toLocaleString('pt-BR', { month: 'short' });

            const total = allTasks.filter(t => {
                if (t.status === 'Concluída') {
                    const completedDate = safeDateParse(t.completedAt);
                    return completedDate && completedDate >= monthStart && completedDate <= monthEnd;
                }
                return false;
            }).length;

            return { name: monthName.charAt(0).toUpperCase() + monthName.slice(1), total };
        }).reverse();
        
        // Updates Data (all types in the last 24 hours)
        const twentyFourHoursAgo = subDays(now, 1);
        const allUpdatesQuery = query(collectionGroup(db, 'updates'));
        const allUpdatesSnapshot = await getDocs(allUpdatesQuery);
        
        let recentUpdatesCount = 0;
        allUpdatesSnapshot.forEach(doc => {
            const data = doc.data();
            const createdAtDate = safeDateParse(data.createdAt);
            if (createdAtDate && createdAtDate >= twentyFourHoursAgo) {
                recentUpdatesCount++;
            }
        });

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

    } catch (error) {
        console.error("Error fetching dashboard data: ", error);
        throw new Error("Failed to fetch dashboard data.");
    }
}
