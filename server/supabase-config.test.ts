import { describe, expect, it } from 'vitest';

describe('Avenmedia Supabase configuration', () => {
  it('reaches the configured Supabase auth settings endpoint', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      expect(url).toBeUndefined();
      return;
    }
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    expect(response.ok).toBe(true);
  }, 15000);
});
