"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import studioDevDeployment from "@/config/studio-dev-deployment.json";

const STUDIO_DEV = {
  chainId: `0x${studioDevDeployment.chain_id.toString(16)}`,
  chainName: studioDevDeployment.chain_name,
  nativeCurrency: studioDevDeployment.native_currency,
  rpcUrls: [studioDevDeployment.rpc_url],
  blockExplorerUrls: [studioDevDeployment.explorer_base_url],
} as const;

// Minimal EIP-1193 provider interface
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isHydrated: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  isConnected: false,
  isHydrated: false,
  connect: async () => { throw new Error("WalletProvider not mounted"); },
  disconnect: () => {},
});

// Switch to or add Studio Dev in the injected wallet.
async function ensureStudioDev(provider: EthereumProvider): Promise<void> {
  const current = await provider.request({ method: "eth_chainId" }) as string;
  if (current === STUDIO_DEV.chainId) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIO_DEV.chainId }],
    });
  } catch (err: unknown) {
    // 4902 = chain not added to the wallet yet
    if ((err as { code?: number }).code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [STUDIO_DEV],
      });
    } else {
      throw err;
    }
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // On mount: silently check if the user already granted access.
  // eth_accounts never prompts; eth_requestAccounts would.
  useEffect(() => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) {
      const timer = window.setTimeout(() => setIsHydrated(true), 0);
      return () => window.clearTimeout(timer);
    }

    (provider.request({ method: "eth_accounts" }) as Promise<string[]>)
      .then((accounts) => {
        if (accounts && accounts.length > 0) setAddress(accounts[0]);
      })
      .catch(() => { /* provider present but request failed -- ignore */ })
      .finally(() => setIsHydrated(true));

    // Keep UI in sync when the user switches accounts or chains.
    const handleAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      setAddress(list.length > 0 ? list[0] : null);
    };
    const handleChainChanged = () => {
      // Standard practice: reload so all state is consistent.
      window.location.reload();
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) {
      throw new Error(
        "No injected wallet detected. Install MetaMask or Rabby and try again."
      );
    }

    // Request accounts -- triggers the MetaMask connection prompt.
    const accounts = await provider.request({
      method: "eth_requestAccounts",
    }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts returned from wallet.");
    }

    // Ensure the wallet matches the SDK chain before storing the address.
    await ensureStudioDev(provider);

    setAddress(accounts[0]);
  }, []);

  const disconnect = useCallback(() => {
    // EIP-1193 has no programmatic disconnect; we just clear local state.
    // The user can revoke site access inside MetaMask if needed.
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, isConnected: !!address, isHydrated, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  return useContext(WalletContext);
}
