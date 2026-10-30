import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const app = await readFile(new URL('../../apps/web/app.js', import.meta.url), 'utf8');

describe('vanilla panel Twitch fulfillment feedback', () => {
  it('shows pending only after the local service-start transition requested fulfillment', () => {
    expect(app).toContain('let acceptedFulfillmentTransition = false;');
    expect(app).toContain("acceptedFulfillmentTransition = transitionResult?.financialDecision === 'request_fulfill';");
    expect(app).toContain("if (transitionResult?.financialDecision === 'request_fulfill') toast(panelText('panel.queue.entry_action_result.fulfillment_pending'), 'warning');");
  });

  it('preserves a distinct warning if the accepted transition refresh fails', () => {
    expect(app).toContain("if (acceptedFulfillmentTransition) toast(panelText('panel.queue.entry_action_result.fulfillment_refresh_failed'), 'warning');");
    expect(app).toContain("else toast(panelError(error), 'error');");
  });
});
