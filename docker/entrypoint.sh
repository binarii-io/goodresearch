#!/bin/sh
set -e
case "$1" in
  server|worker|migrate) exec node "apps/api/src/$1.ts" ;;
  *) exec "$@" ;;
esac
