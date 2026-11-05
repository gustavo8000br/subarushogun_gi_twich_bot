import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routePath = new URL('../../apps/frontend/app/(panel)/commands/page.jsx', import.meta.url);
const navigationPath = new URL('../../apps/frontend/features/panel-shell/panel-shell.jsx', import.meta.url);

describe('Next command permissions route registration', () => {
  it('registers the command page at the URL enabled in panel navigation', () => {
    expect(existsSync(routePath)).toBe(true);
    const route = readFileSync(routePath, 'utf8');
    const navigation = readFileSync(navigationPath, 'utf8');
    expect(route).toContain('activePage="commands"');
    expect(route).toContain('CommandPermissionsPageContent');
    expect(navigation).toContain("['commands', 'panel.navigation.commands', true, '/commands/']");
  });
});
