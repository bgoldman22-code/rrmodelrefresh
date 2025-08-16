#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost:8888}"

echo "== Odds diagnostics =="
curl -s "${BASE}/.netlify/functions/odds-diagnostics?league=mlb" | jq . || true

echo "== Props (player_home_runs) =="
curl -s "${BASE}/.netlify/functions/odds-props?league=mlb" | jq '.usingOddsApi,.reason,.rows[:5]' || true
