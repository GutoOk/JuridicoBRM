"use client";

import { useEffect, useState, useRef } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  type QueryConstraint,
  type WhereFilterOp,
  type OrderByDirection,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";

export type ColOptions = {
  where?: [string, WhereFilterOp, unknown][];
  orderBy?: [string, OrderByDirection?][];
  limit?: number;
};

/**
 * Assina uma coleção do Firestore em tempo real.
 * Retorna null enquanto carrega. Só conecta quando há usuário logado.
 * `deps` deve refletir mudanças nas opções (ex.: valor de um where).
 */
export function useCollection<T>(
  colName: string | null,
  opts?: ColOptions,
  deps: unknown[] = []
): { data: T[] | null; error: Error | null } {
  const { user } = useAuth();
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const enabled = !!user && !!colName;

  useEffect(() => {
    if (!enabled || !colName) {
      setData(null);
      return;
    }
    setError(null);
    const o = optsRef.current;
    const constraints: QueryConstraint[] = [];
    o?.where?.forEach(([f, op, v]) => constraints.push(where(f, op, v)));
    o?.orderBy?.forEach(([f, d]) => constraints.push(orderBy(f, d)));
    if (o?.limit) constraints.push(limit(o.limit));

    const unsub = onSnapshot(
      query(collection(db, colName), ...constraints),
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
      },
      (err) => {
        console.error(`Erro ao carregar ${colName}:`, err);
        setError(err);
        setData([]);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, colName, ...deps]);

  return { data, error };
}

/** Assina um documento do Firestore em tempo real. */
export function useDoc<T>(
  colName: string | null,
  id: string | null | undefined
): { data: T | null | undefined; error: Error | null } {
  const { user } = useAuth();
  // undefined = carregando; null = não existe
  const [data, setData] = useState<T | null | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);

  const enabled = !!user && !!colName && !!id;

  useEffect(() => {
    if (!enabled || !colName || !id) {
      setData(undefined);
      return;
    }
    setError(null);
    const unsub = onSnapshot(
      doc(db, colName, id),
      (snap) => {
        setData(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null);
      },
      (err) => {
        console.error(`Erro ao carregar ${colName}/${id}:`, err);
        setError(err);
        setData(null);
      }
    );
    return unsub;
  }, [enabled, colName, id]);

  return { data, error };
}
