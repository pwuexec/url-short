# Copilot Commit Message Instructions

When generating commit messages for this repository, use the **Conventional Commits 1.0.0** style.

## Standard Format

`<type>(optional-scope)!: <short imperative summary>`

- `type`: category of change (required, lowercase)
- `scope`: area affected (optional, lowercase)
- `!`: marks a breaking change (optional)
- `summary`: concise, imperative subject line

### SemVer Mapping

- `feat` -> **MINOR** version bump
- `fix` -> **PATCH** version bump
- `!` or `BREAKING CHANGE:` footer -> **MAJOR** version bump

## Rules

- Use lowercase `type`.
- Keep the summary concise (about 50-72 characters).
- Use imperative voice ("add", "fix", "update"), not past tense.
- Do not end the summary with a period.
- Keep the subject focused on *what changes* for users/developers.
- Add a body when useful to explain **why** and important context.
- Wrap body lines around ~72 characters.
- Reference issue IDs in the footer when available (example: `Refs #123`).

## Recommended Scopes (this repo)

Use one of these when applicable:

- `api`
- `redirect`
- `short-url`
- `validation`
- `readme`
- `deps`
- `ci`
- `worker`

## Common Types

- `feat`: a new feature
- `fix`: a bug fix
- `docs`: documentation only changes
- `refactor`: code change that neither fixes a bug nor adds a feature
- `test`: adding or updating tests
- `chore`: maintenance tasks (deps, tooling, config)

## Commit Template

```text
<type>(optional-scope): <short imperative summary>

[optional body]

[optional footer(s)]
```

Footer examples:

- `Refs #123`
- `Closes #456`
- `BREAKING CHANGE: redirects now require explicit protocol`

## Examples

- `feat(short-url): add custom alias support`
- `feat(api): return analytics for each short link`
- `fix(redirect): handle missing protocol in destination URL`
- `fix(validation): reject empty slug values`
- `docs(readme): add local development steps`
- `chore(deps): upgrade wrangler to latest version`

### Breaking Change Examples

- `feat(api)!: require authenticated analytics requests`

```text
refactor(worker)!: split redirect response contract

BREAKING CHANGE: redirect handler now returns Response objects only.
```

## Good vs Bad Subjects

Good:

- `fix(redirect): prevent loop on self-referencing URL`
- `feat(short-url): support optional expiration date`

Bad:

- `fixed stuff`
- `update code`
- `feat: Added New Feature.`

## Optional Body Example

```text
fix(redirect): prevent infinite loop on self-referencing URL

Detect when a short URL points to its own route and return a 400 response
instead of redirecting recursively.

Refs #42
```
