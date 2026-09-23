# Release workflow

- Keep the public app version in `apps/desktop/package.json` and the desktop workspace entry in the root `package-lock.json` synchronized.
- For each completed release-sized change, bump the patch version for fixes, the minor version for backward-compatible features, and the major version for breaking changes. Do not bump again for follow-up corrections to the same unreleased change or when the user has already set the intended version.
- At completion, propose a short English commit title. After the user approves it, create the commit and push it. An explicit request to commit authorizes the commit; a commit-only request does not authorize a push.
- Include only the changes belonging to the requested task. Never publish a release or its binaries unless the user asks for that publication.
