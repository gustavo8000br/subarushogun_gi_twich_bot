<#
.SYNOPSIS
  Gera o hash PBKDF2 da senha do instalador de teste (Secret TEST_INSTALLER_PASSWORD_HASH). Windows PowerShell 5.1 ou pwsh.
.DESCRIPTION
  A senha e digitada com a tela oculta (Read-Host -AsSecureString), nunca vai para argumento, variavel de ambiente,
  arquivo ou historico. Somente a linha do hash e escrita na saida:
  pbkdf2-sha256$600000$<sal-base64>$<hash-base64>. Compativel com apps/infra/scripts/gen-test-password-hash.mjs.
  Use uma senha longa e aleatoria (minimo de 16 caracteres).
#>
$ErrorActionPreference = 'Stop'
$iterations = 600000
$minimumLength = 16

function Read-Secret([string]$Prompt) {
  if ([Console]::IsInputRedirected) { return [Console]::In.ReadLine() }
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $secure.Dispose() }
}
function Get-Pbkdf2([byte[]]$Secret, [byte[]]$Salt, [int]$Count) {
  try {
    $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Secret, $Salt, $Count, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
    try { return ,$kdf.GetBytes(32) } finally { $kdf.Dispose() }
  } catch { }
  Add-Type -TypeDefinition @'
using System;
using System.Security.Cryptography;
public static class OwnerPbkdf2 {
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
  return ,[OwnerPbkdf2]::Derive($Secret, $Salt, $Count)
}

$first = Read-Secret 'Senha de teste (oculta)'
if (-not [Console]::IsInputRedirected) {
  $second = Read-Secret 'Repita a senha (oculta)'
  if ($first -cne $second) { [Console]::Error.WriteLine('As duas digitacoes sao diferentes.'); exit 1 }
}
if ([string]::IsNullOrEmpty($first) -or $first.Length -lt $minimumLength) {
  [Console]::Error.WriteLine("Use uma senha com pelo menos $minimumLength caracteres (longa e aleatoria).")
  exit 1
}
if ($first -notmatch '^[\x20-\x7e]+$') {
  [Console]::Error.WriteLine('Use apenas caracteres ASCII (letras, digitos e simbolos comuns).')
  exit 1
}
$secretBytes = [Text.Encoding]::UTF8.GetBytes($first)
$first = $null
$salt = New-Object byte[] 16
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($salt) } finally { $rng.Dispose() }
$digest = Get-Pbkdf2 $secretBytes $salt $iterations
[Array]::Clear($secretBytes, 0, $secretBytes.Length)
[Console]::Out.WriteLine('pbkdf2-sha256$' + $iterations + '$' + [Convert]::ToBase64String($salt) + '$' + [Convert]::ToBase64String($digest))
[Console]::Error.WriteLine('Hash impresso acima. Cadastre como Secret TEST_INSTALLER_PASSWORD_HASH; mantenha a senha fora de chats, arquivos e historico.')
