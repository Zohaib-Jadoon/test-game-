# Wave 2 unrecorded 1080p benchmark (2400 frames/preset + 500ms nvidia-smi telemetry + crisp post-warmup screenshot pass)
param(
  [int]$Frames = 2400,
  [int]$WarmupSkip = 120,
  [int]$TimeoutSec = 90
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$UeExe = "D:\game\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe"
$Proj = Join-Path $RepoRoot "native\EidrathUE_Trial\EidrathUE_Trial.uproject"
$Map = "/Game/Eidrath/Maps/Lvl_FrostheimValley"
$OutJson = Join-Path $RepoRoot "_asset_cache\ue_frostheim_metrics.json"
$ShotsDir = Join-Path $RepoRoot "art\qa\ue_frostheim"
$SavedShotsDir = Join-Path $RepoRoot "native\EidrathUE_Trial\Saved\Screenshots\WindowsEditor"
$CsvOutDir = Join-Path $RepoRoot "native\EidrathUE_Trial\Saved\Profiling\CSV"

New-Item -ItemType Directory -Force -Path $ShotsDir | Out-Null

$runs = @(
  @{ id = "valley_dx11_low";    rhi = "-d3d11"; sg = 0 },
  @{ id = "valley_dx11_medium"; rhi = "-d3d11"; sg = 1 },
  @{ id = "valley_dx11_high";   rhi = "-d3d11"; sg = 2 },
  @{ id = "valley_dx11_ultra";  rhi = "-d3d11"; sg = 3 }
)

$results = @()

foreach ($r in $runs) {
  $rid = $r.id
  $sg = $r.sg
  $rhi = $r.rhi
  $csvTarget = Join-Path $CsvOutDir "$rid.csv"
  Remove-Item $csvTarget -ErrorAction SilentlyContinue

  Write-Host "=== Running Wave 2 Frostheim Valley Benchmark: $rid ($rhi, sg=$sg, frames=$Frames) ==="
  $execCmds = "sg.ViewDistanceQuality $sg, sg.ShadowQuality $sg, sg.GlobalIlluminationQuality $sg, sg.ReflectionQuality $sg, sg.PostProcessQuality $sg, sg.TextureQuality $sg, sg.EffectsQuality $sg, sg.FoliageQuality $sg, sg.ShadingQuality $sg, CsvProfile STARTFILE=$rid.csv, CsvProfile EXITONCOMPLETION, CsvProfile FRAMES=$Frames"
  $ueArgs = "`"$Proj`" $Map -game $rhi -ResX=1920 -ResY=1080 -windowed -NoSound -Unattended -NoSplash -csvGpuStats -ExecCmds=`"$execCmds`""

  $proc = Start-Process -FilePath $UeExe -ArgumentList $ueArgs -PassThru
  $vramSamples = @()
  $gpuSamples = @()
  $ramSamples = @()

  $start = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
    Start-Sleep -Milliseconds 500
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
  Start-Sleep -Milliseconds 400

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
def is_num(x):
    try:
        float(x)
        return True
    except Exception:
        return False
with open(p, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    cols = reader.fieldnames or []
    rows = [row for row in reader if is_num(row.get('FrameTime', ''))]
rows = rows[skip:] if len(rows) > skip + 50 else rows
fts = [float(row['FrameTime']) for row in rows]
gts = [float(row['GameThreadTime']) for row in rows if is_num(row.get('GameThreadTime', ''))]
rts = [float(row['RenderThreadTime']) for row in rows if is_num(row.get('RenderThreadTime', ''))]
gpu_col = next((c for c in cols if c in ('Total', 'GPU', 'GPUTime', 'GPU/Total')), None)
gput = [float(row[gpu_col]) for row in rows if gpu_col and is_num(row.get(gpu_col, ''))]
fts_s = sorted(fts)
n = len(fts_s)
avg_ft = sum(fts_s)/n if n else 0
p95 = fts_s[min(n-1, int(n*0.95))] if n else 0
p99 = fts_s[min(n-1, int(n*0.99))] if n else 0
print(json.dumps({
    'measuredFrames': n,
    'avgFrameMs': round(avg_ft, 2),
    'avgFps': round(1000.0/avg_ft, 1) if avg_ft > 0 else 0,
    'p95FrameMs': round(p95, 2),
    'p99FrameMs': round(p99, 2),
    'onePercentLowFps': round(1000.0/p99, 1) if p99 > 0 else 0,
    'maxFrameMs': round(fts_s[-1], 2) if n else 0,
    'avgGameThreadMs': round(sum(gts)/len(gts), 2) if gts else None,
    'avgRenderThreadMs': round(sum(rts)/len(rts), 2) if rts else None,
    'avgGpuMs': round(sum(gput)/len(gput), 2) if gput else None,
}))
" $csvPath $WarmupSkip
    $perfStats = $pyOut | ConvertFrom-Json
  }

  # Separate crisp screenshot pass with FullMip streaming forced so ruins/snow/foliage are captured post-warmup
  $beforeShots = @{}
  if (Test-Path $SavedShotsDir) {
    Get-ChildItem $SavedShotsDir -Filter "*.png" | ForEach-Object { $beforeShots[$_.FullName] = $true }
  }
  $shotCmds = "sg.ViewDistanceQuality $sg, sg.ShadowQuality $sg, sg.GlobalIlluminationQuality $sg, sg.ReflectionQuality $sg, sg.PostProcessQuality $sg, sg.TextureQuality $sg, sg.EffectsQuality $sg, sg.FoliageQuality $sg, sg.ShadingQuality $sg, r.Streaming.FullyLoadUsedTextures 1, r.Streaming.UseAllMips 1, Shot, CsvProfile STARTFILE=${rid}_shot.csv, CsvProfile EXITONCOMPLETION, CsvProfile FRAMES=90"
  $shotProc = Start-Process -FilePath $UeExe -ArgumentList "`"$Proj`" $Map -game $rhi -ResX=1920 -ResY=1080 -windowed -NoSound -Unattended -NoSplash -ExecCmds=`"$shotCmds`"" -PassThru
  $null = $shotProc.WaitForExit(35000)
  if (-not $shotProc.HasExited) { Stop-Process -Id $shotProc.Id -Force -ErrorAction SilentlyContinue }

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
Write-Host "Wrote Wave 2 benchmark summary to $OutJson"
