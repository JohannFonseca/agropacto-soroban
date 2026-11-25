import {
  Horizon,
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
} from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";
import { WalletSession, signSorobanTransactionXdr } from "./wallet";

const horizonServer = new Horizon.Server(STELLAR_CONFIG.HORIZON_URL);
const sorobanServer = new rpc.Server(STELLAR_CONFIG.SOROBAN_RPC_URL);

const STROOPS = 10_000_000;

export interface HarvestLotData {
  id: number;
  producer: string;
  buyer: string;
  title: string;
  region: string;
  variety: string;
  quantity_kg: number;
  total_amount_xlm: number;
  released_amount_xlm: number;
  status: number;
  stage1_note: string;
  stage2_note: string;
  stage3_note: string;
  reported_stage: number;
  released_stage: number;
}

export interface PlatformMetricsData {
  total_lots: number;
  active_lots: number;
  completed_lots: number;
  total_volume_locked_xlm: number;
  total_volume_released_xlm: number;
}

export interface TxReceipt {
  hash: string;
  explorerUrl: string;
  fnName: string;
  timestamp: string;
}

export async function fetchAccountBalance(address: string): Promise<{ funded: boolean; xlm: string }> {
  try {
    const acc = await horizonServer.loadAccount(address);
    const native = acc.balances.find((b) => b.asset_type === "native");
    return {
      funded: true,
      xlm: native ? parseFloat(native.balance).toFixed(2) : "0.00",
    };
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return { funded: false, xlm: "0.00" };
    }
    return { funded: false, xlm: "0.00" };
  }
}

export async function fundTestnetAccount(address: string): Promise<void> {
  const res = await fetch(`${STELLAR_CONFIG.FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const current = await fetchAccountBalance(address);
    if (!current.funded) {
      throw new Error("No se pudo fondear la cuenta con Friendbot en Stellar Testnet.");
    }
  }
}

export async function ensureDemoAccountsFunded(producer: string, buyer: string): Promise<void> {
  const [pStatus, bStatus] = await Promise.all([
    fetchAccountBalance(producer),
    fetchAccountBalance(buyer),
  ]);
  const tasks: Promise<void>[] = [];
  if (!pStatus.funded) tasks.push(fundTestnetAccount(producer));
  if (!bStatus.funded) tasks.push(fundTestnetAccount(buyer));
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

/**
 * Ejecuta una lectura (simulacion sin costo) contra el contrato inteligente en Soroban Testnet.
 */
async function readContract<T>(
  sourceAddress: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<T> {
  const account = await sorobanServer.getAccount(sourceAddress);
  const contract = new Contract(STELLAR_CONFIG.CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_CONFIG.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await sorobanServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Error simulando ${method} en Soroban: ${sim.error}`);
  }
  const retval = sim.result?.retval;
  if (!retval) {
    throw new Error(`La funcion ${method} no devolvio ningun valor.`);
  }
  return scValToNative(retval) as T;
}

/**
 * Construye, simula, firma y envia una invocacion de escritura al Smart Contract en Soroban Testnet.
 */
async function invokeContract(
  session: WalletSession,
  signerAddress: string,
  method: string,
  args: xdr.ScVal[]
): Promise<TxReceipt> {
  const account = await sorobanServer.getAccount(signerAddress);
  const contract = new Contract(STELLAR_CONFIG.CONTRACT_ID);

  const rawTx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: STELLAR_CONFIG.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const preparedTx = await sorobanServer.prepareTransaction(rawTx);

  const sigResult = await signSorobanTransactionXdr(
    preparedTx.toXDR(),
    STELLAR_CONFIG.NETWORK_PASSPHRASE,
    session,
    signerAddress
  );

  let signedTx;
  if (sigResult.mode === "local-keypair" && sigResult.keypair) {
    preparedTx.sign(sigResult.keypair);
    signedTx = preparedTx;
  } else if (sigResult.signedXdr) {
    signedTx = TransactionBuilder.fromXDR(
      sigResult.signedXdr,
      STELLAR_CONFIG.NETWORK_PASSPHRASE
    );
  } else {
    throw new Error("No se pudo firmar la transaccion de Soroban.");
  }

  const sendResponse = await sorobanServer.sendTransaction(signedTx);
  if (sendResponse.status === "ERROR") {
    throw new Error(`Soroban RPC rechazo la transaccion (${method}).`);
  }

  const txHash = sendResponse.hash;

  // Espera la confirmacion en el ledger de Soroban Testnet
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 1200));
    const statusRes = await sorobanServer.getTransaction(txHash);
    if (statusRes.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        hash: txHash,
        explorerUrl: `${STELLAR_CONFIG.EXPLORER_TX_URL}/${txHash}`,
        fnName: method,
        timestamp: new Date().toLocaleTimeString("es-CR"),
      };
    }
    if (statusRes.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`La transaccion ${method} fallo en el ledger de Soroban.`);
    }
  }

  return {
    hash: txHash,
    explorerUrl: `${STELLAR_CONFIG.EXPLORER_TX_URL}/${txHash}`,
    fnName: method,
    timestamp: new Date().toLocaleTimeString("es-CR"),
  };
}

