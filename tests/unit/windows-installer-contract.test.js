import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

// C1 / LA-25: contract tests for the Windows `.bat` installer (embedded installer.ps1). They run on any OS because they
// only inspect the packaged artifact; the real Windows run is the owner's (docs/guides/windows-validation-kit.md).
const root = fileURLToPath(new URL('../../', import.meta.url));
const packager = join(root, 'apps/infra/scripts/package-installer.mjs');
const IMAGE_TAG = 'v1.0.0-a1b2c3d-beta';

let output;
let bat;
let script;
let rawScript;

const decodePayload = (artifact) => Buffer.from(
  artifact.match(/:payload\r?\n([\s\S]*?)\r?\n:endpayload/)?.[1]?.replace(/\s/g, '') ?? '', 'base64',
).toString('utf16le');

/** Returns the text between two literal anchors, failing loudly so a mutated or renamed anchor cannot pass silently. */
const between = (text, startAnchor, endAnchor) => {
  const start = text.indexOf(startAnchor);
  expect(start, `anchor not found: ${startAnchor}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf(endAnchor, start + startAnchor.length);
  expect(end, `anchor not found: ${endAnchor}`).toBeGreaterThan(start);
  return text.slice(start, end);
};

const copyKeys = (locale) => {
  const block = between(script, locale === 'pt-BR' ? "  'pt-BR' = @{" : `  ${locale} = @{`, '\n  }\n');
  return [...block.matchAll(/(?:^|\s|;)([A-Za-z]+)=(?:'|")/g)].map((match) => match[1]).sort();
};

beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), 'queuebot-windows-contract-'));
  const result = spawnSync(process.execPath, [
    packager, '--platform', 'windows', '--output', output, '--image-tag', IMAGE_TAG, '--product-version', IMAGE_TAG,
  ], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  bat = await readFile(join(output, 'subarushogun_twich_bot_setup.bat'), 'latin1');
  script = decodePayload(bat).replace(/\r\n/g, '\n');
  rawScript = decodePayload(bat);
});

afterAll(async () => {
  if (output) await rm(output, { recursive: true, force: true });
});

describe('Windows .bat artifact container', () => {
  it('is pure ASCII, has no BOM and uses CRLF on every line so cmd.exe parses it on any code page', () => {
    expect(bat.charCodeAt(0)).not.toBe(0xfeff);
    expect([...bat].every((char) => { const code = char.charCodeAt(0); return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126); })).toBe(true);
    expect(bat.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(bat.startsWith('@echo off\r\nsetlocal\r\ngoto :run\r\n')).toBe(true);
    expect(bat.endsWith('exit /b %errorlevel%\r\n')).toBe(true);
  });

  it('jumps over the payload before cmd.exe can read it and keeps base64 lines short', () => {
    const lines = bat.split('\r\n');
    const goto = lines.indexOf('goto :run');
    const payload = lines.indexOf(':payload');
    const endPayload = lines.indexOf(':endpayload');
    expect(goto).toBeGreaterThan(-1);
    expect(payload).toBeGreaterThan(goto);
    expect(endPayload).toBeGreaterThan(payload + 1);
    expect(lines.indexOf(':run')).toBeGreaterThan(endPayload);
    for (const line of lines.slice(payload + 1, endPayload)) expect(line).toMatch(/^[A-Za-z0-9+/=]{1,76}$/);
  });

  it('launches PowerShell on its own file, forwards the arguments and propagates the exit code', () => {
    const launch = bat.split('\r\n').find((line) => line.startsWith('powershell.exe'));
    expect(launch).toBeDefined();
    expect(launch.length).toBeLessThan(8191);
    expect(launch).toContain('-NoProfile');
    expect(launch).toContain('ReadAllText($env:QUEUEBOT_SELF)');
    expect(bat).toContain('set "QUEUEBOT_SELF=%~f0"');
    expect(launch).toContain('exit $LASTEXITCODE');
    expect(bat).toContain('set "QUEUEBOT_INSTALLER_ARGS=%*"');
    expect(bat.indexOf('set "QUEUEBOT_INSTALLER_ARGS=%*"')).toBeLessThan(bat.indexOf('powershell.exe'));
  });

  it('keeps the PowerShell source on CRLF so the embedded copy matches the repository policy', () => {
    expect(rawScript).toMatch(/\r\n/);
    expect(rawScript.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('keeps accents in the decoded script (UTF-16 payload) while the file itself stays ASCII', () => {
    expect(script).toContain('Versão do instalador');
    expect(script).toContain('Versión del instalador');
    expect(bat).not.toContain('Versão');
  });

  it('has no unresolved placeholders and embeds the exact version and image tag', () => {
    for (const placeholder of ['__COMPOSE_B64__', '__IMAGE_TAG__', '__PRODUCT_VERSION__']) expect(script).not.toContain(placeholder);
    expect(script).toContain(`$ReleaseImageTag = '${IMAGE_TAG}'`);
    expect(script).toContain(`$InstallerVersion = '${IMAGE_TAG}'`);
  });

  it('has no hard-coded user, checkout or machine paths', () => {
    const forbidden = [root.replace(/\/$/, ''), '/home/', 'C:\\Users', 'C:/Users', '/Users/', 'gustavo\\', 'D:\\'];
    for (const fragment of forbidden) {
      expect(bat).not.toContain(fragment);
      expect(script).not.toContain(fragment);
    }
    expect(script).toContain("Join-Path $env:LOCALAPPDATA 'SubaruShogun\\subarushogun-gi-twitch-bot'");
    expect(script).toContain('$env:QUEUEBOT_INSTALL_HOME');
  });

  it('embeds a runtime Compose file without local builds that keeps the data volumes', () => {
    const encoded = script.match(/\$ComposeBase64 = '([^']+)'/)?.[1];
    const composeText = Buffer.from(encoded ?? '', 'base64').toString('utf8');
    const compose = load(composeText);
    expect(Object.values(compose.services).every((service) => !service.build)).toBe(true);
    expect(composeText).toContain('postgres_data');
    expect(composeText).toContain('operational_secrets');
    expect(composeText).not.toContain('./apps/');
  });
});

describe('Windows installer language, port and menu contract', () => {
  it('offers the same copy keys in pt-BR, English and Spanish, and every used key exists', () => {
    const [ptBR, en, es] = ['pt-BR', 'en', 'es'].map(copyKeys);
    expect(ptBR.length).toBeGreaterThan(30);
    expect(en).toEqual(ptBR);
    expect(es).toEqual(ptBR);
    const used = [...script.matchAll(/\(T '([A-Za-z]+)'\)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(20);
    for (const key of new Set(used)) expect(ptBR, `missing copy key ${key}`).toContain(key);
  });

  it('shows the three actions and Exit in every language', () => {
    expect(script).toContain("menu='1) Instalar / Iniciar   2) Atualizar   3) Desinstalar   0) Sair'");
    expect(script).toContain("menu='1) Install / Start   2) Update   3) Uninstall   0) Exit'");
    expect(script).toContain("menu='1) Instalar / Iniciar   2) Actualizar   3) Desinstalar   0) Salir'");
    const loop = between(script, 'while ($true) {\n  Write-Host \'\'; Write-Host (T \'menu\')', '\n}');
    for (const [choice, action] of [['1', 'Setup-Product'], ['2', 'Update-Product'], ['3', 'Uninstall-Product']]) {
      expect(loop).toContain(`'${choice}' { ${action} }`);
    }
    expect(loop).toContain("'0' { exit 0 }");
  });

  it('maps the language prompt to pt-BR, en and es only and rejects any other locale on the command line', () => {
    const prompt = between(script, 'function Prompt-Language {', 'function Open-Url');
    expect(prompt).toContain("'1' { $script:Locale='pt-BR'; return $true }");
    expect(prompt).toContain("'2' { $script:Locale='en'; return $true }");
    expect(prompt).toContain("'3' { $script:Locale='es'; return $true }");
    expect(script).toContain("$script:CliLocale -notin @('pt-BR','en','es')");
    expect(script).toContain("PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$");
    expect(script).toContain("PRODUCT_INITIAL_LOCALE=$script:Locale");
  });

  it('validates the port from 1 to 65535, defaults to 3000, checks it is free and never switches it silently', () => {
    expect(script).toContain('$number -lt 1 -or $number -gt 65535');
    expect(script).toContain("$value='3000'");
    expect(script).toContain('[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$number)');
    expect(script).toContain('APP_PORT=$Port');
    expect(script).toContain("'--port'");
    for (const text of ['o instalador não troca a porta sozinho', 'the installer never changes it silently', 'el instalador no lo cambia sin avisar']) {
      expect(script).toContain(text);
    }
  });

  it('shows the exact Twitch callback URL for the chosen port in every language', () => {
    expect(script.match(/callback='[^']*https:\/\/localhost:\{0\}\/callback'/g)).toHaveLength(3);
    expect(script).toContain("Write-Host ([string]::Format((T 'callback'),$port))");
  });

  it('only ever writes the four non-secret settings to .env', () => {
    const saves = script.match(/Write-EnvFile -Value @\([^\n]*/g);
    expect(saves).toHaveLength(2);
    for (const save of saves) {
      expect(save).toContain('"APP_PORT=$Port"');
      expect(save).toContain('"IMAGE_TAG=$ReleaseImageTag"');
      expect(save).toContain('"PRODUCT_INITIAL_LOCALE=$script:Locale"');
      expect(save).not.toMatch(/SECRET|TOKEN|PASSWORD|CLIENT|KEY/i);
    }
  });
});

describe('Windows installer messages and exit codes', () => {
  it('never prints credentials, .env contents or environment dumps', () => {
    const shown = [...script.matchAll(/Write-Host\s+(\((?:[^()]|\([^()]*\))*\)|'[^']*'|"[^"]*")/g)].map((match) => match[1]);
    expect(shown.length).toBeGreaterThan(40);
    for (const argument of shown) {
      expect(argument).not.toMatch(/\$env:(?!IMAGE_TAG)/i);
      expect(argument).not.toMatch(/Get-Content|\$EnvFile|ConvertFrom|\$\w*(secret|password|credential)|CLIENT_SECRET/i);
    }
    expect(script).not.toMatch(/Get-ChildItem\s+env:|\[Environment\]::GetEnvironmentVariables|Format-List\s+\*/i);
    expect(script).not.toMatch(/Start-Transcript|Invoke-WebRequest|Invoke-RestMethod/);
  });

  it('refuses invalid or unsafe command lines with exit code 2 and prints help with exit code 0', () => {
    for (const text of [
      "'Choose only one action.'", "'Invalid --locale usage.'", "'Invalid --port usage.'", "'Choose either --keep-data or --erase-data.'",
      "'A silent run requires install, update, or uninstall.'", "'--confirm-erase requires --erase-data.'",
      "'Erasing data requires both --erase-data and --confirm-erase.'", "'Use update or uninstall with --erase-data.'",
      '"Unknown installer option: $token"',
    ]) {
      expect(script).toContain(text);
    }
    expect(between(script, '$parseStatus=Parse-CommandLine', 'if (-not (Test-Path $EnvFile) -and -not (Prompt-Language))')).toBe(
      '$parseStatus=Parse-CommandLine\nif ($parseStatus -eq 3) { exit 0 }\nif ($parseStatus -ne 0) { exit $parseStatus }\n',
    );
    expect(script).toContain("Usage: installer.bat [--silent] [install|update|uninstall] [--locale pt-BR|en|es] [--port 1-65535] [--keep-data | --erase-data --confirm-erase]");
    expect(between(script, 'if ($script:NonInteractive) {\n  switch', 'while ($true) {')).toContain('if ($script:OperationFailed) { exit 1 }\n  exit 0');
  });

  it('exits 1 with a clear message when no interactive input is available instead of looping', () => {
    expect(script).toContain("if ($null -eq $answer) { Write-Host (T 'inputUnavailable'); return $false }");
    expect(script).toContain('if (-not (Test-Path $EnvFile) -and -not (Prompt-Language)) { exit 1 }');
    for (const text of ['terminal interativo', 'interactive terminal', 'terminal interactivo']) expect(script).toContain(text);
  });

  it('keeps failure messages free of stack traces and says existing data was preserved', () => {
    expect(script).not.toMatch(/\$_\.Exception|\$Error\[0\]|ScriptStackTrace/);
    // The only raw echo is the Docker/Compose output relayed line by line (no installer variables or secrets involved).
    expect(script.match(/Write-Host \$_/g)).toHaveLength(1);
    expect(between(script, 'function Invoke-Docker', '\n}\n')).toContain('ForEach-Object { Write-Host $_ }');
    for (const text of ['Os dados existentes foram preservados', 'Existing data was preserved', 'Se conservaron los datos existentes']) {
      expect(script).toContain(text);
    }
  });
});

describe('Windows installer data preservation contract', () => {
  const uninstall = () => between(script, 'function Uninstall-Product {', '\n}\n\n$parseStatus');
  const keepBranch = () => between(uninstall(), "if ($choice -eq '1') {", "if ($choice -ne '2') { return }");
  const eraseBranch = () => uninstall().slice(uninstall().indexOf("if ($choice -ne '2') { return }"));

  it('keeps volumes, .env and data when uninstalling with maintenance (choice 1)', () => {
    const keep = keepBranch();
    expect(keep).toContain("Compose @('down','--remove-orphans')");
    expect(keep).toContain("Verify-Uninstall $originalVolumes $knownImages 'keep'");
    expect(keep).toContain("(T 'doneKeep')");
    expect(keep).not.toContain('--volumes');
    expect(keep).not.toMatch(/Remove-Item[^\n]*\$InstallHome/);
    expect(keep).not.toMatch(/Remove-Item[^\n]*\$EnvFile/);
    expect(keep).not.toMatch(/volume\s+rm|volume','rm|'prune'/i);
    expect(keep).toContain('Remove-Item -LiteralPath $ComposeFile -Force');
  });

  it('erases volumes and the install directory only after the typed word or --confirm-erase', () => {
    const erase = eraseBranch();
    const confirmation = erase.indexOf('-cne [string]$Copy[$script:Locale].word');
    expect(confirmation).toBeGreaterThan(-1);
    expect(erase.indexOf("Compose @('down','--volumes','--remove-orphans')")).toBeGreaterThan(confirmation);
    expect(erase.indexOf('Remove-Item -LiteralPath $InstallHome -Recurse -Force')).toBeGreaterThan(confirmation);
    expect(erase).toContain("Verify-Uninstall $originalVolumes $knownImages 'remove'");
    expect(script).toContain("word='APAGAR'");
    expect(script).toContain("word='DELETE'");
    expect(script).toContain("word='ELIMINAR'");
    expect(script).toContain('if ($script:DataPolicy -eq \'erase\' -and -not $script:EraseConfirmed)');
  });

  it('keeps data when updating (choice 1 never runs down) and erases only on the explicit clean-install choice', () => {
    const update = between(script, 'function Update-Product {', 'function Uninstall-Product');
    const keep = between(update, "if (-not $choice -or $choice -eq '1') {", "if ($choice -ne '2') { return }");
    expect(keep).not.toMatch(/'down'|--volumes|Remove-Item/);
    expect(keep).toContain("Compose @('pull') $ReleaseImageTag");
    expect(update).toContain('$choice=if ($script:DataPolicy -eq \'erase\') { \'2\' } else { \'1\' }');
    expect(update).toContain('-cne [string]$Copy[$script:Locale].word');
  });

  it('removes only product images that no other container uses and never removes Docker, volumes by name or other projects', () => {
    const removal = between(script, 'function Remove-UnusedProductImages', 'function Verify-Uninstall');
    expect(removal).toContain('ancestor=$imageId');
    expect(removal).toContain('imageShared');
    expect(script).toContain('label=com.docker.compose.project=$ProjectName');
    expect(script).not.toMatch(/docker\s+system\s+prune|'system','prune'|'volume','prune'|'image','prune'|Uninstall-Package|winget\s+uninstall/i);
  });
});
