# 🚀 Deployment Guide

## Quick Deploy to Railway

### Prerequisites
- GitHub account connected to Railway
- Project pushed to GitHub

### Steps

1. **Visit Railway:**
   ```
   https://railway.app/new
   ```

2. **Deploy from GitHub:**
   - Click "Deploy from GitHub repo"
   - Select: `jidra1/moltiverse-world-agent`
   - Click "Deploy"

3. **Generate Public URL:**
   - Go to Settings → Networking
   - Click "Generate Domain"
   - Save your URL: `https://your-app.up.railway.app`

4. **Start Demo Agents (Optional):**

   In Railway dashboard, add a new service:
   - Click "+ New"
   - Select "Empty Service"
   - Connect same GitHub repo
   - In "Settings" → "Start Command": `npm run agents`
   - This keeps 3 demo agents running 24/7

5. **Test Your Deployment:**
   ```bash
   # Check if server is up
   curl https://your-app.up.railway.app/api/state

   # Open in browser
   open https://your-app.up.railway.app
   ```

## Alternative: Deploy to Render.com

1. Visit: https://render.com/
2. Click "New +" → "Web Service"
3. Connect GitHub: `jidra1/moltiverse-world-agent`
4. Settings:
   - Name: `moltiverse-world-agent`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
5. Click "Create Web Service"

## Environment Variables (Optional)

If deploying the token economy:

```
TREASURY_PRIVATE_KEY=0x...
REALM_TOKEN_ADDRESS=0x...
MONAD_RPC_URL=https://rpc.monad.xyz
```

Add these in Railway/Render dashboard under "Environment Variables"

## Testing Deployment

```bash
# 1. Check server health
curl https://your-url.app/api/state

# 2. Enter a test agent
curl -X POST https://your-url.app/api/enter \
  -H "Content-Type: application/json" \
  -d '{"agentId":"test-agent","class":"warrior","proof":{}}'

# 3. Check agent status
curl https://your-url.app/api/agent/test-agent

# 4. Open in browser
open https://your-url.app
```

## Troubleshooting

**Server won't start:**
- Check Railway logs for errors
- Ensure `npm start` works locally first
- Verify all dependencies in package.json

**Can't access frontend:**
- Ensure `client/dist` was built: `npm run build`
- Check server serves static files (see server/index.js line 50)

**WebSocket not connecting:**
- Railway auto-configures WebSocket support
- Check browser console for errors
- Verify URL uses `wss://` not `ws://`

## Post-Deployment

1. **Update README** with live demo URL
2. **Test with demo agents** by running locally and pointing to deployed URL
3. **Add URL to submission form**
4. **Share with judges!**
