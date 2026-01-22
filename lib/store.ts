import type { Match, Player, Team, TournamentState, Variant } from "./types";
import { uid, clamp } from "./utils";
import { buildRound } from "./scheduler";
import { sortPlayers, sortTeams } from "./scoring";

const LS_KEY = "padelhub:tournament:v13";

/** ---------- helpers ---------- */
function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Lokalna walidacja: sumy punktów do matchPoints */
function isValidSumLocal(scoreA: number, scoreB: number, matchPoints: number) {
  return scoreA + scoreB === matchPoints;
}

/**
 * AUTO plan "partner z każdym" dla AMERICANO (INDIVIDUAL 2v2)
 */
function autoPartnerPlan(n: number, rematch: boolean) {
  const factor = rematch ? 2 : 1;
  const pairs = (n * (n - 1)) / 2; // C(n,2)
  const needPartnerPairs = pairs * factor;

  const minMatchesByPartners = Math.ceil(needPartnerPairs / 2); // 2 partnerstwa / mecz
  const step = n / gcd(n, 4); // aby 4M % n == 0
  const M = Math.ceil(minMatchesByPartners / step) * step;

  const gamesPerPlayer = (4 * M) / n;
  return { matches: M, gamesPerPlayer };
}

/** ---------- standings local recompute ---------- */
export function recomputeState(state: TournamentState): TournamentState {
  const players: Player[] = state.players.map((p) => ({
    ...p,
    pointsFor: 0,
    pointsAgainst: 0,
    games: 0,
  }));

  const teams: Team[] = state.teams.map((t) => ({
    ...t,
    pointsFor: 0,
    pointsAgainst: 0,
    games: 0,
  }));

  const playerIndex = new Map(players.map((p, i) => [p.id, i]));
  const teamIndex = new Map(teams.map((t, i) => [t.id, i]));
  const teamPlayers = new Map<string, string[]>();
  for (const t of teams) teamPlayers.set(t.id, t.playerIds ?? []);

  const addToPlayer = (pid: string, pf: number, pa: number) => {
    const i = playerIndex.get(pid);
    if (i == null) return;
    const p = players[i];
    players[i] = { ...p, pointsFor: p.pointsFor + pf, pointsAgainst: p.pointsAgainst + pa, games: p.games + 1 };
  };

  const addToTeam = (tid: string, pf: number, pa: number) => {
    const i = teamIndex.get(tid);
    if (i == null) return;
    const t = teams[i];
    teams[i] = { ...t, pointsFor: t.pointsFor + pf, pointsAgainst: t.pointsAgainst + pa, games: t.games + 1 };
  };

  for (const round of state.rounds) {
    for (const m of round) {
      if (m.scoreA == null || m.scoreB == null) continue;
      const aScore = m.scoreA;
      const bScore = m.scoreB;

      if (state.config.scoringMode === "INDIVIDUAL") {
        for (const pid of m.sideA) addToPlayer(pid, aScore, bScore);
        for (const pid of m.sideB) addToPlayer(pid, bScore, aScore);
      } else {
        const ta = m.sideA[0];
        const tb = m.sideB[0];
        if (ta) addToTeam(ta, aScore, bScore);
        if (tb) addToTeam(tb, bScore, aScore);

        if (ta) for (const pid of teamPlayers.get(ta) ?? []) addToPlayer(pid, aScore, bScore);
        if (tb) for (const pid of teamPlayers.get(tb) ?? []) addToPlayer(pid, bScore, aScore);
      }
    }
  }

  return { ...state, players, teams };
}

/** ---------- time helpers ---------- */
export function getTimerRemainingMs(state: TournamentState): number | null {
  if (state.config.playMode !== "TIMER") return null;
  if (!state.startedAt) return state.config.timerMinutes * 60_000;
  const endAt = state.startedAt + state.config.timerMinutes * 60_000;
  return Math.max(0, endAt - Date.now());
}

export function isTimerExpired(state: TournamentState): boolean {
  const left = getTimerRemainingMs(state);
  return left != null && left <= 0;
}

export function canAddNextRound(state: TournamentState): boolean {
  // Timer mode: tylko dopóki czas > 0
  if (state.config.playMode === "TIMER") {
    return !isTimerExpired(state);
  }

  // Rounds mode: tylko dopóki nie przekroczysz planned
  const planned = getPlannedRounds(state);
  if (planned <= 0) return true;
  return state.rounds.length < planned;
}

/** ---------- state ---------- */
export function makeEmptyState(): TournamentState {
  return {
    started: false,
    startedAt: null,
    config: {
      variant: "AMERICANO",
      scoringMode: "INDIVIDUAL",
      courts: 2,
      matchPoints: 21,
      roundsPlanned: 0,      // 0 = AUTO (gdy playMode="ROUNDS")
      autoRematch: false,

      playMode: "ROUNDS",    // ✅ nowość
      timerMinutes: 60,      // ✅ nowość
    },
    players: [],
    teams: [],
    rounds: [],
  } as TournamentState;
}

/** LocalStorage */
export function saveState(state: TournamentState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}
export function loadState(): TournamentState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TournamentState;
  } catch {
    return null;
  }
}

export function resetTournament(state: TournamentState): TournamentState {
  const fresh = makeEmptyState();
  fresh.config = { ...fresh.config, ...state.config };
  return fresh;
}

export function setConfig(state: TournamentState, patch: Partial<TournamentState["config"]>): TournamentState {
  return { ...state, config: { ...state.config, ...patch } };
}

/** Players */
export function addPlayer(state: TournamentState, name: string): TournamentState {
  const clean = (name ?? "").trim();
  if (!clean) return state;
  if (state.players.length >= 32) return state;

  const p: Player = { id: uid("p_"), name: clean, pointsFor: 0, pointsAgainst: 0, games: 0 } as Player;
  return { ...state, players: [...state.players, p] };
}

