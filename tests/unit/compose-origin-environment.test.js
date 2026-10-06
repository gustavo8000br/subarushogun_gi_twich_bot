import { describe, expect, it } from 'vitest';
import { composeEnvironmentForOrigin } from '../helpers/compose-origin-environment.mjs';

describe('Compose test environment', () => {
  it('uses the application origin port when restarting the isolated stack', () => {
    expect(composeEnvironmentForOrigin('https://localhost:3437', { NODE_ENV: 'test' })).toEqual({ NODE_ENV: 'test', APP_PORT: '3437' });
  });

  it('uses the application default port when the origin omits a port', () => {
    expect(composeEnvironmentForOrigin('https://localhost', {})).toEqual({ APP_PORT: '3000' });
  });
});
