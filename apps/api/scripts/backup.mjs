import { cpSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';

const sourceDb = resolve(process.env.DATABASE_PATH ?? 'data/app.sqlite');
const sourceImages = resolve(process.env.CAPTURE_STORAGE_PATH ?? 'private/captures');
const backupRoot = resolve(process.env.BACKUP_DIR ?? '../../backups/api');
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const destination = join(backupRoot, timestamp);
const backupDb = join(destination, 'app.sqlite');
mkdirSync(dirname(backupDb), { recursive: true });

const database = new DatabaseSync(sourceDb);
const escapedPath = backupDb.replaceAll("'", "''");
database.exec(`VACUUM INTO '${escapedPath}'`);
database.close();
cpSync(sourceImages, join(destination, 'captures'), { recursive: true });
console.log(`Backup created at ${destination}`);
