import { describe, expect, it } from 'vitest';

import { app } from '../src/app.js';

describe('app', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/__missing__');
    expect(res.status).toBe(404);
  });
});
