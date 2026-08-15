import { useState } from "react";
import { GAME_INFO, GAME_TYPES, SHOP_COLORS } from "@koroc/shared";
import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";
import { ColorPicker } from "../components/ColorPicker";

export function Lobby() {
  const { user, logout } = useAuth();
  const { users, events, startEvent, joinEvent, errorMessage, leaderboard, shop, purchaseCosmetic } = useGame();
  const [tab, setTab] = useState<"join" | "minigames" | "leaderboard" | "shop">("join");

  return (
    <div className="lobby-screen">
      <header className="lobby-header">
        <h1 className="brand">🎮 Koroc Games</h1>
        <div className="who-am-i">
          <span className="coin-balance" title="Coins earned from wins">
            🪙 {shop.coins}
          </span>
          <span>
            {user?.username}
            {user?.isAdmin && <span className="badge">admin</span>}
          </span>
          <ColorPicker />
          <button className="link-btn" onClick={() => logout()} type="button">
            Sign out
          </button>
        </div>
      </header>

      {errorMessage && <div className="toast">{errorMessage}</div>}

      <main className="lobby-main">
        <section className="players-panel">
          <h2>In the lobby ({users.length})</h2>
          <ul className="player-list">
            {users.map((u) => (
              <li key={u.id}>
                <span className="dot" />
                {u.username}
                {u.isAdmin && <span className="badge small">admin</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="games-panel">
          <div className="tabs">
            <button className={tab === "join" ? "tab active" : "tab"} onClick={() => setTab("join")} type="button">
              Join Games {events.length > 0 && `(${events.length})`}
            </button>
            <button
              className={tab === "minigames" ? "tab active" : "tab"}
              onClick={() => setTab("minigames")}
              type="button"
            >
              Minigames
            </button>
            <button
              className={tab === "leaderboard" ? "tab active" : "tab"}
              onClick={() => setTab("leaderboard")}
              type="button"
            >
              Leaderboard
            </button>
            <button className={tab === "shop" ? "tab active" : "tab"} onClick={() => setTab("shop")} type="button">
              Shop
            </button>
          </div>

          {tab === "join" && (
            <>
              {events.length === 0 ? (
                <p className="hint">
                  Nothing running right now.{" "}
                  {user?.isAdmin ? "Start one from the Minigames tab." : "Ask an admin to start one."}
                </p>
              ) : (
                <div className="game-grid">
                  {events.map((event) => {
                    const info = GAME_INFO[event.gameType];
                    return (
                      <div className="game-card" key={event.id}>
                        <h3>{info.label}</h3>
                        <p>
                          started by {event.startedBy} · {event.playerCount}{" "}
                          {event.playerCount === 1 ? "player" : "players"} joined
                        </p>
                        <button className="primary-btn" onClick={() => joinEvent(event.id)} type="button">
                          Join
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "minigames" && (
            <>
              <div className="game-grid">
                {GAME_TYPES.map((gt) => {
                  const info = GAME_INFO[gt];
                  return (
                    <div className="game-card" key={gt}>
                      <h3>{info.label}</h3>
                      <p>{info.description}</p>
                      {user?.isAdmin ? (
                        <button className="primary-btn" onClick={() => startEvent(gt)} type="button">
                          Start Event
                        </button>
                      ) : (
                        <span className="waiting-text">Only admins can start events</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="hint">
                Starting an event doesn't join you to it automatically — switch to "Join Games" (or click Join
                right after starting) to actually play.
              </p>
            </>
          )}

          {tab === "leaderboard" && (
            <>
              {leaderboard.length === 0 ? (
                <p className="hint">No wins recorded yet — finish a game to get on the board.</p>
              ) : (
                <ol className="leaderboard-list">
                  {leaderboard.map((entry, i) => (
                    <li key={entry.userId} className={entry.userId === user?.id ? "you" : undefined}>
                      <span className="leaderboard-rank">#{i + 1}</span>
                      <span className="leaderboard-name">
                        {entry.username}
                        {entry.userId === user?.id ? " (you)" : ""}
                      </span>
                      <span className="leaderboard-wins">
                        {entry.wins} {entry.wins === 1 ? "win" : "wins"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {tab === "shop" && (
            <>
              <p className="hint">
                Earn 10 coins per win. You have <strong>🪙 {shop.coins}</strong>.
              </p>
              <div className="shop-grid">
                {SHOP_COLORS.map((item) => {
                  const owned = shop.owned.includes(item.id);
                  const canAfford = shop.coins >= item.price;
                  return (
                    <div className="shop-card" key={item.id}>
                      <div className="shop-swatch" style={{ backgroundColor: item.color }} />
                      <h3>{item.label}</h3>
                      {owned ? (
                        <span className="waiting-text">Owned</span>
                      ) : (
                        <button
                          className="primary-btn"
                          onClick={() => purchaseCosmetic(item.id)}
                          disabled={!canAfford}
                          type="button"
                        >
                          🪙 {item.price}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
