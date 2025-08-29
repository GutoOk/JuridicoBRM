
"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  Gavel,
  Users,
  CheckSquare,
  BarChart,
  LineChart,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart as RechartsBarChart,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import type { DashboardData } from './actions';
import { getDashboardData } from './actions';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const dashboardData = await getDashboardData();
        setData(dashboardData);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const StatCard = ({ title, value, icon: Icon, changeText, isLoading }: { title: string, value: number, icon: React.ElementType, changeText: string, isLoading: boolean }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
            <>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4 mt-1" />
            </>
        ) : (
            <>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground">{changeText}</p>
            </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
        <StatCard 
            title="Processos Ativos" 
            value={data?.activeProcessesCount || 0} 
            icon={Gavel} 
            changeText={`${data?.processesThisMonthCount || 0} novos este mês`} 
            isLoading={loading}
        />
        <StatCard 
            title="Clientes" 
            value={data?.clientsCount || 0} 
            icon={Users} 
            changeText={`${data?.clientsThisWeekCount || 0} novos esta semana`} 
            isLoading={loading}
        />
        <StatCard 
            title="Tarefas Pendentes" 
            value={data?.pendingTasksCount || 0} 
            icon={CheckSquare} 
            changeText={`${data?.overdueTasksCount || 0} com prazo vencido`} 
            isLoading={loading}
        />
        <StatCard 
            title="Andamentos Recentes" 
            value={data?.recentUpdatesCount || 0} 
            icon={Activity} 
            changeText="nas últimas 24 horas" 
            isLoading={loading}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5 text-muted-foreground" />
              Processos por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
             {loading ? <Skeleton className="h-[300px] w-full" /> : (
                 <ChartContainer config={{}} className="h-[300px] w-full">
                    <RechartsBarChart data={data?.processesByStatus} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                        <YAxis allowDecimals={false} />
                        <RechartsTooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={4} />
                    </RechartsBarChart>
                </ChartContainer>
             )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5 text-muted-foreground" />
              Tarefas Concluídas (Últimos 6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
             {loading ? <Skeleton className="h-[300px] w-full" /> : (
                <ChartContainer config={{}} className="h-[300px] w-full">
                    <RechartsLineChart data={data?.completedTasksByMonth} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                        <YAxis allowDecimals={false} />
                        <RechartsTooltip cursor={{ strokeDasharray: '3 3', stroke: 'hsl(var(--muted-foreground))' }} content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="total" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ fill: 'hsl(var(--accent))' }} activeDot={{ r: 8 }} />
                    </RechartsLineChart>
                </ChartContainer>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
