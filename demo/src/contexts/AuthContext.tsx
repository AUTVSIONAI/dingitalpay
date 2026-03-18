import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getBaseUrl } from "@/lib/get-base-url";
import type { User, Session } from "@/types/auth";

export type AppRole = "admin" | "seller" | "buyer";
type RoleFromMeta = AppRole | null;

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: Profile | null;
  loading: boolean;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  cpf: string;
  birth_date: string | null;
  bio: string;
  city: string;
  state: string;
  country: string;
  company: string;
  website: string;
  timezone: string;
  avatar_url: string | null;
  email_notifications: boolean;
  sms_notifications: boolean;
  marketing_emails: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string, opts?: { turnstileToken?: string | null; useTrustedDevice?: boolean }) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
    role?: AppRole,
    redirectTo?: string,
    turnstileToken?: string | null
  ) => Promise<{ error: Error | null; requiresEmailVerification: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    profile: null,
    loading: true,
  });
  const stateRef = useRef(state);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fetchProfileAndRole = async (userId: string) => {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.rpc("get_user_role", { _user_id: userId }),
    ]);
    return {
      profile: profileRes.data as Profile | null,
      role: (roleRes.data as AppRole) || null,
    };
  };

  const refreshProfile = async () => {
    if (!state.user) return;
    const { profile, role } = await fetchProfileAndRole(state.user.id);
    setState((prev) => ({ ...prev, profile, role }));
  };

  const resolveSessionState = async (
    session: Session,
    prevState?: AuthState,
    options?: { event?: "INITIAL" | "SIGNED_IN" | "TOKEN_REFRESHED" | "USER_UPDATED" }
  ): Promise<AuthState> => {
    const roleFromMeta = (session.user.user_metadata?.role as RoleFromMeta) || null;
    const mfaPending = Boolean((session as any)?.mfa_pending);
    const mfaSetupRequired = Boolean((session as any)?.mfa_setup_required);
    const nextSession = { ...(session as any), mfa_pending: mfaPending, mfa_setup_required: mfaSetupRequired };
    const sameUser = prevState?.user?.id === session.user.id;
    const prevProfile = sameUser ? prevState?.profile ?? null : null;
    const prevRole = sameUser ? prevState?.role ?? null : null;

    if (mfaPending) {
      return {
        user: session.user,
        session: nextSession,
        profile: null,
        role: roleFromMeta ?? prevRole,
        loading: false,
      };
    }

    const isRefresh = options?.event === "TOKEN_REFRESHED";
    const needsProfile = !prevProfile;
    const needsRole = !(roleFromMeta ?? prevRole);

    if (isRefresh && !needsProfile && !needsRole) {
      return {
        user: session.user,
        session: nextSession,
        profile: prevProfile,
        role: roleFromMeta ?? prevRole,
        loading: false,
      };
    }

    try {
      const { profile, role } = await fetchProfileAndRole(session.user.id);
      return {
        user: session.user,
        session: nextSession,
        profile: profile ?? prevProfile,
        role: roleFromMeta ?? role ?? prevRole,
        loading: false,
      };
    } catch {
      return {
        user: session.user,
        session: nextSession,
        profile: prevProfile,
        role: roleFromMeta ?? prevRole,
        loading: false,
      };
    }
  };

  useEffect(() => {
    if (!state.user) return;
    const refresh = async () => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      try {
        await supabase.auth.refreshSession();
        lastRefreshAtRef.current = Date.now();
      } catch {
        // Ignore transient refresh failures; auth listener will reconcile state.
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      const expiresAtMs = Number(state.session?.expires_at || 0) * 1000;
      if (!expiresAtMs) return;

      const msUntilExpiry = expiresAtMs - Date.now();
      const msUntilRefresh = msUntilExpiry - 60_000;
      const delay = Math.max(15_000, Math.min(msUntilRefresh, 30 * 60_000));

      timeoutId = window.setTimeout(() => {
        refresh().catch(() => null);
      }, delay);
    };

    const maybeRefreshOnResume = () => {
      const currentSession = stateRef.current.session;
      if (!currentSession) return;
      const expiresAtMs = Number(currentSession.expires_at || 0) * 1000;
      const msUntilExpiry = expiresAtMs - Date.now();
      const refreshedRecently = Date.now() - lastRefreshAtRef.current < 30_000;
      if (!refreshedRecently && msUntilExpiry <= 5 * 60_000) {
        refresh().catch(() => null);
      }
    };

    scheduleRefresh();
    const handleFocus = () => maybeRefreshOnResume();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") maybeRefreshOnResume();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [state.user, state.session?.expires_at]);

  useEffect(() => {
    // Set up auth listener BEFORE getSession
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Use setTimeout to avoid potential deadlocks with Supabase auth
          setTimeout(async () => {
            const prevSnapshot = stateRef.current;
            const nextState = await resolveSessionState(session, prevSnapshot, {
              event: event === "TOKEN_REFRESHED" ? "TOKEN_REFRESHED" : event === "USER_UPDATED" ? "USER_UPDATED" : "SIGNED_IN",
            });
            setState((prev) => {
              if (prev.user?.id === nextState.user?.id) {
                return {
                  ...nextState,
                  profile: nextState.profile ?? prev.profile,
                  role: nextState.role ?? prev.role,
                };
              }
              return nextState;
            });
          }, 0);
        } else {
          setState({ user: null, session: null, profile: null, role: null, loading: false });
        }
      }
    );

    // Then get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const nextState = await resolveSessionState(session, stateRef.current, { event: "INITIAL" });
        setState(nextState);
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, opts?: { turnstileToken?: string | null; useTrustedDevice?: boolean }) => {
    const payload: { email: string; password: string; turnstileResponse?: string } = {
      email,
      password,
    };

    if (opts?.turnstileToken) payload.turnstileResponse = opts.turnstileToken;

    const { error } = await supabase.auth.signInWithPassword({
      ...(payload as any),
      use_trusted_device: opts?.useTrustedDevice,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, name: string, role: AppRole = "buyer", redirectTo?: string, turnstileToken?: string | null) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      turnstile_token: turnstileToken || undefined,
      options: {
        data: { name, role },
        emailRedirectTo: redirectTo || getBaseUrl(),
      },
    });
    return {
      error: error as Error | null,
      requiresEmailVerification: Boolean((data as any)?.requires_email_verification),
    };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
