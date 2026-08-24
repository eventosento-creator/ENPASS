export type TicketEmail = {
  to: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  ticketCount: number;
  accessUrl: string;
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
