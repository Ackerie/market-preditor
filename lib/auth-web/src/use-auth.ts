import { useState, useEffect, useCallback } from "react";
import {
  apiFetch,
  clearNativeSession,
  isNativeApp,
  saveNativeSession,
} from "./native-session";

export type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin?: boolean;
};

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<string | null>;
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

    apiFetch("/api/auth/user", { credentials: "include" })
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
      let response: Response;
      try {
        response = await apiFetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      } catch {
        return "Unable to reach the authentication service. Check your connection and try again.";
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        return (
          data?.error ??
          `Authentication service returned an unexpected response (HTTP ${response.status}). Please try again.`
        );
      }
      const data = (await response.json()) as {
        user: AuthUser;
        sessionToken?: string;
      };
      if (isNativeApp()) {
        if (!data.sessionToken) {
          return "The authentication service did not return a native session.";
        }
        try {
          await saveNativeSession(data.sessionToken);
        } catch (error) {
          console.error("Unable to securely store the native session.", error);
          try {
            await apiFetch("/api/auth/logout", {
              method: "POST",
              credentials: "include",
            });
          } catch (logoutError) {
            console.error(
              "Unable to invalidate the unstored native session.",
              logoutError,
            );
          }
          return "Secure session storage is unavailable. Please try again.";
        }
      }
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
    void (async () => {
      try {
        const csrfToken = document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("XSRF-TOKEN="))
          ?.slice("XSRF-TOKEN=".length);

        const response = await apiFetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: csrfToken
            ? { "x-csrf-token": decodeURIComponent(csrfToken) }
            : undefined,
        });

        if (!response.ok) {
          throw new Error(`Logout failed with status ${response.status}`);
        }
      } catch (error) {
        console.error("Unable to invalidate the server session.", error);
      }

      try {
        await clearNativeSession();
      } catch (error) {
        console.error("Unable to clear the native session.", error);
      }

      document.cookie = "sid=; Path=/; Max-Age=0; SameSite=Strict";
      document.cookie = "XSRF-TOKEN=; Path=/; Max-Age=0; SameSite=Strict";
      setUser(null);
      window.location.replace("/login");
    })();
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
