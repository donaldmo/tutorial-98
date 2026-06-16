#!/bin/bash
set -e

echo "Step 1: Installing pnpm globally..."
npm install -g pnpm

echo "Step 2: Installing project dependencies..."
pnpm install

echo "Step 3: Building client..."
pnpm run build

echo "Build completed successfully!"

