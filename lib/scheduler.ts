import type { Match, Player, Team, Variant } from "./types";
import { uid, shuffle } from "./utils";
import { sortPlayers, sortTeams } from "./scoring";

type BuildRoundArgs =
  | {
      variant: Variant;
      scoringMode: "INDIVIDUAL";
      courts: number;
      roundIndex: number;
      plannedRounds?: number;
      autoRematch?: boolean;
      players: Player[];
      teams: Team[];
      roundsSoFar: Match[][];
    }
  | {
      variant: Variant;
      scoringMode: "TEAM";
      courts: number;
      roundIndex: number;
      plannedRounds?: number;
      autoRematch?: boolean;
      players: Player[];
      teams: Team[];
      roundsSoFar: Match[][];
    };

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function maxMatchesPerRound(n: number, courts: number) {
  return Math.min(courts, Math.floor(n / 4));
}

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

/** AUTO target games per player (AMERICANO) based on partner coverage */
function autoTargetGamesAmericano(n: number, rematch: boolean) {
  const factor = rematch ? 2 : 1;
  const pairs = (n * (n - 1)) / 2;
  const minMatchesByPartners = Math.ceil((pairs * factor) / 2);

  const step = n / gcd(n, 4);
  const M = Math.ceil(minMatchesByPartners / step) * step;

  return (4 * M) / n;
}

function computeGames(ids: string[], rounds: Match[][]) {
  const g = new Map<string, number>();
  for (const id of ids) g.set(id, 0);
  for (const r of rounds) {
    for (const m of r) {
      for (const id of m.sideA) g.set(id, (g.get(id) ?? 0) + 1);
      for (const id of m.sideB) g.set(id, (g.get(id) ?? 0) + 1);
    }
  }
  return g;
}

function computeByes(ids: string[], rounds: Match[][]) {
  const b = new Map<string, number>();
  for (const id of ids) b.set(id, 0);
  for (const r of rounds) {
    const used = new Set<string>();
    for (const m of r) {
      for (const id of m.sideA) used.add(id);
      for (const id of m.sideB) used.add(id);
    }
    for (const id of ids) if (!used.has(id)) b.set(id, (b.get(id) ?? 0) + 1);
  }
  return b;
}

function byedLast(ids: string[], rounds: Match[][]) {
  const bl = new Map<string, boolean>();
  for (const id of ids) bl.set(id, false);

  const last = rounds.length ? rounds[rounds.length - 1] : null;
  if (!last) return bl;

  const used = new Set<string>();
  for (const m of last) {
    for (const id of m.sideA) used.add(id);
    for (const id of m.sideB) used.add(id);
  }
  for (const id of ids) bl.set(id, !used.has(id));
  return bl;
}

function partnerCounts(rounds: Match[][]) {
  const pc = new Map<string, number>();
  for (const r of rounds) {
    for (const m of r) {
      if (m.sideA.length === 2) pc.set(pairKey(m.sideA[0], m.sideA[1]), (pc.get(pairKey(m.sideA[0], m.sideA[1])) ?? 0) + 1);
      if (m.sideB.length === 2) pc.set(pairKey(m.sideB[0], m.sideB[1]), (pc.get(pairKey(m.sideB[0], m.sideB[1])) ?? 0) + 1);
    }
  }
  return pc;
}

function opponentCounts(rounds: Match[][]) {
  const oc = new Map<string, number>();
  for (const r of rounds) {
    for (const m of r) {
      for (const a of m.sideA) for (const b of m.sideB) {
        oc.set(pairKey(a, b), (oc.get(pairKey(a, b)) ?? 0) + 1);
      }
    }
  }
  return oc;
}

function lastPartners(rounds: Match[][]) {
  const lp = new Map<string, string>();
  const last = rounds.length ? rounds[rounds.length - 1] : null;
  if (!last) return lp;

  for (const m of last) {
    if (m.sideA.length === 2) {
      lp.set(m.sideA[0], m.sideA[1]);
      lp.set(m.sideA[1], m.sideA[0]);
    }
    if (m.sideB.length === 2) {
      lp.set(m.sideB[0], m.sideB[1]);
      lp.set(m.sideB[1], m.sideB[0]);
    }
  }
  return lp;
}

