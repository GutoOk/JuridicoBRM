
"use server";

import { revalidatePath } from "next/cache";
import type { ClientGroup } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, getDoc, query, orderBy, serverTimestamp, updateDoc, deleteDoc } from "firebase/firestore";

type NewClientGroup = Omit<ClientGroup, 'id' | 'createdAt' | 'updatedAt' | 'author' | 'deleted' | 'deletedAt' | 'deletedBy'>;
type UpdatableClientGroup = Partial<Omit<ClientGroup, 'id' | 'createdAt' | 'updatedAt' | 'author'>>;


export async function getClientGroups(): Promise<ClientGroup[]> {
  const groupsCol = collection(db, "clientGroups");
  // A ordenação será feita no lado do cliente para evitar a necessidade de um índice composto complexo.
  const groupSnapshot = await getDocs(groupsCol);
  const groupList = groupSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
      deletedAt: data.deletedAt?.toDate?.().toISOString() || null,
    } as ClientGroup;
  });
  // Ordenar no lado do servidor antes de retornar
  return groupList.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
}

export async function getClientGroupById(id: string): Promise<ClientGroup | null> {
  try {
    const groupDocRef = doc(db, "clientGroups", id);
    const groupSnap = await getDoc(groupDocRef);

    if (groupSnap.exists()) {
      const data = groupSnap.data();
      return {
        id: groupSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
        deletedAt: data.deletedAt?.toDate?.().toISOString() || null,
      } as ClientGroup;
    } else {
      console.warn(`Grupo de Clientes com ID "${id}" não encontrado.`);
      return null;
    }
  } catch (error) {
    console.error("Erro ao buscar grupo por ID: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao buscar grupo: ${error.message}`);
    }
    throw new Error("Falha ao buscar grupo no banco de dados.");
  }
}

export async function addClientGroup(groupData: NewClientGroup, author: string): Promise<{ id: string }> {
  try {
    const groupsCol = collection(db, "clientGroups");
    const docRef = await addDoc(groupsCol, {
      ...groupData,
      author: author,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deleted: false,
      deletedAt: null,
      deletedBy: null,
    });

    revalidatePath("/dashboard/groups");
    return { id: docRef.id };
  } catch (error) {
    console.error("Error adding client group: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao adicionar grupo: ${error.message}`);
    }
    throw new Error("Falha ao adicionar grupo ao banco de dados.");
  }
}

export async function updateClientGroup(id: string, groupData: UpdatableClientGroup, author: string): Promise<void> {
  try {
    const groupDocRef = doc(db, "clientGroups", id);
    await updateDoc(groupDocRef, {
      ...groupData,
      updatedAt: serverTimestamp(),
      author: author, // Keep track of last editor as well
    });

    revalidatePath(`/dashboard/groups`);
    revalidatePath(`/dashboard/groups/${id}`);

  } catch (error) {
    console.error("Error updating client group: ", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao atualizar grupo: ${error.message}`);
    }
    throw new Error("Falha ao atualizar grupo no banco de dados.");
  }
}

export async function softDeleteClientGroup(groupId: string, authorName: string): Promise<void> {
    const groupRef = doc(db, "clientGroups", groupId);
    try {
        await updateDoc(groupRef, {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: authorName,
        });
        revalidatePath('/dashboard/groups');
    } catch (error) {
        console.error("Error soft deleting group: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir grupo: ${error.message}`);
        }
        throw new Error("Falha ao excluir grupo no banco de dados.");
    }
}

export async function restoreClientGroup(groupId: string): Promise<void> {
    const groupRef = doc(db, "clientGroups", groupId);
    try {
        await updateDoc(groupRef, {
            deleted: false,
            deletedAt: null,
            deletedBy: null,
        });
        revalidatePath('/dashboard/groups');
    } catch (error) {
        console.error("Error restoring group: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao restaurar grupo: ${error.message}`);
        }
        throw new Error("Falha ao restaurar grupo no banco de dados.");
    }
}


export async function permanentlyDeleteClientGroup(id: string): Promise<void> {
    try {
        const groupDocRef = doc(db, "clientGroups", id);
        await deleteDoc(groupDocRef);
        revalidatePath("/dashboard/groups");
    } catch (error) {
        console.error("Error permanently deleting client group: ", error);
        if (error instanceof Error) {
            throw new Error(`Falha ao excluir grupo permanentemente: ${error.message}`);
        }
        throw new Error("Falha ao excluir grupo permanentemente no banco de dados.");
    }
}
