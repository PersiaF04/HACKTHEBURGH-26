# Vercel CI deployments

The `Vercel preview` GitHub Actions workflow deploys same-repository pull requests as Vercel previews using the project owner's token. This avoids Vercel Hobby's restriction on deploying private-repository commits authored by collaborators, while preserving the original commit authorship.

## Required repository secret

Add `VERCEL_TOKEN` under **Settings → Secrets and variables → Actions** for this repository. Create the token in Vercel for the `persia3` team and grant it project deployment access to `whitespace`. Do not commit the token or put it in a workflow file.

The workflow links to Vercel project `whitespace` in team `persia3` and runs from the repository root. The Vercel project is configured with `whitespace/web` as its root directory.

## Deployment behavior

- Pull requests targeting `main` from branches in this repository get a preview deployment.
- Pull requests from forks do not receive the secret and are not deployed.
- Draft pull requests are skipped until marked ready for review.
- Main-branch production deployment remains handled by the connected Vercel Git project when the owner merges changes. Review and approve the preview before merging.
- If `VERCEL_TOKEN` is not configured, preview deployment is skipped with a notice; ordinary CI continues to run.

This workflow does not change Git commit authorship, Vercel plan, project domains, or production aliases.
