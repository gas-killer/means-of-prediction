#!/usr/bin/env node
// Fund the demo's featured Sepolia markets with TestUSDC liquidity.
//   PRIVATE_KEY=0x… node scripts/seed-liquidity.mjs [--dry-run]
//
// TestUSDC has an open mint, so the key only needs Sepolia ETH for gas. A market
// with no liquidity yet gets AMOUNT at its starting YES price (via the FPMM's
// distributionHint); a market already funded is skipped. Every write is simulated
// first, and a market whose simulation fails is reported and skipped.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, maxUint256, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const DRY_RUN = process.argv.includes("--dry-run");
const AMOUNT = parseUnits(process.env.AMOUNT ?? "5000", 6);
const RPC = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

// Market id -> starting YES price in percent. Keep in sync with src/data/featured-markets.ts.
const START_YES = { 41: 6, 26: 3, 14: 5, 36: 3, 24: 4, 29: 2, 2: 7, 21: 4, 34: 2 };

const abi = (name) =>
  JSON.parse(readFileSync(new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8")).abi;
const factoryAbi = abi("MarketFactory");
const marketAbi = abi("HeadlineMarket");
const fpmmAbi = abi("FPMM");
const usdcAbi = abi("TestUSDC");
const deployment = JSON.parse(readFileSync(new URL("../../contracts/deployments/sepolia.json", import.meta.url), "utf8"));

const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
const account = process.env.PRIVATE_KEY ? privateKeyToAccount(process.env.PRIVATE_KEY) : null;
if (!account && !DRY_RUN) {
  console.error("usage: PRIVATE_KEY=0x… node scripts/seed-liquidity.mjs [--dry-run]");
  process.exit(1);
}
const walletClient = account && createWalletClient({ account, chain: sepolia, transport: http(RPC) });

async function send(req) {
  const { request } = await publicClient.simulateContract({ account, ...req });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
  return hash;
}

if (account) console.log(`funder ${account.address}, ${await publicClient.getBalance({ address: account.address }) / 10n ** 15n} mETH`);

for (const [idStr, yes] of Object.entries(START_YES)) {
  const id = Number(idStr);
  const { market, fpmm } = await publicClient.readContract({
    address: deployment.factory, abi: factoryAbi, functionName: "getMarket", args: [BigInt(id)],
  });
  const [question, collateral, supply] = await Promise.all([
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "question" }),
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "collateralToken" }),
    publicClient.readContract({ address: fpmm, abi: fpmmAbi, functionName: "totalSupply" }),
  ]);
  const label = `#${id} ${question.slice(0, 70)}`;
  if (supply > 0n) { console.log(`skip ${label}: already funded`); continue; }
  console.log(`fund ${label}: ${AMOUNT / 10n ** 6n} USDC at ${yes}% YES`);
  if (DRY_RUN) continue;
  try {
    const balance = await publicClient.readContract({ address: collateral, abi: usdcAbi, functionName: "balanceOf", args: [account.address] });
    if (balance < AMOUNT) await send({ address: collateral, abi: usdcAbi, functionName: "mint", args: [account.address, AMOUNT * 10n] });
    const allowance = await publicClient.readContract({ address: collateral, abi: usdcAbi, functionName: "allowance", args: [account.address, fpmm] });
    if (allowance < AMOUNT) await send({ address: collateral, abi: usdcAbi, functionName: "approve", args: [fpmm, maxUint256] });
    // Pool holds YES:NO at (100 - yes):yes, so the YES price is yes%.
    const hash = await send({ address: fpmm, abi: fpmmAbi, functionName: "addFunding", args: [AMOUNT, [BigInt(100 - yes), BigInt(yes)], account.address] });
    console.log(`  ok ${hash}`);
  } catch (e) {
    console.log(`  failed: ${e.shortMessage ?? e.message}`);
  }
}
