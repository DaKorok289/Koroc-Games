#!/bin/bash
# Launched by launchd (com.korocgames.dev) to keep the Koroc Games dev servers running.
export PATH="/Users/devagarwal/.nvm/versions/node/v24.19.0/bin:$PATH"
cd "/Users/devagarwal/Java Script"
exec npm run dev
