"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MANAGEABLE_PROFILE_ROLES,
  isManageableProfileRole,
  type ManageableProfileRole,
} from "@/lib/admin/adminAllowlist";

type AdminUserRow = {
  id: string;
  email: string | null;
  role: string;
  full_name: string | null;
  created_at: string | null;
  is_allowlisted_admin: boolean;
};

type RowUiState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [requesterId, setRequesterId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, ManageableProfileRole>>(
    {},
  );
  const [rowState, setRowState] = useState<Record<string, RowUiState>>({});
  const [loadState, setLoadState] = useState<
    "loading" | "error" | "ready"
  >("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selfDemote, setSelfDemote] = useState<{
    targetUserId: string;
    role: ManageableProfileRole;
  } | null>(null);
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  const roleOptions = useMemo(() => [...MANAGEABLE_PROFILE_ROLES], []);

  const loadUsers = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/users", {
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        requester_id?: string;
        users?: AdminUserRow[];
      };
      if (!res.ok || !json.success || !Array.isArray(json.users)) {
        setLoadState("error");
        setLoadError(json.error ?? "No se pudo cargar la lista.");
        return;
      }
      setRequesterId(json.requester_id ?? null);
      setUsers(json.users);
      const drafts: Record<string, ManageableProfileRole> = {};
      for (const u of json.users) {
        if (u.is_allowlisted_admin) {
          drafts[u.id] = "admin";
        } else {
          drafts[u.id] = isManageableProfileRole(u.role)
            ? u.role
            : "candidate";
        }
      }
      setDraftRoles(drafts);
      setRowState({});
      setLoadState("ready");
    } catch {
      setLoadState("error");
      setLoadError("Error de red al cargar usuarios.");
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const applyUpdate = useCallback(
    async (
      targetUserId: string,
      role: ManageableProfileRole,
      confirmSelfDemotion: boolean,
    ) => {
      setRowState((s) => ({
        ...s,
        [targetUserId]: { kind: "saving" },
      }));
      try {
        const res = await fetch("/api/admin/user-role", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_user_id: targetUserId,
            role,
            confirm_self_demotion: confirmSelfDemotion,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          code?: string;
        };

        if (res.status === 409 && json.code === "CONFIRM_SELF_DEMOTION") {
          setRowState((s) => ({ ...s, [targetUserId]: { kind: "idle" } }));
          setSelfDemote({ targetUserId, role });
          return;
        }

        if (!res.ok || !json.success) {
          setRowState((s) => ({
            ...s,
            [targetUserId]: {
              kind: "error",
              message: json.error ?? "No se pudo guardar.",
            },
          }));
          return;
        }

        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUserId ? { ...u, role } : u,
          ),
        );
        setDraftRoles((d) => ({ ...d, [targetUserId]: role }));
        setRowState((s) => ({
          ...s,
          [targetUserId]: {
            kind: "success",
            message: "Guardado",
          },
        }));
        setGlobalToast("Rol actualizado correctamente.");
        window.setTimeout(() => setGlobalToast(null), 3200);
        window.setTimeout(() => {
          setRowState((s) => {
            const cur = s[targetUserId];
            if (cur?.kind === "success") {
              return { ...s, [targetUserId]: { kind: "idle" } };
            }
            return s;
          });
        }, 2500);
      } catch {
        setRowState((s) => ({
          ...s,
          [targetUserId]: {
            kind: "error",
            message: "Error de red.",
          },
        }));
      }
    },
    [],
  );

  const onSaveRow = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    const role: ManageableProfileRole = u?.is_allowlisted_admin
      ? "admin"
      : draftRoles[userId] ?? "candidate";
    void applyUpdate(userId, role, false);
  };

  const confirmSelfDemotionAction = () => {
    if (!selfDemote) return;
    const { targetUserId, role } = selfDemote;
    setSelfDemote(null);
    void applyUpdate(targetUserId, role, true);
  };

  if (loadState === "loading") {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-600 shadow-sm">
        Cargando usuarios…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-6 text-sm text-rose-900 shadow-sm">
        <p className="font-medium">No se pudo cargar la lista</p>
        <p className="mt-1 text-rose-800/90">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadUsers()}
          className="mt-4 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <>
      {globalToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[110] max-w-[min(90vw,24rem)] -translate-x-1/2 rounded-full border border-zinc-700/20 bg-[#0F172A] px-5 py-2.5 text-center text-sm font-medium text-white shadow-lg"
        >
          {globalToast}
        </div>
      ) : null}
      {selfDemote ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="self-demote-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2
              id="self-demote-title"
              className="text-lg font-semibold text-[#0F172A]"
            >
              Dejar de ser administrador
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Vas a cambiar tu propio rol y podrías perder acceso al panel de
              administración en esta sesión. ¿Continuar?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelfDemote(null)}
                className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSelfDemotionAction}
                className="rounded-full bg-[#3B4EFF] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f3dcc]"
              >
                Confirmar cambio
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Rol actual</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3">Nuevo rol</th>
                <th className="px-4 py-3 w-36" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const allowlistLocked = u.is_allowlisted_admin;
                const draftRaw = draftRoles[u.id] ?? "candidate";
                const draft = allowlistLocked ? "admin" : draftRaw;
                const dirty = allowlistLocked
                  ? u.role !== "admin"
                  : draft !== u.role;
                const ui = rowState[u.id] ?? { kind: "idle" };
                const isSelf = requesterId != null && u.id === requesterId;

                return (
                  <tr
                    key={u.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50"
                  >
                    <td className="px-4 py-3 font-medium text-[#0F172A]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{u.full_name ?? "—"}</span>
                        {u.is_allowlisted_admin ? (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">
                            Admin permitido por email
                          </span>
                        ) : null}
                        {isSelf ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                            Tú
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 capitalize text-zinc-600">
                      {u.role}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="w-full max-w-[11rem] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-[#0F172A] shadow-sm focus:border-[#3B4EFF] focus:outline-none focus:ring-1 focus:ring-[#3B4EFF] disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500"
                        value={draft}
                        disabled={ui.kind === "saving" || allowlistLocked}
                        title={
                          allowlistLocked
                            ? "Este correo está en la lista de administración: el rol en base de datos debe ser admin (acceso efectivo también gobernado por la lista)."
                            : undefined
                        }
                        onChange={(e) =>
                          setDraftRoles((d) => ({
                            ...d,
                            [u.id]: e.target.value as ManageableProfileRole,
                          }))
                        }
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-stretch gap-1">
                        <button
                          type="button"
                          disabled={!dirty || ui.kind === "saving"}
                          onClick={() => onSaveRow(u.id)}
                          className="rounded-lg bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {ui.kind === "saving" ? "Guardando…" : "Guardar"}
                        </button>
                        {ui.kind === "success" ? (
                          <span className="text-[11px] font-medium text-emerald-600">
                            {ui.message}
                          </span>
                        ) : null}
                        {ui.kind === "error" ? (
                          <span className="text-[11px] font-medium text-rose-600">
                            {ui.message}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        Quien tenga <strong>admin permitido por email</strong> debe conservar{" "}
        <code className="rounded bg-zinc-100 px-1">admin</code> en{" "}
        <code className="rounded bg-zinc-100 px-1">public.profiles</code>; la
        app sigue tratando esos correos como administradores de forma efectiva.
        Máximo {users.length} usuarios mostrados.
      </p>
    </>
  );
}
