
import React from "react";
import { notFound } from "next/navigation";
import { getClientById } from "@/app/dashboard/clients/actions";
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
  ArrowLeft
} from "lucide-react";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ClientUpdates } from "@/components/client-updates";

function DetailItem({ icon: Icon, label, value, fullWidth = false }: { icon: React.ElementType, label: string, value?: string | null, fullWidth?: boolean }) {
  if (!value) return null;
  return (
    <div className={`flex items-start gap-3 ${fullWidth ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}`}>
      <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await getClientById(params.id);

  if (!client) {
    notFound();
  }

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
    <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
             <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/clients">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar para Clientes</span>
                </Link>
            </Button>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
                <p className="text-muted-foreground">Cliente do tipo "{client.type}"</p>
            </div>
        </div>
     
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl">
             {client.type === "Pessoa Física" ? <User className="h-6 w-6 text-primary" /> : <Building className="h-6 w-6 text-primary" />}
             Informações do Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                {client.notes && (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4">
                        <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                             <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                             <div>
                                <p className="text-sm font-medium">Observações Gerais</p>
                                <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </CardContent>
      </Card>

      <ClientUpdates />
    </div>
  );
}
