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

export type ClubStaffInviteEmail = {
  to: string;
  clubName: string;
  inviterName: string;
  acceptUrl: string;
  roleLabel?: string;
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

export type SaleNotificationEmail = {
  to: string;
  eventName: string;
  buyerName: string;
  itemsSummary: string;
  totalAmount: number;
  currency: string;
  dashboardUrl: string;
};

export type InvoiceEmail = {
  to: string;
  kind: "invoice" | "credit_note";
  description: string;
  amountLabel: string;
  documentNumber: string;
  cae: string;
  pdfUrl: string | null;
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

export type ClubBrand = {
  logoUrl?: string | null;
  name?: string | null;
  accentColor?: string | null;
};

export type MembershipWelcomeEmail = {
  to: string;
  memberFirstName: string;
  organizationName: string;
  memberNumber: string;
  categoryName: string;
  brand?: ClubBrand;
};

export type MemberPasswordEmail = {
  to: string;
  memberFirstName: string;
  organizationName: string;
  /** Link para crear o cambiar la contraseña del perfil de socio (vence en 2 horas). */
  setupUrl: string;
  brand?: ClubBrand;
};

export type MembershipDueEmail = {
  to: string;
  memberFirstName: string;
  organizationName: string;
  /** Ej. "Fútbol" para una cuota de división — si no se pasa, es la cuota de socio general. */
  concept?: string;
  periodLabel: string;
  amountLabel: string;
  dueDateLabel: string;
  payUrl: string | null;
  brand?: ClubBrand;
};

export type MembershipDuePaidEmail = {
  to: string;
  memberFirstName: string;
  organizationName: string;
  concept?: string;
  periodLabel: string;
  amountLabel: string;
  paymentMethodLabel: string;
  brand?: ClubBrand;
};

export interface EmailProvider {
  sendTicketDelivery(message: TicketEmail): Promise<void>;
  sendBuyerAccess(message: BuyerAccessEmail): Promise<void>;
  sendPromoterInvite(message: PromoterInviteEmail): Promise<void>;
  sendCollaboratorInvite(message: CollaboratorInviteEmail): Promise<void>;
  sendClubStaffInvite(message: ClubStaffInviteEmail): Promise<void>;
  sendEventReminder(message: EventReminderEmail): Promise<void>;
  sendEventChangeNotice(message: EventChangeEmail): Promise<void>;
  sendSaleNotification(message: SaleNotificationEmail): Promise<void>;
  sendInvoice(message: InvoiceEmail): Promise<void>;
  sendArrepentimientoVerification(message: ArrepentimientoVerificationEmail): Promise<void>;
  sendArrepentimientoReceived(message: ArrepentimientoReceivedEmail): Promise<void>;
  sendMembershipWelcome(message: MembershipWelcomeEmail): Promise<void>;
  sendMemberPassword(message: MemberPasswordEmail): Promise<void>;
  sendMembershipDue(message: MembershipDueEmail): Promise<void>;
  sendMembershipDuePaid(message: MembershipDuePaidEmail): Promise<void>;
}