function lastOpponents(rounds: Match[][]) {
  const lo = new Map<string, Set<string>>();
  const last = rounds.length ? rounds[rounds.length - 1] : null;
  if (!last) return lo;

  for (const m of last) {
    for (const a of m.sideA) {
      const set = lo.get(a) ?? new Set<string>();
      for (const b of m.sideB) set.add(b);
      lo.set(a, set);
    }
    for (const b of m.sideB) {
      const set = lo.get(b) ?? new Set<string>();
      for (const a of m.sideA) set.add(a);
      lo.set(b, set);
    }
  }
  return lo;
}

/** ===== AMERICANO: wybór graczy do rundy (AUTO), dopuszcza mniejszą liczbę meczów ===== */
function pickPlayersForRoundAmericanoAuto(
  ids: string[],
  maxMatches: number,
  games: Map<string, number>,
  byes: Map<string, number>,
  byedLastRound: Map<string, boolean>,
  targetGames: number,
  plannedRounds: number,
  roundIndex: number
) {
  const remainingRounds = plannedRounds - roundIndex;

  const rows = ids.map((id, idx) => ({
    id,
    idx,
    g: games.get(id) ?? 0,
    b: byes.get(id) ?? 0,
    need: Math.max(0, targetGames - (games.get(id) ?? 0)),
    byedLast: byedLastRound.get(id) ?? false,
  }));

  // gracze, którzy MUSZĄ zagrać w tej rundzie żeby zdążyć do targetu
  const mustPlay = rows.filter((x) => x.need === remainingRounds && x.need > 0).map((x) => x.id);

  // ile gier zostało do rozegrania łącznie
  const totalNeedGames = rows.reduce((acc, x) => acc + x.need, 0);
  const remainingMatches = Math.ceil(totalNeedGames / 4);

  const minMatchesNow = Math.ceil(mustPlay.length / 4);
  let mNow = Math.min(maxMatches, remainingMatches);
  mNow = Math.max(mNow, minMatchesNow);

  const needPlayers = mNow * 4;

  const ranked = rows
    .filter((x) => x.need > 0)
    .sort((a, b) => {
      if (b.need !== a.need) return b.need - a.need;
      if (a.byedLast !== b.byedLast) return a.byedLast ? -1 : 1; // nie dawaj 2 pauz z rzędu
      if (a.b !== b.b) return a.b - b.b;
      return a.idx - b.idx;
    });

  const selected = new Set<string>(mustPlay);
  for (const r of ranked) {
    if (selected.size >= needPlayers) break;
    selected.add(r.id);
  }

  const playing = Array.from(selected);
  return playing.slice(0, Math.floor(playing.length / 4) * 4);
}

/** ===== Koszt meczu: wspólny (ale z różnymi wagami) ===== */
function costForFour(
  a: string, b: string, c: string, d: string,
  pc: Map<string, number>,
  oc: Map<string, number>,
  lp: Map<string, string>,
  lo: Map<string, Set<string>>,
  weights: {
    W_PARTNER_REPEAT: number;
    W_PARTNER_LAST: number;
    W_OPP_REPEAT: number;
    W_OPP_LAST: number;
  }
) {
  let cost = 0;

  // partner repeats
  cost += (pc.get(pairKey(a, b)) ?? 0) * weights.W_PARTNER_REPEAT;
  cost += (pc.get(pairKey(c, d)) ?? 0) * weights.W_PARTNER_REPEAT;

  // partner last round
  if (lp.get(a) === b || lp.get(b) === a) cost += weights.W_PARTNER_LAST;
  if (lp.get(c) === d || lp.get(d) === c) cost += weights.W_PARTNER_LAST;

  // opponent repeats (4 krawędzie)
  const edges: Array<[string, string]> = [
    [a, c], [a, d],
    [b, c], [b, d],
  ];

  for (const [x, y] of edges) {
    const k = pairKey(x, y);
    const rep = oc.get(k) ?? 0;
    if (rep > 0) cost += rep * weights.W_OPP_REPEAT;

    const lastSet = lo.get(x);
    if (lastSet && lastSet.has(y)) cost += weights.W_OPP_LAST;
  }

  return cost;
}

