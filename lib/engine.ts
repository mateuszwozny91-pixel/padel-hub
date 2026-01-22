export type PlayerId = string;

export type Mode = "SINGLE" | "TEAM";

export type Player = { id: PlayerId; name: string };

export type Team = { id: string; p1: PlayerId; p2: PlayerId };

export type Match = {
  court: number; // 1..courts
  a1: PlayerId;
  a2: PlayerId;
  b1: PlayerId;
  b2: PlayerId;
};

export type Round = { index: number; matches: Match[]; byes: PlayerId[] };

export type SingleStats = {
  gamesPlayed: Record<PlayerId, number>;
  byes: Record<PlayerId, number>;
  partnerCount: Record<PlayerId, Record<PlayerId, number>>;
  opponentCount: Record<PlayerId, Record<PlayerId, number>>;
};

export function makeEmptySingleStats(players: Player[]): SingleStats {
  const ids = players.map((p) => p.id);
  const partnerCount: SingleStats["partnerCount"] = {};
  const opponentCount: SingleStats["opponentCount"] = {};
  const gamesPlayed: SingleStats["gamesPlayed"] = {};
  const byes: SingleStats["byes"] = {};

  for (const a of ids) {
    gamesPlayed[a] = 0;
    byes[a] = 0;
    partnerCount[a] = {};
    opponentCount[a] = {};
    for (const b of ids) {
      partnerCount[a][b] = 0;
      opponentCount[a][b] = 0;
    }
  }
  return { gamesPlayed, byes, partnerCount, opponentCount };
}

function incSym(map: Record<PlayerId, Record<PlayerId, number>>, a: PlayerId, b: PlayerId) {
  if (a === b) return;
  map[a][b] += 1;
  map[b][a] += 1;
}

export function applySingleRoundToStats(stats: SingleStats, round: Round) {
  for (const id of round.byes) stats.byes[id] += 1;

  for (const m of round.matches) {
    stats.gamesPlayed[m.a1] += 1;
    stats.gamesPlayed[m.a2] += 1;
    stats.gamesPlayed[m.b1] += 1;
    stats.gamesPlayed[m.b2] += 1;

    // partners
    incSym(stats.partnerCount, m.a1, m.a2);
    incSym(stats.partnerCount, m.b1, m.b2);

    // opponents
    const A = [m.a1, m.a2];
    const B = [m.b1, m.b2];
    for (const a of A) for (const b of B) incSym(stats.opponentCount, a, b);
  }
}

