
import React from "react";
import { notFound } from "next/navigation";
import { getClientById } from "@/app/dashboard/clients/actions";
import { getProcessById } from "@/app/dashboard/processes/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
} from "lucide-react";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ClientUpdates } from "@/components/client-updates";

function DetailItem({ icon: Icon, label, value, fullWidth = false }: { icon: React.ElementType, label: string, value?: string | null, fullWidth?: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${fullWidth ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}`}>
      <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        {value ? (
           <p className="text-muted-foreground">{value}</p>
        ) : (
            <p className="text-sm text-muted-foreground/70 italic">Não informado</p>
        )}
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await getClientById(params.id);

  if (!client) {
    notFound();
  }

  const processes = client.processIds ? await Promise.all(
    client.processIds.map(id => getProcessById(id))
  ) : [];

  const addressString = [
    client.addressStreet,
    client.addressNumber,
    client.addressComplement,
    client.addressDistrict,
    client.addressCity,
    client.addressState,
    client.addressZipCode
  ].filter(Boolean).join(", ");


  return (
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
                <DetailItem icon={Mail} label="Email" value={client.email} />
                <DetailItem icon={Phone} label="Telefone Principal" value={client.phone} />
                <DetailItem icon={Phone} label="Telefone Alternativo" value={client.phone2} />
                
                {/* Documentos */}
                <DetailItem icon={FileText} label="CPF/CNPJ" value={client.cpfCnpj} />
                <DetailItem icon={FileText} label="RG" value={client.rg} />
                <DetailItem icon={FileText} label="Órgão Emissor" value={client.rgIssuer} />
                
                {/* Pessoal */}
                <DetailItem icon={Flag} label="Nacionalidade" value={client.nationality} />
                <DetailItem icon={Briefcase} label="Profissão" value={client.profession} />
                <DetailItem icon={Heart} label="Estado Civil" value={client.maritalStatus} />
                
                {/* Endereço */}
                <DetailItem icon={Home} label="Endereço Completo" value={addressString} fullWidth />

                {/* Observações */}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4">
                    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                         <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                         <div>
                            <p className="text-sm font-medium">Observações Gerais</p>
                            {client.notes ? (
                                <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground/70 italic">Nenhuma observação.</p>
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
  );
}
