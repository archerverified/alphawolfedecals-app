import { Redis } from 'ioredis';

let connection: Redis | undefined;

/**
 * Lazy Redis connection used by BullMQ queues + workers.
 * Reads UPSTASH_REDIS_URL from the environment. The URL must include
 * the password (Upstash provides rediss://default:<token>@host:port).
 */
export function getRedisConnection(): Redis {
  if (connection) return connection;

  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) {
    throw new Error('UPSTASH_REDIS_URL is not set. Add it to .env.local — see /.env.example.');
  }

  connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return connection;
}