/** heurystyka układania meczów (losowania wielu prób) */
function buildMatchesHeuristic(
  playing: string[],
  matchCount: number,
  courts: number,
  roundIndex: number,
  roundsSoFar: Match[][],
  weights: {
    W_PARTNER_REPEAT: number;
    W_PARTNER_LAST: number;
    W_OPP_REPEAT: number;
    W_OPP_LAST: number;
  }
) {
  const pc = partnerCounts(roundsSoFar);
  const oc = opponentCounts(roundsSoFar);
  const lp = lastPartners(roundsSoFar);
  const lo = lastOpponents(roundsSoFar);

  const attempts = 200;
  let best: Match[] = [];
  let bestCost = Infinity;

  for (let t = 0; t < attempts; t++) {
    const ids = shuffle([...playing]);
    const matches: Match[] = [];

    for (let mi = 0; mi < matchCount; mi++) {
      const base = mi * 4;
      const p0 = ids[base + 0];
      const p1 = ids[base + 1];
      const p2 = ids[base + 2];
      const p3 = ids[base + 3];
      if (!p0 || !p1 || !p2 || !p3) continue;

      const opts = [
        { A: [p0, p1] as [string, string], B: [p2, p3] as [string, string] },
        { A: [p0, p2] as [string, string], B: [p1, p3] as [string, string] },
        { A: [p0, p3] as [string, string], B: [p1, p2] as [string, string] },
      ];

      let bestLocal = opts[0];
      let bestLocalCost = Infinity;

      for (const o of opts) {
        const c = costForFour(o.A[0], o.A[1], o.B[0], o.B[1], pc, oc, lp, lo, weights);
        if (c < bestLocalCost) {
          bestLocalCost = c;
          bestLocal = o;
        }
      }

      matches.push({
        id: uid("m_"),
        roundIndex,
        court: (mi % Math.max(1, courts)) + 1,
        sideA: [bestLocal.A[0], bestLocal.A[1]],
        sideB: [bestLocal.B[0], bestLocal.B[1]],
        scoreA: null,
        scoreB: null,
      });
    }

    let total = 0;
    for (const m of matches) {
      total += costForFour(m.sideA[0], m.sideA[1], m.sideB[0], m.sideB[1], pc, oc, lp, lo, weights);
    }

    if (total < bestCost) {
      bestCost = total;
      best = matches;
    }
  }

  return best;
}

/** ===== MEXICANO: układ wg formy + wymuszanie rotacji partnerów ===== */
function buildMexicanoRound(
  courts: number,
  roundIndex: number,
  players: Player[],
  roundsSoFar: Match[][]
): Match[] {
  const n = players.length;
  const maxM = maxMatchesPerRound(n, courts);
  if (maxM === 0) return [];

  const ordered = roundIndex < 2 ? shuffle(players) : sortPlayers(players, roundsSoFar);
  const ids = ordered.map((p) => p.id);

  // gramy full, a jak n nie pozwala to i tak naturalnie ktoś pauzuje (bo maxM = floor(n/4))
  const playing = ids.slice(0, maxM * 4);
  const matchCount = Math.floor(playing.length / 4);
  if (matchCount <= 0) return [];

  // W mex: partner rotacja mocno, przeciwnicy średnio (bo “forma” już robi swoje)
  const weights = {
    W_PARTNER_REPEAT: 15000,
    W_PARTNER_LAST: 40000,
    W_OPP_REPEAT: 1500,
    W_OPP_LAST: 250,
  };

  // Dodatkowo: “blokowa” struktura wg rankingu (po 4) utrzymuje formę
  // ale nadal w ramach bloku wybieramy najlepszą z 3 konfiguracji (zmiana par).
  const blocks: string[] = [];
  for (let i = 0; i < playing.length; i++) blocks.push(playing[i]);

  const matches: Match[] = [];
  const pc = partnerCounts(roundsSoFar);
  const oc = opponentCounts(roundsSoFar);
  const lp = lastPartners(roundsSoFar);
  const lo = lastOpponents(roundsSoFar);

  for (let mi = 0; mi < matchCount; mi++) {
    const base = mi * 4;
    const p0 = blocks[base + 0];
    const p1 = blocks[base + 1];
    const p2 = blocks[base + 2];
    const p3 = blocks[base + 3];
    if (!p0 || !p1 || !p2 || !p3) continue;

    const opts = [
      { A: [p0, p1] as [string, string], B: [p2, p3] as [string, string] },
      { A: [p0, p2] as [string, string], B: [p1, p3] as [string, string] },
      { A: [p0, p3] as [string, string], B: [p1, p2] as [string, string] },
    ];

    let best = opts[0];
    let bestCost = Infinity;

    for (const o of opts) {
      const c = costForFour(o.A[0], o.A[1], o.B[0], o.B[1], pc, oc, lp, lo, weights);
      if (c < bestCost) {
        bestCost = c;
        best = o;
      }
    }

    matches.push({
      id: uid("m_"),
      roundIndex,
      court: (mi % Math.max(1, courts)) + 1,
      sideA: [best.A[0], best.A[1]],
      sideB: [best.B[0], best.B[1]],
      scoreA: null,
      scoreB: null,
    });
  }

  return matches;
}

