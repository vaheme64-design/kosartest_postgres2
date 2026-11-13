import net from 'node:net';
import { PrismaClient } from '@prisma/client';

/**
 * KPIMS Database Connection Configuration
 * Singleton Prisma Client with lazy connection & reachability checks
 */

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __kpimsDbReachable: boolean | null | undefined;
}

const DEFAULT_FALLBACK_PG_URL = 'postgresql://postgres:postgres@localhost:5432/kpims_db?schema=public';

const normalizePgUrl = (raw?: string): string => {
  if (!raw) return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
};

export const isDatabaseUrlSyntaxValid = (): boolean => {
  const rawUrl = normalizePgUrl(process.env.DATABASE_URL);
  if (!rawUrl || rawUrl === DEFAULT_FALLBACK_PG_URL) return false;
  try {
    const parsed = new URL(rawUrl);
    return (
      (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') &&
      Boolean(parsed.hostname) &&
      parsed.pathname.length > 1 &&
      parsed.hostname.toLowerCase() !== 'your_host' &&
      parsed.username.toLowerCase() !== 'your_user' &&
      parsed.pathname.slice(1).toLowerCase() !== 'your_database'
    );
  } catch {
    return false;
  }
};

export const isDatabaseUrlConfigured = (): boolean => {
  if (global.__kpimsDbReachable === false) return false;
  return isDatabaseUrlSyntaxValid();
};

export async function probeDatabaseConnectivity(timeoutMs = 1000): Promise<boolean> {
  if (!isDatabaseUrlSyntaxValid()) {
    global.__kpimsDbReachable = false;
    return false;
  }
  const rawUrl = normalizePgUrl(process.env.DATABASE_URL);
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname;
    const port = Number(parsed.port || 5432);
    const tcpOk = await new Promise<boolean>(resolve => {
      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });
    });
    if (!tcpOk) {
      global.__kpimsDbReachable = false;
      return false;
    }
    const prisma = getPrismaClient();
    await Promise.race([
      prisma.$queryRaw`SELECT 1 as ok`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB probe timeout')), timeoutMs + 500)),
    ]);
    global.__kpimsDbReachable = true;
    return true;
  } catch {
    global.__kpimsDbReachable = false;
    return false;
  }
}

export const resolveDatabaseUrl = (): string => {
  const rawUrl = normalizePgUrl(process.env.DATABASE_URL);
  if (isDatabaseUrlSyntaxValid()) {
    process.env.DATABASE_URL = rawUrl;
    return rawUrl;
  }
  // Supply a syntactically valid PostgreSQL URL only when needed for Prisma Client schema initialization
  // without polluting isDatabaseUrlConfigured()
  return DEFAULT_FALLBACK_PG_URL;
};

export const getPrismaClient = (): PrismaClient => {
  if (!global.__prismaClient) {
    const dbUrl = resolveDatabaseUrl();

    const client = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Intercept Prisma connection events to gracefully handle socket closures
    (client as any).$on('error', (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('Closed') || msg.includes('kind: Closed')) {
        try {
          client.$disconnect().catch(() => {});
        } catch {}
        global.__prismaClient = undefined;
      } else {
        console.warn('[Prisma Notice]:', msg || e);
      }
    });

    global.__prismaClient = client;
  }
  return global.__prismaClient;
};

export interface DatabaseStatus {
  isConfigured: boolean;
  isConnected: boolean;
  databaseType: 'SQLite' | 'PostgreSQL';
  databaseUrlMasked: string;
  errorMessage?: string;
  lastChecked: string;
}

/**
 * Health check & diagnostic utility for the Database connection
 */
export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  const rawUrl = resolveDatabaseUrl();
  const maskedUrl = rawUrl.replace(/:([^@]+)@/, ':****@');
  const dbType: 'SQLite' | 'PostgreSQL' =
    rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://') ? 'PostgreSQL' : 'SQLite';

  try {
    const prisma = getPrismaClient();
    await Promise.race([
      prisma.$queryRaw`SELECT 1 as connected`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('اتصال به دیتابیس منقضی شد (Timeout)')), 3500)
      ),
    ]);
    return {
      isConfigured: true,
      isConnected: true,
      databaseType: dbType,
      databaseUrlMasked: maskedUrl,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    try {
      await global.__prismaClient?.$disconnect().catch(() => {});
    } catch {}
    global.__prismaClient = undefined;

    const errorMsg = error instanceof Error ? error.message : 'خطای نامشخص در اتصال به دیتابیس';
    return {
      isConfigured: true,
      isConnected: false,
      databaseType: dbType,
      databaseUrlMasked: maskedUrl,
      errorMessage: errorMsg,
      lastChecked: new Date().toISOString(),
    };
  }
}
