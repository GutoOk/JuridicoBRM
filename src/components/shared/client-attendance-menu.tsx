"use client";

import { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { EllipsisVertical, Eye, Loader2, MessageSquarePlus, StickyNote } from "lucide-react";
import { db } from "@/lib/firebase";
import { addNote } from "@/lib/db-actions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { dateMillis, formatDateTime } from "@/lib/normalize";
import type { Client, Update } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

export function ClientAttendanceMenu({
  client,
  onRegister,
}: {
  client: Client;
  onRegister: (client: Client) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [attendance, setAttendance] = useState<Update | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadLastAttendance = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, "updates"), where("clientId", "==", client.id)));
      const latest = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as Update)
        .filter((item) => item.type === "Atendimento" && !item.deleted)
        .sort((a, b) => dateMillis(b.createdAt ?? b.updateDate) - dateMillis(a.createdAt ?? a.updateDate))[0] ?? null;
      setAttendance(latest);
      setViewOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    if (!user || !note.trim()) return;
    setSavingNote(true);
    try {
      await addNote(client, note.trim(), user);
      toast({ title: "Anotação registrada", description: client.name });
      setNoteOpen(false);
      setNote("");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao registrar anotação" });
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-7" title={`Ações de atendimento de ${client.name}`}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <EllipsisVertical className="size-4" />}
            <span className="sr-only">Ações de atendimento</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={loadLastAttendance} disabled={loading}>
            <Eye className="mr-2 size-3.5" /> Ver último atendimento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRegister(client)}>
            <MessageSquarePlus className="mr-2 size-3.5" /> Cadastrar novo atendimento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setNote(""); setNoteOpen(true); }}>
            <StickyNote className="mr-2 size-3.5" /> Cadastrar nova anotação
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Último atendimento</DialogTitle>
            <DialogDescription>{attendance?.clientName ?? "Nenhum atendimento registrado para este cliente."}</DialogDescription>
          </DialogHeader>
          {attendance && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/35 p-3 text-xs">
                <div><p className="text-muted-foreground">Data</p><p>{formatDateTime(attendance.createdAt ?? attendance.updateDate)}</p></div>
                <div><p className="text-muted-foreground">Registrado por</p><p>{attendance.author || "—"}</p></div>
                <div><p className="text-muted-foreground">Canal</p><p>{attendance.channel || "Não informado"}</p></div>
                {attendance.result && <div><p className="text-muted-foreground">Resultado antigo</p><p>{attendance.result}</p></div>}
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Registro do atendimento</p>
                <p className="whitespace-pre-wrap rounded-md border bg-background p-3">{attendance.description}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova anotação</DialogTitle>
            <DialogDescription>{client.name}. A anotação aparecerá no painel de Andamentos.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Escreva a anotação..."
            rows={5}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancelar</Button>
            <Button onClick={saveNote} disabled={savingNote || !note.trim()}>
              {savingNote && <Loader2 className="mr-2 size-4 animate-spin" />}
              Registrar anotação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
