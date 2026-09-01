// File: backup.js
import { exec } from "child_process";
import path from "path";

// Nom de la base
const dbName = "fiberdb";

// Dossier de sortie (backup + date)
const backupDir = path.join(
  process.cwd(),
  "backup",
  `${dbName}_${new Date().toISOString().replace(/[:.]/g, "-")}`
);

// Commande mongodump
//const command = `mongodump --db=${dbName} --out="${backupDir}"`;
const command = `mongodump --db=${dbName} --username admin --password ChangeMe2024! --authenticationDatabase admin --out="${backupDir}"`

// Exécution
exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Erreur lors du dump: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`⚠️ Avertissement: ${stderr}`);
    return;
  }
  console.log(`✅ Sauvegarde réussie dans: ${backupDir}`);
});