function normalizeLot(raw: any): HarvestLotData {
  const totalRaw = Number(raw.total_amount ?? 0);
  const releasedRaw = Number(raw.released_amount ?? 0);
  return {
    id: Number(raw.id),
    producer: String(raw.producer),
    buyer: String(raw.buyer),
    title: String(raw.title),
    region: String(raw.region),
    variety: String(raw.variety),
    quantity_kg: Number(raw.quantity_kg),
    total_amount_xlm: totalRaw / STROOPS,
    released_amount_xlm: releasedRaw / STROOPS,
    status: Number(raw.status),
    stage1_note: String(raw.stage1_note || "Pendiente"),
    stage2_note: String(raw.stage2_note || "Pendiente"),
    stage3_note: String(raw.stage3_note || "Pendiente"),
    reported_stage: Number(raw.reported_stage),
    released_stage: Number(raw.released_stage),
  };
}

export async function fetchAllLotsOnChain(readerAddress: string): Promise<HarvestLotData[]> {
  const rawList = await readContract<any[]>(readerAddress, "list_lots", []);
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizeLot).sort((a, b) => b.id - a.id);
}

export async function fetchPlatformMetricsOnChain(
  readerAddress: string
): Promise<PlatformMetricsData> {
  const raw = await readContract<any>(readerAddress, "get_metrics", []);
  return {
    total_lots: Number(raw?.total_lots ?? 0),
    active_lots: Number(raw?.active_lots ?? 0),
    completed_lots: Number(raw?.completed_lots ?? 0),
    total_volume_locked_xlm: Number(raw?.total_volume_locked ?? 0) / STROOPS,
    total_volume_released_xlm: Number(raw?.total_volume_released ?? 0) / STROOPS,
  };
}

export async function fetchProducerScoreOnChain(
  readerAddress: string,
  producerAddress: string
): Promise<number> {
  const score = await readContract<number>(readerAddress, "get_producer_score", [
    new Address(producerAddress).toScVal(),
  ]);
  return Number(score || 100);
}

export async function createHarvestLotOnChain(
  session: WalletSession,
  params: {
    producerAddress: string;
    buyerAddress: string;
    title: string;
    region: string;
    variety: string;
    quantityKg: number;
    totalAmountXlm: number;
  }
): Promise<TxReceipt> {
  const amountStroops = BigInt(Math.round(params.totalAmountXlm * STROOPS));
  return await invokeContract(session, params.producerAddress, "create_lot", [
    new Address(params.producerAddress).toScVal(),
    new Address(params.buyerAddress).toScVal(),
    nativeToScVal(params.title, { type: "string" }),
    nativeToScVal(params.region, { type: "string" }),
    nativeToScVal(params.variety, { type: "string" }),
    nativeToScVal(BigInt(Math.round(params.quantityKg)), { type: "u64" }),
    nativeToScVal(amountStroops, { type: "i128" }),
  ]);
}

export async function fundHarvestLotOnChain(
  session: WalletSession,
  buyerAddress: string,
  lotId: number
): Promise<TxReceipt> {
  return await invokeContract(session, buyerAddress, "fund_lot", [
    nativeToScVal(BigInt(lotId), { type: "u64" }),
  ]);
}

export async function submitHarvestStageOnChain(
  session: WalletSession,
  producerAddress: string,
  lotId: number,
  stageNumber: 1 | 2 | 3,
  evidenceNote: string
): Promise<TxReceipt> {
  return await invokeContract(session, producerAddress, "submit_stage", [
    nativeToScVal(BigInt(lotId), { type: "u64" }),
    nativeToScVal(stageNumber, { type: "u32" }),
    nativeToScVal(evidenceNote, { type: "string" }),
  ]);
}

export async function approveAndReleaseStageOnChain(
  session: WalletSession,
  buyerAddress: string,
  lotId: number,
  stageNumber: 1 | 2 | 3
): Promise<TxReceipt> {
  return await invokeContract(session, buyerAddress, "approve_and_release", [
    nativeToScVal(BigInt(lotId), { type: "u64" }),
    nativeToScVal(stageNumber, { type: "u32" }),
  ]);
}
