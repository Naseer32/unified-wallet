import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { createSolanaKitAdapterFromProvider } from "@circle-fin/adapter-solana-kit";

const kit = new AppKit();

function getInjectedEvmProvider(requiredRdns) {
  return new Promise((resolve, reject) => {
    const providers = new Map();

    function onAnnounce(event) {
      providers.set(event.detail.info.uuid, event.detail);
    }

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);

      const found = requiredRdns
        ? [...providers.values()].find(({ info }) => info.rdns === requiredRdns)?.provider
        : [...providers.values()][0]?.provider;

      if (!found) {
        if (window.ethereum) {
          resolve(window.ethereum);
        } else {
          reject(new Error(requiredRdns ? `No wallet found for ${requiredRdns}` : "No injected wallet found"));
        }
        return;
      }
      resolve(found);
    }, 250);
  });
}

export async function connectMetaMask() {
  const provider = await getInjectedEvmProvider("io.metamask");
  const [address] = await provider.request({ method: "eth_requestAccounts", params: undefined });
  const adapter = await createViemAdapterFromProvider({ provider });
  return { adapter, address };
}

export async function connectPhantom() {
  if (!window.solana) {
    throw new Error("Phantom not found. Install it from phantom.com.");
  }
  const resp = await window.solana.connect();
  const adapter = await createSolanaKitAdapterFromProvider({ provider: window.solana });
  return { adapter, address: resp.publicKey.toString() };
}

export async function deposit({ adapter, chain, amount, token = "USDC" }) {
  return kit.unifiedBalance.deposit({
    from: { adapter, chain },
    amount,
    token,
  });
}

export async function spend({ adapter, toChain, recipientAddress, amount, token = "USDC" }) {
  return kit.unifiedBalance.spend({
    amount,
    token,
    from: { adapter },
    to: { adapter, chain: toChain, recipientAddress },
  });
}

export async function estimateSpend({ adapter, toChain, recipientAddress, amount, token = "USDC" }) {
  return kit.unifiedBalance.estimateSpend({
    amount,
    token,
    from: [{ adapter }],
    to: { adapter, chain: toChain, recipientAddress },
  });
}

export async function getBalances(address) {
  const balances = await kit.unifiedBalance.getBalances({
    sources: { account: address },
    networkType: "testnet",
    includePending: true,
  });
  return {
    confirmed: balances.totalConfirmedBalance,
    pending: balances.totalPendingBalance ?? "0.00",
    byChain: balances.balances ?? [],
  };
}

export { kit };
