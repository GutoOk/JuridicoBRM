
"use server";

import { getClients } from "@/app/dashboard/clients/actions";
import { getProcesses } from "@/app/dashboard/processes/actions";
import { getAllTasks } from "@/app/dashboard/tasks/actions";
import type { Client, Process, Task, Address } from "@/lib/types";
import { format, parseISO } from 'date-fns';

type ReportData = Record<string, any>[];

function formatAddress(address: Address | undefined) {
    if (!address) return '';
    return [address.street, address.number, address.complement, address.district, address.city, address.state, address.zipCode].filter(Boolean).join(", ");
}

export async function getClientReportData(): Promise<ReportData> {
    const clients = await getClients();
    if (!clients || clients.length === 0) return [];
    return clients.map(c => ({
        'Nome': c.name,
        'Tipo': c.type,
        'CPF/CNPJ': c.cpfCnpj || '',
        'Email Principal': c.emails?.find(p => p.isPrimary)?.address || c.emails?.[0]?.address || '',
        'Emails Adicionais': c.emails?.filter(p => !p.isPrimary).map(p => `${p.address} (${p.description})`).join('; ') || '',
        'Telefone Principal': c.phones?.find(p => p.isPrimary)?.number || c.phones?.[0]?.number || '',
        'Telefones Adicionais': c.phones?.filter(p => !p.isPrimary).map(p => `${p.number} (${p.description})`).join('; ') || '',
        'Endereço Principal': (c.addresses && c.addresses.length > 0) ? formatAddress(c.addresses.find(a => a.isPrimary) || c.addresses[0]) : '',
        'Endereços Adicionais': c.addresses?.filter(p => !p.isPrimary).map(p => `${formatAddress(p)} (${p.description})`).join('; ') || '',
        'Data de Cadastro': c.createdAt ? format(parseISO(c.createdAt as string), 'dd/MM/yyyy HH:mm') : '',
    }));
}

export async function getProcessReportData(): Promise<ReportData> {
    const processes = await getProcesses();
    if (!processes || processes.length === 0) return [];
    return processes.map(p => ({
        'Nº Processo': p.processNumber,
        'Clientes': p.clientNames.join(', '),
        'Tipo de Ação': p.actionType,
        'Status': p.status,
        'Vara': p.vara || '',
        'Foro': p.foro || '',
        'Instância': p.instancia || '',
        'Data de Cadastro': p.createdAt ? format(parseISO(p.createdAt as string), 'dd/MM/yyyy HH:mm') : '',
        'Última Atualização': p.lastUpdate ? format(parseISO(p.lastUpdate as string), 'dd/MM/yyyy HH:mm') : '',
    }));
}

export async function getTaskReportData(): Promise<ReportData> {
    const tasks = await getAllTasks();
    if (!tasks || tasks.length === 0) return [];
    return tasks.map(t => ({
        'Tarefa': t.description,
        'Cliente Associado': t.clientName || 'N/A',
        'Processo Associado': t.processNumber || 'N/A',
        'Responsável': t.responsible,
        'Prioridade': t.priority,
        'Status': t.status,
        'Data de Criação': t.createdAt ? format(parseISO(t.createdAt as string), 'dd/MM/yyyy HH:mm') : '',
        'Prazo Final': t.dueDate ? format(parseISO(t.dueDate as string), 'dd/MM/yyyy') : 'N/A',
        'Data de Conclusão': t.completedAt ? format(parseISO(t.completedAt as string), 'dd/MM/yyyy HH:mm') : 'N/A',
     }));
}

export async function getDeadlineReportData(): Promise<ReportData> {
    const allTasks = await getAllTasks();
    const tasksWithDeadline = allTasks.filter(task => task.dueDate);
    if (!tasksWithDeadline || tasksWithDeadline.length === 0) return [];
    return tasksWithDeadline.map(t => ({
        'Prazo Final': t.dueDate ? format(parseISO(t.dueDate as string), 'dd/MM/yyyy') : '',
        'Tarefa': t.description,
        'Cliente Associado': t.clientName || 'N/A',
        'Processo Associado': t.processNumber || 'N/A',
        'Responsável': t.responsible,
        'Prioridade': t.priority,
        'Status': t.status,
     }));
}
