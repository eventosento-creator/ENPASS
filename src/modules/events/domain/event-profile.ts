export const EVENT_PROFILES = [
  "nightlife", "concert", "festival", "conference",
  "sports", "expo", "private_event", "other",
] as const;

export type EventProfile = (typeof EVENT_PROFILES)[number];

export const EVENT_CAPABILITIES = [
  "tickets", "promoters", "tables", "seatmap", "access", "pos", "inventory",
] as const;

export type EventCapability = (typeof EVENT_CAPABILITIES)[number];
export type EventCapabilities = Record<EventCapability, boolean>;
export type VisibleEventCapability = Exclude<EventCapability, "inventory">;

export const EVENT_PROFILE_OPTIONS: ReadonlyArray<{
  value: EventProfile;
  label: string;
  description: string;
}> = [
  { value: "nightlife", label: "Fiesta / Club", description: "Entradas, RRPP, mesas y accesos." },
  { value: "concert", label: "Recital", description: "Entradas, difusión y control de acceso." },
  { value: "festival", label: "Festival", description: "Entradas y operación flexible por fecha." },
  { value: "conference", label: "Congreso / Conferencia", description: "Entradas y control de acceso." },
  { value: "sports", label: "Evento deportivo", description: "Entradas y validación en puerta." },
  { value: "expo", label: "Feria / Expo", description: "Entradas y acceso para visitantes." },
  { value: "private_event", label: "Evento privado", description: "Invitados, entradas y acceso." },
  { value: "other", label: "Otro", description: "Elegí las herramientas que necesitás." },
];

const PRESETS: Record<EventProfile, EventCapabilities> = {
  nightlife: { tickets: true, promoters: true, tables: true, seatmap: false, access: true, pos: true, inventory: false },
  concert: { tickets: true, promoters: true, tables: false, seatmap: false, access: true, pos: true, inventory: false },
  festival: { tickets: true, promoters: false, tables: false, seatmap: false, access: true, pos: true, inventory: false },
  conference: { tickets: true, promoters: false, tables: false, seatmap: true, access: true, pos: false, inventory: false },
  sports: { tickets: true, promoters: false, tables: false, seatmap: true, access: true, pos: true, inventory: false },
  expo: { tickets: true, promoters: false, tables: false, seatmap: false, access: true, pos: true, inventory: false },
  private_event: { tickets: true, promoters: false, tables: false, seatmap: false, access: true, pos: false, inventory: false },
  other: { tickets: true, promoters: false, tables: false, seatmap: false, access: true, pos: false, inventory: false },
};

export function getDefaultCapabilitiesForProfile(profile: EventProfile): EventCapabilities {
  return { ...PRESETS[profile] };
}

export function getEventProfileLabel(profile: EventProfile) {
  return EVENT_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ?? "Otro";
}

export function getEventCapabilities(event: {
  tickets_enabled: boolean;
  promoters_enabled: boolean;
  tables_enabled: boolean;
  seatmap_enabled: boolean;
  access_enabled: boolean;
  pos_enabled: boolean;
  inventory_enabled: boolean;
}): EventCapabilities {
  return {
    tickets: event.tickets_enabled,
    promoters: event.promoters_enabled,
    tables: event.tables_enabled,
    seatmap: event.seatmap_enabled,
    access: event.access_enabled,
    pos: event.pos_enabled,
    inventory: event.inventory_enabled,
  };
}

export function changeEventProfile<T extends { profile: EventProfile }>(event: T, profile: EventProfile): T {
  return { ...event, profile };
}

export const EVENT_DISCOVERY_CATEGORIES = [
  "party", "concert", "conference", "talk", "seminar", "networking", "educational", "theater",
] as const;

export type EventDiscoveryCategory = (typeof EVENT_DISCOVERY_CATEGORIES)[number];

export const EVENT_DISCOVERY_CATEGORY_OPTIONS: ReadonlyArray<{ value: EventDiscoveryCategory; label: string }> = [
  { value: "party", label: "Fiestas" },
  { value: "concert", label: "Recitales" },
  { value: "conference", label: "Conferencias" },
  { value: "talk", label: "Charlas" },
  { value: "seminar", label: "Seminarios" },
  { value: "networking", label: "Networking" },
  { value: "educational", label: "Educativos" },
  { value: "theater", label: "Teatro" },
];

export function getDiscoveryCategoryLabel(category: EventDiscoveryCategory) {
  return EVENT_DISCOVERY_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? "Fiestas";
}
