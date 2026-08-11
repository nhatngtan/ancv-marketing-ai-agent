import { describe, expect, it } from 'vitest';
import { accountProfilePath, pathInsideDataRoot, validateAccountId } from '../src/config.js';
import { chromeAutomationArgs, chromeLoginArgs } from '../src/chrome.js';
import { flowProjectBaseUrl } from '../src/flow-ui.js';

describe('Flow Worker profile isolation', () => {
  it('maps every account to a distinct persistent profile', () => {
    expect(accountProfilePath('account-01')).not.toBe(accountProfilePath('account-02'));
    expect(accountProfilePath('account-01')).toContain('flow-worker-data');
  });
  it('rejects traversal and unsafe account ids', () => {
    expect(() => validateAccountId('../main-profile')).toThrow('FLOW_ACCOUNT_ID_INVALID');
    expect(() => pathInsideDataRoot('..', 'outside')).toThrow('FLOW_PATH_OUTSIDE_DATA_ROOT');
  });
  it('keeps manual login free of automation and binds CDP to localhost later', () => {
    expect(chromeLoginArgs('account-01').some((argument) => argument.includes('remote-debugging'))).toBe(false);
    expect(chromeAutomationArgs('account-01')).toContain('--remote-debugging-address=127.0.0.1');
    expect(chromeAutomationArgs('account-01')).toContain('--remote-debugging-port=0');
  });
  it('normalizes media detail URLs back to the official Flow project', () => {
    expect(flowProjectBaseUrl('https://labs.google/fx/vi/tools/flow/project/project-1/edit/media-1'))
      .toBe('https://labs.google/fx/vi/tools/flow/project/project-1');
    expect(flowProjectBaseUrl('https://example.com/fx/vi/tools/flow/project/project-1')).toBe('');
  });
});
