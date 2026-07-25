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
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { HelpTip, PageHeader } from "@/components/shared/page-shell";
import { Button } from "@/components/ui/button";

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
      toast({ title: "Cliente excluído" });
      router.push("/dashboard/clients");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao excluir cliente" });
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
          <HelpTip label="Exclui este cliente.">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 size-4" /> Excluir cliente
            </Button>
          </HelpTip>
        )}
      </PageHeader>
      <ClientForm client={client} />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir cliente?"
        description="Deseja excluir este cliente?"
        onConfirm={softDelete}
      />
    </div>
  );
}
