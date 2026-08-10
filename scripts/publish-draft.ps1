$ErrorActionPreference = 'Stop'
$updateRepository = 'Danfreitasp/central-whatsapp-web-updates'
$taskVersion = node -p "require('./package.json').version"
$releaseTag = "v$taskVersion"
$installerPath = "dist/Central-WhatsApp-Web-Setup-$taskVersion.exe"
$blockmapPath = "$installerPath.blockmap"
$metadataPath = 'dist/latest.yml'

gh auth status | Out-Null

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
gh release view $releaseTag --repo $updateRepository *> $null
$releaseAlreadyExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $previousErrorPreference

if ($releaseAlreadyExists) {
  throw "A release $releaseTag já existe em $updateRepository."
}

npm test
if ($LASTEXITCODE -ne 0) { throw 'Os testes falharam. A release não será criada.' }

npm run build
if ($LASTEXITCODE -ne 0) { throw 'A geração do instalador falhou. A release não será criada.' }

foreach ($artifactPath in @($installerPath, $blockmapPath, $metadataPath)) {
  if (-not (Test-Path -LiteralPath $artifactPath)) {
    throw "Artefato obrigatório ausente: $artifactPath"
  }
}

gh release create $releaseTag `
  --repo $updateRepository `
  --draft `
  --title "Central WhatsApp Web $taskVersion" `
  --notes "Versão em validação. Publicar somente depois dos testes manuais e da aprovação." `
  $installerPath $blockmapPath $metadataPath

if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar a release em rascunho.' }

Write-Output "Release $releaseTag criada como rascunho. O updater ainda não consegue vê-la."
