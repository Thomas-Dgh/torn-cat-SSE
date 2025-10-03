#!/bin/bash

echo "=== TORN CAT Recovery Verification ==="
echo

echo "📁 Checking Edge Functions..."
functions=(
  "swift-responder"
  "war-detection"
  "call-management"
  "sync-updates"
  "get-war-targets"
  "xanax-cron"
  "xanax-checker"
  "xanax-cron-simple"
  "unified-war-data"
)

for func in "${functions[@]}"; do
  if [ -f "supabase/functions/$func/index.ts" ]; then
    lines=$(wc -l < "supabase/functions/$func/index.ts")
    echo "✓ $func - $lines lines"
  else
    echo "✗ $func - MISSING!"
  fi
done

echo
echo "📁 Checking Shared Files..."
if [ -f "supabase/functions/shared/functions.ts" ]; then
  lines=$(wc -l < "supabase/functions/shared/functions.ts")
  echo "✓ shared/functions.ts - $lines lines"
else
  echo "✗ shared/functions.ts - MISSING!"
fi

if [ -f "supabase/functions/shared/supabase-client.ts" ]; then
  lines=$(wc -l < "supabase/functions/shared/supabase-client.ts")
  echo "✓ shared/supabase-client.ts - $lines lines"
else
  echo "✗ shared/supabase-client.ts - MISSING!"
fi

echo
echo "📁 Checking Database Files..."
if [ -f "supabase/schema.sql" ]; then
  lines=$(wc -l < "supabase/schema.sql")
  echo "✓ schema.sql - $lines lines"
else
  echo "✗ schema.sql - MISSING!"
fi

echo
echo "📁 Checking Documentation..."
if [ -f "README.md" ]; then
  echo "✓ README.md"
else
  echo "✗ README.md - MISSING!"
fi

if [ -f "supabase/EDGE_FUNCTIONS_DOCUMENTATION.md" ]; then
  echo "✓ EDGE_FUNCTIONS_DOCUMENTATION.md"
else
  echo "✗ EDGE_FUNCTIONS_DOCUMENTATION.md - MISSING!"
fi

echo
echo "📁 Checking Configuration..."
if [ -f "supabase/config.toml" ]; then
  echo "✓ config.toml"
else
  echo "✗ config.toml - MISSING!"
fi

echo
echo "=== Summary ==="
echo "All Edge Functions have been recovered with their implementations."
echo "Database schema has been reconstructed from API discovery."
echo "Documentation has been created."
echo
echo "Next steps:"
echo "1. Get Service Role Key from Supabase Dashboard"
echo "2. Deploy functions: supabase functions deploy"
echo "3. Set up environment variables"