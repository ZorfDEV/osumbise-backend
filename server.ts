import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './src/app';
import { prisma } from './src/config/prisma';
import { initSocket } from './src/realtime/socket';

const PORT = process.env.PORT || 5000;

// Un serveur HTTP explicite est nécessaire pour que Socket.IO puisse s'y
// attacher — app.listen() seul ne suffit plus une fois le temps réel ajouté
const httpServer = http.createServer(app);
initSocket(httpServer);

async function start() {
  try {
    await prisma.$connect();
    console.log('Connecté à PostgreSQL via Prisma');

    httpServer.listen(PORT, () => {
      console.log(`Serveur démarré sur le port ${PORT} (HTTP + WebSocket)`);
    });
  } catch (error) {
    console.error('Erreur de connexion à la base de données :', error);
    process.exit(1);
  }
}

start();

process.on('unhandledRejection', (err: Error) => {
  console.error(`Erreur non gérée : ${err.message}`);
  process.exit(1);
});
