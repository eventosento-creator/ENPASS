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

export interface EmailProvider {
  sendTicketDelivery(message: TicketEmail): Promise<void>;
  sendBuyerAccess(message: BuyerAccessEmail): Promise<void>;
  sendPromoterInvite(message: PromoterInviteEmail): Promise<void>;
}
