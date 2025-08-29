
import React from 'react';
import { notFound } from 'next/navigation';
import { getProcessById } from '@/app/dashboard/processes/actions';
import { getClientById } from '@/app/dashboard/clients/actions';
import { ClientUpdates } from '@/components/client-updates';
import { ProcessDetailsCard } from '@/components/process-details-card';
import type { Client, Process } from '@/lib/types';


export default async function ProcessDetailPage({ params }: { params: { id: string } }) {
  const process = await getProcessById(params.id);

  if (!process) {
    notFound();
  }
  
  const clients = (await Promise.all(
    process.clientIds.map(id => getClientById(id))
  )).filter(Boolean) as Client[];


  return (
    <div className="flex flex-col gap-6">
      
      <ProcessDetailsCard process={process} clients={clients} />
      
      {/* Pass all client IDs to the ClientUpdates component */}
      <ClientUpdates clientIds={process.clientIds} processId={process.id} />

    </div>
  );
}
