param([int]$Issue = 0)

$ErrorActionPreference = 'Stop'

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    throw 'GitHub CLI (gh) is required. Install it and run gh auth login.'
}

$repo = 'PersiaF04/HACKTHEBURGH-26'
$endpoint = if ($Issue -gt 0) {
    "repos/$repo/issues/$Issue/comments?per_page=100"
} else {
    "repos/$repo/issues?state=open&labels=agent-message&per_page=100"
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$response = & $gh.Source api $endpoint 2>&1
$ghExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($ghExitCode -ne 0) {
    throw (($response | Out-String).Trim())
}

$json = $response -join [Environment]::NewLine
$items = $json | ConvertFrom-Json
$trusted = @($items | Where-Object {
    $_.author_association -in @('OWNER', 'MEMBER', 'COLLABORATOR')
})

if ($Issue -gt 0) {
    if ($trusted.Count -eq 0) {
        Write-Output "No trusted team comments on #$Issue."
        return
    }
    foreach ($comment in $trusted) {
        Write-Output "@$($comment.user.login): $($comment.body)"
        Write-Output ''
    }
    return
}

$messages = @($trusted | Where-Object { -not $_.pull_request })
if ($messages.Count -eq 0) {
    Write-Output "No open trusted agent messages for $repo."
    return
}

Write-Output "Open agent conversations for $repo. Read the issue and comments before acting:"
$messages | ForEach-Object {
    Write-Output "#$($_.number) $($_.title) from @$($_.user.login) (updated $($_.updated_at)) $($_.html_url)"
}
