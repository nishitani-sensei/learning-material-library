$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
function Find-LibraryNode {
  $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
  if ($command -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) { return $command.Source }

  $installed = Join-Path $env:ProgramFiles 'nodejs\node.exe'
  if (Test-Path -LiteralPath $installed -PathType Leaf) { return $installed }

  # Codexの更新でフォルダー名が変わるため、Windowsに現在の場所を問い合わせる。
  if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
    $packages = Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Version -Descending
    foreach ($package in $packages) {
      if (-not $package.InstallLocation) { continue }
      $bundled = Join-Path $package.InstallLocation 'dependencies\node\bin\node.exe'
      if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
    }
  }

  $runtimeFile = Join-Path $taskRoot '.local\runtime.json'
  if (Test-Path -LiteralPath $runtimeFile -PathType Leaf) {
    try {
      $cached = (Get-Content -LiteralPath $runtimeFile -Raw -Encoding utf8 | ConvertFrom-Json).node
      if ($cached -and (Test-Path -LiteralPath $cached -PathType Leaf)) { return $cached }
    } catch { }
  }
}
$taskNode = Find-LibraryNode
if (-not $taskNode) { throw 'Node.jsが見つかりません。Node.jsを入れるか、Codexを開いてから再度お試しください。' }
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist\index.html'))) { throw '公開用ファイルがありません。先に生成してください。' }
$taskUrl = 'http://127.0.0.1:4188/'
try { $taskResponse = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 2 } catch { $taskResponse = $null }
if (-not $taskResponse) {
  $taskServerScript = Join-Path $PSScriptRoot 'serve.mjs'
  Start-Process -FilePath $taskNode -ArgumentList @("`"$taskServerScript`"") -WorkingDirectory $taskRoot -WindowStyle Hidden
  for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) {
    Start-Sleep -Milliseconds 200
    try { $taskResponse=Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 1; break } catch {}
  }
}
if (-not $taskResponse -or $taskResponse.Content -notmatch '教材ライブラリ') { throw '起動を確認できませんでした。同じ番号の別のアプリが起動していないか確認してください。' }
Start-Process $taskUrl
