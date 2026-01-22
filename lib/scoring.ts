import type { Match, Player, Team } from "./types";

export function isValidSum(scoreA: number, scoreB: number, matchPoints: number) {
  return scoreA + scoreB === matchPoints;
}

function buildPlayerH2H(rounds: Match[][]) {
  // wins.get("A->B") = ile razy A wygrał bezpośrednio przeciwko B (jako przeciwnik)
  const wins = new Map<string, number>();

  for (const round of rounds) {
    for (const m of round) {
      if (m.scoreA == null || m.scoreB == null) continue;

      // INDIVIDUAL doubles: 2v2
      if (m.sideA.length !== 2 || m.sideB.length !== 2) continue;

      const aWon = m.scoreA > m.scoreB;
      const bWon = m.scoreB > m.scoreA;
      if (!aWon && !bWon) continue;

      const winners = aWon ? m.sideA : m.sideB;
      const losers = aWon ? m.sideB : m.sideA;

      for (const w of winners) {
        for (const l of losers) {
          const k = `${w}->${l}`;
          wins.set(k, (wins.get(k) ?? 0) + 1);
        }
      }
    }
  }

  return wins;
}

function buildTeamH2H(rounds: Match[][]) {
  // wins.get("teamA->teamB") = ile razy teamA wygrał z teamB
  const wins = new Map<string, number>();

  for (const round of rounds) {
    for (const m of round) {
      if (m.scoreA == null || m.scoreB == null) continue;

      // TEAM: [teamId] vs [teamId]
      if (m.sideA.length !== 1 || m.sideB.length !== 1) continue;

      const a = m.sideA[0];
      const b = m.sideB[0];
      if (!a || !b) continue;

      const aWon = m.scoreA > m.scoreB;
      const bWon = m.scoreB > m.scoreA;
      if (!aWon && !bWon) continue;

      const winner = aWon ? a : b;
      const loser = aWon ? b : a;

      const k = `${winner}->${loser}`;
      wins.set(k, (wins.get(k) ?? 0) + 1);
    }
  }

  return wins;
}

export function recomputePlayers(players: Player[], rounds: Match[][]) {
  const base = players.map((p) => ({
    ...p,
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    games: 0,
  }));
  const byId = new Map(base.map((p) => [p.id, p]));

  for (const round of rounds) {
    for (const m of round) {
      if (m.scoreA == null || m.scoreB == null) continue;

      const idsA = m.sideA;
      const idsB = m.sideB;
      if (!idsA.length || !idsB.length) continue;

      const winA = m.scoreA > m.scoreB;
      const winB = m.scoreB > m.scoreA;

      for (const id of idsA) {
        const p = byId.get(id);
        if (!p) continue;
        p.pointsFor += m.scoreA;
        p.pointsAgainst += m.scoreB;
        p.games += 1;
        if (winA) p.wins += 1;
      }

      for (const id of idsB) {
        const p = byId.get(id);
        if (!p) continue;
        p.pointsFor += m.scoreB;
        p.pointsAgainst += m.scoreA;
        p.games += 1;
        if (winB) p.wins += 1;
      }
    }
  }

  return base;
}

export function recomputeTeams(teams: Team[], rounds: Match[][]) {
  const base = teams.map((t) => ({
    ...t,
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    games: 0,
  }));
  const byId = new Map(base.map((t) => [t.id, t]));

  for (const round of rounds) {
    for (const m of round) {
      if (m.scoreA == null || m.scoreB == null) continue;

      const a = m.sideA[0];
      const b = m.sideB[0];
      if (!a || !b) continue;

      const ta = byId.get(a);
      const tb = byId.get(b);
      if (!ta || !tb) continue;

      const winA = m.scoreA > m.scoreB;
      const winB = m.scoreB > m.scoreA;

      ta.pointsFor += m.scoreA;
      ta.pointsAgainst += m.scoreB;
      ta.games += 1;
      if (winA) ta.wins += 1;

      tb.pointsFor += m.scoreB;
      tb.pointsAgainst += m.scoreA;
      tb.games += 1;
      if (winB) tb.wins += 1;
    }
  }

  return base;
}

/**
 * SORT:
 * 1) pointsFor DESC
 * 2) H2H (jeśli remis pointsFor)
 * 3) diff DESC
 * 4) pointsAgainst ASC (mniej straconych lepiej)
 */
export function sortPlayers(players: Player[], rounds?: Match[][]) {
  const h2h = rounds ? buildPlayerH2H(rounds) : null;
  const h2hWins = (a: string, b: string) => (h2h?.get(`${a}->${b}`) ?? 0);

  const diff = (p: Player) => p.pointsFor - p.pointsAgainst;

  return [...players].sort((a, b) => {
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;

    const ab = h2hWins(a.id, b.id);
    const ba = h2hWins(b.id, a.id);
    if (ab !== ba) return ab > ba ? -1 : 1;

    const da = diff(a);
    const db = diff(b);
    if (db !== da) return db - da;

    if (a.pointsAgainst !== b.pointsAgainst) return a.pointsAgainst - b.pointsAgainst;

    return 0;
  });
}

export function sortTeams(teams: Team[], rounds?: Match[][]) {
  const h2h = rounds ? buildTeamH2H(rounds) : null;
  const h2hWins = (a: string, b: string) => (h2h?.get(`${a}->${b}`) ?? 0);

  const diff = (t: Team) => t.pointsFor - t.pointsAgainst;

  return [...teams].sort((a, b) => {
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;

    const ab = h2hWins(a.id, b.id);
    const ba = h2hWins(b.id, a.id);
    if (ab !== ba) return ab > ba ? -1 : 1;

    const da = diff(a);
    const db = diff(b);
    if (db !== da) return db - da;

    if (a.pointsAgainst !== b.pointsAgainst) return a.pointsAgainst - b.pointsAgainst;

    return 0;
  });
}
