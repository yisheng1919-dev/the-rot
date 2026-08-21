import { io } from "socket.io-client";

// Point this at your deployed server. During local dev, Vite runs on 5173
// and the server on 4000, so we default to that.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
