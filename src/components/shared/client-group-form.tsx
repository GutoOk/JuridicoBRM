"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2, Plus, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import type { Client, ClientGroup } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { HelpTip } from "@/components/shared/page-shell";

export function ClientGroupForm({ group }: { group?: ClientGroup | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: clients } = useCollection<Client>("clients");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(group?.name ?? "");
    setNotes(group?.notes ?? "");
    setSelectedIds(group?.clientIds ?? []);
  }, [group]);

  const activeClients = useMemo(
    () => (clients ?? []).filter((client) => !client.deleted),
    [clients]
  );
  const visibleClients = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return activeClients
      .filter((client) => !q || client.name.toLocaleLowerCase("pt-BR").includes(q) || client.code?.toLocaleLowerCase("pt-BR").includes(q))
      .sort((a, b) => {
        const selectedDiff = Number(selectedIds.includes(b.id)) - Number(selectedIds.includes(a.id));
        return selectedDiff || a.name.localeCompare(b.name, "pt-BR");
      });
  }, [activeClients, search, selectedIds]);

  const save = async () => {
    if (!user || name.trim().length < 3) return;
    setSaving(true);
    try {
      const selectedClients = selectedIds
        .map((id) => activeClients.find((client) => client.id === id))
        .filter((client): client is Client => !!client);
      const data = {
        name: name.trim(),
        notes: notes.trim(),
        clientIds: selectedClients.map((client) => client.id),
        clientNames: selectedClients.map((client) => client.name),
        updatedAt: serverTimestamp(),
      };
      if (group) {
        await updateDoc(doc(db, "clientGroups", group.id), data);
        toast({ title: "Grupo atualizado" });
      } else {
        const ref = await addDoc(collection(db, "clientGroups"), {
          ...data,
          author: user.name,
          createdAt: serverTimestamp(),
          deleted: false,
        });
        toast({ title: "Grupo criado" });
        router.push(`/dashboard/groups/${ref.id}`);
      }
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao salvar grupo" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface space-y-3 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="group-name">Nome do grupo</Label>
          <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: clientes para revisar esta semana" />
          {name.length > 0 && name.trim().length < 3 && <p className="text-xs text-destructive">Informe ao menos 3 caracteres.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-notes">Observações</Label>
          <Textarea id="group-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Motivo do agrupamento ou orientação para a equipe" />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="flex items-center gap-1">
            Clientes do grupo
            <HelpTip label="O grupo é apenas organizacional: incluir ou remover um cliente não altera processos, operações ou o cadastro dele." />
          </Label>
          <span className="text-xs text-muted-foreground">{selectedIds.length} selecionado(s)</span>
        </div>
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b p-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente por nome ou código" className="h-8 pl-8" />
            </div>
            <HelpTip label="Cadastra um novo cliente. Depois, volte ao grupo para selecioná-lo.">
              <Button asChild variant="outline" size="icon" className="size-8">
                <Link href={`/dashboard/clients/new?redirect=${encodeURIComponent(group ? `/dashboard/groups/${group.id}` : "/dashboard/groups/new")}`}>
                  <Plus className="size-3.5" /><span className="sr-only">Cadastrar cliente</span>
                </Link>
              </Button>
            </HelpTip>
          </div>
          <ScrollArea className="h-52">
            <div className="space-y-0.5 p-1.5">
              {visibleClients.map((client) => (
                <label key={client.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60">
                  <Checkbox
                    checked={selectedIds.includes(client.id)}
                    onCheckedChange={(checked) => setSelectedIds((current) => checked ? [...current, client.id] : current.filter((id) => id !== client.id))}
                  />
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  {client.code && <span className="text-muted-foreground">{client.code}</span>}
                </label>
              ))}
              {clients && visibleClients.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
              {!clients && <p className="py-6 text-center text-xs text-muted-foreground">Carregando clientes...</p>}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link href="/dashboard/groups">Cancelar</Link></Button>
        <Button onClick={save} disabled={saving || name.trim().length < 3 || !clients}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          {group ? "Salvar alterações" : "Criar grupo"}
        </Button>
      </div>
    </div>
  );
}
