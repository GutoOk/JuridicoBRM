"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ArchiveRestore, FolderOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { dateMillis, formatDate } from "@/lib/normalize";
import type { ClientGroup } from "@/lib/types";
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
import { EmptyState, FilterChip, HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type GroupAction = { kind: "delete" | "restore"; group: ClientGroup };

export default function ClientGroupsPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: groupsData } = useCollection<ClientGroup>("clientGroups");
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<GroupAction | null>(null);
  const [saving, setSaving] = useState(false);

  const deletedCount = useMemo(
    () => (groupsData ?? []).filter((group) => group.deleted && (isAdmin || group.deletedBy === user?.name)).length,
    [groupsData, isAdmin, user?.name]
  );
  const groups = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return (groupsData ?? [])
      .filter((group) => showTrash ? group.deleted && (isAdmin || group.deletedBy === user?.name) : !group.deleted)
      .filter((group) => !q || group.name.toLocaleLowerCase("pt-BR").includes(q) || group.notes?.toLocaleLowerCase("pt-BR").includes(q) || group.clientNames?.some((name) => name.toLocaleLowerCase("pt-BR").includes(q)))
      .sort((a, b) => dateMillis(b.updatedAt ?? b.createdAt) - dateMillis(a.updatedAt ?? a.createdAt));
  }, [groupsData, isAdmin, search, showTrash, user?.name]);

  const runAction = async () => {
    if (!action || !user) return;
    setSaving(true);
    try {
      const ref = doc(db, "clientGroups", action.group.id);
      if (action.kind === "delete") {
        await updateDoc(ref, { deleted: true, deletedAt: serverTimestamp(), deletedBy: user.name });
        toast({ title: "Grupo movido para a lixeira" });
      } else if (action.kind === "restore") {
        await updateDoc(ref, { deleted: false, deletedAt: null, deletedBy: null });
        toast({ title: "Grupo restaurado" });
      }
      setAction(null);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao atualizar grupo" });
    } finally {
      setSaving(false);
    }
  };

  if (!groupsData) return <div className="flex h-64 items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="page-shell">
      <PageHeader eyebrow="organização" title="Grupos de clientes" description={`${groups.length} grupo(s) na lista atual. Use grupos para montar recortes livres de trabalho sem alterar os processos.`}>
        <HelpTip label="Cria uma lista personalizada. Um mesmo cliente pode participar de vários grupos.">
          <Button asChild><Link href="/dashboard/groups/new"><Plus className="mr-2 size-4" />Novo grupo</Link></Button>
        </HelpTip>
      </PageHeader>
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar grupo, cliente ou observação" />
        <FilterChip active={!showTrash} onClick={() => setShowTrash(false)}>Ativos</FilterChip>
        {deletedCount > 0 && <FilterChip active={showTrash} onClick={() => setShowTrash(true)}><Trash2 className="size-3" />Lixeira {deletedCount}</FilterChip>}
      </Toolbar>
      <div className="work-table">
        <Table className="table-fixed">
          <TableHeader><TableRow className="ledger-header">
            <TableHead className="w-[28%]">Grupo</TableHead>
            <TableHead>Clientes</TableHead>
            <TableHead className="hidden md:table-cell">Observações</TableHead>
            <TableHead className="hidden w-28 lg:table-cell">Atualização</TableHead>
            <TableHead className="w-20 text-right" />
          </TableRow></TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell>
                  <Link href={`/dashboard/groups/${group.id}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline">
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{group.name}</span>
                  </Link>
                  {group.author && <p className="truncate pl-6 text-[11px] text-muted-foreground">Criado por {group.author}</p>}
                </TableCell>
                <TableCell>
                  <p className="truncate text-[13px]" title={(group.clientNames ?? []).join(", ")}>{group.clientNames?.slice(0, 3).join(", ") || "Nenhum cliente"}</p>
                  {(group.clientIds?.length ?? 0) > 3 && <span className="text-[11px] text-muted-foreground">e mais {group.clientIds.length - 3}</span>}
                </TableCell>
                <TableCell className="hidden truncate text-[13px] text-muted-foreground md:table-cell" title={group.notes}>{group.notes || "—"}</TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{formatDate(group.updatedAt ?? group.createdAt)}</TableCell>
                <TableCell className="text-right">
                  {showTrash ? (
                    <span className="inline-flex">
                      <Button variant="ghost" size="icon" className="size-7" title="Restaurar grupo" onClick={() => setAction({ kind: "restore", group })}><ArchiveRestore className="size-3.5" /></Button>
                    </span>
                  ) : (
                    <span className="inline-flex">
                      <Button asChild variant="ghost" size="icon" className="size-7" title="Editar grupo"><Link href={`/dashboard/groups/${group.id}`}><Pencil className="size-3.5" /></Link></Button>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive" title="Mover grupo para a lixeira" onClick={() => setAction({ kind: "delete", group })}><Trash2 className="size-3.5" /></Button>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {groups.length === 0 && <TableRow><TableCell colSpan={5}><EmptyState icon={FolderOpen} title={showTrash ? "Lixeira vazia" : "Nenhum grupo encontrado"} description={showTrash ? "Os grupos excluídos por você aparecem aqui." : "Crie um grupo para reunir clientes que você está trabalhando no momento."} className="border-0 bg-transparent" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action?.kind === "restore" ? "Restaurar grupo?" : "Mover grupo para a lixeira?"}</AlertDialogTitle>
            <AlertDialogDescription>Somente a exibição do agrupamento será alterada; ele permanece armazenado e os clientes e processos ficam intactos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={runAction} disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
