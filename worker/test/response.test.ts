import { describe, it, expect } from 'vitest';
import { ok, fail, json } from '../src/lib/response';

describe('response envelope ({code,data,message})', () => {
  it('ok wraps data with code 0 / message ok', () => {
    expect(ok(123)).toEqual({ code: 0, data: 123, message: 'ok' });
    expect(ok({ a: 1 }, 'done')).toEqual({ code: 0, data: { a: 1 }, message: 'done' });
    expect(ok(null)).toEqual({ code: 0, data: null, message: 'ok' });
  });

  it('fail builds an error envelope with null data by default', () => {
    expect(fail(422, 'bad')).toEqual({ code: 422, data: null, message: 'bad' });
    expect(fail(409, 'dup', { id: 1 })).toEqual({ code: 409, data: { id: 1 }, message: 'dup' });
  });

  it('json serializes the envelope into a Response with json content-type', async () => {
    const r = json(ok({ x: 1 }));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(await r.json()).toEqual({ code: 0, data: { x: 1 }, message: 'ok' });
  });

  it('json respects a custom status code', async () => {
    const r = json(fail(404, 'nf'), 404);
    expect(r.status).toBe(404);
  });
});
