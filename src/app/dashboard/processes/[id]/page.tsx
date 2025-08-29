
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
    <div className="mx-auto w-full max-w-7xl">
      
      <ProcessDetailsCard process={process} clients={clients} />
      
      <div className="mt-6">
        <ClientUpdates clientIds={process.clientIds} processId={process.id} />
      </div>

    </div>
  );
}
