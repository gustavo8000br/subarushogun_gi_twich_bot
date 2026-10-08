#!/usr/bin/env bash

set -euo pipefail

readonly EXPECTED_NODE_VERSION="v24.20.0"
readonly CODEX_CLI_VERSION="0.161.0"
readonly OPENGREP_VERSION="v1.30.0"
readonly OPENGREP_INSTALLER_URL="https://raw.githubusercontent.com/opengrep/opengrep/${OPENGREP_VERSION}/install.sh"

if [[ "$(node --version)" != "${EXPECTED_NODE_VERSION}" ]]; then
  printf 'Expected Node.js %s, found %s.\n' "${EXPECTED_NODE_VERSION}" "$(node --version)" >&2
  exit 1
fi

printf '\n==> Installing locked project dependencies with npm ci\n'
npm ci

printf '\n==> Installing Codex CLI %s\n' "${CODEX_CLI_VERSION}"
npm install --global "@openai/codex@${CODEX_CLI_VERSION}"

printf '\n==> Installing OpenGrep %s\n' "${OPENGREP_VERSION}"
installer_dir="$(mktemp -d)"
trap 'rm -rf "${installer_dir}"' EXIT
curl --fail --silent --show-error --location "${OPENGREP_INSTALLER_URL}" \
  --output "${installer_dir}/opengrep-install.sh"
bash "${installer_dir}/opengrep-install.sh" -v "${OPENGREP_VERSION}"
export PATH="${HOME}/.opengrep/cli/latest:${PATH}"
grep_path_line='export PATH="$HOME/.opengrep/cli/latest:$PATH"'
touch "${HOME}/.bashrc"
if ! grep --fixed-strings --quiet "${grep_path_line}" "${HOME}/.bashrc"; then
  printf '\n%s\n' "${grep_path_line}" >> "${HOME}/.bashrc"
fi

printf '\n==> Verifying Codespaces tools\n'
node --version
npm --version
git --version
gh --version | head --lines=1
docker --version
docker compose version
codex --version
opengrep --version

printf '\nCodespaces setup complete. Authenticate Codex in your own session with: codex login --device-auth\n'
