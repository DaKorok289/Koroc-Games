import { useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { GameProvider, useGame } from "./context/GameContext";
import { AuthPage } from "./pages/AuthPage";
import { Lobby } from "./pages/Lobby";
import { GameRouter } from "./pages/GameRouter";

function AuthedApp() {
  const { myEventId } = useGame();
  return myEventId ? <GameRouter /> : <Lobby />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <SocketProvider>
      <GameProvider>
        <AuthedApp />
      </GameProvider>
    </SocketProvider>
  );
}
