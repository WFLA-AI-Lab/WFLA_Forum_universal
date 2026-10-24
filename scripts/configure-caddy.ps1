#requires -Version 5.1
<#
  生成仅用于本地源站的 HTTPS 配置。
  默认：
    浏览器/隧道 -> https://127.0.0.1:8443 (Caddy)
    Caddy       -> http://127.0.0.1:8888 (论坛)

  这里创建的是内部 CA 证书，只保证本地 TLS 与隧道链路。
  公网浏览器仍应使用隧道/Cloudflare 提供的公开受信证书。
#>
[CmdletBinding()]
param(
  [string]$Domain = 'wflawall.zh.kg',
  [string]$ListenAddress = '127.0.0.1',
  [int]$HttpsPort = 8443,
  [int]$UpstreamPort = 8888,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath.TrimEnd('\', '/')
$caddyExe = Join-Path $root 'tools\caddy\caddy.exe'
$certDir = Join-Path $root 'certs'
$siteCert = Join-Path $certDir 'site.crt'
$siteKey = Join-Path $certDir 'site.key'
$rootCert = Join-Path $certDir 'root-ca.crt'
$caddyfile = Join-Path $root 'Caddyfile'

function Get-DerLength([int]$Length) {
  if ($Length -lt 128) { return [byte[]]@([byte]$Length) }
  $body = New-Object System.Collections.Generic.List[byte]
  $n = $Length
  while ($n -gt 0) { $body.Insert(0, [byte]($n -band 0xff)); $n = $n -shr 8 }
  $result = New-Object System.Collections.Generic.List[byte]
  $result.Add([byte](0x80 -bor $body.Count))
  $result.AddRange($body)
  return $result.ToArray()
}

function New-DerTlv([byte]$Tag, [byte[]]$Value) {
  $len = Get-DerLength $Value.Length
  $result = New-Object byte[] ($Value.Length + $len.Length + 1)
  $result[0] = $Tag
  [Array]::Copy($len, 0, $result, 1, $len.Length)
  [Array]::Copy($Value, 0, $result, 1 + $len.Length, $Value.Length)
  return ,$result
}

function New-DerInteger([byte[]]$Value) {
  $start = 0
  while ($start -lt ($Value.Length - 1) -and $Value[$start] -eq 0) { $start++ }
  $body = New-Object System.Collections.Generic.List[byte]
  if (($Value[$start] -band 0x80) -ne 0) { $body.Add(0) }
  for ($i = $start; $i -lt $Value.Length; $i++) { $body.Add($Value[$i]) }
  return New-DerTlv 0x02 $body.ToArray()
}

function New-Pkcs1PrivateKey([Security.Cryptography.RSA]$Rsa) {
  $p = $Rsa.ExportParameters($true)
  $content = New-Object System.Collections.Generic.List[byte]
  $parts = @(
    (New-DerInteger ([byte[]]@(0))),
    (New-DerInteger $p.Modulus),
    (New-DerInteger $p.Exponent),
    (New-DerInteger $p.D),
    (New-DerInteger $p.P),
    (New-DerInteger $p.Q),
    (New-DerInteger $p.DP),
    (New-DerInteger $p.DQ),
    (New-DerInteger $p.InverseQ)
  )
  foreach ($part in $parts) { $content.AddRange([byte[]]$part) }
  return New-DerTlv 0x30 $content.ToArray()
}

function New-PemText([string]$Label, [byte[]]$Der) {
  $body = [Convert]::ToBase64String($Der, [Base64FormattingOptions]::InsertLineBreaks)
  return "-----BEGIN $Label-----$([Environment]::NewLine)$body$([Environment]::NewLine)-----END $Label-----$([Environment]::NewLine)"
}

function New-InternalCertificates {
  if ($Force) {
    Remove-Item -LiteralPath $siteCert, $siteKey, $rootCert -Force -ErrorAction SilentlyContinue
  }
  if ((Test-Path -LiteralPath $siteCert) -and (Test-Path -LiteralPath $siteKey) -and (Test-Path -LiteralPath $rootCert)) { return }

  $caRsa = [Security.Cryptography.RSA]::Create(3072)
  $caReq = New-Object Security.Cryptography.X509Certificates.CertificateRequest(
    'CN=WFLA Wall Local Root CA', $caRsa,
    [Security.Cryptography.HashAlgorithmName]::SHA256,
    [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $caReq.CertificateExtensions.Add((New-Object Security.Cryptography.X509Certificates.X509Extension('2.5.29.19', [byte[]](0x30,0x03,0x01,0x01,0xff), $true)))
  $caUsage = [int][Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor [int][Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign -bor [int][Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature
  $caReq.CertificateExtensions.Add((New-Object Security.Cryptography.X509Certificates.X509KeyUsageExtension([Security.Cryptography.X509Certificates.X509KeyUsageFlags]$caUsage, $true)))
  $ca = $caReq.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1), [DateTimeOffset]::UtcNow.AddYears(5))

  $siteRsa = [Security.Cryptography.RSA]::Create(2048)
  $siteReq = New-Object Security.Cryptography.X509Certificates.CertificateRequest(
    "CN=$Domain", $siteRsa,
    [Security.Cryptography.HashAlgorithmName]::SHA256,
    [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $san = New-Object Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder
  $san.AddDnsName($Domain)
  $siteReq.CertificateExtensions.Add($san.Build())
  $siteReq.CertificateExtensions.Add((New-Object Security.Cryptography.X509Certificates.X509Extension('2.5.29.19', [byte[]](0x30,0x00), $true)))
  $siteUsage = [int][Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [int][Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment
  $siteReq.CertificateExtensions.Add((New-Object Security.Cryptography.X509Certificates.X509KeyUsageExtension([Security.Cryptography.X509Certificates.X509KeyUsageFlags]$siteUsage, $true)))
  # Extended Key Usage: serverAuth (1.3.6.1.5.5.7.3.1), DER extension value
  $ekuDer = [byte[]](0x30,0x0a,0x06,0x08,0x2b,0x06,0x01,0x05,0x05,0x07,0x03,0x01)
  $siteReq.CertificateExtensions.Add((New-Object Security.Cryptography.X509Certificates.X509Extension('2.5.29.37', $ekuDer, $false)))
  $serial = New-Object byte[] 16
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($serial) } finally { $rng.Dispose() }
  $serial[0] = [byte](($serial[0] -band 0x7f) -bor 0x01)
  $signed = $siteReq.Create($ca, [DateTimeOffset]::UtcNow.AddDays(-1), [DateTimeOffset]::UtcNow.AddYears(2), $serial)

  $rootPem = New-PemText 'CERTIFICATE' $ca.RawData
  $leafPem = New-PemText 'CERTIFICATE' $signed.RawData
  $keyPem = New-PemText 'RSA PRIVATE KEY' (New-Pkcs1PrivateKey $siteRsa)
  [IO.File]::WriteAllText($rootCert, $rootPem, (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText($siteCert, ($leafPem + $rootPem), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText($siteKey, $keyPem, (New-Object Text.UTF8Encoding($false)))

  $signed.Dispose(); $siteRsa.Dispose(); $siteReq = $null
  $ca.Dispose(); $caRsa.Dispose(); $caReq = $null
}

if (-not (Test-Path -LiteralPath $caddyExe)) { throw 'Please run scripts\install-caddy.ps1 first.' }
if ($Domain -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$') { throw 'Domain format is invalid.' }
if ($HttpsPort -lt 1 -or $HttpsPort -gt 65535 -or $UpstreamPort -lt 1 -or $UpstreamPort -gt 65535) { throw 'Ports must be in 1-65535.' }
if ($HttpsPort -eq $UpstreamPort) { throw 'HTTPS port cannot equal upstream port.' }
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
New-InternalCertificates

$certForCaddy = ($siteCert -replace '\\','/')
$keyForCaddy = ($siteKey -replace '\\','/')
$caddyText = @"
{
    admin off
    auto_https off
}

$($ListenAddress):$($HttpsPort) {
    encode zstd gzip
    reverse_proxy 127.0.0.1:$($UpstreamPort) {
        header_up X-Forwarded-Proto https
        header_up X-Real-IP {remote_host}
    }
    tls "$certForCaddy" "$keyForCaddy"
}
"@
[IO.File]::WriteAllText($caddyfile,$caddyText,(New-Object Text.UTF8Encoding($false)))
& $caddyExe validate --config $caddyfile --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddyfile validation failed.' }

Write-Host "Caddyfile: $caddyfile" -ForegroundColor Green
Write-Host "Local HTTPS origin: https://$($ListenAddress):$($HttpsPort)" -ForegroundColor Cyan
Write-Host "Certificate: $siteCert" -ForegroundColor Yellow
Write-Host "Private key: $siteKey" -ForegroundColor Yellow
Write-Host "Root CA for client trust: $rootCert" -ForegroundColor Yellow
Write-Host 'If the tunnel client cannot trust a private CA, use its HTTP mode or Cloudflare Tunnel instead.' -ForegroundColor Yellow
