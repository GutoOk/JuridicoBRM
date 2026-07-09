"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCollection } from "@/hooks/use-collection";
import { dateMillis, formatDateTime, searchable } from "@/lib/normalize";
import type { Update } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { CodeBadge } from "@/components/shared/badges";
import { EmptyState, FilterChip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";

const TYPES = ["Todos", "Atendimento", "Anotação", "Tarefa", "Andamento Processual"] as const;

/** Linha do tempo geral: contatos, anotações, tarefas e andamentos de todos os clientes. */
export default function UpdatesPage() {
  const { data: updates } = useCollection<Update>("updates", {
    orderBy: [["createdAt", "desc"]],
    limit: 500,
  });
  const [typeFilter, setTypeFilter] = useState<(typeof TYPES)[number]>("Todos");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    let out = (updates ?? []).filter((u) => !u.deleted);
    if (typeFilter !== "Todos") out = out.filter((u) => u.type === typeFilter);
    const q = searchable(search.trim());
    if (q) {
      out = out.filter(
        (u) =>
          searchable(u.clientName).includes(q) ||
          searchable(u.description).includes(q) ||
          searchable(u.author).includes(q) ||
          (u.clientCode ?? "").toLowerCase().includes(search.trim().toLowerCase())
      );
    }
    return out.sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));
  }, [updates, typeFilter, search]);

  if (!updates) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="histórico"
        title="Andamentos"
        description="Últimos registros de contato, anotações, tarefas e andamentos processuais. Use a busca para localizar rapidamente cliente, autor ou trecho do registro."
        badge={<span className="kbd-hint">500 mais recentes</span>}
      />

      <Toolbar>
        <SearchBox
          placeholder="Buscar por cliente, código, texto ou autor..."
          value={search}
          onChange={setSearch}
        />
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <FilterChip
              key={t}
              onClick={() => setTypeFilter(t)}
              active={typeFilter === t}
            >
              {t}
            </FilterChip>
          ))}
        </div>
      </Toolbar>

      <div className="space-y-2">
        {rows.map((u) => (
          <div key={u.id} className="surface p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{u.type}</Badge>
                {u.clientId && (
                  <Link href={`/dashboard/clients/${u.clientId}`} className="flex items-center gap-1.5 font-medium hover:underline">
                    <CodeBadge code={u.clientCode || undefined} />
                    {u.clientName}
                  </Link>
                )}
                {u.type === "Atendimento" && u.channel && (
                  <span className="text-muted-foreground">
                    {u.channel}
                    {u.result ? ` — ${u.result}` : ""}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{u.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">por {u.author}</p>
          </div>
        ))}
        {rows.length === 0 && (
          <EmptyState
            title="Nenhum andamento encontrado"
            description="Ajuste a busca ou escolha outro tipo de registro."
          />
        )}
      </div>
    </div>
  );
}
