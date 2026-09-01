"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { createAccount } from "genlayer-js";

const STORAGE_KEY = "lexitreasury_wallet_key";

interface WalletState {
  privateKey: `0x${string}` | null;
  address: string | null;
  isConnected: boolean;
  isHydrated: boolean;
  connect: (rawKey: string) => { address: string } | { error: string };
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  privateKey: null,
  address: null,
  isConnected: false,
  isHydrated: false,
  connect: () => ({ error: "WalletProvider not mounted" }),
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [privateKey, setPrivateKey] = useState<`0x${string}` | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore wallet from localStorage after mount.
  // Must run client-side only; localStorage does not exist on the server.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored.startsWith("0x") && stored.length === 66) {
        const key = stored as `0x${string}`;
        const account = createAccount(key);
        setPrivateKey(key);
        setAddress(account.address);
      }
    } catch {
      // Stored key is corrupt or createAccount failed; wipe it.
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    setIsHydrated(true);
  }, []);

  const connect = useCallback((rawKey: string) => {
    if (!rawKey.startsWith("0x") || rawKey.length !== 66) {
      return { error: "Key must be a 0x-prefixed 32-byte hex string (66 chars)" };
    }
    try {
      const key = rawKey as `0x${string}`;
      const account = createAccount(key);
      setPrivateKey(key);
      setAddress(account.address);
      localStorage.setItem(STORAGE_KEY, key);
      return { address: account.address };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : "Invalid private key" };
    }
  }, []);

  const disconnect = useCallback(() => {
    setPrivateKey(null);
    setAddress(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <WalletContext.Provider
      value={{ privateKey, address, isConnected: !!address, isHydrated, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  return useContext(WalletContext);
}
