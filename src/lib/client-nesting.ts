import type { Client } from "./types";

export function clientMapOf(clients: Client[]): Map<string, Client> {
  return new Map(clients.map((client) => [client.id, client]));
}

export function nestedClientsOf(
  parent: Client,
  clientMap: Map<string, Client>
): Client[] {
  return (parent.nestedClientIds ?? [])
    .map((id) => clientMap.get(id))
    .filter((client): client is Client => !!client && !client.deleted);
}

export function parentClientsOf(clientId: string, clients: Client[]): Client[] {
  return clients.filter(
    (candidate) =>
      !candidate.deleted && (candidate.nestedClientIds ?? []).includes(clientId)
  );
}

/** Impede auto vínculo e ciclos como A > B > C > A. */
export function wouldCreateNestingCycle(
  parentClientId: string,
  nestedClientId: string,
  clientMap: Map<string, Client>
): boolean {
  if (parentClientId === nestedClientId) return true;

  const pending = [nestedClientId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const currentId = pending.pop()!;
    if (currentId === parentClientId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    pending.push(...(clientMap.get(currentId)?.nestedClientIds ?? []));
  }
  return false;
}
