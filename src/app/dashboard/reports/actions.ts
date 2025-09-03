
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
    return clients.map(c => {
        const primaryEmail = c.emails?.find(e => e.isPrimary) || (c.emails?.[0]);
        const otherEmails = c.emails?.filter(e => !(primaryEmail && e.address === primaryEmail.address)) || [];
        
        const primaryPhone = c.phones?.find(p => p.isPrimary) || (c.phones?.[0]);
        const otherPhones = c.phones?.filter(p => !(primaryPhone && p.number === primaryPhone.number)) || [];
        
        const primaryAddress = c.addresses?.find(a => a.isPrimary) || (c.addresses?.[0]);
        const otherAddresses = c.addresses?.filter(a => !(primaryAddress && formatAddress(a) === formatAddress(primaryAddress))) || [];

        return {
            'Nome': c.name,
            'Tipo': c.type,
            'CPF/CNPJ': c.cpfCnpj || '',
            'Email Principal': primaryEmail?.address || '',
            'Emails Adicionais': otherEmails.map(p => `${p.address} (${p.description})`).join('; ') || '',
            'Telefone Principal': primaryPhone?.number || '',
            'Telefones Adicionais': otherPhones.map(p => `${p.number} (${p.description})`).join('; ') || '',
            'Endereço Principal': formatAddress(primaryAddress) || '',
            'Endereços Adicionais': otherAddresses.map(p => `${formatAddress(p)} (${p.description})`).join('; ') || '',
            'Data de Cadastro': c.createdAt ? format(parseISO(c.createdAt as string), 'dd/MM/yyyy HH:mm') : '',
        };
    });
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
