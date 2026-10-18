import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance: Database.Database | null = null;

export function getDbPath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const bundledPath = path.resolve(process.cwd(), 'QRBase.db');

  if (isServerless) {
    // Vercel / Lambda bundle is read-only.
    // Use /tmp which is the designated writable directory on AWS Lambda / Vercel.
    const tmpPath = path.join('/tmp', 'QRBase.db');
    if (!fs.existsSync(tmpPath)) {
      try {
        if (fs.existsSync(bundledPath)) {
          fs.copyFileSync(bundledPath, tmpPath);
        }
      } catch (err) {
        console.error('Error copying QRBase.db to /tmp:', err);
      }
    }
    return tmpPath;
  }

  return bundledPath;
}

export function getMessagesPath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const bundledPath = path.resolve(process.cwd(), 'messages.json');

  if (isServerless) {
    const tmpPath = path.join('/tmp', 'messages.json');
    if (!fs.existsSync(tmpPath)) {
      try {
        if (fs.existsSync(bundledPath)) {
          fs.copyFileSync(bundledPath, tmpPath);
        } else {
          fs.writeFileSync(tmpPath, '[]', 'utf-8');
        }
      } catch (err) {
        console.error('Error copying messages.json to /tmp:', err);
      }
    }
    return tmpPath;
  }

  return bundledPath;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = getDbPath();
    dbInstance = new Database(dbPath, {
      fileMustExist: false,
      timeout: 5000,
    });

    try {
      dbInstance.pragma('journal_mode = WAL');
      dbInstance.pragma('foreign_keys = ON');
    } catch {}
  }
  return dbInstance;
}

export default getDb;
