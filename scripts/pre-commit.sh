#!/bin/sh
set -e

echo "=== SatyaRPL Pre-Commit Quality Gate ==="
echo "1. Checking TypeScript types..."
npx tsc --noEmit

echo "2. Checking ESLint..."
npm run lint

echo "3. Running Test Suite..."
npm run test

echo "All quality gates passed!"
