#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Only Docker is required on the destination machine.
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24-alpine node scripts/setup.mjs
