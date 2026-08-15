import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { SERVER_URL } from "../config";
import { useAuth } from "./AuthContext";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      return;
    }
    // Empty SERVER_URL means "same origin" — socket.io-client wants undefined for that, not "".
    const s = io(SERVER_URL || undefined, { withCredentials: true });
    socketRef.current = s;
    setSocket(s);
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}
