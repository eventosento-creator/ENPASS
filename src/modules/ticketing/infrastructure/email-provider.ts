export type TicketEmailItem = {
  holderName: string;
  document: string | null;
  ticketTypeName: string;
  shortCode: string;
  qrPng: Buffer;
};

export type TicketEmail = {
  to: string;
  eventName: string;
  eventDateLabel: string;
  eventTimeLabel: string;
  venueName: string;
  venueAddress: string;
  accessUrl: string;
  tickets: TicketEmailItem[];
};

export type BuyerAccessEmail = {
  to: string;
  accessUrl: string;
};

export type PromoterInviteEmail = {
  to: string;
  promoterName: string;
  eventName: string;
  accessUrl: string;
};

export type CollaboratorInviteEmail = {
  to: string;
  eventName: string;
  inviterName: string;
  acceptUrl: string;
};

export type EventReminderEmail = {
  to: string;
  eventName: string;
  eventDateLabel: string;
  eventTimeLabel: string;
  venueName: string;
  venueAddress: string;
  accessUrl: string;
};

export type EventChangeEmail = {
  to: string;
  eventName: string;
  eventDateLabel: string;
  eventTimeLabel: string;
  venueName: string;
  venueAddress: string;
  changedFields: string[];
  accessUrl: string;
};

export type ArrepentimientoVerificationEmail = {
  to: string;
  confirmUrl: string;
};

export type ArrepentimientoReceivedEmail = {
  to: string;
  managementCode: string;
  eligible: boolean;
  reason?: string | null;
};

export interface EmailProvider {
  sendTicketDelivery(message: TicketEmail): Promise<void>;
  sendBuyerAccess(message: BuyerAccessEmail): Promise<void>;
  sendPromoterInvite(message: PromoterInviteEmail): Promise<void>;
  sendCollaboratorInvite(message: CollaboratorInviteEmail): Promise<void>;
  sendEventReminder(message: EventReminderEmail): Promise<void>;
  sendEventChangeNotice(message: EventChangeEmail): Promise<void>;
  sendArrepentimientoVerification(message: ArrepentimientoVerificationEmail): Promise<void>;
  sendArrepentimientoReceived(message: ArrepentimientoReceivedEmail): Promise<void>;
}
