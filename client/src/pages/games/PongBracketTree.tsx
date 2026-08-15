import type { PongBracketMatch } from "@koroc/shared";

function matchLabel(player: { username: string } | null): string {
  return player?.username ?? "TBD";
}

export function PongBracketTree({
  rounds,
  currentMatchId,
  youId,
}: {
  rounds: PongBracketMatch[][];
  currentMatchId: string | null;
  youId?: number;
}) {
  return (
    <div className="bracket-tree">
      {rounds.map((round, i) => (
        <div className="bracket-round" key={i}>
          <h4>{i === rounds.length - 1 ? "Final" : `Round ${i + 1}`}</h4>
          {round.map((match) => {
            const isCurrent = match.id === currentMatchId;
            const youInMatch = match.player1?.id === youId || match.player2?.id === youId;
            return (
              <div key={match.id} className={`bracket-match${isCurrent ? " current" : ""}${youInMatch ? " you" : ""}`}>
                <div className={match.winner && match.winner.id === match.player1?.id ? "won" : ""}>
                  {matchLabel(match.player1)}
                  {match.winner ? ` (${match.score1})` : ""}
                </div>
                <div className={match.winner && match.winner.id === match.player2?.id ? "won" : ""}>
                  {matchLabel(match.player2)}
                  {match.winner ? ` (${match.score2})` : ""}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
