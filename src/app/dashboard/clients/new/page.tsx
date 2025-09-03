
import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { NewClientForm } from '@/components/new-client-form';


function NewClientPageSkeleton() {
    return (
        <div className="mx-auto w-full max-w-7xl">
            <h1 className="text-2xl font-bold tracking-tight">Adicionar Novo Cliente</h1>
            <Card className="mt-6">
                <CardHeader>
                    <Skeleton className="h-8 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-8">
                     <Skeleton className="h-10 w-full" />
                     <Skeleton className="h-32 w-full" />
                     <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        </div>
    )
}


export default function NewClientPage() {
    return (
        <Suspense fallback={<NewClientPageSkeleton />}>
            <NewClientForm />
        </Suspense>
    );
}
