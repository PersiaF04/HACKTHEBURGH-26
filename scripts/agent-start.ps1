#!/usr/bin/env pwsh
<#
Run once when starting or resuming an agent session from this repository.
Requires GitHub CLI (gh) authenticated with repository access.
#>

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is required. Install it, then run gh auth login.'
}

$null = & gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI is not authenticated. Run gh auth login and retry.'
}

$repoInfo = & gh repo view --json nameWithOwner | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $repoInfo.nameWithOwner) {
    throw 'Could not identify the current GitHub repository. Run this from a cloned repository.'
}
$repo = $repoInfo.nameWithOwner

Write-Output "Repository: $repo"
Write-Output ''
Write-Output 'Open issues assigned to you:'
& gh issue list --repo $repo --assignee '@me' --state open --limit 100 --json number,title,labels,url
if ($LASTEXITCODE -ne 0) { throw 'Could not list assigned issues.' }

Write-Output ''
Write-Output 'Open pull requests (check review requests and latest activity):'
& gh pr list --repo $repo --state open --limit 100 --json number,title,author,createdAt,reviewDecision,reviewRequests,url
if ($LASTEXITCODE -ne 0) { throw 'Could not list open pull requests.' }

Write-Output ''
Write-Output 'Open repository agent messages:'
$inboxScript = Join-Path $PSScriptRoot 'team-inbox.ps1'
& $inboxScript
if ($LASTEXITCODE -ne 0) { throw 'Could not read the repository agent inbox.' }
