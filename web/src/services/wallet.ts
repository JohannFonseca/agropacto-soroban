import {
  isConnected,
  requestAccess,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

const PRODUCER_STORAGE_KEY = "agropacto_producer_secret_v1";
const BUYER_STORAGE_KEY = "agropacto_buyer_secret_v1";

export type WalletRole = "producer" | "buyer";
export type WalletMode = "freighter" | "testnet-keypair";

export interface WalletSession {
  address: string;
  mode: WalletMode;
  role: WalletRole;
  counterpartyAddress: string;
}

function getOrCreateKeypair(storageKey: string): Keypair {
  const saved = localStorage.getItem(storageKey);
  if (saved && StrKey.isValidEd25519SecretSeed(saved)) {
    return Keypair.fromSecret(saved);
  }
  const created = Keypair.random();
  localStorage.setItem(storageKey, created.secret());
  return created;
}

export function getDemoPairAddresses(): { producer: string; buyer: string } {
  const producer = getOrCreateKeypair(PRODUCER_STORAGE_KEY);
  const buyer = getOrCreateKeypair(BUYER_STORAGE_KEY);
  return {
    producer: producer.publicKey(),
    buyer: buyer.publicKey(),
  };
}

export async function isFreighterAvailable(): Promise<boolean> {
  try {
    const res = await isConnected();
    return Boolean(!res.error && res.isConnected);
  } catch {
    return false;
  }
}

export async function connectFreighter(role: WalletRole = "producer"): Promise<WalletSession> {
  const available = await isFreighterAvailable();
  if (!available) {
    throw new Error(
      "No se detectó la extensión Freighter en el navegador. Instalá Freighter o usá la Billetera Testnet Instantánea con Faucet automático."
    );
  }
  const res = await requestAccess();
  if (res.error || !res.address) {
    throw new Error(
      typeof res.error === "string"
        ? res.error
        : res.error?.message || "No se pudo autorizar Freighter Wallet."
    );
  }
  const demoPairs = getDemoPairAddresses();
  const counterparty = role === "producer" ? demoPairs.buyer : demoPairs.producer;
  return {
    address: res.address,
    mode: "freighter",
    role,
    counterpartyAddress: counterparty,
  };
}

export function connectInstantTestnetWallet(role: WalletRole = "producer"): WalletSession {
  const producerKp = getOrCreateKeypair(PRODUCER_STORAGE_KEY);
  const buyerKp = getOrCreateKeypair(BUYER_STORAGE_KEY);

  return {
    address: role === "producer" ? producerKp.publicKey() : buyerKp.publicKey(),
    mode: "testnet-keypair",
    role,
    counterpartyAddress: role === "producer" ? buyerKp.publicKey() : producerKp.publicKey(),
  };
}

export async function restoreSession(): Promise<WalletSession | null> {
  const savedMode = localStorage.getItem("agropacto_active_mode") as WalletMode | null;
  const savedRole = (localStorage.getItem("agropacto_active_role") as WalletRole) || "producer";

  if (savedMode === "testnet-keypair") {
    return connectInstantTestnetWallet(savedRole);
  }

  if (await isFreighterAvailable()) {
    const res = await getAddress();
    if (!res.error && res.address) {
      const demoPairs = getDemoPairAddresses();
      return {
        address: res.address,
        mode: "freighter",
        role: savedRole,
        counterpartyAddress: savedRole === "producer" ? demoPairs.buyer : demoPairs.producer,
      };
    }
  }
  return null;
}

export function saveActiveSessionMeta(mode: WalletMode | null, role: WalletRole) {
  if (!mode) {
    localStorage.removeItem("agropacto_active_mode");
  } else {
    localStorage.setItem("agropacto_active_mode", mode);
  }
  localStorage.setItem("agropacto_active_role", role);
}

export async function signSorobanTransactionXdr(
  unsignedXdr: string,
  networkPassphrase: string,
  session: WalletSession,
  signerAddress?: string
): Promise<{ mode: "freighter-signed" | "local-keypair"; signedXdr?: string; keypair?: Keypair }> {
  const targetAddress = signerAddress || session.address;

  const producerKp = getOrCreateKeypair(PRODUCER_STORAGE_KEY);
  const buyerKp = getOrCreateKeypair(BUYER_STORAGE_KEY);

  if (session.mode === "testnet-keypair" || targetAddress === producerKp.publicKey() || targetAddress === buyerKp.publicKey()) {
    const kp = targetAddress === buyerKp.publicKey() ? buyerKp : producerKp;
    return {
      mode: "local-keypair",
      keypair: kp,
    };
  }

  const signed = await signTransaction(unsignedXdr, {
    networkPassphrase,
    address: targetAddress,
  });

  if (signed.error || !signed.signedTxXdr) {
    throw new Error(
      typeof signed.error === "string"
        ? signed.error
        : signed.error?.message || "Firma cancelada en Freighter Wallet."
    );
  }

  return {
    mode: "freighter-signed",
    signedXdr: signed.signedTxXdr,
  };
}

export function shortenKey(key: string): string {
  if (!key || key.length < 12) return key || "";
  return `${key.slice(0, 6)}...${key.slice(-6)}`;
}
