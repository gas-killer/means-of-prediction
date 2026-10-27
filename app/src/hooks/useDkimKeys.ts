import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Hex } from "viem";
import { deployment, TRADES_FROM_BLOCK } from "../config";
import { abis, dkimKeyIndex } from "../contracts/gen";
import { publicClient } from "../lib/wallet";

const registeredEvent = parseAbiItem(
  "event DKIMKeyRegistered(string domainName, bytes32 indexed publicKeyHash, string selector)",
);

export interface DkimKey {
  domain: string;
  selector: string;
  publicKeyHash: Hex;
}

/** Registered DKIM public keys. Used to resolve an uploaded email's (domain, selector)
 * → the publicKeyHash the onchain verifier checks.
 *
 * Public RPCs prune old logs, so the registry's DKIMKeyRegistered history can't be
 * replayed from the deploy block. Instead every key in the published key list is
 * checked against registry state (isDKIMPublicKeyHashValid, batched via multicall),
 * which also drops revoked keys. Logs since TRADES_FROM_BLOCK add any key registered
 * after the list was generated; if that scan fails the state check still stands. */
export function useDkimKeys() {
  return useQuery({
    queryKey: ["dkim-keys"],
    staleTime: 60_000,
    queryFn: async (): Promise<DkimKey[]> => {
      const registry = deployment.dkimRegistry as Hex;
      const [valid, recent] = await Promise.all([
        publicClient.multicall({
          allowFailure: true,
          batchSize: 32_768,
          contracts: dkimKeyIndex.map(([domain, , hash]) => ({
            address: registry,
            abi: abis.DKIMRegistry,
            functionName: "isDKIMPublicKeyHashValid",
            args: [domain, hash],
          })),
        }),
        publicClient
          .getLogs({ address: registry, event: registeredEvent, fromBlock: TRADES_FROM_BLOCK })
          .catch(() => []),
      ]);
      const keys = new Map<string, DkimKey>();
      dkimKeyIndex.forEach(([domain, selector, publicKeyHash], i) => {
        if (valid[i].status === "success" && valid[i].result === true) {
          keys.set(`${domain}|${selector}|${publicKeyHash}`, { domain, selector, publicKeyHash });
        }
      });
      for (const l of recent) {
        const key = { domain: l.args.domainName as string, selector: l.args.selector as string, publicKeyHash: l.args.publicKeyHash as Hex };
        keys.set(`${key.domain}|${key.selector}|${key.publicKeyHash}`, key);
      }
      return [...keys.values()];
    },
  });
}

export function resolveKey(keys: DkimKey[] | undefined, domain: string, selector: string): Hex | null {
  return keys?.find((k) => k.domain === domain && k.selector === selector)?.publicKeyHash ?? null;
}
