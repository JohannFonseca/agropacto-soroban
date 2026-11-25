# 🍒 AgroPacto — Preventa Directa y Escrow de Cosechas por Etapas en Stellar Soroban

**Autor:** Johann Fonseca (`@JohannFonseca`)  
**Entregable Campamento 02:** Contratos Inteligentes en Soroban (con **Trustless Work**) — *Pura Vida Bootcamp*  
**Red:** Stellar Testnet (Soroban RPC)

---

## 🔗 Contrato Desplegado en Stellar Testnet

| Recurso | Valor / Enlace Oficial |
| :--- | :--- |
| **Contract ID (Testnet)** | `CB2ZCHXZW5AEWIQRKJJ7VX3I2SPOZPXAULEIE34SJUEMLNRNOADZARQG` |
| **WASM Hash** | `18d704f64cab8717f35b59b9fe330a03e6456d6298848cbdf767d625aa8d5bfe` |
| **Stellar Lab (Contrato)** | [Ver en Stellar Lab Testnet ↗](https://lab.stellar.org/r/testnet/contract/CB2ZCHXZW5AEWIQRKJJ7VX3I2SPOZPXAULEIE34SJUEMLNRNOADZARQG) |
| **Stellar.expert (Contrato)** | [Ver en Stellar.expert Testnet ↗](https://stellar.expert/explorer/testnet/contract/CB2ZCHXZW5AEWIQRKJJ7VX3I2SPOZPXAULEIE34SJUEMLNRNOADZARQG) |
| **Tx de Despliegue** | [`874ee5ce763ae1b0a512350c6592e3fd3efdf60c14f02a9e799be57b3c6990b1`](https://stellar.expert/explorer/testnet/tx/874ee5ce763ae1b0a512350c6592e3fd3efdf60c14f02a9e799be57b3c6990b1) |
| **Tx `create_lot` (#1)** | [`c050293ee5081f77f59b155ddae11db6ba797c200ac602eda62ce02981c97b17`](https://stellar.expert/explorer/testnet/tx/c050293ee5081f77f59b155ddae11db6ba797c200ac602eda62ce02981c97b17) |
| **Tx `fund_lot` (#1)** | [`707d112872e543fe6327803e18c943a7717976b4b3831e66d51ccc0d6c7d1489`](https://stellar.expert/explorer/testnet/tx/707d112872e543fe6327803e18c943a7717976b4b3831e66d51ccc0d6c7d1489) |
| **Tx `submit_stage` (Etapa 1)** | [`a353fa26ef4cfc1ae557ef50eea9106b2b37d9a1b0539ae36cdc0ec55ea0dfb1`](https://stellar.expert/explorer/testnet/tx/a353fa26ef4cfc1ae557ef50eea9106b2b37d9a1b0539ae36cdc0ec55ea0dfb1) |
| **Tx `approve_and_release` (30%)** | [`a956d480413e2f0b11e37737ea08b7fb8b156490aca5e7df0a0cdd4fcf4f7a6a`](https://stellar.expert/explorer/testnet/tx/a956d480413e2f0b11e37737ea08b7fb8b156490aca5e7df0a0cdd4fcf4f7a6a) |
| **Tx `create_lot` (#3 · San Ramón)** | [`19b912f905361690345680f974cf62d3aeb4e48fcb3622b1a6f41241ab9746d9`](https://stellar.expert/explorer/testnet/tx/19b912f905361690345680f974cf62d3aeb4e48fcb3622b1a6f41241ab9746d9) |
| **Tx `approve_and_release` (#3 · San Ramón Etapa 2)** | [`ce4cf43bcf4ca6bc81a8368f35dfb6cfa33ce1b1cde4f29f558c9318a5924be5`](https://stellar.expert/explorer/testnet/tx/ce4cf43bcf4ca6bc81a8368f35dfb6cfa33ce1b1cde4f29f558c9318a5924be5) |

---

## 💡 El Problema Real en San Ramón y el Valle Occidental que Resuelve AgroPacto

En zonas cafetaleras históricas de Costa Rica como **San Ramón de Alajuela (Piedades Sur, Ángeles, Berlín, Santiago, San Juan)** y el Valle Occidental, cientos de familias productoras de café de especialidad (*Villa Sarchí, Caturra, Geisha*) necesitan capital de trabajo meses antes de *la cogida* (para abono orgánico, chapea, regulación de sombra de poró y mano de obra). Al no tener acceso ágil a crédito bancario, terminan vendiendo su cosecha por adelantado a intermediarios (*"coyotes"*) perdiendo hasta un 40% de su margen. Por otro lado, los compradores y tostadores temen enviar el 100% del pago por adelantado mediante transferencia bancaria sin garantías de cumplimiento.

**AgroPacto** elimina al intermediario mediante un **Smart Contract de Escrow por Hitos de Cosecha en Soroban**:
1. **Etapa 01 · Siembra, Poda e Insumos (30%):** Capital inicial liberado al registrar la preparación de la finca.
2. **Etapa 02 · Cosecha y Beneficio Húmedo/Seco (40%):** Liberación intermedia al recolectar grano cereza maduro y secar al 11% de humedad.
3. **Etapa 03 · Despacho en Oro y Catación SCA (30%):** Liquidación final contra entrega de sacos GrainPro y puntaje de catación.

---

## ⚙️ Arquitectura del Smart Contract en Soroban (`contracts/agropacto_escrow/src/lib.rs`)

El contrato exporta **8 funciones públicas** con almacenamiento persistente (`env.storage().persistent()`), validación de estado, eventos on-chain y autorización criptográfica (`require_auth()`):

1. `create_lot(producer, buyer, title, region, variety, quantity_kg, total_amount) -> Result<u64, AgroError>`  
   Crea un nuevo lote de cosecha en el contrato verificando la firma del productor (`producer.require_auth()`).
2. `fund_lot(lot_id) -> Result<HarvestLot, AgroError>`  
   El comprador (`lot.buyer.require_auth()`) bloquea el capital total del lote en el escrow y actualiza el TVL del protocolo.
3. `submit_stage(lot_id, stage_number, evidence_note) -> Result<HarvestLot, AgroError>`  
   El productor (`lot.producer.require_auth()`) registra en el ledger la bitácora o evidencia técnica de la etapa `1`, `2` o `3`.
4. `approve_and_release(lot_id, stage_number) -> Result<HarvestLot, AgroError>`  
   El comprador (`lot.buyer.require_auth()`) aprueba la etapa y el contrato libera automáticamente el porcentaje correspondiente (`30%`, `40%`, `30%`) e incrementa el puntaje de reputación on-chain (`ProducerScore`) del agricultor.
5. `get_lot(lot_id) -> Result<HarvestLot, AgroError>`  
   Devuelve el estado completo de un lote específico.
6. `list_lots() -> Vec<HarvestLot>`  
   Devuelve todos los lotes registrados en el contrato.
7. `get_metrics() -> PlatformMetrics`  
   Devuelve métricas agregadas on-chain (lotes totales, activos, completados, volumen protegido en escrow y volumen liberado).
8. `get_producer_score(producer) -> u32`  
   Consulta el puntaje de reputación histórica del productor en la blockchain.

---

## 🚀 Cómo Correr el Proyecto Localmente

### 1. Ejecutar Pruebas Unitarias y Compilar el Contrato Soroban (Rust)

```bash
# Ejecutar suite de tests del ciclo completo de cosecha (Etapas 1, 2 y 3)
cargo test

# Compilar a WebAssembly optimizado
stellar contract build
```

### 2. Ejecutar el Frontend Conectado a Soroban Testnet

```bash
cd web
npm install
npm run dev
```

Abre `http://localhost:5173` en tu navegador. Puedes conectarte con **Freighter Wallet** o usar el botón **Billetera Testnet Instantánea** (que fondea automáticamente un par Productor/Comprador con Friendbot para que puedas probar todas las funciones de escritura del contrato `create_lot`, `fund_lot`, `submit_stage` y `approve_and_release` en 1 clic).
