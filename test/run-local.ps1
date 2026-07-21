# End-to-end local verification of the ghas-free-pack Docker action.
# Builds the image, runs it against test/fixtures with a mocked GitHub API,
# then asserts every acceptance criterion. Requires Docker Desktop + Node.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Remove-Item -Recurse -Force "$PSScriptRoot\out" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$PSScriptRoot\out" | Out-Null

Write-Host "== docker build =="
docker build -t ghas-free-pack:local $root
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "== starting mock GitHub API on :8899 =="
$mock = Start-Process node -ArgumentList "`"$PSScriptRoot\mock-github.js`"" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 1

try {
    Write-Host "== docker run (fixtures as workspace, PR event #1) =="
    docker run --rm `
        -v "$PSScriptRoot\fixtures:/github/workspace" `
        -v "$PSScriptRoot\event.json:/github/event.json:ro" `
        -v "$PSScriptRoot\out:/artifacts" `
        -e GITHUB_WORKSPACE=/github/workspace `
        -e GITHUB_REPOSITORY=octo-demo/fixture-repo `
        -e GITHUB_EVENT_NAME=pull_request `
        -e GITHUB_EVENT_PATH=/github/event.json `
        -e GITHUB_SHA=0123456789abcdef0123456789abcdef01234567 `
        -e GITHUB_REF=refs/pull/1/merge `
        -e GITHUB_API_URL=http://host.docker.internal:8899 `
        -e GITHUB_STEP_SUMMARY=/artifacts/step-summary.md `
        -e "INPUT_GITHUB-TOKEN=local-test-token" `
        -e "INPUT_ENABLE-PHPSTAN=true" `
        -e GFP_ARTIFACT_DIR=/artifacts `
        ghas-free-pack:local
    $actionExit = $LASTEXITCODE
    Write-Host "== action exit code: $actionExit (1 expected: fixtures contain errors) =="
}
finally {
    Stop-Process -Id $mock.Id -Force -ErrorAction SilentlyContinue
}

node "$PSScriptRoot\assert.js" $actionExit
exit $LASTEXITCODE
