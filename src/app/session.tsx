import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { client } from "../data/client";
interface AuthState {
  session: Session | null;
  loading: boolean;
  failed: boolean;
}
const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  failed: false,
});
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: !!client,
    failed: false,
  });
  useEffect(() => {
    if (!client) return;
    let mounted = true;
    let changed = false;
    let currentUser: string | undefined;
    const apply = (session: Session | null) => {
      if (!mounted) return;
      if (currentUser !== session?.user.id) {
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      currentUser = session?.user.id;
      setState({ session, loading: false, failed: false });
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      changed = true;
      apply(session);
    });
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted || changed) return;
        if (error) setState({ session: null, loading: false, failed: true });
        else apply(data.session);
      })
      .catch(() => {
        if (mounted) setState({ session: null, loading: false, failed: true });
      });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export const useSession = () => useContext(AuthContext);
