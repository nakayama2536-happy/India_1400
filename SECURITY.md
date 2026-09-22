# Security Policy for This Public Repository

This is an internet-visible GitHub Pages repository.

- Do not commit API keys, personal access tokens, passwords, private keys, or .env files.
- Do not store personal portfolio/account data such as holdings, quantities, average cost, cost basis, account type, position IDs, planned purchase size, or transaction history.
- API credentials used by GitHub Actions must remain in GitHub Actions Secrets.
- Keep Security Check and Dependabot enabled.
- Treat all source code and JSON committed here as publicly readable.
- A failed Security Check must be investigated before further publication.

Future target architecture: keep calculation/data-acquisition logic in a Private core repository and publish only a sanitized snapshot plus PWA display files here.
