import { useTranslation } from "react-i18next";

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold">{t("auth.login")}</h1>
        <p className="text-sm text-gray-500">Login form — coming soon</p>
      </div>
    </main>
  );
}
