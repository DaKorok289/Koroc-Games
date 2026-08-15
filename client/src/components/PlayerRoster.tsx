interface RosterEntry {
  id: number;
  username: string;
}

export function PlayerRoster({ players, youId, title }: { players: RosterEntry[]; youId?: number; title?: string }) {
  return (
    <div className="roster-panel">
      <h3>
        {title ?? "Players"} ({players.length})
      </h3>
      <ul className="roster-list">
        {players.map((p) => (
          <li key={p.id} className={p.id === youId ? "you" : undefined}>
            {p.username}
            {p.id === youId ? " (you)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
