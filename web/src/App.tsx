import React, { useEffect, useState } from "react";
import {
  STELLAR_CONFIG,
  HARVEST_STAGES,
  PRESET_COSTA_RICA_LOTS,
  SAN_RAMON_REGIONS,
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

  // Simulador interactivo de impacto economico para el cafetalero
  const [simFanegas, setSimFanegas] = useState<number>(25);

  // Formulario para crear lote en Soroban (por defecto: San Ramon de Alajuela)
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
        text: `Freighter Wallet conectada (${shortenKey(
          connected.address
        )}) en Stellar Testnet.`,
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
        text: "Conectando con Soroban RPC y leyendo los lotes cafetaleros de San Ramón, Dota y Tarrazú...",
        type: "info",
      });
      await syncOnChainState(connected);
      setBanner({
        text: `Billetera Testnet activa (${shortenKey(
          connected.address
        )}) · Podés firmar como Productor o Comprador en 1 clic.`,
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
            ? "Rol activo: Finca / Productor Cafetalero (San Ramón / Valle Occidental)"
            : "Rol activo: Comprador / Microbeneficio (autorizado para fondear y liberar etapas)",
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
        text: "Firmando e invocando create_lot() en el Smart Contract de Soroban Testnet...",
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
        text: `¡Lote de cosecha inscrito on-chain en Soroban! Función create_lot() confirmada.`,
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
        text: `Invocando fund_lot(#${lot.id}) en Soroban Testnet (${lot.total_amount_xlm} XLM custodiados en el contrato)...`,
        type: "info",
      });

      const receipt = await fundHarvestLotOnChain(session, lot.buyer, lot.id);
      setTxHistory((prev) => [receipt, ...prev]);
      await syncOnChainState(session);

      setBanner({
        text: `¡Lote #${lot.id} fondeado en el Smart Contract! Los ${lot.total_amount_xlm} XLM quedaron protegidos por etapas.`,
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
        text: `Registrando bitácora de finca submit_stage(#${lot.id}, Etapa ${stageNumber}) en Soroban...`,
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
        text: `¡Bitácora de la Etapa ${stageNumber} registrada on-chain! Lista para que el comprador libere el pago.`,
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
        text: `Invocando approve_and_release(#${lot.id}, Etapa ${stageNumber}) para liberar ${trancheXlm} XLM (${meta.percentage}%) a la finca...`,
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
        text: `¡Etapa ${stageNumber} liquidada on-chain! La finca recibió ${trancheXlm} XLM y subió su Reputación Cafetalera.`,
        type: "success",
        txUrl: receipt.explorerUrl,
      });
    } catch (err: any) {
      setBanner({ text: err.message, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  // Calculos del simulador de impacto por fanega de cafe de especialidad
  const directValueUsd = simFanegas * 290;
  const coyoteValueUsd = Math.round(directValueUsd * 0.58);
  const agropactoNetUsd = Math.round(directValueUsd * 0.985);
  const extraFarmerIncome = agropactoNetUsd - coyoteValueUsd;

  return (
    <div>
      {/* TOP ANNOUNCEMENT RIBBON */}
      <div className="origin-ribbon">
        <div className="origin-ribbon-inner">
          <span className="ribbon-tag">
            <span className="ribbon-dot"></span>
            <span>
              PROTOCOLO ACTIVO EN STELLAR SOROBAN TESTNET · PILOTO SAN RAMÓN,
              TARRAZÚ & DOTA
            </span>
          </span>
          <span className="font-mono" style={{ fontSize: "0.72rem" }}>
            CONTRACT ID: {STELLAR_CONFIG.CONTRACT_ID}
          </span>
        </div>
      </div>

      {/* NAVBAR */}
      <header className="navbar">
        <div className="navbar-inner">
          <div
            className="brand-group"
            onClick={() => setActiveTab("landing")}
            title="Volver al inicio"
          >
            <div className="brand-seal">AP</div>
            <div>
              <span className="brand-name">
                AgroPacto<span className="brand-dot">.</span>
              </span>
              <span className="brand-tag">
                Nacido en San Ramón · Escrow Cafetalero para Costa Rica & LATAM
              </span>
            </div>
          </div>

          <nav className="nav-links">
            <button
              type="button"
              className={`nav-tab ${activeTab === "landing" ? "active" : ""}`}
              onClick={() => setActiveTab("landing")}
            >
              El Producto & Regiones
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              Microbeneficio On-Chain ({lots.length})
            </button>
            <a
              href={`${STELLAR_CONFIG.EXPLORER_CONTRACT_URL}/${STELLAR_CONFIG.CONTRACT_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-tab"
            >
              Stellar.expert ↗
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
                    {session.role === "producer"
                      ? "FINCA / PRODUCTOR"
                      : "COMPRADOR / TOSTADOR"}
                  </strong>
                  <code>{shortenKey(session.address)}</code>
                </div>
                <div className="pill font-mono">{balanceXlm} XLM</div>
                <button
                  type="button"
                  className="btn btn-outline-emerald btn-xs"
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
                className="btn btn-outline-emerald btn-xs"
              >
                Ver Recibo en Stellar.expert ↗
              </a>
            )}
          </div>
        )}

        {activeTab === "landing" ? (
          /* ==================== LANDING PAGE EDITORIAL DE PRODUCTO ==================== */
          <div>
            <section className="hero-section">
              <div>
                <span className="kicker-badge">
                  ORIGEN SAN RAMÓN DE ALAJUELA · ESCALABLE A COSTA RICA Y LATAM
                </span>
                <h1 className="hero-title">
                  De las fincas de <em>San Ramón, Tarrazú y Dota</em> directo al
                  tostador, sin intermediarios.
                </h1>
                <p className="hero-lead">
                  Inspirado en la realidad de las familias cafetaleras de{" "}
                  <strong>San Ramón (Piedades Sur, Berlín, Ángeles)</strong> y diseñado
                  para escalar a todo el cinturón cafetalero de{" "}
                  <strong>Costa Rica y Latinoamérica</strong>. Los pequeños productores
                  necesitan liquidez meses antes de <em>la cogida</em> para abonar y
                  cuidar el cafetal, pero pierden hasta el 40% de su margen ante
                  intermediarios. <strong>AgroPacto</strong> protege a la finca y al
                  comprador mediante un{" "}
                  <strong>Smart Contract de Escrow por Etapas de Cosecha en Soroban</strong>.
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
                    Entrar al Microbeneficio On-Chain →
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

              {/* PASAPORTE DIGITAL ON-CHAIN */}
              <div className="hero-passport">
                <div className="passport-header">
                  <div>
                    <span className="passport-tag">
                      PASAPORTE DE COSECHA ON-CHAIN · LOTE #03
                    </span>
                    <div className="passport-lot-title">
                      Villa Sarchí Honey · Piedades Sur, San Ramón
                    </div>
                  </div>
                  <span
                    className="font-mono"
                    style={{
                      background: "rgba(52, 211, 153, 0.16)",
                      color: "#6ee7b7",
                      padding: "0.25rem 0.6rem",
                      borderRadius: "999px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                    }}
                  >
                    1,450 MSNM
                  </span>
                </div>

                <div>
                  <span
                    className="passport-tag"
                    style={{ display: "block", marginBottom: "0.35rem" }}
                  >
                    SMART CONTRACT DESPLEGADO EN SOROBAN TESTNET
                  </span>
                  <div className="contract-id-box">
                    <code>{STELLAR_CONFIG.CONTRACT_ID}</code>
                  </div>
                </div>

                <div>
                  <span
                    className="passport-tag"
                    style={{ display: "block", marginBottom: "0.4rem" }}
                  >
                    REGLA DE LIBERACIÓN AUTOMÁTICA POR HITOS
                  </span>
                  <div className="stage-mini-bars">
                    <div className="stage-mini-bar">
                      <strong>30%</strong>
                      <span>01. Abono y Sombra</span>
                    </div>
                    <div className="stage-mini-bar">
                      <strong>40%</strong>
                      <span>02. La Cogida y Secado</span>
                    </div>
                    <div className="stage-mini-bar">
                      <strong>30%</strong>
                      <span>03. Café Oro y Taza</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.76rem",
                    color: "rgba(255,255,255,0.72)",
                  }}
                >
                  <span>✓ 8 Funciones Públicas en Rust</span>
                  <span>✓ Firma Criptográfica require_auth()</span>
                </div>
              </div>
            </section>

            {/* SIMULADOR INTERACTIVO DE IMPACTO ECONOMICO */}
            <div className="section-header">
              <div>
                <span className="eyebrow-label">
                  IMPACTO ECONÓMICO REAL EN LA FINCA
                </span>
                <h2>Calculadora de Ingreso Directo vs. Intermediario ("Coyote")</h2>
              </div>
            </div>

            <section className="comparison-panel">
              <div>
                <label
                  htmlFor="fanegas-slider"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.95rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span>Volumen de cosecha del productor:</span>
                  <strong
                    className="font-mono"
                    style={{ color: "var(--forest-main)", fontSize: "1.1rem" }}
                  >
                    {simFanegas} Fanegas ({simFanegas * 46} kg Café Oro)
                  </strong>
                </label>
                <input
                  id="fanegas-slider"
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={simFanegas}
                  onChange={(e) => setSimFanegas(Number(e.target.value))}
                  style={{
                    width: "100%",
                    accentColor: "var(--forest-main)",
                    marginBottom: "1rem",
                    padding: 0,
                  }}
                />
                <p style={{ color: "var(--ink-secondary)", fontSize: "0.92rem" }}>
                  Cuando una familia cafetalera en <strong>San Ramón o Los Santos</strong>{" "}
                  vende su cosecha por adelantado a un intermediario informal por falta de
                  liquidez en mayo, recibe apenas ~58% del valor final del microlote. Con
                  el escrow por etapas de <strong>AgroPacto en Soroban</strong>, recibe
                  liquidez desde la etapa de abono y conserva el{" "}
                  <strong>98.5% del valor de exportación</strong> (+
                  <strong className="font-mono" style={{ color: "var(--emerald-accent)" }}>
                    ${extraFarmerIncome.toLocaleString("es-CR")} USD
                  </strong>{" "}
                  directos para la finca).
                </p>
              </div>

              <div className="compare-bars">
                <div className="compare-bar-box">
                  <div className="compare-bar-header">
                    <span>Venta Informal / Adelanto con Intermediario (58%)</span>
                    <span className="font-mono" style={{ color: "var(--terracotta)" }}>
                      ${coyoteValueUsd.toLocaleString("es-CR")} USD
                    </span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill-coyote"></div>
                  </div>
                </div>

                <div className="compare-bar-box">
                  <div className="compare-bar-header">
                    <span>Preventa Directa por Hitos en AgroPacto Soroban (98.5%)</span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--emerald-accent)" }}
                    >
                      ${agropactoNetUsd.toLocaleString("es-CR")} USD
                    </span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill-agropacto"></div>
                  </div>
                </div>
              </div>
            </section>

            {/* SECCION DE ZONAS PRODUCTORAS: ORIGEN SAN RAMON -> ESCALA CR & LATAM */}
            <div className="section-header">
              <div>
                <span className="eyebrow-label">
                  ORIGEN LOCAL Y ESCALABILIDAD REGIONAL · COSTA RICA & LATAM
                </span>
                <h2>De Plan Piloto en San Ramón a Estándar Cafetalero Regional</h2>
              </div>
            </div>

            <section className="cards-grid-3">
              {SAN_RAMON_REGIONS.map((z, i) => (
                <div key={i} className="feature-card">
                  <span className="eyebrow-label">ALTITUD: {z.altitude}</span>
                  <h3>{z.district}</h3>
                  <p>{z.highlight}</p>
                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "0.75rem",
                      borderTop: "1px dashed var(--border-strong)",
                      fontSize: "0.82rem",
                      color: "var(--forest-main)",
                    }}
                  >
                    <strong>Perfil de taza:</strong> {z.profile}
                  </div>
                </div>
              ))}
            </section>

            <div className="section-header">
              <div>
                <span className="eyebrow-label">
                  ARQUITECTURA DEL ESCROW POR HITOS (INSPIRADO EN TRUSTLESS WORK)
                </span>
                <h2>
                  ¿Cómo protege el Smart Contract tanto al cafetalero como al comprador?
                </h2>
              </div>
            </div>

            <section className="cards-grid-3">
              <div className="feature-card">
                <span className="eyebrow-label">01 · CAPITAL ANTES DE LA COGIDA</span>
                <h3>Liquidez para Abono y Mano de Obra</h3>
                <p>
                  En lugar de endeudarse con intereses altos en mayo o junio, la finca
                  en San Ramón pacta su microlote (Villa Sarchí, Caturra o Geisha) y
                  recibe el <strong>30% inicial</strong> apenas el comprador fondea el
                  escrow y se verifica el abonado del cafetal.
                </p>
              </div>

              <div className="feature-card">
                <span className="eyebrow-label">02 · CUSTODIA SIN CONFIANZA CIEGA</span>
                <h3>El Comprador Paga contra Cosecha Real</h3>
                <p>
                  El tostador o importador no suelta el 100% a ciegas: el contrato
                  inteligente retiene los fondos en Soroban y libera el{" "}
                  <strong>40% durante la cogida y secado en camas</strong> (11% de
                  humedad) y el <strong>30% final</strong> al recibir los sacos
                  GrainPro catados.
                </p>
              </div>

              <div className="feature-card">
                <span className="eyebrow-label">03 · RÉCORD CREDITICIO DE LA FINCA</span>
                <h3>Reputación On-Chain para Exportar</h3>
                <p>
                  Cada cosecha entregada incrementa el{" "}
                  <code>ProducerScore</code> de la finca en el storage persistente de
                  Soroban, construyendo una identidad verificable para negociar mejores
                  precios por quintal cada temporada.
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
                <span className="metric-label">LOTES EN EL LEDGER (ON-CHAIN)</span>
                <div className="metric-value font-mono">{metrics.total_lots}</div>
              </div>
              <div className="metric-card">
                <span className="metric-label">CAPITAL CUSTODIADO EN ESCROW</span>
                <div className="metric-value terracotta font-mono">
                  {metrics.total_volume_locked_xlm.toFixed(2)} XLM
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-label">LIBERADO A FINCAS CAFETALERAS</span>
                <div className="metric-value emerald font-mono">
                  {metrics.total_volume_released_xlm.toFixed(2)} XLM
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-label">REPUTACIÓN DE LA FINCA</span>
                <div className="metric-value font-mono">{producerScore} PTS</div>
              </div>
            </section>

            <section className="dashboard-grid">
              {/* COLUMNA IZQUIERDA: CREAR LOTE EN SOROBAN */}
              <div className="panel-card">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow-label">
                      FUNCIÓN SOROBAN: create_lot()
                    </span>
                    <h2>Inscribir Lote de Finca / Microbeneficio</h2>
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
                        {idx === 0
                          ? "Piedades Sur (San Ramón)"
                          : idx === 1
                          ? "Berlín (San Ramón)"
                          : idx === 2
                          ? "Occidente Geisha"
                          : "Tarrazú"}
                      </button>
                    ))}
                  </div>
                </div>

                <form className="form-stack" onSubmit={handleCreateLot}>
                  <div className="field-group">
                    <label>Nombre del Lote y Finca</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field-row">
                    <div className="field-group">
                      <label>Distrito / Región Cafetalera</label>
                      <input
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field-group">
                      <label>Variedad y Beneficiado</label>
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
                      <label>Volumen del Lote (kg Café Oro)</label>
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
                      <label>Valor Pactado en Escrow (XLM)</label>
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
                      background: "var(--bg-parchment)",
                      border: "1px dashed var(--border-strong)",
                      borderRadius: "8px",
                      padding: "0.8rem",
                      fontSize: "0.78rem",
                      color: "var(--ink-secondary)",
                    }}
                  >
                    <strong>Tramos que bloqueará el contrato en Soroban:</strong>
                    <div
                      className="font-mono"
                      style={{
                        marginTop: "0.3rem",
                        color: "var(--forest-main)",
                        fontWeight: 700,
                      }}
                    >
                      • Etapa 1 Abono (30%): {(totalAmountXlm * 0.3).toFixed(2)} XLM ·
                      Etapa 2 Cogida (40%): {(totalAmountXlm * 0.4).toFixed(2)} XLM ·
                      Etapa 3 Café Oro (30%): {(totalAmountXlm * 0.3).toFixed(2)} XLM
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction === "create_lot"
                      ? "Firmando create_lot() en Soroban Testnet..."
                      : "Inscribir Lote en Smart Contract Soroban"}
                  </button>
                </form>

                {/* HISTORIAL DE TRANSACCIONES ON-CHAIN DE LA SESION */}
                {txHistory.length > 0 && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <span className="metric-label">
                      TRANSACCIONES FIRMADAS EN SOROBAN RPC
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
                            background: "var(--bg-parchment)",
                            border: "1px solid var(--border-light)",
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
                            style={{
                              color: "var(--forest-main)",
                              fontWeight: 700,
                            }}
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
                    <span className="eyebrow-label">
                      LECTURA EN TIEMPO REAL DESDE SOROBAN TESTNET
                    </span>
                    <h2>Lotes Cafetaleros en Escrow ({lots.length})</h2>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => session && syncOnChainState(session)}
                    disabled={Boolean(busyAction)}
                  >
                    Sincronizar Ledger
                  </button>
                </div>

                {lots.length === 0 ? (
                  <div
                    style={{
                      padding: "2.5rem 1rem",
                      textAlign: "center",
                      color: "var(--ink-secondary)",
                      border: "1px dashed var(--border-strong)",
                      borderRadius: "10px",
                    }}
                  >
                    Conectá tu billetera arriba para cargar los lotes desde Soroban
                    Testnet.
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
                              <span className="eyebrow-label">
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
                                  Finca: <code>{shortenKey(lot.producer)}</code>
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
                                  EN COSECHA · {pctReleased}% LIBERADO
                                </span>
                              )}
                              {lot.status === 4 && (
                                <span className="status-badge status-completed">
                                  COSECHA 100% LIQUIDADA ({lot.total_amount_xlm} XLM)
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
                                Liberado a la finca:{" "}
                                <strong className="font-mono">
                                  {lot.released_amount_xlm.toFixed(2)} XLM
                                </strong>
                              </span>
                              <span>
                                Total del Escrow:{" "}
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
                                background: "var(--bg-surface)",
                                padding: "0.85rem 1rem",
                                borderRadius: "8px",
                                border: "1px dashed var(--terracotta)",
                              }}
                            >
                              <span style={{ fontSize: "0.85rem" }}>
                                Paso 1: El comprador deposita los{" "}
                                <strong>{lot.total_amount_xlm} XLM</strong> en el
                                escrow de Soroban.
                              </span>
                              <button
                                type="button"
                                className="btn btn-terracotta btn-sm"
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
                                        ? `Bitácora de Finca: "${note}"`
                                        : stage.subtitle}
                                    </div>
                                  </div>

                                  <div className="stage-actions">
                                    {isReleased ? (
                                      <span className="status-badge status-completed">
                                        LIQUIDADO ({stageXlm} XLM)
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
                                              ? "Guardando..."
                                              : "1. Reportar Bitácora (Finca)"}
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
                                          color: "var(--ink-muted)",
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
            <strong>AgroPacto.</strong> · Desarrollado por Johann Fonseca (San Ramón,
            Costa Rica)
          </span>
          <span>
            Campamento 02 (Soroban · Trustless Work) · Contract ID:{" "}
            <code>{shortenKey(STELLAR_CONFIG.CONTRACT_ID)}</code>
          </span>
        </div>
      </footer>
    </div>
  );
}
