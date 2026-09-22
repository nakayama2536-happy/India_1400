# Security Policy for This Public Repository

This is an internet-visible GitHub Pages repository.

- Do not commit API keys, personal access tokens, passwords, private keys, or .env files.
- Do not store personal portfolio/account data such as holdings, quantities, average cost, cost basis, account type, position IDs, planned purchase size, or transaction history.
- Data acquisition and calculation logic belongs in the Private `india-stock-check` core repository.
- This Public repository receives only public-safe JSON snapshots and PWA display files.
- API credentials are not required by the Public PWA update path.
- Keep Security Check and Dependabot enabled.
- Treat all source code and JSON committed here as publicly readable.
- A failed Security Check must be investigated before further publication.

Current architecture:

`Private india-stock-check → public-safe validation → Public India_1400 → GitHub Pages`
