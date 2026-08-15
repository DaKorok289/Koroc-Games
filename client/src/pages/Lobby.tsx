import { useState } from "react";
import { GAME_INFO, GAME_TYPES } from "@koroc/shared";
import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";
import { ColorPicker } from "../components/ColorPicker";

export function Lobby() {
  const { user, logout } = useAuth();
  const { users, events, startEvent, joinEvent, errorMessage } = useGame();
  const [tab, setTab] = useState<"join" | "minigames">("join");

  return (
    <div className="lobby-screen">
      <header className="lobby-header">
        <h1 className="brand">🎮 Koroc Games</h1>
        <div className="who-am-i">
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
                        <p>started by {event.startedBy}</p>
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
        </section>
      </main>
    </div>
  );
}
