import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

// Dossier racine des fichiers envoyés. En production, UPLOADS_DIR doit pointer
// vers un disque persistant (ex. /var/data/uploads sur Render) : le disque
// du conteneur est effacé à chaque déploiement.
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
export const PRODUCT_IMAGES_DIR = path.join(UPLOADS_DIR, 'products');
export const ESTABLISHMENT_LOGOS_DIR = path.join(UPLOADS_DIR, 'establishments');
fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });
fs.mkdirSync(ESTABLISHMENT_LOGOS_DIR, { recursive: true });

const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1 Mo

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(new Error('Format d’image non supporté (png ou jpg uniquement)'));
    return;
  }
  cb(null, true);
};

// Middleware d'envoi d'une image (champ "image") vers le dossier donné
const createImageUpload = (destinationDir: string) => {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, destinationDir),
      filename: (_req, file, cb) => {
        // On ignore l'extension fournie par le client : seul le mimetype, déjà
        // vérifié par fileFilter, sert à déterminer l'extension du fichier stocké
        const ext = ALLOWED_MIME_TYPES[file.mimetype] ?? '';
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    fileFilter,
    limits: { fileSize: MAX_IMAGE_SIZE },
  }).single('image');

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'L’image ne doit pas dépasser 1 Mo' });
      }
      if (err) {
        const message = err instanceof Error ? err.message : 'Fichier invalide';
        return res.status(400).json({ message });
      }
      next();
    });
  };
};

export const uploadProductImage = createImageUpload(PRODUCT_IMAGES_DIR);
export const uploadEstablishmentLogo = createImageUpload(ESTABLISHMENT_LOGOS_DIR);
