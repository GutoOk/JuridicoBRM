
"use server";

import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, arrayUnion, writeBatch, serverTimestamp } from "firebase/firestore";
import type { Client, Phone } from "@/lib/types";
import { revalidatePath } from "next/cache";

export interface BatchClient {
  name: string;
  cpfCnpj?: string;
  phone?: string;
}

export type BatchResultStatus = 'Incluído' | 'Atualizado' | 'Existente' | 'Nome divergente' | 'Restaurado' | 'Falha' | 'Inválido';

export interface BatchResult {
  client: BatchClient;
  status: BatchResultStatus;
  message: string;
  clientId?: string;
}

export async function processBatchClients(clients: BatchClient[], author: string): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  const clientsRef = collection(db, "clients");

  for (const client of clients) {
    if (!client.cpfCnpj) {
      results.push({ client, status: 'Inválido', message: 'CPF/CNPJ é obrigatório.' });
      continue;
    }

    try {
      const q = query(clientsRef, where("cpfCnpj", "==", client.cpfCnpj));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // CPF not found, create new client
        const newClientData: Omit<Client, 'id'> = {
          name: client.name,
          cpfCnpj: client.cpfCnpj,
          phones: client.phone ? [{ number: client.phone, description: 'Principal', isPrimary: true }] : [],
          type: client.cpfCnpj.length > 11 ? 'Pessoa Jurídica' : 'Pessoa Física',
          createdBy: author,
          updatedBy: author,
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
          processIds: [],
          deleted: false,
          deletedAt: null,
          deletedBy: null,
          emails: [],
          addresses: [],
        };
        const docRef = await addDoc(clientsRef, newClientData);
        results.push({ client, status: 'Incluído', message: 'Novo cliente criado com sucesso.', clientId: docRef.id });

      } else {
        // CPF found, get existing client
        const existingClientDoc = querySnapshot.docs[0];
        const existingClientData = existingClientDoc.data() as Client;
        const clientRef = doc(db, "clients", existingClientDoc.id);

        // FIRST: Check if the client was soft-deleted and restore it.
        if (existingClientData.deleted) {
             await updateDoc(clientRef, {
                deleted: false,
                deletedAt: null,
                deletedBy: null,
                updatedAt: serverTimestamp(),
                updatedBy: author,
             });
             results.push({ client, status: 'Restaurado', message: 'Cliente estava na lixeira e foi reativado.', clientId: existingClientDoc.id });
             continue; // Stop further processing for this client
        }

        // --- Logic for non-deleted clients ---

        // SECOND: Check for name divergence
        if (existingClientData.name.toLowerCase() !== client.name.toLowerCase()) {
          results.push({ client, status: 'Nome divergente', message: `CPF/CNPJ encontrado, mas o nome é diferente (${existingClientData.name}).`, clientId: existingClientDoc.id });
          continue;
        }

        // THIRD: Check phone
        if (!client.phone) {
           results.push({ client, status: 'Existente', message: 'Cliente já existe, nenhum telefone fornecido para adicionar.', clientId: existingClientDoc.id });
           continue;
        }
        
        const phoneExists = existingClientData.phones?.some(p => p.number === client.phone);

        if (phoneExists) {
          results.push({ client, status: 'Existente', message: 'Cliente e telefone já cadastrados.', clientId: existingClientDoc.id });
        } else {
          // Phone does not exist, add it
          const newPhone: Phone = { number: client.phone, description: 'Adicionado em lote', isPrimary: !existingClientData.phones?.some(p => p.isPrimary) };
          
          await updateDoc(clientRef, {
            phones: arrayUnion(newPhone),
            updatedAt: serverTimestamp(),
            updatedBy: author,
          });
          results.push({ client, status: 'Atualizado', message: 'Telefone adicionado ao cliente existente.', clientId: existingClientDoc.id });
        }
      }
    } catch (error) {
      console.error(`Error processing client ${client.name}:`, error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      results.push({ client, status: 'Falha', message: `Erro ao processar: ${errorMessage}` });
    }
  }

  revalidatePath('/dashboard/clients');
  return results;
}
