# Claude CLI spike (roadmap M1). Checks how the `claude` command behaves on this laptop, so the
# Claude bridge (M9) is built on facts instead of guesses. Read-only: it changes no settings
# and asks Claude for nothing but the word "ok", a few times (a tiny amount of plan usage).
#
# How to run it (Windows PowerShell):
#   1. Open PowerShell (Start menu -> type "PowerShell" -> Enter).
#   2. Copy this whole file (on GitHub: the "Copy raw file" button above the code) and paste
#      it into the window (right-click pastes; if Windows asks about pasting several lines,
#      choose "Paste anyway"). Press Enter if it doesn't start on its own.
#   3. Wait a minute or two, then copy everything from "=== Claude CLI spike" to the end and
#      paste it into a Claude Code session for School Assistant.
#
# Each run starts `claude` directly with an exact argument list and sends the prompt on stdin,
# like the app will. (Typing the same command by hand breaks: Windows PowerShell 5.1 strips the
# quotes inside JSON arguments.) ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are removed for the
# child process so the subscription login is what gets tested.

function Get-SpikeQuotedArg([string]$Value) {
  # Quote one argument by the Windows command-line rules (backslashes before a quote double).
  if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
  $out = '"'
  $slashes = 0
  foreach ($ch in $Value.ToCharArray()) {
    if ($ch -eq '\') { $slashes++; continue }
    if ($ch -eq '"') { $out += ('\' * (2 * $slashes + 1)) + '"' }
    else { $out += ('\' * $slashes) + $ch }
    $slashes = 0
  }
  return $out + ('\' * (2 * $slashes)) + '"'
}

function Invoke-SpikeClaude([string]$Exe, [string[]]$CliArgs, [string]$Stdin, [int]$TimeoutSec) {
  $argLine = ($CliArgs | ForEach-Object { Get-SpikeQuotedArg $_ }) -join ' '
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  if ($Exe -match '\.(cmd|bat)$') {
    # npm installs a claude.cmd shim, which only runs through cmd.exe.
    $psi.FileName = $env:ComSpec
    $psi.Arguments = '/d /s /c "' + (Get-SpikeQuotedArg $Exe) + ' ' + $argLine + '"'
  } else {
    $psi.FileName = $Exe
    $psi.Arguments = $argLine
  }
  $work = Join-Path ([System.IO.Path]::GetTempPath()) ('sa-claude-spike-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $work | Out-Null
  $psi.WorkingDirectory = $work
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
  foreach ($name in @('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN')) {
    if ($psi.EnvironmentVariables.ContainsKey($name)) { $psi.EnvironmentVariables.Remove($name) }
  }
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $proc = [System.Diagnostics.Process]::Start($psi)
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()
  $proc.StandardInput.Write($Stdin)
  $proc.StandardInput.Close()
  $timedOut = -not $proc.WaitForExit($TimeoutSec * 1000)
  if ($timedOut) { try { $proc.Kill() } catch {} ; $proc.WaitForExit() }
  $watch.Stop()
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    ExitCode = $(if ($timedOut) { 'timed out' } else { $proc.ExitCode })
    Seconds  = [math]::Round($watch.Elapsed.TotalSeconds, 1)
    Stdout   = $outTask.Result
    Stderr   = $errTask.Result
  }
}

function Show-SpikeText([string]$Label, [string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { Write-Output "$($Label): (empty)"; return }
  $t = $Text.Trim()
  if ($t.Length -gt 4000) { $t = $t.Substring(0, 4000) + ' ...(cut)' }
  Write-Output "$($Label):"
  Write-Output $t
}

function Invoke-ClaudeCliSpike {
  Write-Output '=== Claude CLI spike (School Assistant, roadmap M1) ==='
  Write-Output ("Date: " + (Get-Date).ToString('yyyy-MM-dd HH:mm zzz'))
  Write-Output ("Windows: " + [System.Environment]::OSVersion.VersionString + "; PowerShell " + $PSVersionTable.PSVersion)
  foreach ($name in @('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN')) {
    $isSet = [bool][System.Environment]::GetEnvironmentVariable($name)
    Write-Output ("$name set in your environment: " + $(if ($isSet) { 'YES (removed for these runs)' } else { 'no' }))
  }

  $found = @(Get-Command claude -CommandType Application -ErrorAction SilentlyContinue)
  if ($found.Count -eq 0) {
    Write-Output 'RESULT: the claude command was not found. Install Claude Code, log in, then run this again.'
    return
  }
  $exe = $found[0].Source
  Write-Output ("claude found at: " + $exe)
  if ($found.Count -gt 1) { Write-Output ("Also on PATH: " + (($found | Select-Object -Skip 1 | ForEach-Object { $_.Source }) -join '; ')) }

  $r = Invoke-SpikeClaude $exe @('--version') $null 60
  Write-Output ''
  Write-Output '--- claude --version'
  Show-SpikeText 'stdout' $r.Stdout
  Show-SpikeText 'stderr' $r.Stderr

  $r = Invoke-SpikeClaude $exe @('auth', 'status') $null 60
  Write-Output ''
  Write-Output ("--- claude auth status (exit " + $r.ExitCode + ")")
  Show-SpikeText 'stdout' $r.Stdout
  Show-SpikeText 'stderr' $r.Stderr

  $schema = '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}'
  $base = @('-p', '--output-format', 'json', '--json-schema', $schema)
  $runs = @(
    @{ Label = 'default model'; Extra = @() },
    @{ Label = '--model opus'; Extra = @('--model', 'opus') },
    @{ Label = '--setting-sources user'; Extra = @('--setting-sources', 'user') },
    @{ Label = '--strict-mcp-config with no servers'; Extra = @('--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}') },
    @{ Label = '--safe-mode'; Extra = @('--safe-mode') }
  )
  foreach ($run in $runs) {
    $r = Invoke-SpikeClaude $exe ($base + $run.Extra) 'Return ok' 300
    Write-Output ''
    Write-Output ("--- " + $run.Label + " (exit " + $r.ExitCode + ", " + $r.Seconds + " s)")
    $structured = 'no (output was not JSON)'
    try {
      $json = $r.Stdout | ConvertFrom-Json
      if ($null -ne $json.structured_output) { $structured = 'yes: ' + ($json.structured_output | ConvertTo-Json -Compress) }
      else { $structured = 'no structured_output field' }
    } catch {}
    Write-Output ("structured_output: " + $structured)
    Show-SpikeText 'stdout' $r.Stdout
    Show-SpikeText 'stderr' $r.Stderr
  }
  Write-Output ''
  Write-Output '=== end of Claude CLI spike ==='
}

Invoke-ClaudeCliSpike