/** ===== AMERICANO: partner coverage + fairness AUTO ===== */
function buildAmericanoRound(
  courts: number,
  roundIndex: number,
  plannedRounds: number | undefined,
  autoRematch: boolean | undefined,
  players: Player[],
  roundsSoFar: Match[][]
): Match[] {
  const n = players.length;
  const maxM = maxMatchesPerRound(n, courts);
  if (maxM === 0) return [];

  const ids = players.map((p) => p.id);
  const games = computeGames(ids, roundsSoFar);
  const byes = computeByes(ids, roundsSoFar);
  const bl = byedLast(ids, roundsSoFar);

  const isAuto = !!plannedRounds && plannedRounds > 0;
  const playing = isAuto
    ? pickPlayersForRoundAmericanoAuto(
        ids,
        maxM,
        games,
        byes,
        bl,
        autoTargetGamesAmericano(n, !!autoRematch),
        plannedRounds!,
        roundIndex
      )
    : ids.slice(0, maxM * 4);

  const matchCount = Math.floor(playing.length / 4);
  if (matchCount <= 0) return [];

  // AMERICANO: partner repeats MAKSYMALNIE karane (priorytet)
  const weights = {
    W_PARTNER_REPEAT: 25000,
    W_PARTNER_LAST: 60000,
    W_OPP_REPEAT: 2000,
    W_OPP_LAST: 350,
  };

  return buildMatchesHeuristic(playing, matchCount, courts, roundIndex, roundsSoFar, weights);
}

function buildIndividualRound(args: Extract<BuildRoundArgs, { scoringMode: "INDIVIDUAL" }>): Match[] {
  const { variant, courts, roundIndex, players, roundsSoFar, plannedRounds, autoRematch } = args;

  if (variant === "MEXICANO") {
    // ✅ Mexicano: jak było + rotacja partnerów
    return buildMexicanoRound(courts, roundIndex, players, roundsSoFar);
  }

  // ✅ Americano: nowe zasady
  return buildAmericanoRound(courts, roundIndex, plannedRounds, autoRematch, players, roundsSoFar);
}

function buildTeamRound(args: Extract<BuildRoundArgs, { scoringMode: "TEAM" }>): Match[] {
  const { variant, courts, roundIndex, teams, roundsSoFar } = args;

  const n = teams.length;
  const maxMatches = Math.min(courts, Math.floor(n / 2));
  if (maxMatches === 0) return [];

  const ordered =
    variant === "MEXICANO"
      ? roundIndex < 2
        ? shuffle(teams)
        : sortTeams(teams, roundsSoFar)
      : shuffle(teams);

  const ids = ordered.map((t) => t.id);
  const playing = ids.slice(0, maxMatches * 2);

  const matches: Match[] = [];
  for (let m = 0; m < maxMatches; m++) {
    const a = playing[m * 2];
    const b = playing[m * 2 + 1];
    if (!a || !b) continue;

    matches.push({
      id: uid("m_"),
      roundIndex,
      court: m + 1,
      sideA: [a],
      sideB: [b],
      scoreA: null,
      scoreB: null,
    });
  }

  return matches;
}

export function buildRound(args: BuildRoundArgs): Match[] {
  if (args.scoringMode === "TEAM") return buildTeamRound(args);
  return buildIndividualRound(args);
}
