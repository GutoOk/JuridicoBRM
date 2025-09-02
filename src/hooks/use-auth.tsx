

"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { getUsers as getUsersFromDB } from '@/app/dashboard/users/actions';
import type { User } from '@/lib/types';


interface AuthContextType {
  user: User | null;
  login: (username: string, password_provided: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if running on the client
    if (typeof window !== 'undefined') {
      try {
        const storedUser = localStorage.getItem('maua-user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error("Failed to parse user from localStorage", error);
        localStorage.removeItem('maua-user');
      } finally {
        setLoading(false);
      }
    } else {
        setLoading(false);
    }
  }, []);

  const login = async (username: string, password_provided: string): Promise<boolean> => {
    try {
        const users = await getUsersFromDB();
        const foundUser = users.find(
            (u) => u.name.toLowerCase() === username.toLowerCase() && u.password === password_provided
        );

        if (foundUser) {
            const { password, ...userData } = foundUser;
            // Always set 'áttila' as admin
            if (userData.name.toLowerCase() === 'áttila') {
                userData.isAdmin = true;
            }
            localStorage.setItem('maua-user', JSON.stringify(userData));
            setUser(userData);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Login failed:", error);
        return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('maua-user');
    sessionStorage.removeItem('master-access');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
