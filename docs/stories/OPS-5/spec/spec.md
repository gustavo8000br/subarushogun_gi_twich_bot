# OPS-5 specification — lifecycle setup entrypoints and CI artifacts

[Português brasileiro](../../../pt-BR/stories/OPS-5/spec/spec.md)

**Status:** planning draft. This is a proposal for refinement, not implementation authorization.

## Goal

Provide one understandable lifecycle entrypoint per supported OS family for first setup, update, and uninstall. Use a GitHub Actions workflow with native OS runners to test and package the platform deliverables from reviewed repository sources. The runner application is open source; GitHub-hosted Actions is a hosted service.

## Product behavior

- Windows gets one PowerShell entrypoint; supported Linux/macOS targets share a POSIX shell entrypoint when their tested requirements match.
- The entrypoint presents `setup/start`, `update`, and `uninstall` menu/argument actions.
- It detects Docker CLI, daemon availability, Compose v2, supported OS, and architecture before changing the product.
- It explains missing prerequisites and offers only explicitly consented, supported installation steps. It never silently elevates, enables host virtualization, accepts vendor terms, or executes unchecked downloads.
- Update preserves product volumes and reports the image/version source.
- Uninstall keeps the existing preserve-data/delete-data choice, requires typed confirmation for deletion, removes only product resources, and never removes Docker as a shared dependency.
- The entrypoint is idempotent and supports paths containing spaces.

## CI behavior

- A GitHub Actions matrix runs shell contract tests on native Linux/macOS runners and PowerShell contract tests on Windows.
- CI covers quoting, path spaces, cancellation, missing dependencies, failure/recovery paths, elevation boundaries, Compose health, and uninstall volume policy.
- The workflow packages one artifact per OS family from checked-in, reviewed source files and uploads them for inspection. Generated artifacts never get committed back to the source branch.
- Workflow permissions are minimal; third-party actions are pinned to full commit SHAs and updates are reviewed through PRs.
- Release attachment is a separate authorized step. PR CI does not publish releases or tags.
- CI runner checks are labeled separately from manual acceptance on native user machines.
- The runner application is MIT-licensed/open source; GitHub-hosted Actions remains a hosted service and the full control plane is not open source. Self-hosting is an optional operations cost, not the default recommendation.

## Security and operations

- Never uninstall or mutate a shared Docker installation.
- Do not print credentials, OAuth material, database secrets, or connection strings.
- Verify signatures/checksums for downloaded installers when the vendor publishes them; fail closed if a verification contract exists but fails.
- A failed dependency install does not delete product data and leaves explicit recovery instructions.
- Do not promise automatic Docker host updates; this workflow packages the product lifecycle entrypoints only.

## Open decisions

1. Exact supported Windows, macOS, Linux distributions, and CPU architectures.
2. Whether the Windows deliverable remains `.ps1` or requires a signed executable wrapper.
3. Which prerequisite steps can be automated on each supported OS, versus official manual guidance.
4. Whether distributable CI artifacts are needed on every PR or only on pushes/manual dispatch.

See [`research.json`](research.json) for the official-source research and alternatives.
