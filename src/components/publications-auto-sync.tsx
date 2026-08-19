"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  lastPublicationSync,
  shouldRunAutomaticSync,
  syncDjenPublications,
} from "@/lib/djen-sync";
import type { Lawyer } from "@/lib/types";

/**
 * Dispara a busca de publicações no DJEN quando alguém abre o sistema.
 *
 * Não existe backend agendando isso: a captura acontece na sessão de quem abriu
 * o painel. Por isso a janela consultada é sobreposta (últimos dias) e a
 * execução só repete depois de algumas horas — vários usuários entrando de
 * manhã não precisam repetir a mesma coleta.
 */
export function PublicationsAutoSync() {
  const { user } = useAuth();
  const { data: lawyers } = useCollection<Lawyer>("lawyers");
  const { toast } = useToast();
  const jaRodou = useRef(false);

  useEffect(() => {
    if (!user || !lawyers || jaRodou.current) return;
    const monitorados = lawyers.filter((lawyer) => !lawyer.deleted && lawyer.monitored);
    if (monitorados.length === 0) return;

    jaRodou.current = true;
    let cancelado = false;

    (async () => {
      try {
        const ultima = await lastPublicationSync();
        if (cancelado || !shouldRunAutomaticSync(ultima)) return;

        const resultado = await syncDjenPublications(lawyers, user, { automatic: true });
        if (cancelado || resultado.created === 0) return;
        toast({
          title:
            resultado.created === 1
              ? "1 nova publicação"
              : `${resultado.created} novas publicações`,
          description: "Abra Publicações para fazer a triagem.",
        });
      } catch (erro) {
        // Falha de rede ou limite do DJEN não pode atrapalhar o uso do sistema;
        // a tela de Publicações mostra o erro e permite buscar de novo.
        console.error("Falha na busca automática de publicações:", erro);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [user, lawyers, toast]);

  return null;
}
