$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskNode = if ($taskNodeCommand) { $taskNodeCommand.Source } else { $null }
if (-not $taskNode) {
  $taskRuntime = Join-Path $taskRoot '.local\runtime.json'
  if (Test-Path -LiteralPath $taskRuntime) { $taskNode = (Get-Content -LiteralPath $taskRuntime -Raw -Encoding utf8 | ConvertFrom-Json).node }
}
if (-not $taskNode -or -not (Test-Path -LiteralPath $taskNode)) { throw 'Node.jsが見つかりません。制作環境を確認してください。' }
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
