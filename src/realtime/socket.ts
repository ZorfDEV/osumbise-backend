import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { Role } from '@prisma/client';

interface SocketUser {
  id: string;
  organizationId: string;
  establishmentId: string | null;
  role: Role;
}

let io: SocketIOServer | undefined;

const extractToken = (socket: Socket): string | undefined => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    const cookies = cookie.parse(cookieHeader);
    if (cookies.token) return cookies.token;
  }
  // Repli pour les clients sans cookie de navigateur (ex. future app mobile
  // React Native) : token passé explicitement à la connexion
  return socket.handshake.auth?.token as string | undefined;
};

export const initSocket = (httpServer: HttpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error('Non authentifié'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as SocketUser;
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error('Session invalide'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;

    // Limite connue : un OWNER (sans établissement fixe) ne rejoint aucune
    // salle pour l'instant, donc ne reçoit pas ces événements en direct —
    // un vrai sélecteur "établissement actif" (déjà évoqué pour le POS)
    // réglerait aussi ce cas.
    if (user.establishmentId) {
      socket.join(`establishment:${user.establishmentId}`);
    }
  });
};

export const emitToEstablishment = (
  establishmentId: string,
  event: string,
  payload: unknown
) => {
  io?.to(`establishment:${establishmentId}`).emit(event, payload);
};
