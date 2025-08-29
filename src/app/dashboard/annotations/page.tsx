

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, PlusCircle, Eye, EyeOff, Pin, User, Edit, Trash2, Loader2, Users, Calendar, Tag, Search, ArrowUpDown } from "lucide-react";
import { useAuth } from '@/hooks/use-auth';
import { getAnnotations, deleteAnnotations } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { ClientUpdate, Client } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { getClients } from '../clients/actions';
import { AddAnnotationDialog } from '@/components/add-annotation-dialog';
import { EditAnnotationDialog } from '@/components/edit-annotation-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';


type SortableKeys = 'clientName' | 'createdAt' | 'author';

export default function AnnotationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [annotations, setAnnotations] = useState<ClientUpdate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'createdAt', direction: 'descending' });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAnno, setEditingAnno] = useState<ClientUpdate | null>(null);
  const [selectedAnnos, setSelectedAnnos] = useState<ClientUpdate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');


  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [fetchedAnnos, fetchedClients] = await Promise.all([
        getAnnotations(),
        getClients()
      ]);
      setAnnotations(fetchedAnnos);
      setClients(fetchedClients);
      setSelectedAnnos([]);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({ title: "Erro ao buscar dados", description: "Não foi possível carregar as anotações e clientes.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user]);

  const handleEditClick = (anno: ClientUpdate) => {
    setEditingAnno(anno);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (annosToDelete: ClientUpdate[]) => {
    setIsDeleting(true);
    try {
        await deleteAnnotations(annosToDelete);
        toast({ title: `Anotação(ões) excluída(s) com sucesso!` });
        await fetchAllData();
    } catch(error) {
         const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao excluir anotação(ões)", description: errorMessage, variant: "destructive" });
    } finally {
        setIsDeleting(false);
    }
  }

  const filteredAndSortedAnnos = useMemo(() => {
    if (!user) return [];

    let filteredAnnos = annotations.filter(anno => 
      (anno.description?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
      (anno.clientName?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
    );

    if (!showOthers) {
      filteredAnnos = filteredAnnos.filter(anno => anno.author === user.name);
    }

    if (sortConfig !== null) {
      filteredAnnos.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof ClientUpdate];
        let bValue: any = b[sortConfig.key as keyof ClientUpdate];

        if (sortConfig.key === 'clientName') {
            aValue = a.clientName;
            bValue = b.clientName;
        }

        if (sortConfig.key === 'createdAt') {
          const dateA = aValue ? parseISO(aValue as string).getTime() : 0;
          const dateB = bValue ? parseISO(bValue as string).getTime() : 0;
          if (dateA < dateB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateA > dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }
        
        if (sortConfig.key === 'author') {
          const authorA = a.author || '';
          const authorB = b.author || '';
          if (authorA < authorB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (authorA > authorB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        if (aValue == null) return 1;
        if (bValue == null) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return filteredAnnos;
  }, [annotations, user, showOthers, sortConfig, searchQuery]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleSelectAnno = (anno: ClientUpdate) => {
    setSelectedAnnos(prev =>
      prev.some(c => c.id === anno.id)
        ? prev.filter(c => c.id !== anno.id)
        : [...prev, anno]
    );
  };

  const handleSelectAllAnnos = () => {
    if (selectedAnnos.length === filteredAndSortedAnnos.length) {
      setSelectedAnnos([]);
    } else {
      setSelectedAnnos(filteredAndSortedAnnos);
    }
  };

  const otherAnnosCount = annotations.filter(c => c.author !== user?.name).length;

  const sortOptions: {key: SortableKeys, label: string, icon: React.ElementType}[] = [
    { key: 'clientName', label: 'Cliente', icon: Users },
    { key: 'createdAt', label: 'Data', icon: Calendar },
    { key: 'author', label: 'Autor', icon: User },
  ];

  return (
    <>
      <div className="mx-auto w-full max-w-7xl">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <CardTitle>Anotações</CardTitle>
                <Button onClick={() => setIsAddDialogOpen(true)} className="bg-accent hover:bg-accent/90">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Novo
                </Button>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 sm:flex-initial w-full sm:w-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por cliente ou descrição..."
                        className="pl-8 sm:w-[250px] md:w-[300px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {otherAnnosCount > 0 && (
                    <Button variant="ghost" onClick={() => setShowOthers(!showOthers)}>
                        {showOthers ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {showOthers ? 'Ocultar de outros' : `Mostrar de outros (${otherAnnosCount})`}
                    </Button>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost">
                            <ArrowUpDown className="mr-2 h-4 w-4" />
                            Ordenar
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Campo de Ordenação</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup value={sortConfig?.key} onValueChange={(value) => requestSort(value as SortableKeys)}>
                        {sortOptions.map(option => (
                            <DropdownMenuRadioItem key={option.key} value={option.key}>
                                <option.icon className="mr-2 h-4 w-4" />
                                {option.label}
                            </DropdownMenuRadioItem>
                        ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                {selectedAnnos.length > 0 && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={isDeleting}>
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Excluir ({selectedAnnos.length})
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Tem certeza que deseja excluir as {selectedAnnos.length} anotações selecionadas? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(selectedAnnos)} className="bg-destructive hover:bg-destructive/90">
                                    Confirmar Exclusão
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={3}><Skeleton className="h-16 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredAndSortedAnnos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                       {searchQuery ? "Nenhuma anotação encontrada para sua busca." : "Nenhuma anotação encontrada."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedAnnos.map((anno) => (
                    <TableRow key={anno.id} data-state={selectedAnnos.some(t => t.id === anno.id) && "selected"}>
                      <TableCell className="w-[40px] pr-0 align-top">
                        <Checkbox
                          checked={selectedAnnos.some(c => c.id === anno.id)}
                          onCheckedChange={() => handleSelectAnno(anno)}
                          aria-label={`Selecionar anotação ${anno.id}`}
                        />
                      </TableCell>
                      <TableCell className="p-4 align-top">
                         {anno.clientId ? (
                          <Button variant="link" className="p-0 h-auto font-medium text-base" asChild>
                            <Link href={`/dashboard/clients/${anno.clientId}`}>{anno.clientName}</Link>
                          </Button>
                        ) : (
                          <div className="flex items-center">
                            <Pin className="mr-2 h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-base text-muted-foreground">Anotação Geral</span>
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1 cursor-pointer hover:text-foreground" onClick={() => handleEditClick(anno)}>{anno.description}</p>
                         <div className="text-xs text-muted-foreground/80 flex items-center gap-1.5 mt-2">
                           <Calendar className="h-3 w-3" />
                           <span>{format(new Date(anno.createdAt as string), 'dd/MM/yyyy \'às\' HH:mm')}</span>
                           <span className="text-muted-foreground/50">&bull;</span>
                           <User className="h-3 w-3" />
                           <span>{anno.author}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <AddAnnotationDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        clients={clients}
        onAnnotationCreated={fetchAllData}
      />
      {editingAnno && (
        <EditAnnotationDialog
            key={editingAnno.id}
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            annotation={editingAnno}
            onAnnotationUpdated={fetchAllData}
        />
      )}
    </>
  );
}
