"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Match, TournamentState, Variant } from "@/lib/types";
import {
  addPlayer,
  updatePlayer,
  removePlayer,
  generateTeamsRandom,
  updateTeamName,
  setConfig,
  loadState,
  saveState,
  resetTournament,
  startOrNextRound,
  setScore,
  getPlannedRounds,
  canAddNextRound,
  getTimerRemainingMs,
  recomputeState,
} from "@/lib/store";
import { sortPlayers, sortTeams } from "@/lib/scoring";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  variant: Variant;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseIntOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function isOddBetween11and29(n: number) {
  return n >= 11 && n <= 29 && n % 2 === 1;
}

function nameById(state: TournamentState) {
  const map = new Map<string, string>();
  for (const p of state.players) map.set(p.id, p.name);
  for (const t of state.teams) map.set(t.id, t.name);
  return map;
}

function roundComplete(round: Match[]) {
  return round.every((m) => m.scoreA != null && m.scoreB != null);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function formatMs(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

function matchPointsOptions() {
  const opts: number[] = [];
  for (let n = 11; n <= 29; n += 2) opts.push(n);
  return opts;
}

export default function TournamentApp({ variant }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const isTV = sp?.get("tv") === "1";

  const theme = useMemo(() => {
    // Americano: zielony + niebieski
    // Mexicano: żółty + niebieski
    if (variant === "AMERICANO") {
      return {
        title: "Americano",
        accentRing: "focus:ring-emerald-300",
        chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
        headerBar: "from-emerald-500 via-emerald-400 to-sky-400",
        primaryBtn: "bg-emerald-600 hover:bg-emerald-700",
        secondaryBtn: "bg-sky-600 hover:bg-sky-700",
        cardTint: "bg-white",
        tableHead: "bg-gradient-to-r from-emerald-50 to-sky-50",
        highlight: "text-emerald-700",
      };
    }
    return {
      title: "Mexicano",
      accentRing: "focus:ring-yellow-300",
      chip: "bg-yellow-50 text-yellow-900 border-yellow-200",
      headerBar: "from-yellow-400 via-yellow-300 to-sky-400",
      primaryBtn: "bg-sky-600 hover:bg-sky-700",
      secondaryBtn: "bg-yellow-500 hover:bg-yellow-600",
      cardTint: "bg-white",
      tableHead: "bg-gradient-to-r from-yellow-50 to-sky-50",
      highlight: "text-sky-700",
    };
  }, [variant]);

  const [state, setState] = useState<TournamentState | null>(null);
  const [newPlayer, setNewPlayer] = useState("");
  const [openRound, setOpenRound] = useState<number | null>(null);

  // timer ticker (for TIMER mode)
  const [, forceTick] = useState(0);

  useEffect(() => {
    const s = loadState();
    if (s) {
      const patched = setConfig(s, { variant });
      setState(recomputeState(patched));
    } else {
      setState(null);
    }
  }, [variant]);

  useEffect(() => {
    if (!state) return;
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    if (state.config.playMode !== "TIMER") return;

    const id = window.setInterval(() => forceTick((x) => x + 1), 250); // płynniejsze odliczanie
    return () => window.clearInterval(id);
  }, [state]);

  const computed = useMemo(() => {
    if (!state) return null;
    return recomputeState(state);
  }, [state]);

  const plannedRounds = useMemo(() => {
    if (!computed) return 0;
    return getPlannedRounds(computed);
  }, [computed]);

  const currentRoundIndex = useMemo(() => {
    if (!computed) return -1;
    return computed.rounds.length - 1;
  }, [computed]);

  const currentRound = useMemo(() => {
    if (!computed) return null;
    if (computed.rounds.length === 0) return null;
    return computed.rounds[computed.rounds.length - 1];
  }, [computed]);

  const pastRounds = useMemo(() => {
    if (!computed) return [];
    if (computed.rounds.length <= 1) return [];
    return computed.rounds.slice(0, -1);
  }, [computed]);

  const canNext = useMemo(() => {
    if (!computed) return false;
    if (computed.rounds.length === 0) return true;
    return canAddNextRound(computed);
  }, [computed]);

  const timerLeftMs = useMemo(() => {
    if (!computed) return null;
    return getTimerRemainingMs(computed);
  }, [computed]);

  const standingsRows = useMemo(() => {
    if (!computed) return [];
    if (computed.config.scoringMode === "TEAM") {
      return sortTeams(computed.teams, computed.rounds).map((t) => ({
        id: t.id,
        name: t.name,
        games: t.games,
        pf: t.pointsFor,
        pa: t.pointsAgainst,
      }));
    }
    return sortPlayers(computed.players, computed.rounds).map((p) => ({
      id: p.id,
      name: p.name,
      games: p.games,
      pf: p.pointsFor,
      pa: p.pointsAgainst,
    }));
  }, [computed]);

  const names = useMemo(() => (computed ? nameById(computed) : new Map<string, string>()), [computed]);

  function goResults() {
    const path = variant === "MEXICANO" ? "/mexicano/results" : "/americano/results";
    router.push(path);
  }

  function onAddPlayer() {
    if (!state) return;
    const next = addPlayer(state, newPlayer);
    setState(next);
    setNewPlayer("");
  }

  function onStartOrNext() {
    if (!state) return;
    const next = startOrNextRound(state);
    setState(next);
  }

  function onReset() {
    if (!state) return;
    const next = resetTournament(state);
    setState(next);
    setOpenRound(null);
  }

  function setMatchScore(roundIndex: number, matchId: string, which: "A" | "B", raw: string) {
    if (!state) return;

    if (raw.trim() === "") {
      setState(setScore(state, roundIndex, matchId, null, null));
      return;
    }

    const n = parseIntOrNull(raw);
    if (n == null) return;

    const mp = state.config.matchPoints;
    const val = clamp(n, 0, mp);
    const other = clamp(mp - val, 0, mp);

    const a = which === "A" ? val : other;
    const b = which === "A" ? other : val;

    setState(setScore(state, roundIndex, matchId, a, b));
  }

  function formatLabelForMode(scoringMode: "INDIVIDUAL" | "TEAM") {
    if (variant === "AMERICANO") return scoringMode === "INDIVIDUAL" ? "Singiel Americano" : "Team Americano";
    return scoringMode === "INDIVIDUAL" ? "Singiel Mexicano" : "Team Mexicano";
  }

  function renderSettings() {
    if (!computed) return null;

    const isBeforeStart = !computed.started && computed.rounds.length === 0;
    const mpOpts = matchPointsOptions();

    return (
      <div className={`rounded-2xl border border-slate-200 ${theme.cardTint} overflow-hidden`}>
        {/* Color bar */}
        <div className={`h-2 w-full bg-gradient-to-r ${theme.headerBar}`} />

        <div className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                ← PadelHub
              </Link>

              <div className="text-lg font-extrabold tracking-tight">
                {theme.title}
              </div>

              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${theme.chip}`}>
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                <span>{computed.config.playMode === "TIMER" ? "Tryb czasu" : "Tryb rund"}</span>
              </span>

              {!isTV && (
                <Link
                  href={(variant === "AMERICANO" ? "/americano" : "/mexicano") + "?tv=1"}
                  target="_blank"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  Tryb TV
                </Link>
              )}

              {isTV && (
                <Link
                  href={variant === "AMERICANO" ? "/americano" : "/mexicano"}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  Tryb APP
                </Link>
              )}
            </div>

            <button
              onClick={onReset}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Reset
            </button>
          </div>

          {/* Top settings row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Play mode */}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-500 mb-2">Tryb rozgrywki</div>

              <div className="flex items-center gap-2">
                <select
                  className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-4 ${theme.accentRing}`}
                  value={computed.config.playMode}
                  onChange={(e) => setState(setConfig(computed, { playMode: e.target.value as any }))}
                >
                  <option value="ROUNDS">Rundy</option>
                  <option value="TIMER">Czas</option>
                </select>

                {computed.config.playMode === "TIMER" && (
                  <div className="flex items-center gap-1">
                    <button
                      className="h-10 w-10 rounded-lg border border-slate-200 bg-white font-bold hover:bg-slate-50"
                      onClick={() =>
                        setState(setConfig(computed, { timerMinutes: clamp(computed.config.timerMinutes - 5, 1, 360) }))
                      }
                      type="button"
                      title="-5 min"
                    >
                      −
                    </button>

                    <input
                      className={`h-10 w-20 rounded-lg border border-slate-200 px-3 text-center text-sm font-semibold outline-none focus:ring-4 ${theme.accentRing}`}
                      type="number"
                      min={1}
                      max={360}
                      step={1}
                      value={computed.config.timerMinutes}
                      onChange={(e) => {
                        const v = clamp(parseIntOrNull(e.target.value) ?? 60, 1, 360);
                        setState(setConfig(computed, { timerMinutes: v }));
                      }}
                    />

                    <button
                      className="h-10 w-10 rounded-lg border border-slate-200 bg-white font-bold hover:bg-slate-50"
                      onClick={() =>
                        setState(setConfig(computed, { timerMinutes: clamp(computed.config.timerMinutes + 5, 1, 360) }))
                      }
                      type="button"
                      title="+5 min"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              {computed.config.playMode === "TIMER" && (
                <div className="mt-2 text-xs text-slate-500">
                  Ustaw czas, potem dodajesz rundy ręcznie. Po czasie pokaże się przycisk <b>Wyniki</b>.
                </div>
              )}
            </div>

            {/* Courts / Match points */}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-500 mb-2">Korty / Punkty w meczu</div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500 mb-1">Korty (1–8)</div>
                  <input
                    className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-4 ${theme.accentRing}`}
                    type="number"
                    min={1}
                    max={8}
                    step={1}
                    value={computed.config.courts}
                    onChange={(e) =>
                      setState(setConfig(computed, { courts: clamp(parseIntOrNull(e.target.value) ?? 1, 1, 8) }))
                    }
                  />
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 mb-1">Do (11–29, nieparzyste)</div>
                  {/* Lepsza edytowalność: select zamiast ręcznego wpisywania */}
                  <select
                    className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-4 ${theme.accentRing}`}
                    value={computed.config.matchPoints}
                    onChange={(e) => {
                      const v = parseIntOrNull(e.target.value) ?? 21;
                      const fixed = isOddBetween11and29(v) ? v : 21;
                      setState(setConfig(computed, { matchPoints: fixed }));
                    }}
                  >
                    {mpOpts.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                Tip: wpisując wynik po jednej stronie, druga automatycznie dopełnia do {computed.config.matchPoints}.
              </div>
            </div>

            {/* Format */}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-500 mb-2">Format</div>

              <select
                className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-4 ${theme.accentRing}`}
                value={computed.config.scoringMode}
                onChange={(e) => setState(setConfig(computed, { scoringMode: e.target.value as any }))}
              >
                <option value="INDIVIDUAL">{formatLabelForMode("INDIVIDUAL")}</option>
                <option value="TEAM">{formatLabelForMode("TEAM")}</option>
              </select>

              {computed.config.scoringMode === "TEAM" && isBeforeStart && (
                <button
                  onClick={() => setState(generateTeamsRandom(computed))}
                  className={`mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white ${theme.secondaryBtn}`}
                >
                  Wylosuj teamy
                </button>
              )}
            </div>
          </div>

          {/* Rounds settings only if playMode=ROUNDS */}
          {computed.config.playMode === "ROUNDS" && (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-500 mb-2">Ilość rund</div>

              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-700">Rundy:</div>
                  <input
                    className={`h-10 w-24 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-4 ${theme.accentRing}`}
                    type="number"
                    min={0}
                    step={1}
                    value={computed.config.roundsPlanned}
                    onChange={(e) => {
                      const v = parseIntOrNull(e.target.value) ?? 0;
                      setState(setConfig(computed, { roundsPlanned: Math.max(0, v) }));
                    }}
                  />
                  <div className="text-xs text-slate-500">(0 = AUTO)</div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={computed.config.autoRematch}
                    onChange={(e) => setState(setConfig(computed, { autoRematch: e.target.checked }))}
                  />
                  Rewanż (x2)
                </label>

                <div className="ml-auto text-sm text-slate-600">
                  Plan: <b>{plannedRounds || 0}</b> rund
                </div>
              </div>
            </div>
          )}

          {/* Players before start */}
          {(!computed.started && computed.rounds.length === 0) && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <div className="text-xs font-semibold text-slate-500">Uczestnicy (4–32)</div>

              <div className="flex gap-2">
                <input
                  className={`h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-4 ${theme.accentRing}`}
                  placeholder="Dodaj gracza…"
                  value={newPlayer}
                  onChange={(e) => setNewPlayer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAddPlayer();
                  }}
                />
                <button
                  className={`h-10 rounded-lg px-4 text-sm font-semibold text-white ${theme.primaryBtn}`}
                  onClick={onAddPlayer}
                >
                  Dodaj
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {computed.players.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                    <input
                      className={`h-9 flex-1 rounded-md border border-slate-200 px-2 text-sm outline-none focus:ring-4 ${theme.accentRing}`}
                      value={p.name}
                      onChange={(e) => setState(updatePlayer(computed, p.id, e.target.value))}
                    />
                    <button
                      className="h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold hover:bg-slate-50"
                      onClick={() => setState(removePlayer(computed, p.id))}
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>

              {computed.config.scoringMode === "TEAM" && computed.players.length % 2 !== 0 && (
                <div className="text-xs text-amber-700">
                  Tryb TEAM wymaga parzystej liczby graczy (żeby zrobić stałe pary).
                </div>
              )}
            </div>
          )}

          {/* Teams naming (TEAM mode, before start) */}
          {computed.config.scoringMode === "TEAM" && !computed.started && computed.teams.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-500">Teamy</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {computed.teams.map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <input
                      className={`h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-4 ${theme.accentRing}`}
                      value={t.name}
                      onChange={(e) => setState(updateTeamName(computed, t.id, e.target.value))}
                    />
                    <div className="mt-2 text-sm text-slate-700">
                      {(t.playerIds ?? []).map((pid) => (
                        <div key={pid}>{names.get(pid) ?? "???"}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderCurrentRound() {
    if (!computed) return null;

    const showButton = computed.players.length >= 4;
    const showResults = computed.rounds.length > 0 && !canNext;

    const timeBadge =
      computed.config.playMode === "TIMER" && timerLeftMs != null ? (
        <div className={`rounded-full border px-3 py-1 text-sm font-semibold ${theme.chip}`}>
          ⏱ {formatMs(timerLeftMs)}
        </div>
      ) : null;

    return (
      <div className={`rounded-2xl border border-slate-200 ${theme.cardTint} p-4 space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Aktualna runda</div>
            <div className="text-lg font-extrabold tracking-tight">
              {computed.rounds.length === 0 ? "—" : `Runda ${computed.rounds.length}`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {timeBadge}

            {showButton && canNext && (
              <button
                onClick={onStartOrNext}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${theme.primaryBtn}`}
              >
                {computed.rounds.length === 0 ? "Start" : "Następna runda"}
              </button>
            )}

            {showResults && (
              <button
                onClick={goResults}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Wyniki
              </button>
            )}
          </div>
        </div>

        {currentRound == null ? (
          <div className="text-sm text-slate-600">
            Dodaj graczy w ustawieniach i kliknij <b>Start</b>.
          </div>
        ) : (
          <div className="space-y-3">
            {currentRound.map((m) => {
              const aNames = m.sideA.map((id) => names.get(id) ?? "???");
              const bNames = m.sideB.map((id) => names.get(id) ?? "???");

              return (
                <div key={m.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-slate-500">Kort {m.court}</div>
                    <div className={`text-xs font-semibold ${theme.highlight}`}>
                      Suma = {computed.config.matchPoints}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 items-center">
                    <div className="text-sm">
                      {aNames.map((n, idx) => (
                        <div key={idx}>{n}</div>
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <input
                        className={`h-12 w-16 rounded-xl border border-slate-200 px-2 text-center text-base font-extrabold outline-none focus:ring-4 ${theme.accentRing}`}
                        inputMode="numeric"
                        value={m.scoreA ?? ""}
                        onChange={(e) => setMatchScore(currentRoundIndex, m.id, "A", e.target.value)}
                      />
                      <div className="text-base font-extrabold text-slate-700">:</div>
                      <input
                        className={`h-12 w-16 rounded-xl border border-slate-200 px-2 text-center text-base font-extrabold outline-none focus:ring-4 ${theme.accentRing}`}
                        inputMode="numeric"
                        value={m.scoreB ?? ""}
                        onChange={(e) => setMatchScore(currentRoundIndex, m.id, "B", e.target.value)}
                      />
                    </div>

                    <div className="text-sm text-right">
                      {bNames.map((n, idx) => (
                        <div key={idx}>{n}</div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {computed.config.playMode === "ROUNDS" && plannedRounds > 0 && (
          <div className="text-xs text-slate-500">
            {computed.rounds.length} / {plannedRounds} rund
          </div>
        )}
      </div>
    );
  }

  function renderStandingsAndHistory() {
    if (!computed) return null;

    return (
      <div className={`rounded-2xl border border-slate-200 ${theme.cardTint} p-4 space-y-4`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">Tabela</div>
            <div className="text-lg font-extrabold tracking-tight">Klasyfikacja</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className={`grid grid-cols-5 px-3 py-2 text-xs font-semibold text-slate-700 ${theme.tableHead}`}>
            <div className="col-span-2">Zawodnik / Team</div>
            <div className="text-right">M</div>
            <div className="text-right">PF</div>
            <div className="text-right">PA</div>
          </div>

          {standingsRows.map((r, idx) => (
            <div key={r.id} className="grid grid-cols-5 px-3 py-2 border-t text-sm">
              <div className="col-span-2 font-semibold flex items-center gap-2">
                {idx < 3 && (
                  <span
                    className={[
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold border",
                      idx === 0 ? "bg-yellow-100 border-yellow-300 text-yellow-800" : "",
                      idx === 1 ? "bg-slate-100 border-slate-300 text-slate-700" : "",
                      idx === 2 ? "bg-orange-100 border-orange-300 text-orange-800" : "",
                    ].join(" ")}
                    title="Top 3"
                  >
                    {idx + 1}
                  </span>
                )}
                <span>{r.name}</span>
              </div>
              <div className="text-right font-semibold">{r.games}</div>
              <div className="text-right">{r.pf}</div>
              <div className="text-right">{r.pa}</div>
            </div>
          ))}
        </div>

        {/* Past rounds under table as small tiles (collapsed) */}
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-700">Rozegrane rundy</div>

          {pastRounds.length === 0 ? (
            <div className="text-sm text-slate-500">Brak.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {pastRounds.map((round, ri) => {
                const roundNum = ri + 1;
                const idx = ri;
                const isOpen = openRound === idx;
                const completed = roundComplete(round);

                return (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => setOpenRound(isOpen ? null : idx)}
                    >
                      <div className="text-sm font-semibold">Runda {roundNum}</div>
                      <div className="text-xs text-slate-500">
                        {round.length} • {completed ? "OK" : "—"}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2">
                        {round.map((m) => {
                          const aNames = m.sideA.map((id) => names.get(id) ?? "???");
                          const bNames = m.sideB.map((id) => names.get(id) ?? "???");
                          return (
                            <div key={m.id} className="rounded-lg border border-slate-100 p-2">
                              <div className="text-[11px] text-slate-500 mb-1">Kort {m.court}</div>
                              <div className="grid grid-cols-3 gap-2 items-center">
                                <div className="text-xs">
                                  {aNames.map((n, i) => (
                                    <div key={i}>{n}</div>
                                  ))}
                                </div>
                                <div className="text-center text-sm font-extrabold">
                                  {m.scoreA ?? "-"} : {m.scoreB ?? "-"}
                                </div>
                                <div className="text-xs text-right">
                                  {bNames.map((n, i) => (
                                    <div key={i}>{n}</div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!computed) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-lg font-bold mb-2">Brak danych turnieju</div>
          <div className="text-sm text-slate-600">
            Wróć do PadelHub i wejdź ponownie w {variant === "AMERICANO" ? "Americano" : "Mexicano"}.
          </div>
          <div className="mt-4">
            <Link className="text-emerald-700 underline" href="/">
              Wróć do PadelHub
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // TV mode: only current round + table, big and clean
  if (isTV) {
    return (
      <div className="p-4 md:p-8 space-y-4">
        {renderSettings()}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderCurrentRound()}
          {renderStandingsAndHistory()}
        </div>
      </div>
    );
  }

  // APP mode
  return (
    <div className="p-4 md:p-8 space-y-4">
      {renderSettings()}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderCurrentRound()}
        {renderStandingsAndHistory()}
      </div>
    </div>
  );
}
