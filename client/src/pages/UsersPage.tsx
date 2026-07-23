import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { api, type CreateUserInput, type UpdateUserInput } from "../api";
import type { UserDto } from "@shared/types";
import BossNav from "../components/BossNav";

// ── Modal state ──────────────────────────────────────────────────────────────

type ModalState =
  | null
  | { type: "create" }
  | { type: "edit"; user: UserDto }
  | { type: "resetPassword"; user: UserDto }
  | { type: "delete"; user: UserDto };

// ── Small shared pieces ──────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserDto["role"] }) {
  const { t } = useTranslation();
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        role === "boss"
          ? "bg-indigo-100 text-indigo-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {role === "boss" ? t("users.boss") : t("users.employee")}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoComplete={autoComplete}
      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    />
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600"
      />
      {label}
    </label>
  );
}

// ── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Create user modal ────────────────────────────────────────────────────────

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: UserDto) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateUserInput>({
    name: "",
    username: "",
    password: "",
    role: "employee",
    isCook: false,
    isBarista: false,
    defaultShiftsPerWeek: 3,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof CreateUserInput>(k: K, v: CreateUserInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await api.users.create(form);
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t("users.createUser")} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t("users.name")}>
          <TextInput value={form.name} onChange={(v) => set("name", v)} required />
        </Field>
        <Field label={t("users.username")}>
          <TextInput
            value={form.username}
            onChange={(v) => set("username", v)}
            autoComplete="off"
            required
          />
        </Field>
        <Field label={t("users.password")}>
          <TextInput
            type="password"
            value={form.password}
            onChange={(v) => set("password", v)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label={t("users.role")}>
          <select
            value={form.role}
            onChange={(e) => set("role", e.target.value as CreateUserInput["role"])}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="employee">{t("users.employee")}</option>
            <option value="boss">{t("users.boss")}</option>
          </select>
        </Field>
        <div className="flex gap-6">
          <CheckboxRow
            label={t("users.isCook")}
            checked={form.isCook}
            onChange={(v) => set("isCook", v)}
          />
          <CheckboxRow
            label={t("users.isBarista")}
            checked={form.isBarista}
            onChange={(v) => set("isBarista", v)}
          />
        </div>
        <Field label={t("users.defaultShiftsPerWeek")}>
          <input
            type="number"
            min={0}
            value={form.defaultShiftsPerWeek}
            onChange={(e) => set("defaultShiftsPerWeek", parseInt(e.target.value, 10) || 0)}
            className="w-24 rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "…" : t("users.createUser")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit user modal ──────────────────────────────────────────────────────────

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserDto;
  onClose: () => void;
  onSaved: (updated: UserDto) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Required<UpdateUserInput>>({
    name: user.name,
    isCook: user.isCook,
    isBarista: user.isBarista,
    defaultShiftsPerWeek: user.defaultShiftsPerWeek,
    isActive: user.isActive,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user: updated } = await api.users.update(user.id, form);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t("users.editUser")} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t("users.name")}>
          <TextInput value={form.name} onChange={(v) => set("name", v)} required />
        </Field>
        <div className="flex gap-6">
          <CheckboxRow
            label={t("users.isCook")}
            checked={form.isCook}
            onChange={(v) => set("isCook", v)}
          />
          <CheckboxRow
            label={t("users.isBarista")}
            checked={form.isBarista}
            onChange={(v) => set("isBarista", v)}
          />
        </div>
        <Field label={t("users.defaultShiftsPerWeek")}>
          <input
            type="number"
            min={0}
            value={form.defaultShiftsPerWeek}
            onChange={(e) =>
              set("defaultShiftsPerWeek", parseInt(e.target.value, 10) || 0)
            }
            className="w-24 rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </Field>
        <CheckboxRow
          label={t("users.isActive")}
          checked={form.isActive}
          onChange={(v) => set("isActive", v)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "…" : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Reset password modal ─────────────────────────────────────────────────────

function ResetPasswordModal({
  user,
  onClose,
}: {
  user: UserDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.users.resetPassword(user.id, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t("users.resetPassword")} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-green-700">{t("users.passwordResetSuccess")}</p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">
            {t("users.resetPasswordFor", { name: user.name })}
          </p>
          <Field label={t("users.newPassword")}>
            <TextInput
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              required
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "…" : t("users.resetPassword")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Delete user modal ────────────────────────────────────────────────────────

function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: {
  user: UserDto;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.users.delete(user.id, password);
      onDeleted(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t("users.deleteUser")} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          {t("users.deleteWarning", { name: user.name })}
        </p>
        <Field label={t("users.confirmYourPassword")}>
          <TextInput
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "…" : t("users.deleteUser")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── User card ────────────────────────────────────────────────────────────────

function UserCard({
  user,
  currentUserId,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  user: UserDto;
  currentUserId: number;
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const roles = [
    user.isCook && t("users.isCook"),
    user.isBarista && t("users.isBarista"),
  ].filter(Boolean);

  return (
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm ${
        !user.isActive ? "opacity-60" : ""
      }`}
    >
      {/* Whole header toggles the card; details always show, actions hide until open. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-2 text-start"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{user.name}</span>
            <RoleBadge role={user.role} />
            {!user.isActive && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600">
                {t("users.inactive")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">@{user.username}</p>
          <p className="mt-1 text-sm text-gray-500">
            {roles.length > 0 ? roles.join(" · ") + " · " : ""}
            {t("users.shiftsPerWeek", { count: user.defaultShiftsPerWeek })}
          </p>
        </div>
        <span
          aria-hidden
          className={`mt-0.5 shrink-0 text-gray-400 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
      </button>

      {expanded && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <button
            onClick={onEdit}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("common.edit")}
          </button>
          <button
            onClick={onResetPassword}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("users.password")}
          </button>
          {user.id !== currentUserId && (
            <button
              onClick={onDelete}
              className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              {t("users.deleteUser")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    api.users
      .list()
      .then(({ users }) => setUsers(users))
      .catch(() => setError(t("users.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const handleCreated = (user: UserDto) => {
    setUsers((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
    setModal(null);
  };

  const handleSaved = (updated: UserDto) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setModal(null);
  };

  const handleDeleted = (id: number) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setModal(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <BossNav />
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-lg font-semibold">{t("users.title")}</h1>
          <button
            onClick={() => setModal({ type: "create" })}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + {t("users.newUser")}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-3 p-4">
        {loading && (
          <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            {t("users.showInactive")}
          </label>
        )}
        {!loading && !error && users.filter((u) => showInactive || u.isActive).length === 0 && (
          <p className="text-center text-sm text-gray-400">{t("users.noUsers")}</p>
        )}
        {users.filter((u) => showInactive || u.isActive).map((user) => (
          <UserCard
            key={user.id}
            user={user}
            currentUserId={currentUser!.id}
            onEdit={() => setModal({ type: "edit", user })}
            onResetPassword={() => setModal({ type: "resetPassword", user })}
            onDelete={() => setModal({ type: "delete", user })}
          />
        ))}
      </main>

      {modal?.type === "create" && (
        <CreateUserModal onClose={() => setModal(null)} onCreated={handleCreated} />
      )}
      {modal?.type === "edit" && (
        <EditUserModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {modal?.type === "resetPassword" && (
        <ResetPasswordModal user={modal.user} onClose={() => setModal(null)} />
      )}
      {modal?.type === "delete" && (
        <DeleteUserModal
          user={modal.user}
          onClose={() => setModal(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
