import { initializeApp, getApps, getApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider, createUserWithEmailAndPassword, signOut } from "firebase/auth";

const googleProvider = new GoogleAuthProvider();

const firebaseConfig = {
  projectId: "baro-de-mau",
  appId: "1:214288673341:web:32b3b650cebac0c9521854",
  storageBucket: "baro-de-mau.firebasestorage.app",
  apiKey: "AIzaSyBMr3qg-Iyi51uAtGWdRTNemaksKmwD8aM",
  authDomain: "juridicobrm--baro-de-mau.us-central1.hosted.app",
  measurementId: "",
  messagingSenderId: "214288673341",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let db: Firestore;
try {
  // Cache local persistente: menos leituras no Firestore e resposta instantânea.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  // Já inicializado (hot reload) — reutiliza a instância.
  db = getFirestore(app);
}

const auth = getAuth(app);

/**
 * Cria uma conta no Firebase Auth usando uma instância secundária,
 * para não derrubar a sessão do administrador logado.
 * Retorna o uid da conta criada.
 */
export async function createAuthUser(email: string, password: string): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `user-mgmt-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}

export { app, db, auth, googleProvider };
