import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

export function AuthPage() {
  const { login, register, error } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const fn = mode === "login" ? login : register;
    await fn(username.trim(), password);
    setSubmitting(false);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="brand">🎮 Korok Games</h1>
        <p className="subtitle">Sign in and jump into the lobby.</p>

        <div className="tabs">
          <button className={mode === "login" ? "tab active" : "tab"} onClick={() => setMode("login")} type="button">
            Sign In
          </button>
          <button
            className={mode === "register" ? "tab active" : "tab"}
            onClick={() => setMode("register")}
            type="button"
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={20}
              required
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {mode === "register" && (
          <p className="hint">First account created on this server automatically becomes admin.</p>
        )}
      </div>
    </div>
  );
}
