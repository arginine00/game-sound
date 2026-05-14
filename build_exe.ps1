$ErrorActionPreference = "Stop"

$modelSource = "models"
$existingDistModels = "dist\ImageFolderViewer\models"
if ((Test-Path $existingDistModels) -and -not (Test-Path (Join-Path $modelSource "wd14\model.onnx"))) {
  New-Item -ItemType Directory -Force -Path $modelSource | Out-Null
  Copy-Item -Path "$existingDistModels\*" -Destination $modelSource -Recurse -Force -ErrorAction SilentlyContinue
}

python -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --windowed `
  --name ImageFolderViewer `
  desktop_app.py

$modelTarget = "dist\ImageFolderViewer\models"
New-Item -ItemType Directory -Force -Path $modelTarget | Out-Null
foreach ($name in @("wd14", "deepdanbooru", "camie")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $modelTarget $name) | Out-Null
}
if (Test-Path $modelSource) {
  Copy-Item -Path "$modelSource\*" -Destination $modelTarget -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Built: dist\ImageFolderViewer\ImageFolderViewer.exe"
