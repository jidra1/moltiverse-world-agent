#!/usr/bin/env node
// One-time script to create $REALM token on nad.fun bonding curve (Monad mainnet)

import { readFileSync } from 'fs';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

// Monad Mainnet chain config
const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  network: 'monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.monad.xyz'] },
    public: { http: ['https://rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://monadvision.com' },
  },
});

// nad.fun Mainnet config
const NAD_API_URL = 'https://api.nadapp.net';
const BONDING_CURVE_ROUTER = '0x6F6B8F1a20703309951a5127c45B49b1CD981A22';
const BONDING_CURVE_FACTORY = '0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE';

// ABIs
const ROUTER_ABI = parseAbi([
  'function create(address curve, bytes32 salt, string memory name, string memory symbol, string memory uri, uint256 initialBuyAmount) payable returns (address token)',
]);

const FACTORY_ABI = parseAbi([
  'function feeConfig() view returns (uint256 deployFee, uint256 buyFee, uint256 sellFee)',
]);

async function main() {
  // 1. Load private key
  const privateKey = process.env.TREASURY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: TREASURY_PRIVATE_KEY environment variable not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Using wallet: ${account.address}`);

  // 2. Create clients
  const rpcUrl = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz';
  const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadMainnet,
    transport: http(rpcUrl),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Wallet balance: ${balance} wei (${Number(balance) / 1e18} MON)`);
  if (balance < parseEther('10')) {
    console.warn('Warning: Wallet balance is low. You may need at least 10-15 MON to cover deploy fee + gas.');
  }

  // 3. Read token image
  const imagePath = new URL('../scripts/realm-token.png', import.meta.url).pathname;
  let imageBuffer;
  try {
    imageBuffer = readFileSync(imagePath);
    console.log(`Loaded token image: ${imageBuffer.length} bytes`);
  } catch (err) {
    console.error(`Error: Could not read token image at ${imagePath}`);
    console.error('Make sure scripts/realm-token.png exists');
    process.exit(1);
  }

  // 4. Upload image to nad.fun
  console.log('\nUploading image to nad.fun...');
  const imageFormData = new FormData();
  const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
  imageFormData.append('file', imageBlob, 'realm-token.png');

  const imageRes = await fetch(`${NAD_API_URL}/agent/token/image`, {
    method: 'POST',
    body: imageFormData,
  });

  if (!imageRes.ok) {
    const errorText = await imageRes.text();
    console.error(`Image upload failed: ${imageRes.status} ${imageRes.statusText}`);
    console.error(errorText);
    process.exit(1);
  }

  const imageData = await imageRes.json();
  const imageUri = imageData.image_uri;
  console.log(`Image URI: ${imageUri}`);

  // 5. Create metadata
  console.log('\nCreating metadata...');
  const metadataRes = await fetch(`${NAD_API_URL}/agent/token/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Moltirealm',
      symbol: 'REALM',
      description: 'In-game currency for the Moltiverse world — earn gold, convert to $REALM, withdraw and sell for MON.',
      image: imageUri,
    }),
  });

  if (!metadataRes.ok) {
    const errorText = await metadataRes.text();
    console.error(`Metadata creation failed: ${metadataRes.status} ${metadataRes.statusText}`);
    console.error(errorText);
    process.exit(1);
  }

  const metadataData = await metadataRes.json();
  const metadataUri = metadataData.metadata_uri;
  console.log(`Metadata URI: ${metadataUri}`);

  // 6. Get salt
  console.log('\nGenerating salt...');
  const saltRes = await fetch(`${NAD_API_URL}/agent/salt`);
  if (!saltRes.ok) {
    const errorText = await saltRes.text();
    console.error(`Salt generation failed: ${saltRes.status} ${saltRes.statusText}`);
    console.error(errorText);
    process.exit(1);
  }

  const saltData = await saltRes.json();
  const salt = saltData.salt;
  console.log(`Salt: ${salt}`);

  // 7. Read deploy fee from factory
  console.log('\nReading deploy fee...');
  const feeConfig = await publicClient.readContract({
    address: BONDING_CURVE_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'feeConfig',
  });
  const deployFee = feeConfig[0];
  console.log(`Deploy fee: ${deployFee} wei (${Number(deployFee) / 1e18} MON)`);

  // 8. Deploy token via BondingCurveRouter.create()
  console.log('\nDeploying token on-chain...');
  console.log('This may take a minute...');

  const hash = await walletClient.writeContract({
    address: BONDING_CURVE_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'create',
    args: [
      BONDING_CURVE_FACTORY,  // curve
      salt,                    // salt
      'Moltirealm',           // name
      'REALM',                // symbol
      metadataUri,            // uri
      0n,                     // initialBuyAmount (0 = no initial buy)
    ],
    value: deployFee,
  });

  console.log(`Transaction hash: ${hash}`);
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== 'success') {
    console.error('Transaction failed!');
    process.exit(1);
  }

  // 9. Parse logs to get token address
  // The Router emits a TokenCreated event with the token address
  // For simplicity, we'll decode the first topic which should be the token address
  // In production you'd parse the event properly
  let tokenAddress = null;
  for (const log of receipt.logs) {
    // Look for logs from the Router contract
    if (log.address.toLowerCase() === BONDING_CURVE_ROUTER.toLowerCase()) {
      // The token address is typically in the log data or topics
      // For nad.fun, check the decoded logs or use a proper event decoder
      // As a fallback, you can check nadapp.net API or explorer
      console.log('Log found from Router:', log);
    }
  }

  // Alternative: compute token address from Create2
  // For now, instruct user to check explorer or nad.fun UI
  console.log('\n✅ Token deployed successfully!');
  console.log(`Transaction: https://monadvision.com/tx/${hash}`);
  console.log('\nTo find your token address:');
  console.log('1. Visit the transaction on MonadVision explorer');
  console.log('2. Look for the "TokenCreated" event in the logs');
  console.log('3. Or visit nad.fun and check your wallet\'s created tokens');
  console.log('\nOnce you have the token address, add it to your .env:');
  console.log(`REALM_TOKEN_ADDRESS=0x...`);
  console.log(`TREASURY_PRIVATE_KEY=${privateKey}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
