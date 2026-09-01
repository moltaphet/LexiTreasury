"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createAccount } from "genlayer-js";

interface WalletState {
  privateKey: `0x${string}` | null;
  address: string | null;
  isConnected: boolean;
  connect: (rawKey: string) => { address: string } | { error: string };
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  privateKey: null,
  address: null,
  isConnected: false,
  connect: () => ({ error: "WalletProvider not mounted" }),
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [privateKey, setPrivateKey] = useState<`0x${string}` | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback((rawKey: string) => {
    if (!rawKey.startsWith("0x") || rawKey.length !== 66) {
      return { error: "Key must be a 0x-prefixed 32-byte hex string (66 chars)" };
    }
    try {
      const key = rawKey as `0x${string}`;
      const account = createAccount(key);
      setPrivateKey(key);
      setAddress(account.address);
      return { address: account.address };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : "Invalid private key" };
    }
  }, []);

  const disconnect = useCallback(() => {
    setPrivateKey(null);
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ privateKey, address, isConnected: !!address, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  return useContext(WalletContext);
}
