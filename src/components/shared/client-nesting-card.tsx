"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CornerDownRight, Link2, Loader2, Plus, Unlink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { addNestedClient, removeNestedClient } from "@/lib/db-actions";
import {
  clientMapOf,
  nestedClientsOf,
  parentClientsOf,
  wouldCreateNestingCycle,
} from "@/lib/client-nesting";
import { searchable } from "@/lib/normalize";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CodeBadge } from "@/components/shared/badges";
import { HelpTip } from "@/components/shared/page-shell";

export function ClientNestingCard({ client, clients }: { client: Client; clients: Client[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const clientMap = useMemo(() => clientMapOf(clients), [clients]);
  const nestedClients = nestedClientsOf(client, clientMap).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );
  const parentClients = parentClientsOf(client.id, clients).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );
  const normalizedSearch = searchable(search.trim());
  const candidates = normalizedSearch.length >= 2
    ? clients
        .filter(
          (candidate) =>
            !candidate.deleted &&
            candidate.id !== client.id &&
            !(client.nestedClientIds ?? []).includes(candidate.id) &&
            searchable(`${candidate.name} ${candidate.code ?? ""} ${candidate.cpfCnpj ?? ""}`).includes(
              normalizedSearch
            )
        )
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .slice(0, 8)
    : [];

  const add = async (candidate: Client) => {
    if (!user) return;
    if (wouldCreateNestingCycle(client.id, candidate.id, clientMap)) {
      toast({
        variant: "destructive",
        title: "Este vínculo criaria um ciclo",
        description: `${candidate.name} já possui ${client.name} em sua cadeia de aninhamento.`,
      });
      return;
    }
    setSavingId(candidate.id);
    try {
      await addNestedClient(client.id, candidate.id, user);
      setSearch("");
      toast({ title: "Cliente aninhado", description: candidate.name });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao criar vínculo" });
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (nested: Client) => {
    if (!user) return;
    setRemovingId(nested.id);
    try {
      await removeNestedClient(client.id, nested.id, user);
      toast({ title: "Vínculo removido", description: nested.name });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao remover vínculo" });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="surface">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4 text-muted-foreground" /> Vínculos entre clientes
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <div>
            <p className="text-xs font-medium">Clientes aninhados ({nestedClients.length})</p>
            <p className="text-[11px] text-muted-foreground">
              Aparecem abaixo deste cliente nas listagens.
            </p>
          </div>
          <div className="space-y-1">
            {nestedClients.map((nested) => (
              <div key={nested.id} className="flex items-center gap-2 rounded-md bg-muted/35 px-2 py-1.5">
                <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                <CodeBadge code={nested.code} />
                <Link
                  href={`/dashboard/clients/${nested.id}`}
                  className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
                >
                  {nested.name}
                </Link>
                <HelpTip label="Remove somente o vínculo de aninhamento; o cadastro permanece.">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(nested)}
                    disabled={removingId === nested.id}
                  >
                    {removingId === nested.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Unlink className="size-3.5" />
                    )}
                  </Button>
                </HelpTip>
              </div>
            ))}
            {nestedClients.length === 0 && (
              <p className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">
                Nenhum cliente aninhado.
              </p>
            )}
          </div>
          <div className="relative">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente para aninhar…"
              className="h-8 text-xs"
            />
            {normalizedSearch.length >= 2 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => add(candidate)}
                    disabled={savingId === candidate.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-60"
                  >
                    {savingId === candidate.id ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <CodeBadge code={candidate.code} />
                    <span className="truncate">{candidate.name}</span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum cliente disponível.</p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <p className="text-xs font-medium">Aninhado a ({parentClients.length})</p>
            <p className="text-[11px] text-muted-foreground">
              Estes vínculos só podem ser alterados na ficha do cliente principal.
            </p>
          </div>
          <div className="space-y-1">
            {parentClients.map((parent) => (
              <Link
                key={parent.id}
                href={`/dashboard/clients/${parent.id}`}
                className="flex items-center gap-2 rounded-md bg-muted/35 px-2 py-1.5 text-xs hover:bg-muted"
              >
                <CodeBadge code={parent.code} />
                <span className="truncate font-medium">{parent.name}</span>
              </Link>
            ))}
            {parentClients.length === 0 && (
              <p className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">
                Este cliente não está aninhado a outro.
              </p>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
