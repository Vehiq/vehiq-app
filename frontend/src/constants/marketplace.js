// Listing types and parts categories — used by Marketplace forms and filters.

export const LISTING_TYPES = [
  { id: "car", labelKey: "marketplace.types.car" },
  { id: "parts", labelKey: "marketplace.types.parts" },
  { id: "swap", labelKey: "marketplace.types.swap" },
  { id: "full_parts", labelKey: "marketplace.types.full_parts" },
  { id: "project", labelKey: "marketplace.types.project" },
  { id: "rental", labelKey: "marketplace.types.rental" },
  { id: "service", labelKey: "marketplace.types.service" },
];

export const VEHICLE_CONDITIONS = [
  { id: "running", labelKey: "marketplace.conditions.running" },
  { id: "damaged_runs", labelKey: "marketplace.conditions.damagedRuns" },
  { id: "damaged_dead", labelKey: "marketplace.conditions.damagedDead" },
  { id: "restoration", labelKey: "marketplace.conditions.restoration" },
];

export const STEERING_OPTIONS = [
  { id: "left", labelKey: "marketplace.steering.left" },
  { id: "right", labelKey: "marketplace.steering.right" },
];

export const SWAP_CONDITIONS = [
  { id: "any", labelKey: "marketplace.swapCond.any" },
  { id: "running", labelKey: "marketplace.swapCond.running" },
  { id: "clean", labelKey: "marketplace.swapCond.clean" },
];

// 8 main parts categories with subcategories (id used in DB, labelKey for i18n)
export const PARTS_CATEGORIES = [
  {
    id: "engine", labelKey: "parts.engine.title", subs: [
      { id: "engine_full", labelKey: "parts.engine.full" },
      { id: "engine_head", labelKey: "parts.engine.head" },
      { id: "engine_alternator", labelKey: "parts.engine.alternator" },
      { id: "engine_timing", labelKey: "parts.engine.timing" },
      { id: "engine_other", labelKey: "parts.engine.other" },
    ],
  },
  {
    id: "transmission", labelKey: "parts.transmission.title", subs: [
      { id: "trans_manual", labelKey: "parts.transmission.manual" },
      { id: "trans_auto", labelKey: "parts.transmission.auto" },
      { id: "trans_clutch", labelKey: "parts.transmission.clutch" },
    ],
  },
  {
    id: "suspension", labelKey: "parts.suspension.title", subs: [
      { id: "susp_shocks", labelKey: "parts.suspension.shocks" },
      { id: "susp_springs", labelKey: "parts.suspension.springs" },
      { id: "susp_arms", labelKey: "parts.suspension.arms" },
      { id: "susp_wheels", labelKey: "parts.suspension.wheels" },
    ],
  },
  {
    id: "body", labelKey: "parts.body.title", subs: [
      { id: "body_bumpers", labelKey: "parts.body.bumpers" },
      { id: "body_hood_fenders", labelKey: "parts.body.hoodFenders" },
      { id: "body_doors", labelKey: "parts.body.doors" },
      { id: "body_glass", labelKey: "parts.body.glass" },
      { id: "body_other", labelKey: "parts.body.other" },
    ],
  },
  {
    id: "electrical", labelKey: "parts.electrical.title", subs: [
      { id: "elec_alternator", labelKey: "parts.electrical.alternator" },
      { id: "elec_starter", labelKey: "parts.electrical.starter" },
      { id: "elec_ecu", labelKey: "parts.electrical.ecu" },
      { id: "elec_lights", labelKey: "parts.electrical.lights" },
    ],
  },
  {
    id: "interior", labelKey: "parts.interior.title", subs: [
      { id: "int_seats", labelKey: "parts.interior.seats" },
      { id: "int_dashboard", labelKey: "parts.interior.dashboard" },
      { id: "int_mats", labelKey: "parts.interior.mats" },
      { id: "int_other", labelKey: "parts.interior.other" },
    ],
  },
  {
    id: "brakes", labelKey: "parts.brakes.title", subs: [
      { id: "brake_discs", labelKey: "parts.brakes.discs" },
      { id: "brake_calipers", labelKey: "parts.brakes.calipers" },
      { id: "brake_other", labelKey: "parts.brakes.other" },
    ],
  },
  {
    id: "other", labelKey: "parts.other.title", subs: [
      { id: "other_misc", labelKey: "parts.other.misc" },
    ],
  },
];

// Popular models per make. Free-form input is always allowed via "other".
export const POPULAR_MODELS = {
  "Audi": ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "RS4", "RS6", "S3", "S4", "TT"],
  "BMW": ["1 Series", "3 Series", "5 Series", "7 Series", "X1", "X3", "X5", "M3", "M5", "E30", "E36", "E46", "E90"],
  "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "AMG GT", "W124", "W210"],
  "Porsche": ["911", "Cayenne", "Macan", "Panamera", "Boxster", "Cayman", "Taycan"],
  "Volkswagen": ["Golf", "Polo", "Passat", "Tiguan", "Touareg", "Arteon", "T-Roc", "Up!"],
  "Toyota": ["Corolla", "Yaris", "RAV4", "Supra", "GR86", "Land Cruiser", "Hilux", "Camry"],
  "Honda": ["Civic", "Accord", "CR-V", "HR-V", "S2000", "NSX", "Jazz"],
  "Ford": ["Focus", "Fiesta", "Mondeo", "Mustang", "Kuga", "Ranger", "Explorer"],
  "Mazda": ["3", "6", "CX-5", "CX-30", "MX-5", "RX-7", "RX-8"],
  "Volvo": ["XC40", "XC60", "XC90", "S60", "V60", "V90"],
  "Skoda": ["Fabia", "Octavia", "Superb", "Kodiaq", "Karoq", "Kamiq"],
  "Tesla": ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"],
  "Lexus": ["IS", "ES", "GS", "LS", "RX", "NX", "LFA", "LC"],
  "Land Rover": ["Defender", "Discovery", "Range Rover", "Range Rover Sport", "Evoque"],
  "Subaru": ["Impreza", "WRX", "WRX STI", "Forester", "Outback", "BRZ"],
  "Nissan": ["Skyline", "GT-R", "350Z", "370Z", "Z", "Qashqai", "X-Trail", "Juke"],
  "Mitsubishi": ["Lancer Evolution", "Outlander", "ASX", "Pajero", "Eclipse"],
  "Renault": ["Clio", "Megane", "Captur", "Kadjar", "Scenic"],
  "Peugeot": ["208", "308", "508", "2008", "3008", "5008"],
  "Fiat": ["500", "Panda", "Tipo", "Punto", "Bravo", "124 Spider"],
  "Opel": ["Astra", "Insignia", "Corsa", "Mokka", "Grandland"],
  "Hyundai": ["i20", "i30", "Tucson", "Santa Fe", "Kona", "Ioniq"],
  "Kia": ["Ceed", "Sportage", "Sorento", "Stinger", "EV6", "Picanto"],
};
