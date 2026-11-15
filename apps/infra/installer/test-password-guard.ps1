# BEGIN TEST PASSWORD GUARD
# Owner-only test build: this block is added by package-installer.mjs only when a password hash is supplied at build time.
# The official installer never contains it. Fails closed: every unexpected condition denies with exit code 4.
# PBKDF2-HMAC-SHA256 only: Rfc2898DeriveBytes without HashAlgorithmName would silently use SHA-1, so the constructor is always
# called with SHA256 (.NET Framework 4.7.2+) and older runtimes use the C# HMAC loop below; if neither works the guard denies.
$TestPasswordHash = '__TEST_PASSWORD_HASH__'
$TestGuardCopy = @{
  'pt-BR' = @{ prompt='Senha de teste: '; denied='Senha inválida.'; invalid='Instalador de teste inválido.'; runtime='Este Windows não consegue verificar a senha (requer .NET Framework 4.7.2 ou superior).' }
  en = @{ prompt='Test password: '; denied='Invalid password.'; invalid='Invalid test installer.'; runtime='This Windows cannot verify the password (needs .NET Framework 4.7.2 or later).' }
  es = @{ prompt='Contraseña de prueba: '; denied='Contraseña inválida.'; invalid='Instalador de prueba inválido.'; runtime='Este Windows no puede verificar la contraseña (requiere .NET Framework 4.7.2 o superior).' }
}
function Get-TestGuardText([string]$Key) {
  $guardLocale = $script:Locale
  if (-not $guardLocale) {
    $culture = [Globalization.CultureInfo]::CurrentUICulture.Name
    if ($culture -like 'pt*') { $guardLocale = 'pt-BR' } elseif ($culture -like 'es*') { $guardLocale = 'es' } else { $guardLocale = 'en' }
  }
  return [string]$TestGuardCopy[$guardLocale][$Key]
}
function Get-TestPasswordDigestFallback([byte[]]$Secret, [byte[]]$Salt, [int]$Iterations) {
  if (-not ('QueueBotPbkdf2' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Security.Cryptography;
public static class QueueBotPbkdf2 {
  public static byte[] Derive(byte[] secret, byte[] salt, int iterations) {
    using (HMACSHA256 mac = new HMACSHA256(secret)) {
      byte[] block = new byte[salt.Length + 4];
      Buffer.BlockCopy(salt, 0, block, 0, salt.Length);
      block[salt.Length + 3] = 1;
      byte[] u = mac.ComputeHash(block);
      byte[] t = (byte[])u.Clone();
      for (int i = 1; i < iterations; i++) {
        u = mac.ComputeHash(u);
        for (int j = 0; j < t.Length; j++) { t[j] ^= u[j]; }
      }
      return t;
    }
  }
}
'@
  }
  return [QueueBotPbkdf2]::Derive($Secret, $Salt, $Iterations)
}
function Get-TestPasswordDerived([byte[]]$Secret, [byte[]]$Salt, [int]$Iterations) {
  try {
    $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Secret, $Salt, $Iterations, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
    try { return ,$kdf.GetBytes(32) } finally { $kdf.Dispose() }
  } catch { }
  try { return ,(Get-TestPasswordDigestFallback $Secret $Salt $Iterations) } catch { return $null }
}
function Read-TestPasswordSpec {
  $parts = ([string]$TestPasswordHash).Split('$')
  if ($parts.Count -ne 4 -or $parts[0] -cne 'pbkdf2-sha256') { return $null }
  $iterations = 0
  if (-not [int]::TryParse($parts[1], [ref]$iterations) -or $iterations -lt 100000 -or $iterations -gt 2000000) { return $null }
  try { $salt = [Convert]::FromBase64String($parts[2]); $reference = [Convert]::FromBase64String($parts[3]) } catch { return $null }
  if ($salt.Length -ne 16 -or $reference.Length -ne 32) { return $null }
  return @{ Iterations = $iterations; Salt = $salt; Reference = $reference }
}
function Read-TestPasswordBytes([string]$Prompt) {
  if ($TestMode) {
    $line = Read-Answer $Prompt
    Write-Host ''
    if ([string]::IsNullOrEmpty($line)) { return $null }
    return ,[Text.Encoding]::UTF8.GetBytes($line)
  }
  $secure = Read-Host -Prompt $Prompt.TrimEnd(' ', ':') -AsSecureString
  if ($null -eq $secure -or $secure.Length -eq 0) { return $null }
  $bstr = [IntPtr]::Zero
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $text = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    return ,[Text.Encoding]::UTF8.GetBytes($text)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $text = $null
    $secure.Dispose()
  }
}
function Test-TestPasswordSame([byte[]]$Left, [byte[]]$Right) {
  if ($null -eq $Left -or $null -eq $Right -or $Left.Length -ne $Right.Length) { return $false }
  $acc = 0
  for ($i = 0; $i -lt $Left.Length; $i++) { $acc = $acc -bor ($Left[$i] -bxor $Right[$i]) }
  return ($acc -eq 0)
}
function Invoke-TestPasswordGuard {
  $spec = Read-TestPasswordSpec
  if ($null -eq $spec) { Write-Host (Get-TestGuardText 'invalid'); exit 4 }
  if ($script:NonInteractive) { Write-Host (Get-TestGuardText 'denied'); exit 4 }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $secret = Read-TestPasswordBytes (Get-TestGuardText 'prompt')
    $accepted = $false
    if ($null -ne $secret) {
      $candidate = Get-TestPasswordDerived $secret $spec.Salt $spec.Iterations
      [Array]::Clear($secret, 0, $secret.Length)
      if ($null -eq $candidate) { Write-Host (Get-TestGuardText 'runtime'); exit 4 }
      $accepted = Test-TestPasswordSame $candidate $spec.Reference
      if ($null -ne $candidate) { [Array]::Clear($candidate, 0, $candidate.Length) }
    }
    if ($accepted) { return }
    Write-Host (Get-TestGuardText 'denied')
    if ($attempt -lt 3) { Start-Sleep -Seconds 2 }
  }
  exit 4
}
Invoke-TestPasswordGuard
# END TEST PASSWORD GUARD
