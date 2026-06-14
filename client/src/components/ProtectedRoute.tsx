import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  bossOnly?: boolean;
}

export default function ProtectedRoute({ children, bossOnly = false }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-gray-400">Loading…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (bossOnly && user.role !== "boss") return <Navigate to="/" replace />;

  return <>{children}</>;
}
