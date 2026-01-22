"use client";

import { useEffect, useMemo, useState } from "react";
import type { Variant } from "@/lib/types";
import { loadState } from "@/lib/store";
import { sortPlayers, sortTeams } from "@/lib/scoring";

export default function TvView({ variant }: { variant: Variant }) {
  const [state, setState] = useState(() => loadState() ?? null);

  // polling localStorage (prosto i stabilnie)
  useEffect(() => {
    const t = setInterval(() => {
      const s = loadState();
      if (s) setState(s);
    }, 800);
    return () => clearInterval(t);
  }, []);

  const effective = state && state.config ? { ...state, config: { ...state.config, variant } } : state;

  const standingsPlayers = useMemo(
    () => (effective ? sortPlayers(effective.players, effective.rounds) : []),
    [effective]
  );
  const standingsTeams = useMemo(
    () => (effective ? sortTeams(effective.teams, effective.rounds) : []),
    [effective]
  );

  if (!effective) {
    return (
      <main className="min-h-screen bg-black text-white p-10">
        <div className="max-w-6xl mx-auto text-2xl opacity-80">Brak danych turnieju.</div>
      </main>
    );
  }

  const currentRoundIndex = effective.rounds.length - 1;
  const currentRound = currentRoundIndex >= 0 ? effective.rounds[currentRoundIndex] : null;

  const nameOf = (id: string) => {
    if (effective.config.scoringMode === "TEAM") {
      const t = effective.teams.find((x) => x.id === id);
      if (!t) return "?";
      return t.name;
    }
    return effective.players.find((p) => p.id === id)?.name ?? "?";
  };

  const paused = (() => {
    if (!currentRound) return [];
    const used = new Set<string>();
    for (const mm of currentRound) {
      for (const id of mm.sideA) used.add(id);
      for (const id of mm.sideB) used.add(id);
    }
    return effective.players.filter((p) => !used.has(p.id)).map((p) => p.name);
  })();

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-4xl font-bold">
              {variant === "AMERICANO" ? "Americano" : "Mexicano"} – TV
            </div>
            <div className="opacity-70">
              Runda {currentRoundIndex + 1} • Mecz do {effective.config.matchPoints}
            </div>
          </div>

          {paused.length > 0 && (
            <div className="text-lg opacity-80">
              Pauzują: <span className="font-semibold">{paused.join(", ")}</span>
            </div>
          )}
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CURRENT ROUND RESULTS */}
          <div className="bg-neutral-900 rounded-2xl p-6">
            <div className="text-2xl font-semibold mb-4">Wyniki – aktualna runda</div>
            {!currentRound ? (
              <div className="opacity-70">Brak rund.</div>
            ) : (
              <div className="space-y-3">
                {currentRound.map((m) => (
                  <div key={m.id} className="border border-neutral-800 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="opacity-70">Kort {m.court}</div>
                      <div className="text-2xl font-bold tabular-nums">
                        {m.scoreA ?? "—"} : {m.scoreB ?? "—"}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-lg">
                      <div className="space-y-1">
                        {m.sideA.map((id: string) => (
                          <div key={id} className="font-semibold">
                            {nameOf(id)}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1 text-right">
                        {m.sideB.map((id: string) => (
                          <div key={id} className="font-semibold">
                            {nameOf(id)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TABLE */}
          <div className="bg-neutral-900 rounded-2xl p-6">
            <div className="text-2xl font-semibold mb-4">Tabela</div>

            {effective.config.scoringMode === "TEAM" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-lg">
                  <thead>
                    <tr className="text-left border-b border-neutral-800">
                      <th className="py-2">#</th>
                      <th>Team</th>
                      <th className="text-right">M</th>
                      <th className="text-right">PF</th>
                      <th className="text-right">PA</th>
                      <th className="text-right">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsTeams.map((t, i) => (
                      <tr key={t.id} className="border-b border-neutral-800 last:border-b-0">
                        <td className="py-2">{i + 1}</td>
                        <td className="font-semibold">{t.name}</td>
                        <td className="text-right tabular-nums">{t.games}</td>
                        <td className="text-right tabular-nums">{t.pointsFor}</td>
                        <td className="text-right tabular-nums">{t.pointsAgainst}</td>
                        <td className="text-right tabular-nums">{t.pointsFor - t.pointsAgainst}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-lg">
                  <thead>
                    <tr className="text-left border-b border-neutral-800">
                      <th className="py-2">#</th>
                      <th>Gracz</th>
                      <th className="text-right">M</th>
                      <th className="text-right">PF</th>
                      <th className="text-right">PA</th>
                      <th className="text-right">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsPlayers.map((p, i) => (
                      <tr key={p.id} className="border-b border-neutral-800 last:border-b-0">
                        <td className="py-2">{i + 1}</td>
                        <td className="font-semibold">{p.name}</td>
                        <td className="text-right tabular-nums">{p.games}</td>
                        <td className="text-right tabular-nums">{p.pointsFor}</td>
                        <td className="text-right tabular-nums">{p.pointsAgainst}</td>
                        <td className="text-right tabular-nums">{p.pointsFor - p.pointsAgainst}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-sm opacity-60 mt-3">Ranking: PF → H2H → Diff → PA</div>
          </div>
        </section>
      </div>
    </main>
  );
}
