import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (
    email: string,
    password: string,
    confirmPassword: string,
    firstName?: string,
    lastName?: string,
  ) => Promise<string | null>;
  logout: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(
    async (path: string, body: Record<string, string>) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        return data?.error ?? "Authentication failed";
      }
      const data = (await response.json()) as { user: AuthUser };
      setUser(data.user);
      return null;
    },
    [],
  );

  const login = useCallback(
    (email: string, password: string) =>
      authenticate("/api/auth/login", { email, password }),
    [authenticate],
  );

  const register = useCallback(
    (
      email: string,
      password: string,
      confirmPassword: string,
      firstName = "",
      lastName = "",
    ) =>
      authenticate("/api/auth/register", {
        email,
        password,
        confirmPassword,
        firstName,
        lastName,
      }),
    [authenticate],
  );

  const logout = useCallback(() => {
    fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      window.location.href = "/login";
    });
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };
}
