import { describe, expect, it } from 'vitest';
import { decideRetry } from '../src/services/retry-policy.js';

describe('decideRetry', () => {
  it('does not retry permission failures', () => {
    expect(decideRetry('permission', 1)).toMatchObject({ retry: false, nextState: 'needs_action' });
  });
  it('limits transient retries', () => {
    expect(decideRetry('unavailable', 1).retry).toBe(true);
    expect(decideRetry('unavailable', 2)).toMatchObject({ retry: false, nextState: 'needs_action' });
  });
  it('opens rate limit breaker after three attempts', () => {
    expect(decideRetry('rate_limit', 2).retry).toBe(true);
    expect(decideRetry('rate_limit', 3).retry).toBe(false);
  });
});

