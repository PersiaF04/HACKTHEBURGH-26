$ErrorActionPreference = 'Stop'

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    throw 'GitHub CLI (gh) is required. Install it and run gh auth login.'
}

$repo = 'PersiaF04/HACKTHEBURGH-26'
$endpoint = "repos/$repo/issues?state=open&labels=agent-message&per_page=100"
$filter = '.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR") | "#\(.number) \(.title) from @\(.user.login) (updated \(.updated_at)) \(.html_url)"'
$messages = @(& $gh.Source api $endpoint --jq $filter)
if ($LASTEXITCODE -ne 0) {
    throw 'Could not read the shared inbox. Check gh auth status and repository access.'
}

if ($messages.Count -eq 0) {
    Write-Output "No open trusted agent messages for $repo."
    return
}

Write-Output "Open agent conversations for $repo. Read the issue and comments before acting:"
$messages | ForEach-Object { Write-Output $_ }
