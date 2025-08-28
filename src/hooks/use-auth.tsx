"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password_provided: string) => boolean;
  logout: () => void;
  loading: boolean;
}

const mockUsers = [
    { id: '1', name: 'Áttila', password: 'Áttila2025', email: 'attila@maua.com' },
    { id: '2', name: 'Tiago', password: 'Tiago2025', email: 'tiago@maua.com' },
    { id: '3', name: 'Aurelio', password: 'Aurelio2025', email: 'aurelio@maua.com' },
];

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

  const login = (username: string, password_provided: string): boolean => {
    const foundUser = mockUsers.find(
      (u) => u.name.toLowerCase() === username.toLowerCase() && u.password === password_provided
    );

    if (foundUser) {
      const userData = { id: foundUser.id, name: foundUser.name, email: foundUser.email };
      localStorage.setItem('maua-user', JSON.stringify(userData));
      setUser(userData);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('maua-user');
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
