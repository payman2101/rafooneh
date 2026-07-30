# Agent Instructions & Project Rules

## Git & GitHub Branch Strategy
- **Always Start from Latest GitHub `main`**: At the beginning of every new chat session or task, immediately run `git fetch origin main` and create/checkout the new feature or session branch directly off `origin/main` (e.g., `git checkout -b feature/<task-description> origin/main`).
- **Never Branch off Stale Local Commits**: Ensure the base commit is always `origin/main` so the new branch is 0 commits behind `main` on GitHub and can be merged seamlessly without conflicts or PR errors.
- **Apply Changes on Active Branch**: Apply all file modifications, additions, and commits exclusively on this active branch.
- **Automated Authentication**: Always use the stored GitHub token in `origin` remote URL (`https://<GITHUB_TOKEN>@github.com/payman2101/rafooneh.git`) to seamlessly push branches and merge without asking the user for credentials.
- **Push Branch to Remote**: Push the newly created branch to GitHub (`git push -u origin <branch-name>`) when changes are made.

