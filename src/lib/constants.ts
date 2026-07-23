/**
 * E-mail com acesso de administrador garantido (bootstrap).
 * Também está definido em firestore.rules — se mudar aqui, mude lá.
 */
export const BOOTSTRAP_ADMIN_EMAIL = "okjuridico@gmail.com";

export function isToolsOwner(email: string | undefined | null): boolean {
  return (email ?? "").trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
}

export const APP_NAME = "JurídicoBRM";
