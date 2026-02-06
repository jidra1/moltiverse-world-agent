// Treasury module — on-chain integration for $REALM token via nad.fun bonding curve

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
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

// Contract addresses (nad.fun mainnet)
const BONDING_CURVE_LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';

// ABIs (inline via parseAbi)
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const LENS_ABI = parseAbi([
  'function isGraduated(address token) view returns (bool)',
]);

let treasuryWallet = null;
let publicClient = null;
let walletClient = null;
let tokenAddress = null;

export function initTreasury() {
  const privateKey = process.env.TREASURY_PRIVATE_KEY;
  tokenAddress = process.env.REALM_TOKEN_ADDRESS;

  if (!privateKey || !tokenAddress) {
    console.log('Token economy disabled: TREASURY_PRIVATE_KEY and REALM_TOKEN_ADDRESS env vars not set');
    return;
  }

  try {
    // Create clients
    const rpcUrl = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz';
    publicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(rpcUrl),
    });

    const account = privateKeyToAccount(privateKey);
    treasuryWallet = account.address;

    walletClient = createWalletClient({
      account,
      chain: monadMainnet,
      transport: http(rpcUrl),
    });

    console.log(`Treasury enabled: ${treasuryWallet}`);
    console.log(`$REALM token: ${tokenAddress}`);
  } catch (err) {
    console.error('Treasury init failed:', err.message);
    treasuryWallet = null;
    publicClient = null;
    walletClient = null;
  }
}

export function isTreasuryEnabled() {
  return !!(treasuryWallet && tokenAddress);
}

export async function isTokenGraduated() {
  if (!publicClient || !tokenAddress) return false;
  try {
    const graduated = await publicClient.readContract({
      address: BONDING_CURVE_LENS,
      abi: LENS_ABI,
      functionName: 'isGraduated',
      args: [tokenAddress],
    });
    return graduated;
  } catch (err) {
    console.error('isGraduated check failed:', err.message);
    return false;
  }
}

export async function getTreasuryBalance() {
  if (!publicClient || !tokenAddress || !treasuryWallet) return 0n;
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [treasuryWallet],
    });
    return balance;
  } catch (err) {
    console.error('getTreasuryBalance failed:', err.message);
    return 0n;
  }
}

export async function transferRealm(toAddress, amount) {
  if (!walletClient || !tokenAddress || !treasuryWallet) {
    throw new Error('Treasury not initialized');
  }

  // Check if token is graduated
  const graduated = await isTokenGraduated();
  if (!graduated) {
    throw new Error('Token not yet graduated to DEX — transfers disabled during bonding curve phase');
  }

  // Check treasury balance
  const balance = await getTreasuryBalance();
  if (balance < amount) {
    throw new Error(`Insufficient treasury balance: have ${balance}, need ${amount}`);
  }

  // Execute transfer
  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [toAddress, amount],
  });

  // Wait for receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export function getTreasuryAddress() {
  return treasuryWallet;
}
