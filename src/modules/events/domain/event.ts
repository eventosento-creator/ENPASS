import { z } from "zod";
import { EVENT_PROFILES } from "./event-profile";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

export const eventInputSchema = z.object({
  organizationId: z.uuid(), venueId: z.uuid(), name: z.string().trim().min(2).max(140),
  profile: z.enum(EVENT_PROFILES),
  description: z.string().trim().max(4000).default(""), startsAt: z.iso.datetime({ local: true }),
  capacity: z.preprocess(value => value === "" || value === undefined ? undefined : value, z.coerce.number().int().positive().max(100000).optional()),
  requireDocument: z.coerce.boolean().default(false),
  ticketsEnabled: booleanString,
  promotersEnabled: booleanString,
  tablesEnabled: booleanString,
  accessEnabled: booleanString,
});

export const eventConfigurationSchema = z.object({
  eventId: z.uuid(),
  profile: z.enum(EVENT_PROFILES),
  ticketsEnabled: booleanString,
  promotersEnabled: booleanString,
  tablesEnabled: booleanString,
  accessEnabled: booleanString,
});

export const eventUpdateSchema = z.object({
  eventId: z.uuid(),
  venueId: z.uuid(),
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(4000).default(""),
  startsAt: z.iso.datetime({ local: true }),
  doorsOpenAt: z.preprocess(value => value === "" || value === undefined ? undefined : value, z.iso.datetime({ local: true }).optional()),
  endsAt: z.preprocess(value => value === "" || value === undefined ? undefined : value, z.iso.datetime({ local: true }).optional()),
  capacity: z.coerce.number().int().positive().max(100000),
  requireDocument: z.coerce.boolean().default(false),
});

export const ticketTypeInputSchema = z.object({
  eventId: z.uuid(), organizationId: z.uuid(), name: z.string().trim().min(1).max(100),
  phaseName: z.string().trim().min(1).max(100),
  pricePesos: z.coerce.number().nonnegative().multipleOf(1), quantity: z.coerce.number().int().positive(),
  maxPerOrder: z.coerce.number().int().min(1).max(20),
});

export const ticketTypeUpdateSchema = ticketTypeInputSchema.omit({ phaseName: true }).extend({
  ticketTypeId: z.uuid(),
});

export function pesosToMinorUnits(value: number) { return Math.round(value * 100); }
