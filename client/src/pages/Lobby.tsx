import { GAME_INFO, GAME_TYPES } from "@korok/shared";
import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";

export function Lobby() {
  const { user, logout } = useAuth();
  const { users, startEvent, errorMessage } = useGame();

  return (
    <div className="lobby-screen">
      <header className="lobby-header">
        <h1 className="brand">🎮 Korok Games</h1>
        <div className="who-am-i">
          <span>
            {user?.username}
            {user?.isAdmin && <span className="badge">admin</span>}
          </span>
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
          <h2>Minigames</h2>
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
                    <span className="waiting-text">Waiting for admin…</span>
                  )}
                </div>
              );
            })}
          </div>
          {!user?.isAdmin && <p className="hint">Only admins can start an event. Ask an admin to kick one off!</p>}
        </section>
      </main>
    </div>
  );
}
