"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Gavel, Loader2, Phone, Users } from "lucide-react";
import { useCollection, useDoc } from "@/hooks/use-collection";
import type { Client, ClientGroup, Process } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ClientGroupForm } from "@/components/shared/client-group-form";
import { EmptyState, PageHeader } from "@/components/shared/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ClientGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: group } = useDoc<ClientGroup>("clientGroups", id);
  const { data: clients } = useCollection<Client>("clients");
  const { data: processes } = useCollection<Process>("processes");
  const members = useMemo(() => {
    if (!group || !clients) return [];
    return group.clientIds.map((clientId) => clients.find((client) => client.id === clientId)).filter((client): client is Client => !!client && !client.deleted);
  }, [clients, group]);

  if (group === undefined || !clients || !processes) return <div className="flex h-64 items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  if (!group) return <div className="page-shell"><EmptyState title="Grupo não encontrado" description="Não foi possível carregar este registro." /></div>;

  return (
    <div className="page-shell">
      <PageHeader eyebrow="grupo de clientes" title={group.name} description={`${members.length} cliente(s) neste grupo. Edite os membros sem alterar os vínculos dos cadastros.`}>
        <Button variant="outline" asChild><Link href="/dashboard/groups"><ArrowLeft className="mr-2 size-4" />Voltar</Link></Button>
      </PageHeader>
      <div className="work-table">
        <Table className="table-fixed">
          <TableHeader><TableRow className="ledger-header"><TableHead>Cliente</TableHead><TableHead className="hidden md:table-cell">Telefone</TableHead><TableHead>Processos vinculados</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
          <TableBody>
            {members.map((client) => {
              const phone = client.phone || client.phones?.find((item) => item.isPrimary)?.number || client.phones?.[0]?.number;
              const clientProcesses = processes.filter((process) => !process.deleted && process.clientIds?.includes(client.id));
              return <TableRow key={client.id}>
                <TableCell><Link href={`/dashboard/clients/${client.id}`} className="block truncate font-medium hover:underline">{client.name}</Link>{client.code && <span className="text-[11px] text-muted-foreground">{client.code}</span>}</TableCell>
                <TableCell className="hidden md:table-cell">{phone ? <span className="inline-flex items-center gap-1 text-[13px]"><Phone className="size-3" />{phone}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell><div className="flex flex-wrap gap-x-2 gap-y-1">{clientProcesses.map((process) => <Link key={process.id} href={`/dashboard/processes/${process.id}`} className="inline-flex items-center gap-1 text-xs hover:underline"><Gavel className="size-3" />{process.processNumber}</Link>)}{clientProcesses.length === 0 && <span className="text-xs text-muted-foreground">Nenhum processo</span>}</div></TableCell>
                <TableCell><Button asChild variant="ghost" size="icon" className="size-7" title="Abrir cliente"><Link href={`/dashboard/clients/${client.id}`}><ExternalLink className="size-3.5" /></Link></Button></TableCell>
              </TableRow>;
            })}
            {members.length === 0 && <TableRow><TableCell colSpan={4}><EmptyState icon={Users} title="Grupo sem clientes" description="Selecione os membros no formulário abaixo." className="border-0 bg-transparent" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <ClientGroupForm group={group} />
    </div>
  );
}
