

"use client";

import React, { useState, useEffect } from "react";
import { notFound, useRouter, useParams } from "next/navigation";
import { getClientById } from "@/app/dashboard/clients/actions";
import { getProcessById } from "@/app/dashboard/processes/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  User,
  FileText,
  Mail,
  Phone,
  Home,
  Briefcase,
  Flag,
  Heart,
  StickyNote,
  Building,
  ArrowLeft,
  Edit,
  Gavel,
  Link as LinkIcon,
  PlusCircle,
  Star
} from "lucide-react";
import type { Client, Process, Address, Email } from "@/lib/types";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ClientUpdates } from "@/components/client-updates";
import { Skeleton } from "@/components/ui/skeleton";
import { EditClientNotesDialog } from "@/components/edit-client-notes-dialog";
import { EditClientContactDialog } from "@/components/edit-client-contact-dialog";


function DetailItem({ icon: Icon, label, value, children, fullWidth = false, onEdit }: { icon: React.ElementType, label: string, value?: string | null, children?: React.ReactNode, fullWidth?: boolean, onEdit?: () => void }) {
  const hasContent = value || children;
  if (!hasContent) {
    return (
        <div className={`flex items-start gap-3 ${fullWidth ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}`}>
             <div className="flex items-center gap-3 flex-1">
                <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-sm text-muted-foreground/70 italic">Não informado</p>
                </div>
            </div>
             {onEdit && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Editar</span>
                </Button>
            )}
        </div>
    );
  }
  return (
    <div className={`flex items-start gap-3 ${fullWidth ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}`}>
      <div className="flex items-center gap-3 flex-1">
        <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
        <div>
            <p className="text-sm font-medium">{label}</p>
            {value ? <p className="text-muted-foreground">{value}</p> : <div className="text-muted-foreground">{children}</div>}
        </div>
      </div>
       {onEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                <Edit className="h-4 w-4" />
                 <span className="sr-only">Editar</span>
            </Button>
        )}
    </div>
  );
}

