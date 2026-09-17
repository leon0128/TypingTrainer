import { describe, expect, it } from 'vitest';

import { HealthService, type DatabaseProbe } from '../src/modules/health/health.service';

function service(probe: Partial<DatabaseProbe>): HealthService {
  const database: DatabaseProbe = {
    query: () => Promise.resolve([{ '?column?': 1 }] as never),
    showMigrations: () => Promise.resolve(false),
    ...probe,
  };
  return new HealthService(database);
}

describe('HealthService.ready', () => {
  it('is ok when the database answers and no migration is pending', async () => {
    expect(await service({}).ready()).toEqual({
      status: 'ok',
      checks: [
        { name: 'database', ok: true },
        { name: 'migrations', ok: true },
      ],
    });
  });

  it('reports pending migrations', async () => {
    const report = await service({ showMigrations: () => Promise.resolve(true) }).ready();
    expect(report.status).toBe('unavailable');
    expect(report.checks).toContainEqual({ name: 'migrations', ok: false, detail: 'pending' });
  });

  it('hides the database error behind a fixed detail', async () => {
    const report = await service({
      query: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    }).ready();
    expect(report.status).toBe('unavailable');
    expect(report.checks[0]).toEqual({ name: 'database', ok: false, detail: 'unreachable' });
    expect(JSON.stringify(report)).not.toContain('10.0.0.5');
  });

  it('fails a check that does not settle within the timeout', async () => {
    const report = await service({ query: () => new Promise(() => undefined) }).ready(20);
    expect(report.checks[0]).toEqual({ name: 'database', ok: false, detail: 'unreachable' });
  });
});
