#!/bin/sh
# Prints the version to build an image as: the short commit hash, plus "-dirty" when the working
# tree has uncommitted changes. It becomes APP_VERSION, which every stored run records
# (play_sessions.app_version) so a later scoring change never silently mixes results (R7). Only
# deploy images built from a clean tree, so the recorded hash identifies exactly the code that ran.
set -eu
hash=$(git rev-parse --short=12 HEAD)
if [ -n "$(git status --porcelain)" ]; then
  echo "${hash}-dirty"
else
  echo "${hash}"
fi
