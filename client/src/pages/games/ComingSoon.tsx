import { GAME_INFO, type GameType } from "@koroc/shared";

const EMOJI: Record<GameType, string> = {
  "ping-pong": "🏓",
  "hide-and-seek": "🙈",
  "wizard-battles": "🧙",
  shooters: "🔫",
};

export function ComingSoon({ gameType }: { gameType: GameType }) {
  const info = GAME_INFO[gameType];
  return (
    <div className="coming-soon">
      <div className="coming-soon-emoji">{EMOJI[gameType]}</div>
      <h2>{info.label} is coming soon</h2>
      <p>{info.description}</p>
      <p className="hint">An admin can end this event to return everyone to the lobby.</p>
    </div>
  );
}
