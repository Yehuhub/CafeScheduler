import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";

export default function EmployeeNav() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
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
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-lg font-semibold">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("auth.logout")}
          </button>
        </div>
        <nav className="mt-2 flex items-center gap-4">
          <Link to="/" className={linkClass("/")}>
            {t("nav.home")}
          </Link>
          <Link to="/schedule" className={linkClass("/schedule")}>
            {t("nav.schedule")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
