import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routePath = new URL('../../apps/frontend/app/(panel)/settings/page.jsx', import.meta.url);
const navigationPath = new URL('../../apps/frontend/features/panel-shell/panel-shell.jsx', import.meta.url);

describe('Next account settings route registration', () => {
  it('registers the settings page at the route linked from the panel navigation', () => {
    expect(existsSync(routePath)).toBe(true);
    const route = readFileSync(routePath, 'utf8');
    const navigation = readFileSync(navigationPath, 'utf8');
    expect(route).toContain('activePage="settings"');
    expect(route).toContain('AccountSettingsPageContent');
    expect(navigation).toContain("['settings', 'panel.navigation.settings', true, '/settings/']");
  });
});
