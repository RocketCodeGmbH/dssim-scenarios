#!/usr/bin/env bash
set -euo pipefail

NS=""
DEPLOYMENT="dssim-scenario"


POD=$(kubectl get pods -n "$NS" \
  -l app="$DEPLOYMENT" \
  -o jsonpath='{.items[0].metadata.name}')

echo "Using pod: $POD"
kubectl cp ./dssim-scenarios/src/ \
  "$NS/$POD:/app/dssim-scenarios"

echo "Copied local src → pod"

kubectl exec -n "$NS" "$POD" -- ls -la /app/dssim-scenarios/src/scenarios

echo "Done — now run inside pod:"
echo "kubectl exec -it -n $NS $POD -- sh"