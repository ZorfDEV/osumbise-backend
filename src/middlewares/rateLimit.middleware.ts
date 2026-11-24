import { Request } from 'express';
import { ipKeyGenerator, rateLimit, Options } from 'express-rate-limit';

// En production, l'API est derrière Cloudflare puis le proxy de Render : req.ip
// y serait l'adresse de Cloudflare, commune à de nombreux utilisateurs.
// Cloudflare fournit (et écrase si le client l'envoie) l'adresse réelle.
const clientIp = (req: Request): string => {
  const cloudflareIp = process.env.NODE_ENV === 'production' ? req.header('cf-connecting-ip') : undefined;
  return ipKeyGenerator(cloudflareIp || req.ip || 'inconnue');
};

// Compteurs en mémoire : remis à zéro à chaque redémarrage, suffisant tant que
// l'API tourne sur une seule instance
const limiter = (name: string, options: Partial<Options> & { message: string }) => {
  const { message, ...rest } = options;
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn(`[limite] ${name} bloqué pour ${clientIp(req)}`);
      res.status(429).json({ message });
    },
    ...rest,
  });
};

const QUARTER_HOUR = 15 * 60 * 1000;
const TOO_MANY_LOGINS = 'Trop de tentatives de connexion. Réessayez dans 15 minutes.';

// Connexion : seuls les échecs comptent. Une limite par compte ET par adresse
// (les employés d'un établissement partagent la même adresse : l'un ne doit pas
// bloquer les autres), plus une limite large par adresse, contre les essais sur
// de nombreux comptes. À monter après `validate` (e-mail vérifié).
export const loginLimiters = [
  limiter('connexion (adresse)', {
    windowMs: QUARTER_HOUR,
    limit: 60,
    skipSuccessfulRequests: true,
    keyGenerator: clientIp,
    message: TOO_MANY_LOGINS,
  }),
  limiter('connexion (compte)', {
    windowMs: QUARTER_HOUR,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${clientIp(req)}|${String(req.body.email).trim().toLowerCase()}`,
    message: TOO_MANY_LOGINS,
  }),
];

// Inscription : création d'organisations en masse
export const registerLimiter = limiter('inscription', {
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: clientIp,
  message: 'Trop d’inscriptions depuis cette connexion. Réessayez dans une heure.',
});

// Mot de passe actuel redemandé (changement de mot de passe ou d'e-mail) : une
// session volée ne doit pas permettre de l'essayer sans fin. À monter après
// `protect`.
export const passwordCheckLimiter = limiter('mot de passe actuel', {
  windowMs: QUARTER_HOUR,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user!.id,
  message: 'Trop de tentatives. Réessayez dans 15 minutes.',
});