export function generateNextSingleRound(params: {
  roundIndex: number;
  players: Player[];
  courts: number;
  stats: SingleStats;
}): Round {
  const { roundIndex, players, courts, stats } = params;

  const ids = players.map((p) => p.id);
  const maxSlots = courts * 4;

  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  const sortedByNeed = [...shuffled].sort((a, b) => {
    const ga = stats.gamesPlayed[a],
      gb = stats.gamesPlayed[b];
    if (ga !== gb) return ga - gb;
    const ba = stats.byes[a],
      bb = stats.byes[b];
    if (ba !== bb) return ba - bb;
    return 0;
  });

  let active = sortedByNeed;
  let byes: PlayerId[] = [];

  // too many players for available slots
  if (ids.length > maxSlots) {
    const toBye = ids.length - maxSlots;
    const byeCandidates = [...sortedByNeed].sort((a, b) => {
      const ga = stats.gamesPlayed[a],
        gb = stats.gamesPlayed[b];
      if (ga !== gb) return gb - ga;
      const ba = stats.byes[a],
        bb = stats.byes[b];
      if (ba !== bb) return bb - ba;
      return 0;
    });
    byes = byeCandidates.slice(0, toBye);
    const byeSet = new Set(byes);
    active = sortedByNeed.filter((id) => !byeSet.has(id));
  } else if (ids.length % 4 !== 0) {
    // not divisible by 4 -> byes
    const toBye = ids.length % 4;
    const byeCandidates = [...sortedByNeed].sort((a, b) => {
      const ga = stats.gamesPlayed[a],
        gb = stats.gamesPlayed[b];
      if (ga !== gb) return gb - ga;
      const ba = stats.byes[a],
        bb = stats.byes[b];
      if (ba !== bb) return ba - bb;
      return 0;
    });
    byes = byeCandidates.slice(0, toBye);
    const byeSet = new Set(byes);
    active = sortedByNeed.filter((id) => !byeSet.has(id));
  }

  const matches: Match[] = [];
  const unused = new Set(active);

  function costPartner(a: PlayerId, b: PlayerId) {
    return stats.partnerCount[a][b];
  }
  function costOpponent(a: PlayerId, b: PlayerId) {
    return stats.opponentCount[a][b];
  }

  function popBestPlayer(): PlayerId | null {
    let best: PlayerId | null = null;
    let bestKey: [number, number, number] | null = null;

    for (const id of unused) {
      const key: [number, number, number] = [
        stats.gamesPlayed[id],
        stats.byes[id],
        Math.floor(Math.random() * 1_000_000),
      ];
      if (!best || !bestKey) {
        best = id;
        bestKey = key;
        continue;
      }
      if (
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))
      ) {
        best = id;
        bestKey = key;
      }
    }
    if (best) unused.delete(best);
    return best;
  }

  function pickBestPartner(forPlayer: PlayerId): PlayerId | null {
    let best: PlayerId | null = null;
    let bestScore = Infinity;

    for (const cand of unused) {
      const partnerPenalty = 10 * costPartner(forPlayer, cand);
      const balancePenalty = Math.abs(stats.gamesPlayed[forPlayer] - stats.gamesPlayed[cand]);
      const score = partnerPenalty + 0.5 * balancePenalty + Math.random() * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    if (best) unused.delete(best);
    return best;
  }

  function pickBestOpponents(teamA: [PlayerId, PlayerId]): [PlayerId, PlayerId] | null {
    const cand = Array.from(unused);
    if (cand.length < 2) return null;

    let bestPair: [PlayerId, PlayerId] | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        const x = cand[i],
          y = cand[j];

        const opponentPenalty =
          3 *
          (costOpponent(teamA[0], x) +
            costOpponent(teamA[0], y) +
            costOpponent(teamA[1], x) +
            costOpponent(teamA[1], y));

        const partnerPenalty = 10 * costPartner(x, y);

        const balancePenalty =
          Math.abs(stats.gamesPlayed[teamA[0]] - stats.gamesPlayed[x]) +
          Math.abs(stats.gamesPlayed[teamA[1]] - stats.gamesPlayed[y]);

        const score = opponentPenalty + partnerPenalty + 0.2 * balancePenalty + Math.random() * 0.01;

        if (score < bestScore) {
          bestScore = score;
          bestPair = [x, y];
        }
      }
    }

    if (!bestPair) return null;
    unused.delete(bestPair[0]);
    unused.delete(bestPair[1]);
    return bestPair;
  }

  const maxMatches = Math.min(courts, Math.floor(active.length / 4));
  for (let c = 1; c <= maxMatches; c++) {
    const p1 = popBestPlayer();
    if (!p1) break;
    const p2 = pickBestPartner(p1);
    if (!p2) break;

    const opp = pickBestOpponents([p1, p2]);
    if (!opp) break;

    matches.push({ court: c, a1: p1, a2: p2, b1: opp[0], b2: opp[1] });
  }

  const leftover = Array.from(unused);
  if (leftover.length) byes.push(...leftover);

  return { index: roundIndex, matches, byes };
}

export function randomTeams(players: Player[]): Team[] {
  const ids = players.map((p) => p.id).sort(() => Math.random() - 0.5);
  const teams: Team[] = [];
  for (let i = 0; i < ids.length - 1; i += 2) {
    teams.push({ id: `T${Math.floor(i / 2) + 1}`, p1: ids[i], p2: ids[i + 1] });
  }
  return teams;
}

export function generateTeamSchedule(params: { teams: Team[]; courts: number }): Round[] {
  const { teams, courts } = params;
  const teamIds = teams.map((t) => t.id);

  const list = [...teamIds];
  if (list.length % 2 === 1) list.push("BYE");

  const n = list.length;
  const roundsCount = n - 1;
  const rounds: Round[] = [];

  let arr = [...list];

  for (let r = 1; r <= roundsCount; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) pairs.push([arr[i], arr[n - 1 - i]]);

    const matches: Match[] = [];
    let court = 1;

    for (const [ta, tb] of pairs) {
      if (ta === "BYE" || tb === "BYE") continue;
      if (court > courts) break;

      const A = teams.find((t) => t.id === ta)!;
      const B = teams.find((t) => t.id === tb)!;

      matches.push({ court, a1: A.p1, a2: A.p2, b1: B.p1, b2: B.p2 });
      court++;
    }

    rounds.push({ index: r, matches, byes: [] });

    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr = [fixed, ...rest];
  }

  return rounds;
}
