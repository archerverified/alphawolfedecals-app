import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.js';

/**
 * Queue names are the single source of truth. Workers in services/* subscribe
 * to these names; producers (apps/api routes) enqueue jobs onto them.
 *
 * Step 5 fills in payload schemas and worker stacks. For now the queues are
 * declared so that wiring is in place and integration smoke tests can run.
 */
export const QUEUE_NAMES = {
  parse: 'parse',
  ai: 'ai',
  paneling: 'paneling',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

let queues: Record<QueueName, Queue> | undefined;

export function getQueues(): Record<QueueName, Queue> {
  if (queues) return queues;
  const connection = getRedisConnection();
  queues = {
    [QUEUE_NAMES.parse]: new Queue(QUEUE_NAMES.parse, { connection }),
    [QUEUE_NAMES.ai]: new Queue(QUEUE_NAMES.ai, { connection }),
    [QUEUE_NAMES.paneling]: new Queue(QUEUE_NAMES.paneling, { connection }),
  };
  return queues;
}
