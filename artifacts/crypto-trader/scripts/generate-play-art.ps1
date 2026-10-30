$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$browserCandidates = @(
  (Join-Path $env:ProgramFiles "(x86)\Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe")
)
$browser = $browserCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  throw "Microsoft Edge or Google Chrome is required to render the Play Store artwork."
}

$resources = Join-Path $projectRoot "android\app\src\main\res"
$storeAssets = Join-Path $projectRoot "store-assets"
$profile = Join-Path $env:TEMP ("nexustrade-art-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $profile | Out-Null
New-Item -ItemType Directory -Force -Path $storeAssets | Out-Null

function Export-SvgPng([string]$source, [string]$target, [int]$width, [int]$height) {
  $sourceUri = ([uri](Resolve-Path $source).Path).AbsoluteUri
  $wrapper = Join-Path $profile ([guid]::NewGuid().ToString("N") + ".html")
  $html = @"
<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}img{display:block;width:100%;height:100%;object-fit:contain}</style>
</head><body><img src="$sourceUri"></body></html>
"@
  [System.IO.File]::WriteAllText($wrapper, $html, [System.Text.Encoding]::UTF8)
  $wrapperUri = ([uri]$wrapper).AbsoluteUri
  $arguments = @(
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--allow-file-access-from-files",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=500",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    "--window-size=$width,$height",
    "--user-data-dir=$profile",
    "--screenshot=$target",
    $wrapperUri
  )

  $process = Start-Process -FilePath $browser -ArgumentList $arguments -Wait -PassThru -NoNewWindow
  if ($process.ExitCode -ne 0 -or -not (Test-Path $target)) {
    throw "Failed to render $source to $target."
  }
  Remove-Item -LiteralPath $wrapper -Force
}

$iconSource = Join-Path $projectRoot "assets\icon.svg"
$foregroundSource = Join-Path $projectRoot "assets\icon-foreground.svg"
$splashSource = Join-Path $projectRoot "assets\splash.svg"
$splashLandscapeSource = Join-Path $projectRoot "assets\splash-landscape.svg"
$featureSource = Join-Path $projectRoot "assets\feature-graphic.svg"

Export-SvgPng $iconSource (Join-Path $storeAssets "icon-512.png") 512 512
Export-SvgPng $featureSource (Join-Path $storeAssets "feature-graphic-1024x500.png") 1024 500

$iconSizes = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}
foreach ($entry in $iconSizes.GetEnumerator()) {
  $folder = Join-Path $resources $entry.Key
  $size = [int]$entry.Value
  Export-SvgPng $iconSource (Join-Path $folder "ic_launcher.png") $size $size
  Export-SvgPng $iconSource (Join-Path $folder "ic_launcher_round.png") $size $size
  Export-SvgPng $foregroundSource (Join-Path $folder "ic_launcher_foreground.png") ($size * 2.25) ($size * 2.25)
}

$splashSizes = @{
  "drawable-port-mdpi" = @{ Size = @(320, 480); Source = $splashSource }
  "drawable-port-hdpi" = @{ Size = @(480, 800); Source = $splashSource }
  "drawable-port-xhdpi" = @{ Size = @(720, 1280); Source = $splashSource }
  "drawable-port-xxhdpi" = @{ Size = @(960, 1600); Source = $splashSource }
  "drawable-port-xxxhdpi" = @{ Size = @(1280, 1920); Source = $splashSource }
  "drawable-land-mdpi" = @{ Size = @(480, 320); Source = $splashLandscapeSource }
  "drawable-land-hdpi" = @{ Size = @(800, 480); Source = $splashLandscapeSource }
  "drawable-land-xhdpi" = @{ Size = @(1280, 720); Source = $splashLandscapeSource }
  "drawable-land-xxhdpi" = @{ Size = @(1600, 960); Source = $splashLandscapeSource }
  "drawable-land-xxxhdpi" = @{ Size = @(1920, 1280); Source = $splashLandscapeSource }
}
foreach ($entry in $splashSizes.GetEnumerator()) {
  $dimensions = $entry.Value.Size
  Export-SvgPng $entry.Value.Source (Join-Path (Join-Path $resources $entry.Key) "splash.png") $dimensions[0] $dimensions[1]
}
Export-SvgPng $splashLandscapeSource (Join-Path $resources "drawable\splash.png") 480 320

Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "Generated Play icon, feature graphic, Android launcher icons, and splash screens."
