#!/usr/bin/env bash
set -euo pipefail

NS="dssim-test"
DEPLOYMENT="dssim-scenario"


POD=$(kubectl get pods -n "$NS" \
  -l app="$DEPLOYMENT" \
  -o jsonpath='{.items[0].metadata.name}')

echo "Using pod: $POD"

kubectl cp ./src/ \
  "$NS/$POD:/app/dssim-scenarios"

kubectl cp ./package.json \
  "$NS/$POD:/app/dssim-scenarios/package.json"

kubectl cp ./package-lock.json \
  "$NS/$POD:/app/dssim-scenarios/package-lock.json"

echo "Copied local src → pod"

kubectl exec -n "$NS" "$POD" -- ls -la /app/dssim-scenarios/src/scenarios

echo "Done — now run inside pod:"
echo "kubectl exec -it -n $NS $POD -- sh"