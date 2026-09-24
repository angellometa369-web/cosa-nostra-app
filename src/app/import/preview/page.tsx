"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ImportPreviewUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Selecciona un archivo Excel de BetaDomino");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/betadomino/preview", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Error al procesar el archivo");
      }
      router.push(`/import/preview/${json.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-500/80">
          Godfather Club · Cosa Nostra
        </p>
        <h1 className="mt-2 text-xl font-semibold">Importar resultados</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Sube el Excel exportado desde BetaDomino (Individual o Parejas). Se
          creará un preview editable antes de aplicar el torneo.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Archivo .xlsx
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-amber-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-950 hover:file:bg-amber-500"
            />
          </label>

          {file && (
            <p className="text-xs text-zinc-500">
              Seleccionado:{" "}
              <span className="text-zinc-300">{file.name}</span> (
              {(file.size / 1024).toFixed(1)} KB)
            </p>
          )}

          {error && (
            <p className="rounded-md border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !file}
            className="w-full rounded-md bg-amber-600 py-2.5 text-sm font-medium text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Procesando…" : "Subir y previsualizar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">
          El ranking y los jugadores no se modifican hasta que confirmes la
          importación.
        </p>
      </div>
    </div>
  );
}
