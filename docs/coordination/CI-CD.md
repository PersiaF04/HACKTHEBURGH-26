# CI and delivery

## What is in place

GitHub Actions runs Markdown lint on pull requests targeting `main` and on pushes to `main`. This gives the current documentation-only starter a real, relevant check.

## Add application CI after the idea is selected

Once the team chooses the app stack, add its smallest useful build, test, and packaging checks to `.github/workflows/ci.yml`. Keep required checks fast and tied to real project risks. Update the PRD with the commands and merge requirements.

## Add deployment when there is a target

Automated deployment is intentionally not configured yet because the application type, host, and deployment credentials are undecided. After the team chooses them, create a deployment workflow that runs only after the agreed CI checks pass, stores credentials in GitHub Actions secrets or environments, and has a documented rollback or demo fallback. Record the target and trigger in the PRD before enabling deployment.
