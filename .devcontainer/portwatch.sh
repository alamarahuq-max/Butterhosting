#!/usr/bin/env bash
# Re-applies "public" to port 8080 every minute (Codespaces resets it to private after restarts).
# Needs the Codespaces secret GH_TOKEN: a classic personal access token with the "codespace" scope.
warned=0
while true; do
  if gh codespace ports visibility 8080:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then warned=0
  elif [ $warned -eq 0 ]; then echo "[ports] couldn't set 8080 public. Add the GH_TOKEN Codespaces secret (classic PAT, scope: codespace)." >>/tmp/butterhosting.log; warned=1; fi
  sleep 60
done
