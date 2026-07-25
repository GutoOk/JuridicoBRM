"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { CONTACT_CHANNELS, type ContactChannel, type Update } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

/** Quem pode alterar um andamento: o autor ou um administrador. */
export function canEditUpdate(u: Update, userId: string | undefined, isAdmin: boolean): boolean {
  return u.type !== "Financeiro" && (isAdmin || (!!userId && u.authorId === userId));
}

/**
 * Edição/exclusão de um andamento (anotação, atendimento ou andamento
 * processual). Exclusão é reversível (lixeira) — nada é apagado do banco.
 */
export function EditUpdateDialog({
  update,
  open,
  onOpenChange,
}: {
  update: Update | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState<ContactChannel | "">("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && update) {
      setDescription(update.description ?? "");
      setChannel(update.channel ?? "");
    }
  }, [open, update]);

  if (!update) return null;
  const isContact = update.type === "Atendimento";

  const save = async () => {
    if (!user || !description.trim()) return;
    setSaving(true);
    try {
      const patch: Record<string, any> = {
        description: description.trim(),
        updateDate: serverTimestamp(),
      };
      if (isContact) {
        if (channel) patch.channel = channel;
      }
      await updateDoc(doc(db, "updates", update.id), patch);
      toast({ title: "Andamento atualizado" });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "updates", update.id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.name,
      });
      toast({ title: "Registro excluído" });
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "updates", update.id), {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.name ?? "",
      });
      toast({ title: "Andamento restaurado" });
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao restaurar" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar {update.type.toLowerCase()}</DialogTitle>
            <DialogDescription>
              {update.clientName ? `Cliente: ${update.clientName} · ` : ""}registrado por {update.author}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {isContact && (
              <div className="space-y-1">
                <div className="space-y-1">
                  <Label>Canal</Label>
                  <Select value={channel || undefined} onValueChange={(v) => setChannel(v as ContactChannel)}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>{isContact ? "Registro do atendimento" : "Descrição"}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            {update.deleted ? (
              <Button variant="ghost" onClick={restore} disabled={saving}>
                <ArchiveRestore className="mr-1.5 size-4" /> Restaurar
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 className="mr-1.5 size-4" /> Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving || !description.trim()}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir registro?"
        description="Deseja excluir este registro?"
        onConfirm={softDelete}
        loading={saving}
      />
    </>
  );
}
