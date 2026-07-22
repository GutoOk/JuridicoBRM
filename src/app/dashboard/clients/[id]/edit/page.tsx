"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useDoc } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@/lib/types";
import { ClientForm } from "@/components/shared/client-form";
import { HelpTip, PageHeader } from "@/components/shared/page-shell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client } = useDoc<Client>("clients", id);
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (client === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (client === null) {
    return <p className="text-muted-foreground">Cliente não encontrado.</p>;
  }

  const softDelete = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "clients", client.id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.name,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      toast({ title: "Cliente movido para a lixeira" });
      router.push("/dashboard/clients");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao mover cliente para a lixeira" });
    }
  };

  return (
    <div className="page-shell max-w-5xl">
      <PageHeader
        eyebrow="cadastro"
        title="Editar cliente"
        description={client.name}
      >
        {!client.deleted && (
          <HelpTip label="Move o cliente para a lixeira. Nada é apagado e o cadastro pode ser restaurado depois.">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 size-4" /> Excluir cliente
            </Button>
          </HelpTip>
        )}
      </PageHeader>
      <ClientForm client={client} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover cliente para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              {client.name} deixará de aparecer nas listas e relatórios, mas nenhum dado será apagado definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={softDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Mover para lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
