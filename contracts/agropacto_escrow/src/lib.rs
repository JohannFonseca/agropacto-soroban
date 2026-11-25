#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AgroError {
    LotNotFound = 1,
    InvalidAmount = 2,
    InvalidStageState = 3,
    AlreadyFunded = 4,
    NotFunded = 5,
    StageAlreadyReleased = 6,
    PreviousStageIncomplete = 7,
    LotCancelled = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarvestLot {
    pub id: u64,
    pub producer: Address,
    pub buyer: Address,
    pub title: String,
    pub region: String,
    pub variety: String,
    pub quantity_kg: u64,
    pub total_amount: i128,
    pub released_amount: i128,
    /// 0 = Creado, 1 = Fondeado, 2 = Etapa 1 Liberada, 3 = Etapa 2 Liberada, 4 = Completado, 5 = Cancelado
    pub status: u32,
    /// Evidencia/Nota de cada etapa reportada por el productor
    pub stage1_note: String,
    pub stage2_note: String,
    pub stage3_note: String,
    /// Bitmask o contador de etapas reportadas como listas por el productor (0..=3)
    pub reported_stage: u32,
    /// Contador de etapas aprobadas y liberadas por el comprador (0..=3)
    pub released_stage: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformMetrics {
    pub total_lots: u64,
    pub active_lots: u64,
    pub completed_lots: u64,
    pub total_volume_locked: i128,
    pub total_volume_released: i128,
}

#[contracttype]
pub enum DataKey {
    NextLotId,
    Lot(u64),
    Metrics,
    ProducerScore(Address),
}

// Distribucion de pagos por etapa de cosecha:
// Etapa 1 (Siembra e Insumos): 30%
// Etapa 2 (Cosecha y Beneficio): 40%
// Etapa 3 (Despacho y Calidad Final): 30%
const STAGE_1_BPS: i128 = 3000;
const STAGE_2_BPS: i128 = 4000;
const BPS_DENOMINATOR: i128 = 10000;

#[contract]
pub struct AgroPactoContract;

#[contractimpl]
impl AgroPactoContract {
    /// 1. Crea un nuevo acuerdo de preventa/escrow agricola por etapas de cosecha.
    /// Requiere autorizacion criptografica del productor (`producer.require_auth()`).
    pub fn create_lot(
        env: Env,
        producer: Address,
        buyer: Address,
        title: String,
        region: String,
        variety: String,
        quantity_kg: u64,
        total_amount: i128,
    ) -> Result<u64, AgroError> {
        producer.require_auth();

        if total_amount <= 0 || quantity_kg == 0 {
            return Err(AgroError::InvalidAmount);
        }

        let lot_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::NextLotId)
            .unwrap_or(1u64);

        let empty_note = String::from_str(&env, "Pendiente");

        let lot = HarvestLot {
            id: lot_id,
            producer: producer.clone(),
            buyer: buyer.clone(),
            title,
            region,
            variety,
            quantity_kg,
            total_amount,
            released_amount: 0,
            status: 0,
            stage1_note: empty_note.clone(),
            stage2_note: empty_note.clone(),
            stage3_note: empty_note,
            reported_stage: 0,
            released_stage: 0,
        };

        env.storage().persistent().set(&DataKey::Lot(lot_id), &lot);
        env.storage()
            .persistent()
            .set(&DataKey::NextLotId, &(lot_id + 1));

        let mut metrics = Self::get_metrics(env.clone());
        metrics.total_lots += 1;
        metrics.active_lots += 1;
        env.storage().persistent().set(&DataKey::Metrics, &metrics);

        env.events()
            .publish((symbol_short!("created"), lot_id), (producer, buyer, total_amount));

        Ok(lot_id)
    }

    /// 2. El comprador fondea y bloquea el capital del lote en el escrow de Soroban.
    /// Requiere autorizacion del comprador (`lot.buyer.require_auth()`).
    pub fn fund_lot(env: Env, lot_id: u64) -> Result<HarvestLot, AgroError> {
        let mut lot: HarvestLot = env
            .storage()
            .persistent()
            .get(&DataKey::Lot(lot_id))
            .ok_or(AgroError::LotNotFound)?;

        if lot.status == 5 {
            return Err(AgroError::LotCancelled);
        }
        if lot.status >= 1 {
            return Err(AgroError::AlreadyFunded);
        }

        lot.buyer.require_auth();
        lot.status = 1;

        env.storage().persistent().set(&DataKey::Lot(lot_id), &lot);

        let mut metrics = Self::get_metrics(env.clone());
        metrics.total_volume_locked += lot.total_amount;
        env.storage().persistent().set(&DataKey::Metrics, &metrics);

        env.events()
            .publish((symbol_short!("funded"), lot_id), lot.total_amount);

        Ok(lot)
    }

    /// 3. El productor registra el avance y evidencia de una etapa de la cosecha (1, 2 o 3).
    /// Requiere autorizacion del productor (`lot.producer.require_auth()`).
    pub fn submit_stage(
        env: Env,
        lot_id: u64,
        stage_number: u32,
        evidence_note: String,
    ) -> Result<HarvestLot, AgroError> {
        let mut lot: HarvestLot = env
            .storage()
            .persistent()
            .get(&DataKey::Lot(lot_id))
            .ok_or(AgroError::LotNotFound)?;

        if lot.status == 0 {
            return Err(AgroError::NotFunded);
        }
        if lot.status == 5 {
            return Err(AgroError::LotCancelled);
        }
        if stage_number < 1 || stage_number > 3 {
            return Err(AgroError::InvalidStageState);
        }
        if stage_number > lot.released_stage + 1 {
            return Err(AgroError::PreviousStageIncomplete);
        }

        lot.producer.require_auth();

        if stage_number == 1 {
            lot.stage1_note = evidence_note;
        } else if stage_number == 2 {
            lot.stage2_note = evidence_note;
        } else {
            lot.stage3_note = evidence_note;
        }

        if stage_number > lot.reported_stage {
            lot.reported_stage = stage_number;
        }

        env.storage().persistent().set(&DataKey::Lot(lot_id), &lot);

        env.events()
            .publish((symbol_short!("stage_sub"), lot_id), stage_number);

        Ok(lot)
    }

    /// 4. El comprador aprueba la etapa y libera el porcentaje correspondiente al productor:
    /// Etapa 1 -> 30%, Etapa 2 -> 40%, Etapa 3 -> 30% restante + +10 pts de reputacion on-chain.
    pub fn approve_and_release(
        env: Env,
        lot_id: u64,
        stage_number: u32,
    ) -> Result<HarvestLot, AgroError> {
        let mut lot: HarvestLot = env
            .storage()
            .persistent()
            .get(&DataKey::Lot(lot_id))
            .ok_or(AgroError::LotNotFound)?;

        if lot.status == 0 {
            return Err(AgroError::NotFunded);
        }
        if lot.status == 5 {
            return Err(AgroError::LotCancelled);
        }
        if stage_number < 1 || stage_number > 3 {
            return Err(AgroError::InvalidStageState);
        }
        if stage_number <= lot.released_stage {
            return Err(AgroError::StageAlreadyReleased);
        }
        if stage_number != lot.released_stage + 1 {
            return Err(AgroError::PreviousStageIncomplete);
        }

        lot.buyer.require_auth();

        let tranche_amount: i128 = if stage_number == 1 {
            (lot.total_amount * STAGE_1_BPS) / BPS_DENOMINATOR
        } else if stage_number == 2 {
            (lot.total_amount * STAGE_2_BPS) / BPS_DENOMINATOR
        } else {
            lot.total_amount - lot.released_amount
        };

        lot.released_amount += tranche_amount;
        lot.released_stage = stage_number;
        if lot.reported_stage < stage_number {
            lot.reported_stage = stage_number;
        }

        lot.status = if stage_number == 1 {
            2
        } else if stage_number == 2 {
            3
        } else {
            4
        };

        env.storage().persistent().set(&DataKey::Lot(lot_id), &lot);

        // Actualiza metricas globales y reputacion on-chain del productor
        let mut metrics = Self::get_metrics(env.clone());
        metrics.total_volume_released += tranche_amount;
        if metrics.total_volume_locked >= tranche_amount {
            metrics.total_volume_locked -= tranche_amount;
        }
        if stage_number == 3 {
            metrics.completed_lots += 1;
            if metrics.active_lots > 0 {
                metrics.active_lots -= 1;
            }
        }
        env.storage().persistent().set(&DataKey::Metrics, &metrics);

        let current_score: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::ProducerScore(lot.producer.clone()))
            .unwrap_or(100u32);
        let bonus = if stage_number == 3 { 25u32 } else { 10u32 };
        env.storage().persistent().set(
            &DataKey::ProducerScore(lot.producer.clone()),
            &(current_score + bonus),
        );

        env.events().publish(
            (symbol_short!("released"), lot_id),
            (stage_number, tranche_amount),
        );

        Ok(lot)
    }

    /// 5. Consulta los detalles completos de un lote de cosecha por su ID.
    pub fn get_lot(env: Env, lot_id: u64) -> Result<HarvestLot, AgroError> {
        env.storage()
            .persistent()
            .get(&DataKey::Lot(lot_id))
            .ok_or(AgroError::LotNotFound)
    }

    /// 6. Lista todos los lotes registrados en el protocolo AgroPacto.
    pub fn list_lots(env: Env) -> Vec<HarvestLot> {
        let next_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::NextLotId)
            .unwrap_or(1u64);
        let mut list = Vec::new(&env);
        let mut i = 1u64;
        while i < next_id {
            if let Some(lot) = env.storage().persistent().get::<DataKey, HarvestLot>(&DataKey::Lot(i)) {
                list.push_back(lot);
            }
            i += 1;
        }
        list
    }

    /// 7. Devuelve las metricas agregadas del protocolo (TVL, volumen liberado, lotes activos).
    pub fn get_metrics(env: Env) -> PlatformMetrics {
        env.storage()
            .persistent()
            .get(&DataKey::Metrics)
            .unwrap_or(PlatformMetrics {
                total_lots: 0,
                active_lots: 0,
                completed_lots: 0,
                total_volume_locked: 0,
                total_volume_released: 0,
            })
    }

    /// 8. Devuelve el puntaje de reputacion on-chain de un productor agricola.
    pub fn get_producer_score(env: Env, producer: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::ProducerScore(producer))
            .unwrap_or(100u32)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    #[test]
    fn test_full_harvest_escrow_lifecycle() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(AgroPactoContract, ());
        let client = AgroPactoContractClient::new(&env, &contract_id);

        let producer = Address::generate(&env);
        let buyer = Address::generate(&env);

        // 1. Crear lote de Cafe Geisha de Tarrazu por 1,000 XLM
        let lot_id = client.create_lot(
            &producer,
            &buyer,
            &String::from_str(&env, "Lote Cafe Tarrazu SHB #01"),
            &String::from_str(&env, "Los Santos, Tarrazu"),
            &String::from_str(&env, "Geisha Lavado"),
            &500u64,
            &1000_0000000i128,
        );
        assert_eq!(lot_id, 1);

        // 2. Comprador fondea el escrow
        let funded_lot = client.fund_lot(&lot_id);
        assert_eq!(funded_lot.status, 1);

        let metrics_after_fund = client.get_metrics();
        assert_eq!(metrics_after_fund.total_volume_locked, 1000_0000000i128);

        // 3. Etapa 1: Siembra e Insumos (30% = 300 XLM)
        client.submit_stage(
            &lot_id,
            &1u32,
            &String::from_str(&env, "Fertilizante organico y poda aplicada"),
        );
        let after_stage_1 = client.approve_and_release(&lot_id, &1u32);
        assert_eq!(after_stage_1.released_stage, 1);
        assert_eq!(after_stage_1.released_amount, 300_0000000i128);

        // 4. Etapa 2: Cosecha y Beneficio (40% = 400 XLM -> acumulado 700 XLM)
        client.submit_stage(
            &lot_id,
            &2u32,
            &String::from_str(&env, "Recoleccion grano maduro y secado al sol 11% humedad"),
        );
        let after_stage_2 = client.approve_and_release(&lot_id, &2u32);
        assert_eq!(after_stage_2.released_stage, 2);
        assert_eq!(after_stage_2.released_amount, 700_0000000i128);

        // 5. Etapa 3: Despacho y Calidad Final (30% = 300 XLM -> acumulado 1,000 XLM)
        client.submit_stage(
            &lot_id,
            &3u32,
            &String::from_str(&env, "Sacos GrainPro entregados en beneficio con 87.5 pts SCA"),
        );
        let after_stage_3 = client.approve_and_release(&lot_id, &3u32);
        assert_eq!(after_stage_3.released_stage, 3);
        assert_eq!(after_stage_3.status, 4);
        assert_eq!(after_stage_3.released_amount, 1000_0000000i128);

        // 6. Verificar reputacion del productor y metricas globales
        let score = client.get_producer_score(&producer);
        assert_eq!(score, 145);

        let final_metrics = client.get_metrics();
        assert_eq!(final_metrics.completed_lots, 1);
        assert_eq!(final_metrics.total_volume_released, 1000_0000000i128);
        assert_eq!(final_metrics.total_volume_locked, 0);
    }
}
