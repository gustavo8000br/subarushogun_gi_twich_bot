import assert from 'node:assert/strict';
import { boundary, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// E4 (flow-and-chat-review.md): /commands edit + save sends the version-bound PATCH; a 409 stale response keeps the
// operator's edit visible, offers the reload, and the reload shows the fresh catalog.
const policy = (minimumRole, kind = 'fixed') => ({ kind, minimumRole });
const command = (key, access) => ({ key, scope: key.startsWith('global') ? 'global' : 'queue', syntax: `!${key}`, description: key, access, policy: access, configurable: access.kind === 'configurable' });
const catalogAt = (version, listaRole) => ({
  schemaVersion: 3, version, followerScopeReady: true,
  configurableRoles: ['everyone', 'follower', 'subscriber', 'vip', 'moderator'],
  commands: [command('queue:lista', policy(listaRole, 'configurable')), command('queue:entrar', policy('everyone', 'configurable')), command('queue:atender', policy('moderator'))],
});
let serverCatalog = catalogAt(1, 'follower');
let patchMode = 'ok';
const harness = await openPanel({
  handlers: {
    'GET /api/command-catalog': () => json(serverCatalog),
    'PATCH /api/command-policies': (call) => {
      if (patchMode === 'stale') {
        serverCatalog = catalogAt(3, 'moderator');
        return json({ code: 'COMMAND_POLICY_VERSION_CONFLICT', error: 'private server copy' }, 409);
      }
      return json({ version: call.body.expectedVersion + 1, policies: Object.fromEntries(Object.entries(call.body.policies).map(([key, value]) => [key, { kind: 'configurable', minimumRole: value.minimumRole }])) });
    },
  },
});
const { page, catalog } = harness;
const select = (key) => page.locator(`#threshold-${key.replace(':', '-')}`);

try {
  await harness.goto('/commands/');
  await select('queue:lista').waitFor({ timeout: 15_000 });
  assert.equal(await select('queue:lista').inputValue(), 'follower');
  assert.equal(await page.getByRole('button', { name: catalog['panel.commands.save'] }).isDisabled(), true, 'nothing to save before an edit');

  await select('queue:lista').selectOption('moderator');
  await page.getByRole('button', { name: catalog['panel.commands.save'] }).click();
  await page.getByText(catalog['panel.commands.saved']).waitFor({ timeout: 15_000 });
  const saves = harness.callsTo('PATCH /api/command-policies');
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0].body, { expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'moderator' } } }, 'only the changed policy, bound to the loaded version');
  assert.equal(saves[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.equal(await select('queue:lista').inputValue(), 'moderator');
  await page.getByText(catalog['panel.commands.revision'].replace('{version}', '2')).waitFor();

  // Stale version: the edit survives, the conflict is localized, and the reload fetches the fresh catalog.
  patchMode = 'stale';
  await select('queue:entrar').selectOption('vip');
  await page.getByRole('button', { name: catalog['panel.commands.save'] }).click();
  const conflict = page.getByRole('alert').filter({ hasText: catalog['panel.command.conflict'] });
  await conflict.waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await conflict.textContent(), /private server copy/);
  assert.equal(await select('queue:entrar').inputValue(), 'vip', 'the operator edit is not lost on conflict');
  assert.equal(harness.callsTo('PATCH /api/command-policies')[1].body.expectedVersion, 2);

  await page.getByRole('button', { name: catalog['panel.command.reload'] }).click();
  await page.getByText(catalog['panel.commands.revision'].replace('{version}', '3')).waitFor({ timeout: 15_000 });
  assert.equal(await select('queue:entrar').inputValue(), 'everyone', 'reload shows the server state');
  assert.equal(await select('queue:lista').inputValue(), 'moderator');
  assert.equal(await page.getByText(catalog['panel.command.conflict']).count(), 0, 'the conflict notice is cleared by the reload');

  console.log('PASS E4 commands browser-only: version-bound PATCH with only the changed policy and CSRF, 409 keeps the edit and shows the localized conflict, reload shows the fresh catalog.');
  boundary('E4', 'Whether the stored policy really changes who can run chat commands is proved only by unit/API tests, not here.');
} finally {
  await harness.close();
}
