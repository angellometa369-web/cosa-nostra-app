"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ImpactPayload {
  batchId: string;
  tournament: {
    id: string | null;
    name: string;
    date: string | null;
    type: string;
    roundNumber: number | null;
    externalKey: string;
  };
  confirmedAt: string | null;
  file: { originalFilename: string; fileHash: string };
  headline: {
    participants: number;
    rankingRowsTracked: number;
    climbed: number;
    dropped: number;
    stable: number;
    debuts: number;
    collateralAffected: number;
    podiumChanged: boolean;
    volatility: number;
    medianClimb: number;
    medianDrop: number;
    maxClimb: number;
    maxDrop: number;
  };
  decisionStats: {
    acceptMatch: number;
    createNew: number;
    linkExisting: number;
    ignore: number;
    total: number;
  };
  tournamentPodium: Array<{
    position: number;
    displayName: string;
    club: string | null;
    pg: number;
    pp: number;
    efe: number;
    avg: number;
  }>;
  podium: {
    before: Array<{ position: number | null; displayName: string }>;
    after: Array<{
      position: number;
      displayName: string;
      previousPosition: number | null;
    }>;
    changed: boolean;
  };
  top10: {
    entered: Array<{ displayName: string; newPosition: number }>;
    left: Array<{ displayName: string; previousPosition: number | null }>;
  };
  topClimbers: Array<{
    displayName: string;
    club: string | null;
    from: number | null;
    to: number;
    delta: number | null;
    winsAdded: number;
  }>;
  topDroppers: Array<{
    displayName: string;
    club: string | null;
    from: number | null;
    to: number;
    delta: number | null;
  }>;
  debuts: Array<{
    displayName: string;
    club: string | null;
    position: number;
  }>;
  byClub: Array<{
    club: string;
    players: number;
    avgDelta: number;
    totalClimb: number;
    totalDrop: number;
    debuts: number;
  }>;
  impactScope: {
    participantsAffected: number;
    collateralAffected: number;
    note: string;
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Metric({
  label,
  value,
  hint,
  tone = "zinc",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "zinc" | "emerald" | "rose" | "amber" | "sky";
}) {
  const tones = {
    zinc: "border-zinc-800 bg-zinc-900/50 text-zinc-100",
    emerald: "border-emerald-900/40 bg-emerald-950/25 text-emerald-200",
    rose: "border-rose-900/40 bg-rose-950/25 text-rose-200",
    amber: "border-amber-900/40 bg-amber-950/25 text-amber-200",
    sky: "border-sky-900/40 bg-sky-950/25 text-sky-200",
  };
  return (
    <div className={`rounded-lg border px-3 py-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs opacity-60">{hint}</p>}
    </div>
  );
}

export default function ImpactClient({ batchId }: { batchId: string }) {
  const [data, setData] = useState<ImpactPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/import/betadomino/${batchId}/impact`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error al cargar impacto");
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Analizando impacto del evento…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
        <p className="text-rose-300">{error || "Sin datos"}</p>
        <Link
          href="/index.html"
          className="text-sm text-amber-400 hover:text-amber-300"
        >
          ← Volver al inicio
        </Link>
      </div>
    );
  }

  const h = data.headline;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-8 border-b border-zinc-800 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-500/80">
                Análisis de impacto · Evento de importación
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {data.tournament.name}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                {data.tournament.date || "—"}
                {" · "}
                <span className="capitalize">{data.tournament.type}</span>
                {data.tournament.roundNumber != null && (
                  <> · Ronda {data.tournament.roundNumber}</>
                )}
                {" · "}
                Confirmado {formatDate(data.confirmedAt)}
              </p>
              <p className="mt-2 font-mono text-[11px] text-zinc-600">
                {data.batchId}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="/index.html"
                className="text-zinc-400 hover:text-amber-300"
              >
                Volver
              </Link>
              <Link
                href={`/api/import/betadomino/${batchId}/ranking-audit`}
                className="text-zinc-400 hover:text-amber-300"
                target="_blank"
              >
                Auditoría JSON
              </Link>
              <Link
                href={`/import/preview/${batchId}`}
                className="text-zinc-400 hover:text-amber-300"
              >
                Preview
              </Link>
            </div>
          </div>

          {/* Headline metrics */}
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
            <Metric label="Participantes" value={h.participants} tone="zinc" />
            <Metric
              label="Subieron"
              value={h.climbed}
              tone="emerald"
              hint={h.maxClimb ? `máx ↑${h.maxClimb}` : undefined}
            />
            <Metric
              label="Bajaron"
              value={h.dropped}
              tone="rose"
              hint={h.maxDrop ? `máx ↓${h.maxDrop}` : undefined}
            />
            <Metric
              label="Debuts"
              value={h.debuts}
              tone="sky"
              hint={`${h.stable} estables`}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric
              label="Volatilidad"
              value={h.volatility}
              tone="amber"
              hint="|Δ| medio de puestos"
            />
            <Metric
              label="Mediana subida"
              value={h.medianClimb ? `↑${h.medianClimb}` : "—"}
              tone="emerald"
            />
            <Metric
              label="Mediana bajada"
              value={h.medianDrop ? `↓${h.medianDrop}` : "—"}
              tone="rose"
            />
            <Metric
              label="Efecto colateral"
              value={h.collateralAffected}
              tone="zinc"
              hint="no jugaron este torneo"
            />
          </div>

          {h.podiumChanged && (
            <p className="mt-4 rounded-md border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200/90">
              Este evento <strong>alteró el podio</strong> del ranking GFCN.
            </p>
          )}
        </header>

        {/* Scope note */}
        <p className="mb-8 text-sm text-zinc-500">{data.impactScope.note}</p>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Tournament podium */}
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Podio del torneo importado
            </h2>
            <ol className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
              {data.tournamentPodium.map((r) => (
                <li
                  key={r.position}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="w-8 tabular-nums text-amber-500/90">
                    {r.position}º
                  </span>
                  <span className="flex-1 font-medium">{r.displayName}</span>
                  <span className="text-zinc-500">{r.club || "—"}</span>
                  <span className="tabular-nums text-zinc-400">
                    {r.pg}G · EFE {r.efe}
                  </span>
                </li>
              ))}
              {data.tournamentPodium.length === 0 && (
                <li className="px-3 py-6 text-center text-zinc-500">
                  Sin resultados de torneo.
                </li>
              )}
            </ol>
          </section>

          {/* Ranking podium before/after */}
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Podio del ranking GFCN
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="mb-2 text-[10px] uppercase text-zinc-500">Antes</p>
                <ul className="space-y-1.5 text-sm">
                  {data.podium.before.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-6 text-zinc-500">{p.position}º</span>
                      <span>{p.displayName}</span>
                    </li>
                  ))}
                  {data.podium.before.length === 0 && (
                    <li className="text-zinc-600">—</li>
                  )}
                </ul>
              </div>
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="mb-2 text-[10px] uppercase text-zinc-500">Después</p>
                <ul className="space-y-1.5 text-sm">
                  {data.podium.after.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-6 text-amber-500/80">{p.position}º</span>
                      <span>{p.displayName}</span>
                    </li>
                  ))}
                  {data.podium.after.length === 0 && (
                    <li className="text-zinc-600">—</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          {/* Climbers */}
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-emerald-500/80">
              Mayores subidas
            </h2>
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
              {data.topClimbers.map((c, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{c.displayName}</span>
                    {c.club && (
                      <span className="ml-2 text-xs text-zinc-500">{c.club}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-emerald-400">
                    {c.from ?? "—"}º → {c.to}º
                    {c.delta != null ? ` · ↑${c.delta}` : ""}
                    {c.winsAdded > 0 ? ` · +${c.winsAdded}G` : ""}
                  </span>
                </li>
              ))}
              {data.topClimbers.length === 0 && (
                <li className="px-3 py-4 text-center text-zinc-500">Ninguna</li>
              )}
            </ul>
          </section>

          {/* Droppers */}
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-rose-500/80">
              Mayores bajadas
            </h2>
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
              {data.topDroppers.map((c, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{c.displayName}</span>
                    {c.club && (
                      <span className="ml-2 text-xs text-zinc-500">{c.club}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-rose-400">
                    {c.from ?? "—"}º → {c.to}º
                    {c.delta != null ? ` · ↓${Math.abs(c.delta)}` : ""}
                  </span>
                </li>
              ))}
              {data.topDroppers.length === 0 && (
                <li className="px-3 py-4 text-center text-zinc-500">Ninguna</li>
              )}
            </ul>
          </section>
        </div>

        {/* Top 10 churn + debuts + clubs */}
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Entradas / salidas Top 10
            </h2>
            <div className="space-y-3 rounded-lg border border-zinc-800 p-3 text-sm">
              <div>
                <p className="mb-1 text-[10px] uppercase text-emerald-500/80">
                  Entraron
                </p>
                {data.top10.entered.length === 0 ? (
                  <p className="text-zinc-600">—</p>
                ) : (
                  <ul className="space-y-1">
                    {data.top10.entered.map((x, i) => (
                      <li key={i}>
                        {x.displayName}{" "}
                        <span className="text-zinc-500">→ {x.newPosition}º</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-rose-500/80">
                  Salieron
                </p>
                {data.top10.left.length === 0 ? (
                  <p className="text-zinc-600">—</p>
                ) : (
                  <ul className="space-y-1">
                    {data.top10.left.map((x, i) => (
                      <li key={i}>
                        {x.displayName}{" "}
                        <span className="text-zinc-500">
                          (era {x.previousPosition}º)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-sky-500/80">
              Debuts en ranking
            </h2>
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 text-sm">
              {data.debuts.map((d, i) => (
                <li
                  key={i}
                  className="flex justify-between gap-2 px-3 py-2"
                >
                  <span>
                    {d.displayName}
                    {d.club && (
                      <span className="ml-1 text-xs text-zinc-500">{d.club}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-sky-400">{d.position}º</span>
                </li>
              ))}
              {data.debuts.length === 0 && (
                <li className="px-3 py-4 text-center text-zinc-500">Ninguno</li>
              )}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Impacto por club
            </h2>
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 text-sm">
              {data.byClub.map((c) => (
                <li key={c.club} className="px-3 py-2">
                  <div className="flex justify-between font-medium">
                    <span>{c.club}</span>
                    <span className="tabular-nums text-zinc-400">
                      {c.players} jug.
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Δ medio {c.avgDelta > 0 ? `↑${c.avgDelta}` : c.avgDelta < 0 ? `↓${Math.abs(c.avgDelta)}` : "="}
                    {" · "}
                    subidas {c.totalClimb} · bajadas {c.totalDrop}
                    {c.debuts > 0 ? ` · ${c.debuts} debuts` : ""}
                  </p>
                </li>
              ))}
              {data.byClub.length === 0 && (
                <li className="px-3 py-4 text-center text-zinc-500">—</li>
              )}
            </ul>
          </section>
        </div>

        {/* Decision stats */}
        <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Decisiones del preview
          </h2>
          <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
            <span>
              Aceptar match:{" "}
              <strong className="text-zinc-100">
                {data.decisionStats.acceptMatch}
              </strong>
            </span>
            <span>
              Crear nuevo:{" "}
              <strong className="text-zinc-100">
                {data.decisionStats.createNew}
              </strong>
            </span>
            <span>
              Vincular:{" "}
              <strong className="text-zinc-100">
                {data.decisionStats.linkExisting}
              </strong>
            </span>
            <span>
              Ignorar:{" "}
              <strong className="text-zinc-100">
                {data.decisionStats.ignore}
              </strong>
            </span>
            <span className="text-zinc-500">
              Total filas: {data.decisionStats.total}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