function formatAddress(address: Address) {
    return [address.street, address.number, address.complement, address.district, address.city, address.state, address.zipCode].filter(Boolean).join(", ");
}

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [processes, setProcesses] = useState<(Process | null)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const id = params.id as string;

    const fetchClientData = async () => {
        setIsLoading(true);
        try {
            const fetchedClient = await getClientById(id);
            if (!fetchedClient) {
                notFound();
                return;
            }
            setClient(fetchedClient);

            const fetchedProcesses = fetchedClient.processIds ? await Promise.all(
                fetchedClient.processIds.map(id => getProcessById(id))
            ) : [];
            setProcesses(fetchedProcesses);

        } catch (error) {
            console.error("Failed to fetch client data:", error);
            // Optionally, show a toast notification
        } finally {
            setIsLoading(false);
        }
    }
  useEffect(() => {
    if (!id) return;
    fetchClientData();
  }, [id]);
  
  const handleNotesUpdated = () => {
    // Re-fetch client data to show updated notes
    getClientById(id).then(setClient);
  };

  const handleContactUpdated = () => {
      fetchClientData();
  };

  if (isLoading || !client) {
     return (
        <div className="mx-auto w-full max-w-7xl space-y-6">
            <div className="flex items-center justify-between gap-4">
                 <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                 </div>
                 <Skeleton className="h-10 w-24" />
            </div>
            <Card>
                <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                     <Skeleton className="h-24 w-full" />
                     <Skeleton className="h-24 w-full" />
                </CardContent>
            </Card>
        </div>
     );
  }


  const primaryPhone = client.phones?.find(p => p.isPrimary);
  const otherPhones = client.phones?.filter(p => !p.isPrimary);
  
  const primaryEmail = client.emails?.find(p => p.isPrimary);
  const otherEmails = client.emails?.filter(p => !p.isPrimary);

  const primaryAddress = client.addresses?.find(p => p.isPrimary);
  const otherAddresses = client.addresses?.filter(p => !p.isPrimary);


  return (
    <>
    <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
                    <p className="text-muted-foreground">Cliente do tipo "{client.type}"</p>
                </div>
            </div>
             <Button variant="outline" asChild>
              <Link href={`/dashboard/clients/${client.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
        </div>
     
      <Card className="mt-6">
        <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-2 lg:grid-cols-3">
                {/* Contato */}
                <DetailItem icon={Mail} label="E-mail" onEdit={() => setIsContactDialogOpen(true)}>
                  {primaryEmail ? (
                     <div className="flex items-center gap-2">
                        <a href={`mailto:${primaryEmail.address}`} className="hover:underline">{primaryEmail.address}</a>
                        <span className="text-xs text-muted-foreground/80">({primaryEmail.description})</span>
                        {otherEmails && otherEmails.length > 0 && (
                           <Popover>
                              <PopoverTrigger asChild>
                                 <Button variant="link" size="sm" className="h-auto p-0 whitespace-nowrap">
                                    Outros ({otherEmails.length})
                                 </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2">
                                 <ul className="space-y-1">
                                    {otherEmails.map((email, index) => (
                                       <li key={index} className="text-sm">
                                          <a href={`mailto:${email.address}`} className="hover:underline">{email.address}</a> <span className="text-muted-foreground/80">({email.description})</span>
                                       </li>
                                    ))}
                                 </ul>
                              </PopoverContent>
                           </Popover>
                        )}
                     </div>
                  ) : (client.emails && client.emails.length > 0) ? (
                      <span>{client.emails[0].address} <span className="text-xs text-muted-foreground/80">({client.emails[0].description})</span></span>
                  ) : <p className="text-sm text-muted-foreground/70 italic">Nenhum informado</p>}
               </DetailItem>
                <DetailItem icon={Phone} label="Telefone" onEdit={() => setIsContactDialogOpen(true)}>
                  {primaryPhone ? (
                     <div className="flex items-center gap-2">
                        <span>{primaryPhone.number}</span>
                        <span className="text-xs text-muted-foreground/80">({primaryPhone.description})</span>
                        {otherPhones && otherPhones.length > 0 && (
                           <Popover>
                              <PopoverTrigger asChild>
                                 <Button variant="link" size="sm" className="h-auto p-0 whitespace-nowrap">
                                    Outros ({otherPhones.length})
                                 </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2">
                                 <ul className="space-y-1">
                                    {otherPhones.map((phone, index) => (
                                       <li key={index} className="text-sm">
                                          {phone.number} <span className="text-muted-foreground/80">({phone.description})</span>
                                       </li>
                                    ))}
                                 </ul>
                              </PopoverContent>
                           </Popover>
                        )}
                     </div>
                  ) : (client.phones && client.phones.length > 0) ? (
                      <span>{client.phones[0].number} <span className="text-xs text-muted-foreground/80">({client.phones[0].description})</span></span>
                  ) : <p className="text-sm text-muted-foreground/70 italic">Nenhum informado</p>}
               </DetailItem>
               <div></div>
                
                {/* Documentos */}
                <DetailItem icon={FileText} label="CPF/CNPJ" value={client.cpfCnpj} />
                <DetailItem icon={FileText} label="RG" value={client.rg} />
                <DetailItem icon={FileText} label="Órgão Emissor" value={client.rgIssuer} />
                
                {/* Pessoal */}
                <DetailItem icon={User} label="Nome da Mãe" value={client.motherName} />
                <DetailItem icon={Flag} label="Nacionalidade" value={client.nationality} />
                <DetailItem icon={Briefcase} label="Profissão" value={client.profession} />
                <DetailItem icon={Heart} label="Estado Civil" value={client.maritalStatus} />
                
                {/* Endereço */}
                <DetailItem icon={Home} label="Endereço Principal" fullWidth>
                     {primaryAddress ? (
                         <div className="flex items-center gap-2">
                            <span>{formatAddress(primaryAddress)}</span>
                            {otherAddresses && otherAddresses.length > 0 && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="link" size="sm" className="h-auto p-0 whitespace-nowrap">
                                            Outros ({otherAddresses.length})
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto max-w-sm p-2">
                                        <ul className="space-y-2">
                                            {otherAddresses.map((addr, index) => (
                                            <li key={index} className="text-sm">
                                                <strong className="font-medium">{addr.description}</strong>: {formatAddress(addr)}
                                            </li>
                                            ))}
                                        </ul>
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                    ) : client.addresses && client.addresses.length > 0 ? (
                        <span>{formatAddress(client.addresses[0])}</span>
                    ) : <p className="text-sm text-muted-foreground/70 italic">Nenhum informado</p>}
                </DetailItem>

                {/* Observações */}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4">
                    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                         <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                         <div className="flex-1">
                             <div className="flex justify-between items-center">
                                <p className="text-sm font-medium">Observações Gerais</p>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsNotesDialogOpen(true)}>
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Editar</span>
                                </Button>
                            </div>
                            {client.notes ? (
                                <p className="text-muted-foreground whitespace-pre-wrap mt-2">{client.notes}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground/70 italic mt-2">Nenhuma observação.</p>
                            )}
                        </div>
                    </div>
                </div>
                 {/* Processos Vinculados */}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4">
                    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                         <Gavel className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                         <div className="flex-1">
                            <div className="flex justify-between items-center">
                                <p className="text-sm font-medium">Processos Vinculados</p>
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/dashboard/processes/new?clientId=${client.id}`}>
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Novo Processo
                                    </Link>
                                </Button>
                            </div>
                            <div className="mt-2 flex flex-col items-start gap-1">
                                {processes.length > 0 ? (
                                    processes.map(process => process && (
                                        <Button key={process.id} variant="link" asChild className="p-0 h-auto font-normal -ml-1 text-muted-foreground hover:text-primary">
                                            <Link href={`/dashboard/processes/${process.id}`} className="flex items-center gap-1.5">
                                                <LinkIcon className="h-3 w-3" />
                                                {process.processNumber}
                                            </Link>
                                        </Button>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground italic">Nenhum processo vinculado.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        <ClientUpdates clientId={client.id} />
      </div>
    </div>
    <EditClientNotesDialog
        open={isNotesDialogOpen}
        onOpenChange={setIsNotesDialogOpen}
        client={client}
        onNotesUpdated={handleNotesUpdated}
    />
     <EditClientContactDialog
        open={isContactDialogOpen}
        onOpenChange={setIsContactDialogOpen}
        client={client}
        onContactUpdated={handleContactUpdated}
    />
    </>
  );
}
