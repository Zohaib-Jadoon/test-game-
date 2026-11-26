# Unrecorded 1080p UE 5.8.4 hardware benchmark using native CsvProfile (450 frames) + hardware telemetry
param(
  [int]$Frames = 450,
  [int]$WarmupSkip = 60,
  [int]$TimeoutSec = 65
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$UeExe = "D:\game\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe"
$Proj = Join-Path $RepoRoot "native\EidrathUE_Trial\EidrathUE_Trial.uproject"
$Map = "/Game/Eidrath/Maps/Lvl_FrostheimTrial"
$OutJson = Join-Path $RepoRoot "_asset_cache\ue_trial_metrics.json"
$ShotsDir = Join-Path $RepoRoot "art\qa\ue_trial"
$SavedShotsDir = Join-Path $RepoRoot "native\EidrathUE_Trial\Saved\Screenshots\WindowsEditor"
$CsvOutDir = Join-Path $RepoRoot "native\EidrathUE_Trial\Saved\Profiling\CSV"

New-Item -ItemType Directory -Force -Path $ShotsDir | Out-Null

$runs = @(
  @{ id = "dx11_low";    rhi = "-d3d11"; sg = 0 },
  @{ id = "dx11_medium"; rhi = "-d3d11"; sg = 1 },
  @{ id = "dx11_high";   rhi = "-d3d11"; sg = 2 },
  @{ id = "dx12_medium"; rhi = "-d3d12"; sg = 1 }
)

$results = @()

foreach ($r in $runs) {
  $rid = $r.id
  $sg = $r.sg
  $rhi = $r.rhi
  $csvTarget = Join-Path $CsvOutDir "$rid.csv"
  Remove-Item $csvTarget -ErrorAction SilentlyContinue
  $beforeShots = @{}
  if (Test-Path $SavedShotsDir) {
    Get-ChildItem $SavedShotsDir -Filter "*.png" | ForEach-Object { $beforeShots[$_.FullName] = $true }
  }

  Write-Host "=== Running UE Benchmark: $rid ($rhi, sg=$sg, frames=$Frames) ==="
  $execCmds = "sg.ViewDistanceQuality $sg, sg.ShadowQuality $sg, sg.GlobalIlluminationQuality $sg, sg.ReflectionQuality $sg, sg.PostProcessQuality $sg, sg.TextureQuality $sg, sg.EffectsQuality $sg, sg.FoliageQuality $sg, sg.ShadingQuality $sg, CsvProfile STARTFILE=$rid.csv, CsvProfile EXITONCOMPLETION, CsvProfile FRAMES=$Frames, Shot"
  $ueArgs = "`"$Proj`" $Map -game $rhi -ResX=1920 -ResY=1080 -windowed -NoSound -Unattended -NoSplash -csvGpuStats -ExecCmds=`"$execCmds`""

  $proc = Start-Process -FilePath $UeExe -ArgumentList $ueArgs -PassThru
  $vramSamples = @()
  $gpuSamples = @()
  $ramSamples = @()

  $start = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
    Start-Sleep -Seconds 1
    try {
      $pInfo = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
      if ($pInfo) { $ramSamples += [math]::Round($pInfo.WorkingSet64 / 1MB, 1) }
      $nv = nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits 2>$null
      if ($nv) {
        $parts = ($nv -split ",") | ForEach-Object { $_.Trim() }
        if ($parts.Count -ge 2) {
          $gpuSamples += [double]$parts[0]
          $vramSamples += [double]$parts[1]
        }
      }
    } catch {}
  }

  if (-not $proc.HasExited) {
    $null = $proc.CloseMainWindow()
    if (-not $proc.WaitForExit(5000)) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 500

  # Pick exact or newest CSV
  $csvPath = $null
  if (Test-Path $csvTarget) {
    $csvPath = $csvTarget
  } elseif (Test-Path $CsvOutDir) {
    $latest = Get-ChildItem $CsvOutDir -Filter "$rid*.csv" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) { $csvPath = $latest.FullName }
  }

  $perfStats = $null
  if ($csvPath -and (Test-Path $csvPath)) {
    $pyOut = python -c "
import csv, json, sys
p = sys.argv[1]
skip = int(sys.argv[2])
with open(p, 'r', encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
rows = [r for r in rows if r.get('FrameTime')][skip:]
if not rows:
    rows = []
fts = [float(r['FrameTime']) for r in rows if r.get('FrameTime')]
gts = [float(r['GameThreadTime']) for r in rows if r.get('GameThreadTime')]
rts = [float(r['RenderThreadTime']) for r in rows if r.get('RenderThreadTime')]
gput = [float(r['Total']) for r in rows if r.get('Total')]
if not gput:
    gput = [float(r['GPUTime']) for r in rows if r.get('GPUTime')]
fts_sorted = sorted(fts)
n = len(fts_sorted)
avg_ft = sum(fts_sorted)/n if n else 0
p95 = fts_sorted[min(n-1, int(n*0.95))] if n else 0
p99 = fts_sorted[min(n-1, int(n*0.99))] if n else 0
print(json.dumps({
    'measuredFrames': n,
    'avgFrameMs': round(avg_ft, 2),
    'avgFps': round(1000.0/avg_ft, 1) if avg_ft > 0 else 0,
    'p95FrameMs': round(p95, 2),
    'p99FrameMs': round(p99, 2),
    'onePercentLowFps': round(1000.0/p99, 1) if p99 > 0 else 0,
    'maxFrameMs': round(fts_sorted[-1], 2) if n else 0,
    'avgGameThreadMs': round(sum(gts)/len(gts), 2) if gts else None,
    'avgRenderThreadMs': round(sum(rts)/len(rts), 2) if rts else None,
    'avgGpuMs': round(sum(gput)/len(gput), 2) if gput else None,
}))
" $csvPath $WarmupSkip
    $perfStats = $pyOut | ConvertFrom-Json
  }

  $shotCopied = $null
  if (Test-Path $SavedShotsDir) {
    $newShots = Get-ChildItem $SavedShotsDir -Filter "*.png" | Where-Object { -not $beforeShots.ContainsKey($_.FullName) } | Sort-Object LastWriteTime -Descending
    if ($newShots.Count -gt 0) {
      $dst = Join-Path $ShotsDir "$rid.png"
      Copy-Item $newShots[0].FullName $dst -Force
      $shotCopied = $dst
    }
  }

  $results += [PSCustomObject]@{
    id = $rid
    rhi = $rhi
    scalability = $sg
    exitCode = if ($proc.HasExited) { $proc.ExitCode } else { $null }
    csvFile = $csvPath
    perf = $perfStats
    screenshot = $shotCopied
    avgGpuUtilPct = if ($gpuSamples.Count -gt 0) { [math]::Round(($gpuSamples | Measure-Object -Average).Average, 1) } else { $null }
    peakTotalVramMiB = if ($vramSamples.Count -gt 0) { ($vramSamples | Measure-Object -Maximum).Maximum } else { $null }
    peakRamMB = if ($ramSamples.Count -gt 0) { ($ramSamples | Measure-Object -Maximum).Maximum } else { $null }
    avgRamMB = if ($ramSamples.Count -gt 0) { [math]::Round(($ramSamples | Measure-Object -Average).Average, 1) } else { $null }
  }
}

$results | ConvertTo-Json -Depth 6 | Set-Content -Path $OutJson -Encoding UTF8
Write-Host "Wrote benchmark summary to $OutJson"
