export type Variant = "AMERICANO" | "MEXICANO";
export type ScoringMode = "INDIVIDUAL" | "TEAM";
export type PlayMode = "ROUNDS" | "TIMER";

export type Player = {
  id: string;
  name: string;

  // standings
  pointsFor: number;
  pointsAgainst: number;
  games: number;
};

export type Team = {
  id: string;
  name: string;

  // for TEAM mode: fixed roster
  playerIds: string[];

  // standings
  pointsFor: number;
  pointsAgainst: number;
  games: number;
};

export type Match = {
  id: string;
  roundIndex: number;
  court: number;

  // INDIVIDUAL: playerIds (usually length 2)
  // TEAM: teamIds (length 1)
  sideA: string[];
  sideB: string[];

  scoreA: number | null;
  scoreB: number | null;
};

export type TournamentConfig = {
  variant: Variant;
  scoringMode: ScoringMode;

  courts: number;       // 1..8
  matchPoints: number;  // odd 11..29

  // ROUNDS mode: 0 = AUTO, otherwise manual
  roundsPlanned: number;
  autoRematch: boolean;

  // TIMER mode:
  playMode: PlayMode;
  timerMinutes: number; // >= 1
};

export type TournamentState = {
  started: boolean;
  startedAt: number | null; // used in TIMER mode

  config: TournamentConfig;

  players: Player[];
  teams: Team[];

  // rounds[roundIndex] = list of matches
  rounds: Match[][];
};
