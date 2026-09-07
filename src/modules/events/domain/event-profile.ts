export const EVENT_PROFILES = [
  "nightlife", "concert", "festival", "conference",
  "sports", "expo", "private_event", "other",
] as const;

export type EventProfile = (typeof EVENT_PROFILES)[number];

export const EVENT_CAPABILITIES = [
  "tickets", "promoters", "tables", "access", "pos", "inventory",
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
  nightlife: { tickets: true, promoters: true, tables: true, access: true, pos: true, inventory: false },
  concert: { tickets: true, promoters: true, tables: false, access: true, pos: true, inventory: false },
  festival: { tickets: true, promoters: false, tables: false, access: true, pos: true, inventory: false },
  conference: { tickets: true, promoters: false, tables: false, access: true, pos: false, inventory: false },
  sports: { tickets: true, promoters: false, tables: false, access: true, pos: true, inventory: false },
  expo: { tickets: true, promoters: false, tables: false, access: true, pos: true, inventory: false },
  private_event: { tickets: true, promoters: false, tables: false, access: true, pos: false, inventory: false },
  other: { tickets: true, promoters: false, tables: false, access: true, pos: false, inventory: false },
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
  access_enabled: boolean;
  pos_enabled: boolean;
  inventory_enabled: boolean;
}): EventCapabilities {
  return {
    tickets: event.tickets_enabled,
    promoters: event.promoters_enabled,
    tables: event.tables_enabled,
    access: event.access_enabled,
    pos: event.pos_enabled,
    inventory: event.inventory_enabled,
  };
}

export function changeEventProfile<T extends { profile: EventProfile }>(event: T, profile: EventProfile): T {
  return { ...event, profile };
}
