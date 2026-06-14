import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";

export default function EmployeePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;
  if (user.role === "boss") return <Navigate to="/users" replace />;

  const roles = [
    user.isCook && t("users.isCook"),
    user.isBarista && t("users.isBarista"),
  ].filter(Boolean);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <h1 className="text-lg font-semibold">{t("employee.title")}</h1>
          <button
            onClick={handleLogout}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("auth.logout")}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{user.name}</h2>
          <p className="mt-1 text-sm text-gray-500">@{user.username}</p>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("users.role")}</dt>
              <dd className="font-medium capitalize">{user.role}</dd>
            </div>
            {roles.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">{t("employee.roles")}</dt>
                <dd className="font-medium">{roles.join(", ")}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("users.defaultShiftsPerWeek")}</dt>
              <dd className="font-medium">
                {t("users.shiftsPerWeek", { count: user.defaultShiftsPerWeek })}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
