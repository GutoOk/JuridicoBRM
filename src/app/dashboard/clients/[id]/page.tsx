
import React from "react";
import { notFound } from "next/navigation";
import { getClientById } from "@/app/dashboard/clients/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

function DetailItem({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    const hasChildren = React.Children.toArray(children).some(child => child !== null);
    if (!hasChildren) return null;

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary">{title}</h3>
            <Separator />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
                {children}
            </div>
        </div>
    );
}


export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await getClientById(params.id);

  if (!client) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
             <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/clients">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar para Clientes</span>
                </Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Detalhes do Cliente</h1>
        </div>
     
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
             {client.type === "Pessoa Física" ? <User className="h-8 w-8 text-primary" /> : <Building className="h-8 w-8 text-primary" />}
             {client.name}
          </CardTitle>
          <CardDescription>
            Cliente do tipo "{client.type}" cadastrado em {new Date(client.createdAt as string).toLocaleDateString()}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">

           <Section title="Identificação Pessoal">
             <DetailItem icon={Flag} label="Nacionalidade" value={client.nationality} />
             <DetailItem icon={Briefcase} label="Profissão" value={client.profession} />
             <DetailItem icon={Heart} label="Estado Civil" value={client.maritalStatus} />
          </Section>

          <Section title="Documentos">
            <DetailItem icon={FileText} label="CPF/CNPJ" value={client.cpfCnpj} />
            <DetailItem icon={FileText} label="RG" value={client.rg} />
            <DetailItem icon={FileText} label="Órgão Emissor" value={client.rgIssuer} />
          </Section>
          
          <Section title="Contato">
             <DetailItem icon={Mail} label="Email" value={client.email} />
             <DetailItem icon={Phone} label="Telefone Principal" value={client.phone} />
             <DetailItem icon={Phone} label="Telefone Alternativo" value={client.phone2} />
          </Section>

          <Section title="Endereço">
            <DetailItem icon={Home} label="Logradouro" value={`${client.addressStreet || ''}${client.addressStreet && client.addressNumber ? ', ' : ''}${client.addressNumber || ''}`} />
            <DetailItem icon={Home} label="Complemento" value={client.addressComplement} />
            <DetailItem icon={Home} label="Bairro" value={client.addressDistrict} />
            <DetailItem icon={Home} label="Cidade/Estado" value={client.addressCity && client.addressState ? `${client.addressCity} - ${client.addressState}` : client.addressCity || client.addressState} />
            <DetailItem icon={Home} label="CEP" value={client.addressZipCode} />
          </Section>

          {client.notes && (
             <div className="space-y-4">
                <h3 className="text-lg font-semibold text-primary">Observações Gerais</h3>
                <Separator />
                <div className="flex items-start gap-3 rounded-md border bg-muted/50 p-4">
                    <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                    <p className="text-sm">{client.notes}</p>
                </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
