
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { notFound, useParams } from 'next/navigation';
import { getProcessById } from '@/app/dashboard/processes/actions';
import { getClientById } from '@/app/dashboard/clients/actions';
import { ClientUpdates } from '@/components/client-updates';
import { ProcessDetailsCard } from '@/components/process-details-card';
import type { Client, Process } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

function ProcessDetailSkeleton() {
    return (
        <div className="mx-auto w-full max-w-7xl space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-10 w-24" />
            </div>
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
        </div>
    );
}


export default function ProcessDetailPage() {
  const params = useParams();
  const processId = params.id as string;
  
  const [processData, setProcessData] = useState<Process | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProcessData = useCallback(async () => {
    if (!processId) return;
    setIsLoading(true);
    try {
        const fetchedProcess = await getProcessById(processId);
        if (!fetchedProcess) {
            notFound();
            return;
        }
        setProcessData(fetchedProcess);

        const fetchedClients = (await Promise.all(
            fetchedProcess.clientIds.map(id => getClientById(id))
        )).filter(Boolean) as Client[];
        setClients(fetchedClients);

    } catch (error) {
        console.error("Failed to fetch process data:", error);
    } finally {
        setIsLoading(false);
    }
  }, [processId]);


  useEffect(() => {
    fetchProcessData();
  }, [fetchProcessData]);

  if (isLoading || !processData) {
    return <ProcessDetailSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <ProcessDetailsCard process={processData} clients={clients} onNotesUpdated={fetchProcessData} />
      <div className="mt-6">
        <ClientUpdates processId={processData.id} />
      </div>
    </div>
  );
}
