"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MatchStatus =
  | "exact_id"
  | "exact_name"
  | "fuzzy_name"
  | "new"
  | "conflict";

type DecisionAction =
  | "accept_match"
  | "create_new"
  | "link_existing"
  | "ignore"
  | null;

interface Row {
  decisionId: string | null;
  rowIndex: number;
  pos: number;
  nameRaw: string;
  betaId: string | null;
  clubRaw: string;
  pj: number;
  pg: number;
  pp: number;
  efe: number;
  avg: number;
  matchStatus: MatchStatus;
  confidence: number | null;
  proposedPlayerId: string | null;
  needsReview: boolean;
  action: DecisionAction;
  selectedPlayerId: string | null;
}

interface BatchPayload {
  batchId: string;
  status: string;
  tournament: {
    name: string;
    date: string | null;
    roundNumber: number | null;
    type: string;
    externalKey: string;
  };
  stats: {
    players: number;
    recognized: number;
    new: number;
    conflicts: number;
    fuzzy: number;
  };
  file: {
    originalFilename: string;
    fileHash: string;
  };
  notes: string | null;
  rows: Row[];
}

type FilterTab = "all" | "review" | "recognized" | "new";

const STATUS_LABEL: Record<MatchStatus, string> = {
  exact_id: "ID exacto",
  exact_name: "Nombre",
  fuzzy_name: "Fuzzy",
  new: "Nuevo",
  conflict: "Conflicto",
};

const STATUS_CLASS: Record<MatchStatus, string> = {
  exact_id: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  exact_name: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  fuzzy_name: "bg-amber-900/40 text-amber-300 border-amber-700",
  new: "bg-sky-900/40 text-sky-300 border-sky-700",
  conflict: "bg-rose-900/40 text-rose-300 border-rose-700",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  } catch {
    return d;
  }
}

function formatPct(avg: number): string {
  return `${Math.round(avg * 100)}%`;
}

