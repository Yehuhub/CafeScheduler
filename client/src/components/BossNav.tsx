import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function BossNav() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const linkClass = (path: string) =>
    `text-sm font-medium hover:text-indigo-600 ${
      pathname === path ? "text-indigo-600" : "text-gray-500"
    }`;

  return (
    <header className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <nav className="flex items-center gap-6">
          <Link to="/dashboard" className={linkClass("/dashboard")}>
            {t("nav.schedule")}
          </Link>
          <Link to="/users" className={linkClass("/users")}>
            {t("nav.users")}
          </Link>
        </nav>
        <button
          onClick={handleLogout}
          className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          {t("auth.logout")}
        </button>
      </div>
    </header>
  );
}
