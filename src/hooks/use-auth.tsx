"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import { BOOTSTRAP_ADMIN_EMAIL } from "@/lib/constants";
import type { UserProfile } from "@/lib/types";

interface AuthContextType {
  /** Perfil do usuário logado (users/{uid}). null = sem perfil ou deslogado. */
  user: UserProfile | null;
  fbUser: FirebaseUser | null;
  isAdmin: boolean;
  loading: boolean;
  /** true quando o usuário está autenticado mas não tem perfil criado pelo admin. */
  noProfile: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);

  // Processa resultado de redirect (login com Google em produção)
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.error("Erro no redirect de login:", err);
    });
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (fb) => {
      unsubProfile?.();
      unsubProfile = undefined;
      setFbUser(fb);
      setNoProfile(false);

      if (!fb) {
        setUser(null);
        setLoading(false);
        return;
      }

      const isBootstrap = (fb.email ?? "").toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

      unsubProfile = onSnapshot(
        doc(db, "users", fb.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUser({
              id: snap.id,
              name: data.name ?? fb.email ?? "Usuário",
              email: data.email ?? fb.email ?? "",
              role: isBootstrap ? "admin" : data.role === "admin" ? "admin" : "operator",
              active: isBootstrap ? true : data.active !== false,
              createdAt: data.createdAt,
            });
            setNoProfile(false);
          } else if (isBootstrap) {
            // Primeiro acesso do administrador: cria o próprio perfil.
            setDoc(doc(db, "users", fb.uid), {
              name: "Áttila",
              email: fb.email,
              role: "admin",
              active: true,
              createdAt: serverTimestamp(),
            }).catch((e) => console.error("Falha ao criar perfil do administrador:", e));
          } else {
            setUser(null);
            setNoProfile(true);
          }
          setLoading(false);
        },
        (err) => {
          console.error("Erro ao carregar perfil:", err);
          setUser(null);
          setNoProfile(true);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      unsubProfile?.();
    };
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const loginWithGoogle = async () => {
    const isLocalhost = typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocalhost) {
      await signInWithPopup(auth, googleProvider);
    } else {
      await signInWithRedirect(auth, googleProvider);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isAdmin = user?.role === "admin" && user.active;

  return (
    <AuthContext.Provider value={{ user, fbUser, isAdmin, loading, noProfile, login, loginWithGoogle, resetPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/** Traduz erros do Firebase Auth para mensagens em português. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou senha incorretos.";
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "auth/user-disabled":
      return "Esta conta foi desativada.";
    case "auth/email-already-in-use":
      return "Já existe uma conta com este e-mail.";
    case "auth/weak-password":
      return "Senha muito fraca. Use pelo menos 6 caracteres.";
    case "auth/network-request-failed":
      return "Falha de conexão. Verifique sua internet.";
    case "auth/popup-closed-by-user":
      return "Login cancelado. A janela foi fechada antes de concluir.";
    case "auth/popup-blocked":
      return "Popup bloqueado pelo navegador. Permita popups para este site.";
    case "auth/cancelled-popup-request":
      return ""; // silencioso — outra popup já estava aberta
    case "auth/account-exists-with-different-credential":
      return "Já existe uma conta com este e-mail usando outro método de login.";
    default:
      return "Ocorreu um erro. Tente novamente.";
  }
}
