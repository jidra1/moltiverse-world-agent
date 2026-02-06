# Token Creation Scripts

## realm-token.png

Replace `realm-token.png` with your desired token image before running the create-token script.

**Requirements:**
- PNG format
- Recommended size: 512x512 or 1024x1024
- Should represent the $REALM token branding

The current file is just a 1x1 transparent placeholder.

## create-token.js

One-time script to deploy the $REALM token on nad.fun's bonding curve (Monad mainnet).

**Prerequisites:**
1. Set `TREASURY_PRIVATE_KEY` environment variable to your wallet private key
2. Ensure wallet has at least 15 MON (for deploy fee + gas)
3. Replace `realm-token.png` with your actual token image

**Usage:**
```bash
TREASURY_PRIVATE_KEY=0x... npm run create-token
```

The script will:
1. Upload your token image to nad.fun
2. Create token metadata
3. Deploy the token on-chain via the bonding curve router
4. Output the transaction hash

After deployment, check MonadVision explorer or nad.fun UI to find your token address, then add it to `.env`:
```
REALM_TOKEN_ADDRESS=0x...
TREASURY_PRIVATE_KEY=0x...
```