export default function PreviewClient({ initial }: { initial: BatchPayload }) {
  const router = useRouter();
  const [data, setData] = useState<BatchPayload>(initial);
  const [tab, setTab] = useState<FilterTab>("review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pendingReview = useMemo(
    () =>
      data.rows.filter(
        (r) =>
          (r.matchStatus === "conflict" || r.matchStatus === "fuzzy_name") &&
          !r.action
      ).length,
    [data.rows]
  );

  const autoCount = useMemo(
    () => data.rows.filter((r) => r.action && !r.needsReview).length,
    [data.rows]
  );

  const filtered = useMemo(() => {
    switch (tab) {
      case "review":
        return data.rows.filter(
          (r) => r.matchStatus === "conflict" || r.matchStatus === "fuzzy_name"
        );
      case "recognized":
        return data.rows.filter(
          (r) =>
            r.matchStatus === "exact_id" || r.matchStatus === "exact_name"
        );
      case "new":
        return data.rows.filter((r) => r.matchStatus === "new");
      default:
        return data.rows;
    }
  }, [data.rows, tab]);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/import/betadomino/${data.batchId}`);
    if (!res.ok) throw new Error("No se pudo recargar el batch");
    const json = await res.json();
    setData(json);
  }, [data.batchId]);

  const patchDecision = async (
    decisionId: string,
    action: DecisionAction,
    selectedPlayerId?: string | null
  ) => {
    if (!decisionId || !action) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/import/betadomino/${data.batchId}/decisions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decisions: [
              {
                id: decisionId,
                action,
                selectedPlayerId:
                  action === "accept_match" || action === "link_existing"
                    ? selectedPlayerId
                    : null,
              },
            ],
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al guardar decisión");
      }
      await reload();
      setMessage("Decisión guardada");
      setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (pendingReview > 0) return;
    if (
      !confirm(
        "¿Confirmar e importar este torneo? Se crearán jugadores, resultados y se actualizará el ranking."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/import/betadomino/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: data.batchId,
          fileHash: data.file.fileHash,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error ||
            (json.details ? json.details.join("; ") : "Error al confirmar")
        );
      }
      await reload();
      const s = json.summary;
      setMessage(
        `Importación confirmada. Torneo ${json.tournamentId}. ` +
          `Creados: ${s?.playersCreated ?? 0} jugadores · ` +
          `${s?.resultsWritten ?? 0} resultados · ` +
          `${s?.rankingSnapshots ?? 0} snapshots · ` +
          `${s?.rankingChanges ?? 0} cambios de ranking auditados.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al confirmar");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este preview? No se puede deshacer.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/import/betadomino/${data.batchId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo eliminar");
      }
      router.push("/import/preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
      setBusy(false);
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: data.rows.length },
    {
      id: "review",
      label: "Revisar",
      count: data.rows.filter(
        (r) => r.matchStatus === "conflict" || r.matchStatus === "fuzzy_name"
      ).length,
    },
    {
      id: "recognized",
      label: "Reconocidos",
      count: data.rows.filter(
        (r) =>
          r.matchStatus === "exact_id" || r.matchStatus === "exact_name"
      ).length,
    },
    {
      id: "new",
      label: "Nuevos",
      count: data.rows.filter((r) => r.matchStatus === "new").length,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <header className="mb-8 border-b border-zinc-800 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-500/80">
                Importación BetaDomino
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
                {data.tournament.name}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                {formatDate(data.tournament.date)}
                {" · "}
                <span className="capitalize">{data.tournament.type}</span>
                {data.tournament.roundNumber != null && (
                  <> · Ronda {data.tournament.roundNumber}</>
                )}
              </p>
              <p className="mt-2 font-mono text-xs text-zinc-600">
                batch {data.batchId}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy || data.status !== "preview"}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-rose-800 hover:text-rose-300 disabled:opacity-40"
              >
                Eliminar preview
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy || pendingReview > 0 || data.status !== "preview"}
                className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                title={
                  data.status !== "preview"
                    ? "Este batch ya no está en preview"
                    : pendingReview > 0
                      ? `Quedan ${pendingReview} filas por resolver`
                      : "Confirmar e importar"
                }
              >
                {data.status === "confirmed"
                  ? "Ya importado"
                  : "Confirmar e importar"}
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Jugadores" value={data.stats.players} />
            <StatCard
              label="Automáticas"
              value={autoCount}
              tone="emerald"
            />
            <StatCard
              label="Requieren revisión"
              value={pendingReview}
              tone={pendingReview > 0 ? "rose" : "zinc"}
            />
            <StatCard label="Nuevos" value={data.stats.new} tone="sky" />
          </div>

          {pendingReview > 0 && (
            <p className="mt-4 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200/90">
              Resuelve los {pendingReview} conflicto(s) / fuzzy antes de
              confirmar la importación.
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-md border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
          {message && (
            <p className="mt-3 rounded-md border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
              {message}
            </p>
          )}
        </header>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                tab === t.id
                  ? "border-amber-600 bg-amber-600/20 text-amber-200"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {t.label}{" "}
              <span className="ml-1 tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Pos</th>
                <th className="px-3 py-2.5">Nombre Excel</th>
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Club</th>
                <th className="px-3 py-2.5">Match</th>
                <th className="px-3 py-2.5">Conf.</th>
                <th className="px-3 py-2.5">Acción</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {filtered.map((row) => {
                const key = row.decisionId || String(row.rowIndex);
                const isOpen = expandedId === key;
                return (
                  <tr
                    key={key}
                    className={`align-top ${
                      row.needsReview && !row.action
                        ? "bg-rose-950/10"
                        : "hover:bg-zinc-900/50"
                    }`}
                  >
                    <td className="px-3 py-2.5 tabular-nums text-zinc-500">
                      {row.pos}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-zinc-100">
                      {row.nameRaw}
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {row.pg}G · {row.pp}P · EFE {row.efe} ·{" "}
                        {formatPct(row.avg)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">
                      {row.betaId ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {row.clubRaw || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 text-xs ${STATUS_CLASS[row.matchStatus]}`}
                      >
                        {STATUS_LABEL[row.matchStatus]}
                      </span>
                      {row.action && (
                        <div className="mt-1 text-xs text-zinc-500">
                          → {row.action.replace("_", " ")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-400">
                      {row.confidence != null
                        ? `${Math.round(row.confidence * 100)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-400">
                      {row.action ?? (
                        <span className="text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(row.matchStatus === "conflict" ||
                        row.matchStatus === "fuzzy_name" ||
                        !row.action) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isOpen ? null : key)
                          }
                          className="text-xs text-amber-400 hover:text-amber-300"
                        >
                          {isOpen ? "Cerrar" : "Resolver"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    No hay filas en este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded decision panel */}
        {expandedId && (
          <DecisionPanel
            row={data.rows.find(
              (r) => (r.decisionId || String(r.rowIndex)) === expandedId
            )}
            busy={busy}
            onClose={() => setExpandedId(null)}
            onDecide={patchDecision}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: number;
  tone?: "zinc" | "emerald" | "rose" | "sky";
}) {
  const tones = {
    zinc: "border-zinc-800 bg-zinc-900/50 text-zinc-100",
    emerald: "border-emerald-900/50 bg-emerald-950/30 text-emerald-200",
    rose: "border-rose-900/50 bg-rose-950/30 text-rose-200",
    sky: "border-sky-900/50 bg-sky-950/30 text-sky-200",
  };
  return (
    <div className={`rounded-lg border px-3 py-3 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DecisionPanel({
  row,
  busy,
  onClose,
  onDecide,
}: {
  row?: Row;
  busy: boolean;
  onClose: () => void;
  onDecide: (
    decisionId: string,
    action: DecisionAction,
    selectedPlayerId?: string | null
  ) => void;
}) {
  if (!row || !row.decisionId) return null;

  const isConflict = row.matchStatus === "conflict";
  const isFuzzy = row.matchStatus === "fuzzy_name";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {isConflict ? "⚠ Conflicto" : isFuzzy ? "● Posible match" : "Decisión"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-50">
              {row.nameRaw}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              ID BetaDomino:{" "}
              <span className="font-mono text-zinc-300">
                {row.betaId ?? "—"}
              </span>
              {" · "}
              {row.clubRaw || "Sin club"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>

        {isConflict && (
          <p className="mb-4 rounded-md border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200/90">
            Mismo identificador externo con nombre distinto, o varios
            candidatos. Elige cómo resolverlo.
          </p>
        )}
        {isFuzzy && (
          <p className="mb-4 rounded-md border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200/90">
            Propuesta automática con confianza{" "}
            {row.confidence != null
              ? `${Math.round(row.confidence * 100)}%`
              : "—"}.
            Revisa antes de aceptar.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {row.proposedPlayerId && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onDecide(
                  row.decisionId!,
                  "accept_match",
                  row.proposedPlayerId
                )
              }
              className="rounded-md bg-emerald-700 px-3 py-2 text-left text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              Aceptar match propuesto
              <span className="mt-0.5 block text-xs text-emerald-200/80">
                Vincular a jugador GFCN existente
              </span>
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(row.decisionId!, "create_new")}
            className="rounded-md border border-sky-700 bg-sky-950/40 px-3 py-2 text-left text-sm text-sky-100 hover:bg-sky-900/40 disabled:opacity-50"
          >
            Crear nuevo jugador
            <span className="mt-0.5 block text-xs text-sky-300/70">
              Se creará al confirmar la importación
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(row.decisionId!, "ignore")}
            className="rounded-md border border-zinc-600 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Ignorar fila
            <span className="mt-0.5 block text-xs text-zinc-500">
              No se importará este resultado
            </span>
          </button>
        </div>

        <p className="mt-4 text-xs text-zinc-600">
          “Vincular a otro jugador” (búsqueda manual) se añadirá cuando el
          catálogo de jugadores esté expuesto por API.
        </p>
      </div>
    </div>
  );
}
