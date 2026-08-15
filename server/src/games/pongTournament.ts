import type {
  PongBracketMatch,
  PongState,
  PongTournamentPhase,
  PongTournamentState,
  PublicUser,
} from "@koroc/shared";
import { PongGame } from "./pong";

type OnUpdate = (state: PongTournamentState) => void;
type OnEnd = () => void;

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Builds round 0 so that every bye is absorbed immediately (paired against a "phantom"
// opponent) — the number of real players left over after peeling off byes is always
// even, so no round-0 match is ever bye-vs-bye. That guarantee means every match from
// round 1 onward is eventually fed two real winners; byes never need to be re-resolved
// past round 0.
function generateBracket(players: PublicUser[]): PongBracketMatch[][] {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const bracketSize = nextPowerOf2(shuffled.length);
  const numByes = bracketSize - shuffled.length;
  const byePlayers = shuffled.slice(0, numByes);
  const pairedPlayers = shuffled.slice(numByes);

  let idCounter = 0;
  const round0: PongBracketMatch[] = [];
  for (const p of byePlayers) {
    round0.push({
      id: `m${idCounter++}`,
      round: 0,
      slot: round0.length,
      player1: p,
      player2: null,
      winner: p,
      score1: 0,
      score2: 0,
    });
  }
  for (let i = 0; i < pairedPlayers.length; i += 2) {
    round0.push({
      id: `m${idCounter++}`,
      round: 0,
      slot: round0.length,
      player1: pairedPlayers[i],
      player2: pairedPlayers[i + 1],
      winner: null,
      score1: 0,
      score2: 0,
    });
  }

  const rounds: PongBracketMatch[][] = [round0];
  let prevCount = round0.length;
  let roundNum = 1;
  while (prevCount > 1) {
    const count = prevCount / 2;
    const round: PongBracketMatch[] = [];
    for (let i = 0; i < count; i++) {
      round.push({ id: `m${idCounter++}`, round: roundNum, slot: i, player1: null, player2: null, winner: null, score1: 0, score2: 0 });
    }
    rounds.push(round);
    prevCount = count;
    roundNum++;
  }
  return rounds;
}

export class PongTournament {
  private phase: PongTournamentPhase = "registration";
  private roster = new Map<number, PublicUser>();
  private socketByUserId = new Map<number, string>();
  private rounds: PongBracketMatch[][] = [];
  private currentMatch: PongGame | null = null;
  private currentMatchId: string | null = null;
  private champion: PublicUser | null = null;
  private readonly onUpdate: OnUpdate;
  private readonly onEnd: OnEnd;

  constructor(onUpdate: OnUpdate, onEnd: OnEnd) {
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
  }

  addParticipant(user: PublicUser, socketId: string): void {
    this.socketByUserId.set(user.id, socketId);
    if (this.phase === "registration") {
      this.roster.set(user.id, user);
    } else if (this.currentMatch && this.currentMatchId) {
      const match = this.findMatch(this.currentMatchId);
      if (match && (match.player1?.id === user.id || match.player2?.id === user.id)) {
        this.currentMatch.addParticipant(user, socketId);
      }
    }
    this.onUpdate(this.getState());
  }

  removeParticipant(socketId: string): void {
    for (const [userId, sid] of this.socketByUserId) {
      if (sid === socketId) {
        if (this.phase === "registration") this.roster.delete(userId);
      }
    }
    this.currentMatch?.removeParticipant(socketId);
    this.onUpdate(this.getState());
  }

  handleInput(socketId: string, paddleY: number): void {
    this.currentMatch?.handleInput(socketId, paddleY);
  }

  /** Admin-triggered: locks in the roster, builds the bracket, and starts round 1. */
  requestStart(): boolean {
    if (this.phase !== "registration" || this.roster.size < 2) return false;
    this.rounds = generateBracket(Array.from(this.roster.values()));
    this.phase = "bracket";
    this.advance();
    return true;
  }

  private findMatch(id: string): PongBracketMatch | null {
    for (const round of this.rounds) {
      const match = round.find((m) => m.id === id);
      if (match) return match;
    }
    return null;
  }

  private propagateAll(): void {
    for (let r = 0; r < this.rounds.length - 1; r++) {
      const round = this.rounds[r];
      const parentRound = this.rounds[r + 1];
      round.forEach((match, i) => {
        if (!match.winner) return;
        const parent = parentRound[Math.floor(i / 2)];
        if (i % 2 === 0) parent.player1 = match.winner;
        else parent.player2 = match.winner;
      });
    }
  }

  private findReadyMatch(): PongBracketMatch | null {
    for (const round of this.rounds) {
      for (const match of round) {
        if (!match.winner && match.player1 && match.player2) return match;
      }
    }
    return null;
  }

  private advance(): void {
    this.propagateAll();
    const ready = this.findReadyMatch();
    if (ready) {
      this.startMatch(ready);
      return;
    }
    const finalMatch = this.rounds[this.rounds.length - 1][0];
    if (finalMatch.winner) {
      this.champion = finalMatch.winner;
      this.phase = "finished";
      this.currentMatch = null;
      this.currentMatchId = null;
      this.onUpdate(this.getState());
      setTimeout(() => this.onEnd(), 6000);
      return;
    }
    this.onUpdate(this.getState());
  }

  private startMatch(match: PongBracketMatch): void {
    this.currentMatchId = match.id;
    this.currentMatch = new PongGame(
      () => this.onUpdate(this.getState()),
      () => this.onMatchEnd(match),
    );
    if (match.player1) {
      const sid = this.socketByUserId.get(match.player1.id);
      if (sid) this.currentMatch.addParticipant(match.player1, sid);
    }
    if (match.player2) {
      const sid = this.socketByUserId.get(match.player2.id);
      if (sid) this.currentMatch.addParticipant(match.player2, sid);
    }
    this.currentMatch.requestStart();
    this.onUpdate(this.getState());
  }

  private onMatchEnd(match: PongBracketMatch): void {
    const finalState = this.currentMatch?.getState();
    if (finalState) {
      match.winner = finalState.winner === "left" ? finalState.players.left : finalState.players.right;
      match.score1 = finalState.score.left;
      match.score2 = finalState.score.right;
    }
    this.currentMatch?.destroy();
    this.currentMatch = null;
    this.advance();
  }

  getState(): PongTournamentState {
    let live: PongState | null = null;
    if (this.currentMatch) live = this.currentMatch.getState();
    return {
      phase: this.phase,
      roster: Array.from(this.roster.values()),
      rounds: this.rounds,
      currentMatchId: this.currentMatchId,
      live,
      champion: this.champion,
    };
  }

  getPlayerCount(): number {
    return this.roster.size;
  }

  destroy(): void {
    this.currentMatch?.destroy();
    this.currentMatch = null;
  }
}
