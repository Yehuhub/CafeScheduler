#!/usr/bin/env bash
#
# Redeploy cafe-scheduler on the server.
# Pulls the latest code, rebuilds server + client, and restarts the API.
#
# The whole body lives in main() so that the `git pull` below cannot corrupt
# the running script: bash parses the entire function into memory before
# main is invoked on the last line.
#
set -euo pipefail

main() {
  # Serialize deploys: hold a lock for the whole run so overlapping triggers
  # (two pushes close together, or a manual run racing a webhook) queue and
  # wait here instead of running concurrently. The lock releases automatically
  # when the script exits, since the OS closes fd 9 on exit.
  exec 9>/tmp/cafe-deploy.lock
  flock 9

  # Operate on this script's own repo, regardless of where it's called from.
  local repo_dir
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$repo_dir"

  echo "==> Pulling latest code"
  git pull --ff-only

  echo "==> Installing dependencies"
  npm run install:all

  echo "==> Building server (prisma generate + migrate + tsc)"
  cd server
  npx prisma generate
  npx prisma migrate deploy
  npm run build
  cd ..

  echo "==> Building client"
  cd client
  npm run build
  cd ..

  echo "==> Restarting API service"
  sudo systemctl restart cafe-scheduler

  echo "==> Done. Current status:"
  systemctl --no-pager --lines=0 status cafe-scheduler
}

main "$@"
