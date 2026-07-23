"use client";

import { useMemo, useState } from "react";
import { CaseUpper, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { uppercaseClientNames } from "@/lib/data-quality-actions";
import { searchable } from "@/lib/normalize";
import type { Client } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, SearchBox } from "@/components/shared/page-shell";

export function UppercaseNamesTool({ clients }: { clients: Client[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const candidates = useMemo(() => clients.filter((client) => client.name !== client.name.toLocaleUpperCase("pt-BR")), [clients]);
  const [selected, setSelected] = useState(() => new Set(candidates.map((client) => client.id)));
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const visible = candidates.filter((client) => searchable(`${client.name} ${client.code ?? ""}`).includes(searchable(search)));
  const chosen = candidates.filter((client) => selected.has(client.id));

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const execute = async () => {
    if (!user || !chosen.length) return;
    setSaving(true);
    try {
      await uppercaseClientNames(chosen, user);
      toast({ title: "Nomes convertidos", description: `${chosen.length} cliente(s) e suas referências foram atualizados.` });
      setSelected(new Set());
      setConfirmOpen(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Não foi possível concluir a conversão" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente..." className="min-w-64 flex-1" />
        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(candidates.map((client) => client.id)))}>Selecionar todos</Button>
        <Button size="sm" disabled={!chosen.length} onClick={() => setConfirmOpen(true)}>Converter selecionados ({chosen.length})</Button>
      </div>
      <div className="space-y-1.5">
        {visible.map((client) => (
          <label key={client.id} className="grid cursor-pointer gap-2 rounded-md border bg-card p-2.5 md:grid-cols-[28px_90px_minmax(180px,1fr)_24px_minmax(180px,1fr)] md:items-center">
            <Checkbox checked={selected.has(client.id)} onCheckedChange={(checked) => toggle(client.id, !!checked)} />
            <span className="text-xs text-muted-foreground">{client.code || "sem código"}</span>
            <span className="truncate text-sm">{client.name}</span>
            <span className="text-center text-muted-foreground">→</span>
            <span className="truncate text-sm font-semibold">{client.name.toLocaleUpperCase("pt-BR")}</span>
            {client.deleted && <Badge variant="outline" className="md:col-start-2">na lixeira</Badge>}
          </label>
        ))}
        {!visible.length && <EmptyState icon={CaseUpper} title="Todos os nomes já estão em maiúsculas" description={search ? "A busca não encontrou resultados." : "Não há clientes pendentes de conversão."} />}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Converter nomes para maiúsculas?</AlertDialogTitle><AlertDialogDescription>Serão atualizados {chosen.length} cadastro(s), além das cópias dos nomes em processos, grupos, tarefas e andamentos. Nenhum registro será apagado.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={execute} disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Confirmar conversão</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