export function updatePlayer(state: TournamentState, playerId: string, name: string): TournamentState {
  const clean = (name ?? "").trim();
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, name: clean || p.name } : p)) };
}

export function removePlayer(state: TournamentState, playerId: string): TournamentState {
  if (state.started || state.rounds.length > 0) return state;
  return { ...state, players: state.players.filter((p) => p.id !== playerId), teams: state.teams.filter((t) => !t.playerIds?.includes(playerId)) };
}

/** Teams */
export function generateTeamsRandom(state: TournamentState): TournamentState {
  if (state.started || state.rounds.length > 0) return state;
  if (state.players.length < 4) return state;
  if (state.players.length % 2 !== 0) return state;

  const ids = [...state.players.map((p) => p.id)];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  const teams: Team[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i], b = ids[i + 1];
    if (!a || !b) continue;
    teams.push({ id: uid("t_"), name: `Team ${teams.length + 1}`, playerIds: [a, b], pointsFor: 0, pointsAgainst: 0, games: 0 } as Team);
  }
  return { ...state, teams };
}

export function updateTeamName(state: TournamentState, teamId: string, name: string): TournamentState {
  const clean = (name ?? "").trim();
  return { ...state, teams: state.teams.map((t) => (t.id === teamId ? { ...t, name: clean || t.name } : t)) };
}

/** AUTO rounds (tylko dla playMode="ROUNDS") */
export function computeAutoRounds(state: TournamentState): number {
  const rematch = !!state.config.autoRematch;

  if (state.config.scoringMode === "TEAM") {
    const t = state.teams.length;
    if (t < 2) return 0;
    const base = t - 1;
    return rematch ? base * 2 : base;
  }

  const n = state.players.length;
  if (n < 4) return 0;

  const courts = state.config.courts;
  const maxMatchesPerRound = Math.min(courts, Math.floor(n / 4));
  if (maxMatchesPerRound <= 0) return 0;

  // Mexicano zostaje jak było
  if (state.config.variant === "MEXICANO") {
    const slotsPerRound = maxMatchesPerRound * 4;
    const base = slotsPerRound === n && n % 2 === 0 ? n - 1 : n;
    return rematch ? base * 2 : base;
  }

  // Americano: partner-z-każdym
  const { matches: M, gamesPerPlayer: G } = autoPartnerPlan(n, rematch);
  const roundsByGames = G;
  const roundsByCapacity = Math.ceil(M / maxMatchesPerRound);
  return Math.max(roundsByGames, roundsByCapacity);
}

export function getPlannedRounds(state: TournamentState): number {
  if (state.config.playMode === "TIMER") return 0; // unlimited (limituje czas)
  if (state.config.roundsPlanned && state.config.roundsPlanned > 0) return state.config.roundsPlanned;
  return computeAutoRounds(state);
}

/** Next round */
export function startOrNextRound(state: TournamentState): TournamentState {
  // blokada w trybie TIMER
  if (state.config.playMode === "TIMER" && isTimerExpired(state)) return state;

  // blokada w trybie ROUNDS
  if (state.config.playMode === "ROUNDS") {
    const planned = getPlannedRounds(state);
    if (planned > 0 && state.rounds.length >= planned) return state;
  }

  if (state.config.scoringMode === "TEAM") {
    if (state.players.length < 4 || state.players.length % 2 !== 0) return state;
    if (state.teams.length < 2) return state;
  } else {
    if (state.players.length < 4) return state;
  }

  let recomputed = recomputeState(state);

  // ustaw start czasu przy pierwszej rundzie
  if (!recomputed.startedAt) recomputed = { ...recomputed, startedAt: Date.now() };

  const roundIndex = recomputed.rounds.length;

  const matches =
    recomputed.config.scoringMode === "TEAM"
      ? buildRound({
          variant: recomputed.config.variant as Variant,
          scoringMode: "TEAM",
          courts: recomputed.config.courts,
          roundIndex,
          plannedRounds: getPlannedRounds(recomputed),
          autoRematch: recomputed.config.autoRematch,
          players: recomputed.players,
          teams: sortTeams(recomputed.teams, recomputed.rounds),
          roundsSoFar: recomputed.rounds,
        })
      : buildRound({
          variant: recomputed.config.variant as Variant,
          scoringMode: "INDIVIDUAL",
          courts: recomputed.config.courts,
          roundIndex,
          plannedRounds: getPlannedRounds(recomputed),
          autoRematch: recomputed.config.autoRematch,
          players:
            recomputed.config.variant === "AMERICANO"
              ? recomputed.players
              : sortPlayers(recomputed.players, recomputed.rounds),
          teams: [],
          roundsSoFar: recomputed.rounds,
        });

  return {
    ...recomputed,
    started: true,
    rounds: [...recomputed.rounds, matches],
  };
}

/** Scores */
export function setScore(
  state: TournamentState,
  roundIndex: number,
  matchId: string,
  scoreA: number | null,
  scoreB: number | null
): TournamentState {
  const rounds = state.rounds.map((r, ri) => {
    if (ri !== roundIndex) return r;
    return r.map((m) => {
      if (m.id !== matchId) return m;

      if (scoreA == null || scoreB == null) return { ...m, scoreA: null, scoreB: null };

      const a = clamp(scoreA, 0, state.config.matchPoints);
      const b = clamp(scoreB, 0, state.config.matchPoints);

      if (!isValidSumLocal(a, b, state.config.matchPoints)) {
        return { ...m, scoreA: a, scoreB: b };
      }
      return { ...m, scoreA: a, scoreB: b };
    });
  });

  return recomputeState({ ...state, rounds });
}
