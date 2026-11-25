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
    name: "Etapa 01 · Almácigo, Chapea y Abono en Finca",
    percentage: 30,
    subtitle:
      "Adelanto protegido (30%) para abono orgánico, regulación de sombra de poró y preparación del cafetal en San Ramón / Occidente.",
    defaultEvidence:
      "Finca en Piedades Sur de San Ramón: abonado orgánico completo, poda sanitaria y bitácora ICAFE verificada.",
  },
  {
    number: 2,
    name: "Etapa 02 · La Cogida (Grano Cereza) y Beneficio Seco",
    percentage: 40,
    subtitle:
      "Liberación intermedia (40%) al medir las cajuelas de café maduro recolectadas y secar en patio/camas africanas al 11% de humedad.",
    defaultEvidence:
      "Cogida completada en Ángeles de San Ramón (100% grano cereza maduro 22° Brix) y secado al sol a 11.2% de humedad.",
  },
  {
    number: 3,
    name: "Etapa 03 · Café Oro en Sacos GrainPro y Catación SCA",
    percentage: 30,
    subtitle:
      "Liquidación final (30%) contra entrega de sacos de yute/GrainPro listos para tostar o exportar con puntaje de taza >= 86 pts.",
    defaultEvidence:
      "Lote entregado en microbeneficio de San Ramón en sacos de 69 kg GrainPro, taza limpia con 88.50 pts SCA.",
  },
];

export const PRESET_COSTA_RICA_LOTS = [
  {
    title: "Lote Villa Sarchí Honey #03 · Finca La Paz (Piedades Sur)",
    region: "San Ramón de Alajuela · Piedades Sur (1,450 msnm)",
    variety: "Villa Sarchí · Honey Negro",
    quantityKg: 550,
    totalAmountXlm: 1350,
  },
  {
    title: "Microlote Caturra Lavado · Altos de Ángeles & Berlín",
    region: "San Ramón de Alajuela · Berlín (1,520 msnm)",
    variety: "Caturra · Lavado de Altura",
    quantityKg: 480,
    totalAmountXlm: 1100,
  },
  {
    title: "Lote Geisha Natural · Cumbre de Naranjo & Occidente",
    region: "Valle Occidental · San Ramón - Naranjo (1,680 msnm)",
    variety: "Geisha · Proceso Natural",
    quantityKg: 400,
    totalAmountXlm: 1600,
  },
  {
    title: "Lote Café Geisha Lavado #01 · Finca La Candelaria",
    region: "Los Santos, Tarrazú (1,850 msnm)",
    variety: "Geisha · Proceso Lavado",
    quantityKg: 450,
    totalAmountXlm: 1200,
  },
];

export const SAN_RAMON_REGIONS = [
  {
    district: "Piedades Sur & Potrerillos (San Ramón)",
    altitude: "1,350 – 1,550 msnm",
    profile: "Notas a panela, cacao oscuro y acidez cítrica brillante.",
    highlight: "Zona clave de microbeneficios familiares en San Ramón.",
  },
  {
    district: "Ángeles & Berlín de San Ramón",
    altitude: "1,400 – 1,620 msnm",
    profile: "Cuerpo sedoso, miel de caña y frutos rojos maduros.",
    highlight: "Clima nuboso ideal para procesos Honey y Villa Sarchí.",
  },
  {
    district: "San Juan, Santiago & Zapotal (Occidente)",
    altitude: "1,250 – 1,500 msnm",
    profile: "Dulzor prolongado, chocolate con almendra y taza limpia.",
    highlight: "Alta densidad de pequeños cafetaleros independientes.",
  },
];
