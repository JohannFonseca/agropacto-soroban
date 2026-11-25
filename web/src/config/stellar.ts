export const STELLAR_CONFIG = {
  NETWORK: "TESTNET",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  HORIZON_URL: "https://horizon-testnet.stellar.org",
  SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  FRIENDBOT_URL: "https://friendbot.stellar.org",
  EXPLORER_CONTRACT_URL: "https://stellar.expert/explorer/testnet/contract",
  EXPLORER_TX_URL: "https://stellar.expert/explorer/testnet/tx",
  // Contract ID real desplegado en Stellar Testnet
  CONTRACT_ID: "CB2ZCHXZW5AEWIQRKJJ7VX3I2SPOZPXAULEIE34SJUEMLNRNOADZARQG",
};

export interface HarvestStageMeta {
  number: 1 | 2 | 3;
  name: string;
  percentage: number;
  subtitle: string;
  defaultEvidence: string;
}

export const HARVEST_STAGES: HarvestStageMeta[] = [
  {
    number: 1,
    name: "Etapa 01 · Siembra, Poda e Insumos",
    percentage: 30,
    subtitle: "Adelanto protegido para fertilización orgánica, sombra y mano de obra inicial.",
    defaultEvidence: "Lote fertilizado con abono orgánico, control de sombra y bitácora ICAFE verificada.",
  },
  {
    number: 2,
    name: "Etapa 02 · Cosecha y Beneficio Húmedo/Seco",
    percentage: 40,
    subtitle: "Liberación intermedia al recolectar grano maduro y alcanzar 11% de humedad en patio.",
    defaultEvidence: "Recolección 100% grano cereza maduro, despulpado y secado al sol en camas africanas (11.2% humedad).",
  },
  {
    number: 3,
    name: "Etapa 03 · Despacho en Oro y Catación SCA",
    percentage: 30,
    subtitle: "Liquidación final contra entrega de sacos GrainPro y puntaje de catación >= 86 pts.",
    defaultEvidence: "500 kg entregados en sacos GrainPro de 69 kg, perfil taza limpia 88.25 pts SCA verificado.",
  },
];

export const PRESET_COSTA_RICA_LOTS = [
  {
    title: "Lote Café Geisha Lavado #01 · Finca La Candelaria",
    region: "Los Santos, Tarrazú (1,850 msnm)",
    variety: "Geisha · Proceso Lavado",
    quantityKg: 450,
    totalAmountXlm: 1200,
  },
  {
    title: "Microlote Caturra Honey Rojo · Cooperativa Dota",
    region: "Santa María de Dota (1,720 msnm)",
    variety: "Caturra · Honey Rojo",
    quantityKg: 600,
    totalAmountXlm: 950,
  },
  {
    title: "Cacao Fino de Aroma Trinitario · Upala Orgánico",
    region: "Upala, Zona Norte (650 msnm)",
    variety: "Trinitario Fermentado 6 Días",
    quantityKg: 800,
    totalAmountXlm: 1500,
  },
];
