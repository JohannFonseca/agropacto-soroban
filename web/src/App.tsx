import React, { useEffect, useState } from "react";
import {
  STELLAR_CONFIG,
  HARVEST_STAGES,
  PRESET_COSTA_RICA_LOTS,
} from "./config/stellar";
import {
  WalletSession,
  WalletRole,
  connectFreighter,
  connectInstantTestnetWallet,
  restoreSession,
  saveActiveSessionMeta,
  getDemoPairAddresses,
  shortenKey,
} from "./services/wallet";
import {
  HarvestLotData,
  PlatformMetricsData,
  TxReceipt,
  fetchAccountBalance,
  fundTestnetAccount,
  ensureDemoAccountsFunded,
  fetchAllLotsOnChain,
  fetchPlatformMetricsOnChain,
  fetchProducerScoreOnChain,
  createHarvestLotOnChain,
  fundHarvestLotOnChain,
  submitHarvestStageOnChain,
  approveAndReleaseStageOnChain,
} from "./services/soroban";

export default function App() {
  const [activeTab, setActiveTab] = useState<"landing" | "dashboard">("landing");
  const [session, setSession] = useState<WalletSession | null>(null);
  const [balanceXlm, setBalanceXlm] = useState<string>("0.00");
  const [producerScore, setProducerScore] = useState<number>(100);
  const [lots, setLots] = useState<HarvestLotData[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetricsData>({
    total_lots: 0,
    active_lots: 0,
    completed_lots: 0,
    total_volume_locked_xlm: 0,
    total_volume_released_xlm: 0,
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    text: string;
    type: "info" | "success" | "error";
    txUrl?: string;
  } | null>(null);
  const [txHistory, setTxHistory] = useState<TxReceipt[]>([]);

  // Formulario para crear lote en Soroban
  const [title, setTitle] = useState(PRESET_COSTA_RICA_LOTS[0].title);
  const [region, setRegion] = useState(PRESET_COSTA_RICA_LOTS[0].region);
  const [variety, setVariety] = useState(PRESET_COSTA_RICA_LOTS[0].variety);
  const [quantityKg, setQuantityKg] = useState(PRESET_COSTA_RICA_LOTS[0].quantityKg);
  const [totalAmountXlm, setTotalAmountXlm] = useState(
    PRESET_COSTA_RICA_LOTS[0].totalAmountXlm
  );
  const [customBuyer, setCustomBuyer] = useState("");

  useEffect(() => {
    const demoPairs = getDemoPairAddresses();
    setCustomBuyer(demoPairs.buyer);

    restoreSession().then(async (restored) => {
      if (restored) {
        setSession(restored);
        await syncOnChainState(restored);
      } else {
        // Carga lectura publica desde el par de demo si ya fue fondeado
        try {
          await ensureDemoAccountsFunded(demoPairs.producer, demoPairs.buyer);
          const [onchainLots, onchainMetrics, score] = await Promise.all([
            fetchAllLotsOnChain(demoPairs.producer),
            fetchPlatformMetricsOnChain(demoPairs.producer),
            fetchProducerScoreOnChain(demoPairs.producer, demoPairs.producer),
          ]);
          setLots(onchainLots);
          setMetrics(onchainMetrics);
          setProducerScore(score);
        } catch {
          // Ignorar si aun no se ha conectado
        }
      }
    });
  }, []);

  async function syncOnChainState(activeSession: WalletSession) {
    try {
      const bal = await fetchAccountBalance(activeSession.address);
      setBalanceXlm(bal.xlm);

      if (!bal.funded) {
        await fundTestnetAccount(activeSession.address);
        const afterFund = await fetchAccountBalance(activeSession.address);
        setBalanceXlm(afterFund.xlm);
      }

      const demoPairs = getDemoPairAddresses();
      await ensureDemoAccountsFunded(demoPairs.producer, demoPairs.buyer);

      const [onchainLots, onchainMetrics, score] = await Promise.all([
        fetchAllLotsOnChain(activeSession.address),
        fetchPlatformMetricsOnChain(activeSession.address),
        fetchProducerScoreOnChain(activeSession.address, activeSession.address),
      ]);

      setLots(onchainLots);
      setMetrics(onchainMetrics);
      setProducerScore(score);
    } catch (err: any) {
      console.warn("Sync warning:", err?.message);
    }
  }

  async function handleConnectFreighter(role: WalletRole = "producer") {
    try {
      setBusyAction("Conectando Freighter...");
      const connected = await connectFreighter(role);
      setSession(connected);
      saveActiveSessionMeta(connected.mode, connected.role);
      await syncOnChainState(connected);
      setBanner({
        text: `Freighter Wallet conectada (${shortenKey(connected.address)}) en Stellar Testnet.`,
        type: "success",
      });
      setActiveTab("dashboard");
    } catch (err: any) {
      setBanner({ text: err.message, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConnectInstant(role: WalletRole = "producer") {
    try {
      setBusyAction("Activando Billetera Testnet...");
      const connected = connectInstantTestnetWallet(role);
      setSession(connected);
      saveActiveSessionMeta(connected.mode, connected.role);
      setCustomBuyer(connected.counterpartyAddress);
      setBanner({
        text: "Verificando fondeo en Friendbot y sincronizando estado del Smart Contract en Soroban Testnet...",
        type: "info",
      });
      await syncOnChainState(connected);
      setBanner({
        text: `Billetera Testnet lista (${shortenKey(
          connected.address
        )}) con Productor y Comprador configurados para firmar en Soroban.`,
        type: "success",
      });
      setActiveTab("dashboard");
    } catch (err: any) {
      setBanner({ text: err.message, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  function handleSwitchRole(newRole: WalletRole) {
    if (!session) {
      handleConnectInstant(newRole);
      return;
    }
    if (session.mode === "testnet-keypair") {
      const switched = connectInstantTestnetWallet(newRole);
      setSession(switched);
      saveActiveSessionMeta(switched.mode, switched.role);
      syncOnChainState(switched);
      setBanner({
        text:
          newRole === "producer"
            ? "Rol activo cambiado a: Productor Cafetalero / Agrícola"
            : "Rol activo cambiado a: Comprador / Tostador (listo para fondear y liberar etapas)",
        type: "info",
      });
    } else {
      const demoPairs = getDemoPairAddresses();
      const updated: WalletSession = {
        ...session,
        role: newRole,
        counterpartyAddress:
          newRole === "producer" ? demoPairs.buyer : demoPairs.producer,
      };
      setSession(updated);
      saveActiveSessionMeta(updated.mode, updated.role);
    }
  }

  async function handleCreateLot(e: React.FormEvent) {
    e.preventDefault();
    if (!session) {
      setBanner({
        text: "Conectá primero tu billetera arriba (Freighter o Billetera Testnet Instantánea).",
        type: "error",
      });
      return;
    }

    const demoPairs = getDemoPairAddresses();
    const producerAddr =
      session.role === "producer" ? session.address : demoPairs.producer;
    const buyerAddr =
      customBuyer.trim().length === 56 ? customBuyer.trim() : demoPairs.buyer;

    try {
      setBusyAction("create_lot");
      setBanner({
        text: "Invocando create_lot() en el Smart Contract de Soroban Testnet...",
        type: "info",
      });

      const receipt = await createHarvestLotOnChain(session, {
        producerAddress: producerAddr,
        buyerAddress: buyerAddr,
        title,
        region,
        variety,
        quantityKg: Number(quantityKg),
        totalAmountXlm: Number(totalAmountXlm),
      });

      setTxHistory((prev) => [receipt, ...prev]);
      await syncOnChainState(session);

      setBanner({
        text: `¡Lote creado on-chain en Soroban! Función create_lot() confirmada.`,
        type: "success",
        txUrl: receipt.explorerUrl,
      });
    } catch (err: any) {
      setBanner({ text: err.message, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleFundLot(lot: HarvestLotData) {
    if (!session) {
      await handleConnectInstant("buyer");
      return;
    }
    try {
      setBusyAction(`fund_${lot.id}`);
      setBanner({
        text: `Invocando fund_lot(#${lot.id}) en Soroban Testnet (${lot.total_amount_xlm} XLM protegidos en escrow)...`,
        type: "info",
      });

      const receipt = await fundHarvestLotOnChain(session, lot.buyer, lot.id);
      setTxHistory((prev) => [receipt, ...prev]);
      await syncOnChainState(session);

      setBanner({
        text: `¡Lote #${lot.id} fondeado en el Smart Contract! Los ${lot.total_amount_xlm} XLM quedaron bloqueados por etapas.`,
        type: "success",
        txUrl: receipt.explorerUrl,
      });
    } catch (err: any) {
      setBanner({ text: err.message, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitStage(lot: HarvestLotData, stageNumber: 1 | 2 | 3) {
    if (!session) {
      await handleConnectInstant("producer");
      return;
    }
    const meta = HARVEST_STAGES.find((s) => s.number === stageNumber)!;
    try {
      setBusyAction(`submit_${lot.id}_${stageNumber}`);
      setBanner({
        text: `Registrando avance on-chain submit_stage(#${lot.id}, Etapa ${stageNumber}) en Soroban...`,
        type: "info",
      });

      const receipt = await submitHarvestStageOnChain(
        session,
        lot.producer,
        lot.id,
        stageNumber,
        meta.defaultEvidence
      );
      setTxHistory((prev) => [receipt, ...prev]);
      await syncOnChainState(session);

      setBanner({
        text: `¡Evidencia de la Etapa ${stageNumber} registrada on-chain por el productor! Lista para liberación.`,
        type: "success",
        txUrl: receipt.explorerUrl,
      });
    } catch (err: any) {
      setBanner({ text: err.message, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApproveAndRelease(
    lot: HarvestLotData,
    stageNumber: 1 | 2 | 3
  ) {
    if (!session) {
      await handleConnectInstant("buyer");
      return;
    }
    const meta = HARVEST_STAGES.find((s) => s.number === stageNumber)!;
    const trancheXlm = ((lot.total_amount_xlm * meta.percentage) / 100).toFixed(2);
    try {
      setBusyAction(`release_${lot.id}_${stageNumber}`);
      setBanner({
        text: `Invocando approve_and_release(#${lot.id}, Etapa ${stageNumber}) para liberar ${trancheXlm} XLM (${meta.percentage}%)...`,
        type: "info",
      });

      const receipt = await approveAndReleaseStageOnChain(
        session,
        lot.buyer,
        lot.id,
        stageNumber
      );
      setTxHistory((prev) => [receipt, ...prev]);
      await syncOnChainState(session);

      setBanner({
        text: `¡Etapa ${stageNumber} liberada on-chain! El productor recibió ${trancheXlm} XLM y subió su reputación.`,
        type: "success",
        txUrl: receipt.explorerUrl,
      });
    } catch (err: any) {
      setBanner({ text: err.message, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div>
      {/* NAVBAR */}
      <header className="navbar">
        <div className="navbar-inner">
          <div
            className="brand-group"
            onClick={() => setActiveTab("landing")}
            title="Volver al inicio"
          >
            <div className="brand-badge-box">AP</div>
            <div>
              <span className="brand-name">
                AgroPacto<span className="brand-dot">.</span>
              </span>
              <span className="brand-tag">
                Preventa & Escrow de Cosechas en Soroban
              </span>
            </div>
          </div>

          <nav className="nav-links">
            <button
              type="button"
              className={`nav-tab ${activeTab === "landing" ? "active" : ""}`}
              onClick={() => setActiveTab("landing")}
            >
              El Producto & Problema
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              App / Escrow en Vivo ({lots.length})
            </button>
            <a
              href={`${STELLAR_CONFIG.EXPLORER_CONTRACT_URL}/${STELLAR_CONFIG.CONTRACT_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-tab"
            >
              Contrato en Stellar.expert ↗
            </a>
          </nav>

          {/* WALLET BAR */}
          <div className="wallet-controls">
            {!session ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleConnectFreighter("producer")}
                  disabled={Boolean(busyAction)}
                >
                  Conectar Freighter
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleConnectInstant("producer")}
                  disabled={Boolean(busyAction)}
                >
                  Billetera Testnet Instantánea
                </button>
              </>
            ) : (
              <>
                <div className="pill">
                  <span className="dot-live"></span>
                  <strong>
                    {session.role === "producer" ? "PRODUCTOR" : "COMPRADOR"}
                  </strong>
                  <code>{shortenKey(session.address)}</code>
                </div>
                <div className="pill font-mono">{balanceXlm} XLM</div>
                <button
                  type="button"
                  className="btn btn-red-outline btn-xs"
                  onClick={() =>
                    handleSwitchRole(
                      session.role === "producer" ? "buyer" : "producer"
                    )
                  }
                >
                  Cambiar a {session.role === "producer" ? "Comprador" : "Productor"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="main-wrap">
        {banner && (
          <div className={`alert-banner ${banner.type}`}>
            <span>{banner.text}</span>
            {banner.txUrl && (
              <a
                href={banner.txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-red-outline btn-xs"
              >
                Ver Transacción en Stellar.expert ↗
              </a>
            )}
          </div>
        )}

        {activeTab === "landing" ? (
          /* ==================== LANDING PAGE DE PRODUCTO ==================== */
          <div>
            <section className="hero-section">
              <div>
                <span className="kicker-badge">
                  STELLAR SOROBAN SMART CONTRACT · CAMPAMENTO 02 (TRUSTLESS WORK)
                </span>
                <h1 className="hero-title">
                  Financiamiento directo de cosechas por etapas, sin coyotes ni
                  bancos lentos.
                </h1>
                <p className="hero-lead">
                  En Costa Rica y Latinoamérica, los pequeños productores de café y
                  cacao necesitan capital antes de la cosecha y pierden hasta el 40%
                  de su margen con intermediarios. <strong>AgroPacto</strong>{" "}
                  protege al productor y al comprador mediante un contrato
                  inteligente de <strong>Escrow por Hitos en Soroban</strong>.
                </p>
                <div className="hero-cta-row">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => {
                      if (!session) {
                        handleConnectInstant("producer");
                      } else {
                        setActiveTab("dashboard");
                      }
                    }}
                  >
                    Abrir Plataforma AgroPacto →
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-lg"
                    onClick={() => handleConnectFreighter("producer")}
                  >
                    Conectar con Freighter Wallet
                  </button>
                </div>
              </div>

              <div className="hero-contract-panel">
                <div>
                  <span className="metric-label">
                    SMART CONTRACT DESPLEGADO EN STELLAR TESTNET
                  </span>
                  <div className="contract-id-box">
                    <code>{STELLAR_CONFIG.CONTRACT_ID}</code>
                  </div>
                </div>

                <div>
                  <span className="metric-label">
                    REGLA DE LIBERACIÓN AUTOMÁTICA ON-CHAIN (3 HITOS)
                  </span>
                  <div className="stage-mini-bars">
                    <div className="stage-mini-bar">
                      <strong>30%</strong>
                      <span>01. Siembra e Insumos</span>
                    </div>
                    <div className="stage-mini-bar">
                      <strong>40%</strong>
                      <span>02. Cosecha y Beneficio</span>
                    </div>
                    <div className="stage-mini-bar">
                      <strong>30%</strong>
                      <span>03. Entrega y Catación</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "var(--text-warm)",
                  }}
                >
                  <span>8 Funciones Públicas en Rust</span>
                  <span>Autorización Criptográfica require_auth()</span>
                </div>
              </div>
            </section>

            <div className="section-header">
              <span className="metric-label">EL PROBLEMA EN LATAM Y LA SOLUCIÓN</span>
              <h2>¿Por qué un Smart Contract en Soroban cambia las reglas?</h2>
            </div>

            <section className="cards-grid-3">
              <div className="feature-card">
                <span className="metric-label">01 · EL DOLOR DEL PRODUCTOR</span>
                <h3>Adiós al intermediario ("Coyote")</h3>
                <p>
                  Los bancos tradicionales exigen hipotecas y tardan meses en
                  aprobar crédito agrícola. Con AgroPacto, el comprador o tostador
                  preventa el lote directamente con la finca y el productor recibe
                  el 30% desde la etapa de fertilización y poda.
                </p>
              </div>

              <div className="feature-card">
                <span className="metric-label">02 · LA SEGURIDAD DEL COMPRADOR</span>
                <h3>Escrow por Hitos sin Confianza Ciega</h3>
                <p>
                  El comprador no arriesga el 100% por adelantado en una
                  transferencia bancaria sin garantía. El contrato inteligente en
                  Soroban custodia el capital y solo libera cada tramo (30% → 40% →
                  30%) cuando se registra y aprueba el avance real de la cosecha.
                </p>
              </div>

              <div className="feature-card">
                <span className="metric-label">03 · REPUTACIÓN AGRÍCOLA ON-CHAIN</span>
                <h3>Historial Crediticio Verificable</h3>
                <p>
                  Cada etapa cumplida incrementa automáticamente el{" "}
                  <code>ProducerScore</code> del agricultor en el almacenamiento
                  persistente de Soroban, creando un récord inmutable de entregas a
                  tiempo para acceder a mejores precios internacionales.
                </p>
              </div>
            </section>
          </div>
        ) : (
          /* ==================== DASHBOARD INTERACTIVO SOROBAN ==================== */
          <div>
            {/* STRIP DE METRICAS ON-CHAIN */}
            <section className="metrics-strip">
              <div className="metric-card">
                <span className="metric-label">LOTES REGISTRADOS (ON-CHAIN)</span>
                <div className="metric-value">{metrics.total_lots}</div>
              </div>
              <div className="metric-card">
                <span className="metric-label">CAPITAL PROTEGIDO EN ESCROW</span>
                <div className="metric-value red">
                  {metrics.total_volume_locked_xlm.toFixed(2)} XLM
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-label">CAPITAL LIBERADO A FINCAS</span>
                <div className="metric-value green">
                  {metrics.total_volume_released_xlm.toFixed(2)} XLM
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-label">REPUTACIÓN DEL PRODUCTOR</span>
                <div className="metric-value">{producerScore} PTS</div>
              </div>
            </section>

            <section className="dashboard-grid">
              {/* COLUMNA IZQUIERDA: CREAR LOTE EN SOROBAN */}
              <div className="panel-card">
                <div className="panel-header">
                  <div>
                    <span className="metric-label">
                      FUNCIÓN SOROBAN: create_lot()
                    </span>
                    <h2>Publicar Nuevo Lote de Cosecha</h2>
                  </div>
                  <div className="preset-chips">
                    {PRESET_COSTA_RICA_LOTS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="chip-btn"
                        onClick={() => {
                          setTitle(p.title);
                          setRegion(p.region);
                          setVariety(p.variety);
                          setQuantityKg(p.quantityKg);
                          setTotalAmountXlm(p.totalAmountXlm);
                        }}
                      >
                        Lote #{idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <form className="form-stack" onSubmit={handleCreateLot}>
                  <div className="field-group">
                    <label>Nombre del Lote / Finca</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field-row">
                    <div className="field-group">
                      <label>Región Productora</label>
                      <input
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field-group">
                      <label>Variedad y Proceso</label>
                      <input
                        type="text"
                        value={variety}
                        onChange={(e) => setVariety(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="field-row">
                    <div className="field-group">
                      <label>Volumen del Lote (kg)</label>
                      <input
                        type="number"
                        className="font-mono"
                        min={10}
                        value={quantityKg}
                        onChange={(e) => setQuantityKg(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div className="field-group">
                      <label>Valor Total del Escrow (XLM)</label>
                      <input
                        type="number"
                        className="font-mono"
                        min={10}
                        step="1"
                        value={totalAmountXlm}
                        onChange={(e) => setTotalAmountXlm(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label>Wallet del Comprador / Tostador (G...)</label>
                    <input
                      type="text"
                      className="font-mono"
                      value={customBuyer}
                      onChange={(e) => setCustomBuyer(e.target.value)}
                      required
                    />
                  </div>

                  <div
                    style={{
                      background: "var(--bg-obsidian)",
                      border: "1px dashed var(--border-strong)",
                      borderRadius: "8px",
                      padding: "0.75rem",
                      fontSize: "0.78rem",
                      color: "var(--text-warm)",
                    }}
                  >
                    <strong>Desglose automático en el contrato Soroban:</strong>
                    <div
                      className="font-mono"
                      style={{ marginTop: "0.3rem", color: "var(--text-main)" }}
                    >
                      • Etapa 1 (30%): {(totalAmountXlm * 0.3).toFixed(2)} XLM ·
                      Etapa 2 (40%): {(totalAmountXlm * 0.4).toFixed(2)} XLM ·
                      Etapa 3 (30%): {(totalAmountXlm * 0.3).toFixed(2)} XLM
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction === "create_lot"
                      ? "Firmando create_lot() en Soroban Testnet..."
                      : "Registrar Lote en Smart Contract Soroban"}
                  </button>
                </form>

                {/* HISTORIAL DE TRANSACCIONES ON-CHAIN DE LA SESION */}
                {txHistory.length > 0 && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <span className="metric-label">
                      TRANSACCIONES ENVIADAS A SOROBAN RPC
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                        marginTop: "0.5rem",
                      }}
                    >
                      {txHistory.map((tx, i) => (
                        <div
                          key={i}
                          style={{
                            background: "var(--bg-obsidian)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "6px",
                            padding: "0.55rem 0.75rem",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: "0.78rem",
                          }}
                        >
                          <span>
                            <code>{tx.fnName}()</code> · {tx.timestamp}
                          </span>
                          <a
                            href={tx.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--cherry-bright)" }}
                          >
                            {shortenKey(tx.hash)} ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* COLUMNA DERECHA: LOTES Y EJECUCION DE HITOS ON-CHAIN */}
              <div className="panel-card">
                <div className="panel-header">
                  <div>
                    <span className="metric-label">
                      ESTADO EN VIVO DESDE SOROBAN TESTNET
                    </span>
                    <h2>Escrows de Cosecha Activos ({lots.length})</h2>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => session && syncOnChainState(session)}
                    disabled={Boolean(busyAction)}
                  >
                    Sincronizar con Soroban RPC
                  </button>
                </div>

                {lots.length === 0 ? (
                  <div
                    style={{
                      padding: "2.5rem 1rem",
                      textAlign: "center",
                      color: "var(--text-warm)",
                      border: "1px dashed var(--border-strong)",
                      borderRadius: "10px",
                    }}
                  >
                    Conectá tu billetera o creá el primer lote a la izquierda para
                    interactuar con el contrato en Soroban Testnet.
                  </div>
                ) : (
                  <div className="lots-stack">
                    {lots.map((lot) => {
                      const pctReleased =
                        lot.total_amount_xlm > 0
                          ? Math.round(
                              (lot.released_amount_xlm / lot.total_amount_xlm) * 100
                            )
                          : 0;

                      return (
                        <div key={lot.id} className="lot-card">
                          <div className="lot-top">
                            <div>
                              <span className="metric-label">
                                LOTE ON-CHAIN #{lot.id} · {lot.region}
                              </span>
                              <h3 className="lot-title">{lot.title}</h3>
                              <div className="lot-meta-row">
                                <span>
                                  Variedad: <strong>{lot.variety}</strong>
                                </span>
                                <span>
                                  Volumen: <strong>{lot.quantity_kg} kg</strong>
                                </span>
                                <span>
                                  Productor:{" "}
                                  <code>{shortenKey(lot.producer)}</code>
                                </span>
                                <span>
                                  Comprador: <code>{shortenKey(lot.buyer)}</code>
                                </span>
                              </div>
                            </div>

                            <div>
                              {lot.status === 0 && (
                                <span className="status-badge status-created">
                                  ESPERANDO FONDEO ({lot.total_amount_xlm} XLM)
                                </span>
                              )}
                              {lot.status >= 1 && lot.status < 4 && (
                                <span className="status-badge status-funded">
                                  ESCROW ACTIVO · {pctReleased}% LIBERADO
                                </span>
                              )}
                              {lot.status === 4 && (
                                <span className="status-badge status-completed">
                                  100% LIQUIDADO ({lot.total_amount_xlm} XLM)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* BARRA DE PROGRESO DE FONDOS */}
                          <div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "0.78rem",
                                marginBottom: "0.35rem",
                              }}
                            >
                              <span>
                                Liberado al productor:{" "}
                                <strong className="font-mono">
                                  {lot.released_amount_xlm.toFixed(2)} XLM
                                </strong>
                              </span>
                              <span>
                                Total del Contrato:{" "}
                                <strong className="font-mono">
                                  {lot.total_amount_xlm.toFixed(2)} XLM
                                </strong>
                              </span>
                            </div>
                            <div className="progress-track">
                              <div
                                className="progress-fill"
                                style={{ width: `${pctReleased}%` }}
                              />
                            </div>
                          </div>

                          {/* BOTON DE FONDEAR SI STATUS == 0 */}
                          {lot.status === 0 && (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                background: "var(--bg-card)",
                                padding: "0.85rem 1rem",
                                borderRadius: "8px",
                                border: "1px dashed var(--border-crimson)",
                              }}
                            >
                              <span style={{ fontSize: "0.85rem" }}>
                                Paso 1: El comprador bloquea los{" "}
                                <strong>{lot.total_amount_xlm} XLM</strong> en el
                                contrato de Soroban.
                              </span>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleFundLot(lot)}
                                disabled={Boolean(busyAction)}
                              >
                                {busyAction === `fund_${lot.id}`
                                  ? "Fondeando en Soroban..."
                                  : `Fondear Escrow (${lot.total_amount_xlm} XLM)`}
                              </button>
                            </div>
                          )}

                          {/* LISTA DE LAS 3 ETAPAS DE LA COSECHA */}
                          <div className="stages-list">
                            {HARVEST_STAGES.map((stage) => {
                              const isReleased = lot.released_stage >= stage.number;
                              const isReported = lot.reported_stage >= stage.number;
                              const canAct =
                                lot.status >= 1 &&
                                lot.released_stage === stage.number - 1;
                              const note =
                                stage.number === 1
                                  ? lot.stage1_note
                                  : stage.number === 2
                                  ? lot.stage2_note
                                  : lot.stage3_note;
                              const stageXlm = (
                                (lot.total_amount_xlm * stage.percentage) /
                                100
                              ).toFixed(2);

                              return (
                                <div
                                  key={stage.number}
                                  className={`stage-item ${
                                    isReleased
                                      ? "released"
                                      : isReported
                                      ? "reported"
                                      : ""
                                  }`}
                                >
                                  <div className="stage-info">
                                    <h4>
                                      {stage.name} ({stage.percentage}% ={" "}
                                      <span className="font-mono">
                                        {stageXlm} XLM
                                      </span>
                                      )
                                    </h4>
                                    <div className="stage-note">
                                      {note !== "Pendiente"
                                        ? `Bitácora On-Chain: "${note}"`
                                        : stage.subtitle}
                                    </div>
                                  </div>

                                  <div className="stage-actions">
                                    {isReleased ? (
                                      <span className="status-badge status-completed">
                                        LIBERADO ({stageXlm} XLM)
                                      </span>
                                    ) : canAct ? (
                                      <>
                                        {!isReported && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary btn-xs"
                                            onClick={() =>
                                              handleSubmitStage(lot, stage.number)
                                            }
                                            disabled={Boolean(busyAction)}
                                          >
                                            {busyAction ===
                                            `submit_${lot.id}_${stage.number}`
                                              ? "Enviando..."
                                              : "1. Reportar Avance (Productor)"}
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-xs"
                                          onClick={() =>
                                            handleApproveAndRelease(
                                              lot,
                                              stage.number
                                            )
                                          }
                                          disabled={Boolean(busyAction)}
                                        >
                                          {busyAction ===
                                          `release_${lot.id}_${stage.number}`
                                            ? "Liberando..."
                                            : `2. Aprobar y Liberar ${stage.percentage}% (Comprador)`}
                                        </button>
                                      </>
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: "0.75rem",
                                          color: "var(--text-dim)",
                                        }}
                                      >
                                        {lot.status === 0
                                          ? "Requiere fondear lote"
                                          : "Requiere etapa previa"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>
            <strong>AgroPacto.</strong> · Desarrollado por Johann Fonseca
          </span>
          <span>
            Campamento 02 (Contratos Inteligentes en Soroban · Trustless Work) ·
            Contract ID: <code>{shortenKey(STELLAR_CONFIG.CONTRACT_ID)}</code>
          </span>
        </div>
      </footer>
    </div>
  );
}
