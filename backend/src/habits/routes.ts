import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/requireAuth.js';
import { loadData, PreconditionFailedError, withData } from '../graph/appFolderStore.js';
import { isValidIsoDate, todayIso } from '../util/dates.js';
import { NotFoundError, ValidationError } from './errors.js';
import { addHabit, deleteHabit, updateHabit } from './model.js';

function mapWriteError(err: unknown): { status: number; body: { error: string } } | null {
  if (err instanceof ValidationError) {
    return { status: 400, body: { error: err.message } };
  }
  if (err instanceof NotFoundError) {
    return { status: 404, body: { error: err.message } };
  }
  if (err instanceof PreconditionFailedError) {
    return { status: 409, body: { error: 'conflict: data changed concurrently, please retry' } };
  }
  return null;
}

export async function habitsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/habits', async (request) => {
    const { data } = await loadData(request.graphAccessToken);
    return data.habits;
  });

  app.post<{ Body: { name?: string; colorId?: string; createdAt?: string } }>(
    '/api/habits',
    async (request, reply) => {
      const { name, colorId, createdAt } = request.body ?? {};
      if (!name || !colorId) {
        return reply.code(400).send({ error: 'name and colorId are required' });
      }
      // Prefer the client's local "today" (matters for correct day-filtering later, see
      // /api/day and /api/weekly) — fall back to server UTC only if the client omitted it.
      const effectiveCreatedAt = createdAt && isValidIsoDate(createdAt) ? createdAt : todayIso();
      try {
        const habit = await withData(request.graphAccessToken, (data) => {
          const result = addHabit(data, name, colorId, effectiveCreatedAt);
          return { data: result.data, result: result.habit };
        });
        return reply.code(201).send(habit);
      } catch (err) {
        const mapped = mapWriteError(err);
        if (mapped) return reply.code(mapped.status).send(mapped.body);
        throw err;
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: { name?: string; colorId?: string } }>(
    '/api/habits/:id',
    async (request, reply) => {
      try {
        const habit = await withData(request.graphAccessToken, (data) => {
          const result = updateHabit(data, request.params.id, request.body ?? {});
          return { data: result.data, result: result.habit };
        });
        return habit;
      } catch (err) {
        const mapped = mapWriteError(err);
        if (mapped) return reply.code(mapped.status).send(mapped.body);
        throw err;
      }
    }
  );

  app.delete<{ Params: { id: string } }>('/api/habits/:id', async (request, reply) => {
    try {
      await withData(request.graphAccessToken, (data) => {
        const result = deleteHabit(data, request.params.id);
        return { data: result.data, result: undefined };
      });
      return reply.code(204).send();
    } catch (err) {
      const mapped = mapWriteError(err);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
  });
}
