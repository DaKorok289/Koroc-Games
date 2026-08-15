#!/bin/bash
# Launched by launchd (com.korokgames.dev) to keep the Korok Games dev servers running.
export PATH="/Users/devagarwal/.nvm/versions/node/v24.19.0/bin:$PATH"
cd "/Users/devagarwal/Java Script"
exec npm run dev
