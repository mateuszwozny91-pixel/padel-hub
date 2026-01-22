"use client";

import React, { useMemo } from "react";
import { loadState, recomputeState } from "@/lib/store";
import { sortPlayers, sortTeams } from "@/lib/scoring";
import Link from "next/link";

function medalClass(i: number) {
  if (i === 0) return "bg-yellow-200 border-yellow-400";
  if (i === 1) return "bg-gray-200 border-gray-400";
  if (i === 2) return "bg-orange-200 border-orange-400";
  return "bg-white border-slate-200";
}

export default function ResultsAmericanoPage() {
  const state = useMemo(() => {
    const s = loadState();
    return s ? recomputeState(s) : null;
  }, []);

  const view = useMemo(() => {
    if (!state) return null;

    const isTeam = state.config.scoringMode === "TEAM";

    const rows = isTeam
      ? sortTeams(state.teams, state.rounds).map((t) => ({
          id: t.id,
          name: t.name,
          games: t.games,
          pf: t.pointsFor,
          pa: t.pointsAgainst,
        }))
      : sortPlayers(state.players, state.rounds).map((p) => ({
          id: p.id,
          name: p.name,
          games: p.games,
          pf: p.pointsFor,
          pa: p.pointsAgainst,
        }));

    const nameById = new Map<string, string>();
    for (const p of state.players) nameById.set(p.id, p.name);
    for (const t of state.teams) nameById.set(t.id, t.name);

    return { rows, nameById };
  }, [state]);

  if (!state || !view) {
    return (
      <div className="p-6">
        <p className="text-slate-700">Brak zapisanych danych turnieju.</p>
        <Link className="text-emerald-700 underline" href="/americano">Wróć</Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Wyniki końcowe</h1>
        <Link className="text-emerald-700 underline" href="/americano">Wróć do turnieju</Link>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-4 gap-0 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          <div>Miejsce</div>
          <div>Zawodnik / Team</div>
          <div className="text-right">Mecze</div>
          <div className="text-right">PF / PA</div>
        </div>
        {view.rows.map((r, i) => (
          <div key={r.id} className={`grid grid-cols-4 gap-0 px-4 py-3 border-t ${medalClass(i)}`}>
            <div className="font-semibold">{i + 1}</div>
            <div className="font-semibold">{r.name}</div>
            <div className="text-right">{r.games}</div>
            <div className="text-right">{r.pf} / {r.pa}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Wyniki rund</h2>

        <div className="space-y-2">
          {state.rounds.map((round, ri) => (
            <details key={ri} className="rounded-xl border border-slate-200 p-3 bg-white">
              <summary className="cursor-pointer font-semibold text-slate-800">
                Runda {ri + 1} ({round.length} mecz{round.length === 1 ? "" : "y"})
              </summary>

              <div className="mt-3 space-y-2">
                {round.map((m) => {
                  const aNames = m.sideA.map((id) => view.nameById.get(id) ?? "???");
                  const bNames = m.sideB.map((id) => view.nameById.get(id) ?? "???");
                  return (
                    <div key={m.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="text-xs text-slate-500 mb-2">Kort {m.court}</div>

                      <div className="grid grid-cols-3 gap-3 items-center">
                        <div className="text-sm">
                          {aNames.map((n) => <div key={n}>{n}</div>)}
                        </div>

                        <div className="text-center font-bold">
                          {m.scoreA ?? "-"} : {m.scoreB ?? "-"}
                        </div>

                        <div className="text-sm text-right">
                          {bNames.map((n) => <div key={n}>{n}</div>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
