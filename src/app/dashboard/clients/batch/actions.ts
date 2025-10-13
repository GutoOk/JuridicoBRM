
"use server";

import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, arrayUnion, writeBatch, serverTimestamp } from "firebase/firestore";
import type { Client, Phone } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { permanentlyDeleteClient } from "../actions";

export interface BatchClient {
  name: string;
  cpfCnpj?: string;
  phone?: string;
}

export type BatchResultStatus = 'Incluído' | 'Atualizado' | 'Existente' | 'Nome divergente' | 'Restaurado' | 'Corrigido' | 'Falha' | 'Inválido';

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
        // CPF not found, create new client with all fields initialized
        const newClientData: Omit<Client, 'id'> = {
          name: client.name,
          cpfCnpj: client.cpfCnpj,
          phones: client.phone ? [{ number: client.phone, description: 'Principal', isPrimary: true }] : [],
          emails: [],
          addresses: [],
          type: client.cpfCnpj.length > 11 ? 'Pessoa Jurídica' : 'Pessoa Física',
          createdBy: author,
          updatedBy: author,
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
          processIds: [],
          deleted: false,
          deletedAt: null,
          deletedBy: null,
          motherName: "",
          nationality: "",
          maritalStatus: "",
          profession: "",
          rg: "",
          rgIssuer: "",
          notes: "",
        };
        const docRef = await addDoc(clientsRef, newClientData);
        results.push({ client, status: 'Incluído', message: 'Novo cliente criado com sucesso.', clientId: docRef.id });

      } else {
        // CPF found, get existing client
        const existingClientDoc = querySnapshot.docs[0];
        const existingClientData = existingClientDoc.data() as Client;
        const clientRef = doc(db, "clients", existingClientDoc.id);

        // FIRST: Check if the client was soft-deleted and restore it. This is a terminal action.
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
        const fieldsToUpdate: Partial<Client> & {[key: string]: any} = {};
        let wasCorrected = false;

        // Prepare corrections without stopping the flow
        if (existingClientData.phones === undefined) { fieldsToUpdate.phones = []; wasCorrected = true; }
        if (existingClientData.emails === undefined) { fieldsToUpdate.emails = []; wasCorrected = true; }
        if (existingClientData.addresses === undefined) { fieldsToUpdate.addresses = []; wasCorrected = true; }
        if (existingClientData.processIds === undefined) { fieldsToUpdate.processIds = []; wasCorrected = true; }
        if (existingClientData.deleted === undefined) { fieldsToUpdate.deleted = false; wasCorrected = true; }
        
        // THIRD: Check for name divergence. This is a terminal action.
        if (existingClientData.name.toLowerCase() !== client.name.toLowerCase()) {
          results.push({ client, status: 'Nome divergente', message: `CPF/CNPJ encontrado, mas o nome é diferente (${existingClientData.name}).`, clientId: existingClientDoc.id });
          continue;
        }

        // FOURTH: Handle phone update logic
        let phoneAdded = false;
        if (client.phone) {
            // Use the corrected data if it exists, otherwise the original data
            const currentPhones = fieldsToUpdate.phones ?? existingClientData.phones ?? [];
            const phoneExists = currentPhones.some(p => p.number === client.phone);

            if (!phoneExists) {
                const newPhone: Phone = { number: client.phone, description: 'Adicionado em lote', isPrimary: !currentPhones.some(p => p.isPrimary) };
                // Add to the fieldsToUpdate object to be committed later
                fieldsToUpdate.phones = [...currentPhones, newPhone];
                phoneAdded = true;
            }
        }
        
        // FIFTH: Commit updates if any were made
        if (Object.keys(fieldsToUpdate).length > 0) {
            await updateDoc(clientRef, {
                ...fieldsToUpdate,
                updatedAt: serverTimestamp(),
                updatedBy: `${author} (Lote)`,
            });

            if (phoneAdded) {
                results.push({ client, status: 'Atualizado', message: 'Telefone adicionado e campos corrigidos.', clientId: existingClientDoc.id });
            } else if (wasCorrected) {
                 results.push({ client, status: 'Corrigido', message: 'Cliente teve campos ausentes reparados.', clientId: existingClientDoc.id });
            } else {
                 results.push({ client, status: 'Existente', message: 'Cliente e telefone já cadastrados.', clientId: existingClientDoc.id });
            }
        } else {
            // No fields to update, so the client and phone (if provided) already exist
            results.push({ client, status: 'Existente', message: 'Cliente e telefone já cadastrados.', clientId: existingClientDoc.id });
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

export async function deleteClientsByCpfCnpj(cpfCnpjList: string[]): Promise<{ deletedCount: number, errors: string[] }> {
    if (!cpfCnpjList || cpfCnpjList.length === 0) {
        throw new Error("A lista de CPFs/CNPJs está vazia.");
    }

    const clientsRef = collection(db, "clients");
    let deletedCount = 0;
    const errors: string[] = [];

    // Firestore `in` query is limited to 30 items
    const chunks = [];
    for (let i = 0; i < cpfCnpjList.length; i += 30) {
        chunks.push(cpfCnpjList.slice(i, i + 30));
    }

    for (const chunk of chunks) {
        try {
            const q = query(clientsRef, where("cpfCnpj", "in", chunk));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                continue;
            }

            for (const doc of querySnapshot.docs) {
                try {
                    await permanentlyDeleteClient(doc.id);
                    deletedCount++;
                } catch (deleteError: any) {
                    errors.push(`Falha ao excluir cliente com CPF/CNPJ ${doc.data().cpfCnpj}: ${deleteError.message}`);
                }
            }
        } catch (error: any) {
            errors.push(`Erro ao buscar clientes: ${error.message}`);
        }
    }
    
    revalidatePath('/dashboard/clients');

    return { deletedCount, errors };
}
