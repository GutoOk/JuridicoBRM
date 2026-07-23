"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldQuestion } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cpfReviews } from "@/lib/client-data-quality";
import { updateClient } from "@/lib/db-actions";
import { digitsOnly, formatCpfCnpj, isValidCpfCnpj, searchable } from "@/lib/normalize";
import type { Client } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState, SearchBox } from "@/components/shared/page-shell";

export function CpfQualityTool({ clients }: { clients: Client[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const reviews = useMemo(() => cpfReviews(clients), [clients]);
  const [selected, setSelected] = useState(() => new Set(reviews.filter((item) => item.automatic).map((item) => item.id)));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(reviews.map((item) => [item.id, item.suggestion ?? item.current])));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const visible = reviews.filter((item) => searchable(`${item.client.name} ${item.client.code ?? ""} ${item.current}`).includes(searchable(search)));
  const executable = reviews.filter((item) => selected.has(item.id) && isValidCpfCnpj(values[item.id]));

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const execute = async () => {
    if (!user || !executable.length) return;
    setSaving(true);
    try {
      for (let start = 0; start < executable.length; start += 40) {
        await Promise.all(executable.slice(start, start + 40).map((item) => {
          const value = values[item.id];
          return updateClient(item.client.id, { cpfCnpj: formatCpfCnpj(value), cpfCnpjDigits: digitsOnly(value) }, user);
        }));
      }
      toast({ title: "CPF/CNPJ corrigidos", description: `${executable.length} cadastro(s) atualizado(s).` });
      setSelected(new Set());
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Não foi possível concluir o lote" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por cliente, código ou CPF..." className="min-w-64 flex-1" />
        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(reviews.filter((item) => item.automatic).map((item) => item.id)))}>Marcar correções seguras</Button>
        <Button size="sm" onClick={execute} disabled={saving || !executable.length}>
          {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />} Corrigir selecionados ({executable.length})
        </Button>
      </div>
      <div className="space-y-1.5">
        {visible.map((item) => {
          const value = values[item.id] ?? item.suggestion ?? item.current;
          const valid = isValidCpfCnpj(value);
          return (
            <div key={item.id} className="grid gap-2 rounded-md border bg-card p-2.5 md:grid-cols-[28px_minmax(150px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] md:items-center">
              <Checkbox checked={selected.has(item.id)} disabled={!valid} onCheckedChange={(checked) => toggle(item.id, !!checked)} aria-label={`Selecionar ${item.client.name}`} />
              <div className="min-w-0"><p className="truncate text-sm font-medium">{item.client.name}</p><p className="text-[11px] text-muted-foreground">{item.client.code || "sem código"}</p></div>
              <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Atual</p><p className="truncate font-mono text-xs">{item.current}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Correção</p><Input className="h-7 font-mono text-xs" value={value} onChange={(event) => setValues({ ...values, [item.id]: event.target.value })} onBlur={() => valid && setValues({ ...values, [item.id]: formatCpfCnpj(value) })} /></div>
              <div className="flex items-center justify-between gap-2 md:block md:text-right">
                <Badge className={item.automatic ? "border-emerald-200 bg-emerald-100 text-emerald-900" : "border-amber-200 bg-amber-100 text-amber-900"} variant="outline">
                  {item.automatic ? <CheckCircle2 className="mr-1 size-3" /> : <ShieldQuestion className="mr-1 size-3" />}{item.automatic ? "segura" : "revisar"}
                </Badge>
                <p className="mt-1 max-w-52 text-[10px] text-muted-foreground">{item.reason}</p>
                {!item.automatic && <Link className="text-[10px] text-accent hover:underline" href={`/dashboard/clients/${item.client.id}/edit`}>Abrir cadastro</Link>}
              </div>
            </div>
          );
        })}
        {!visible.length && <EmptyState title="Nenhum CPF/CNPJ para revisar" description={search ? "A busca não encontrou resultados." : "Todos os documentos ativos estão formatados e válidos."} />}
      </div>
    </div>
  );
}
