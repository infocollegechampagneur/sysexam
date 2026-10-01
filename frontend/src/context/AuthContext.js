import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(false);
  };

  return <AuthContext.Provider value={{ user, setUser, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

export const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen grid place-items-center" data-testid="auth-loading">
        <Loader2 className="h-6 w-6 animate-spin text-blue-900" />
      </div>
    );
  if (!user) return <Navigate to="/connexion" replace />;
  return children;
};
