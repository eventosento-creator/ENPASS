import type { DueStatus } from "@/shared/database/types";

export type MembershipStatus = "active" | "suspended" | "cancelled";

export type MemberRow = {
  membershipId: string;
  customerId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  document: string | null;
  categoryName: string;
  membershipStatus: MembershipStatus;
  dueStatus: DueStatus | null;
  dueAmount: number | null;
  dueDate: string | null;
};

export type MembershipDetail = {
  membershipId: string;
  organizationId: string;
  customerId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  document: string | null;
  categoryId: string;
  categoryName: string;
  membershipStatus: MembershipStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  startsAt: string;
  notes: string;
};

export type MembershipDue = {
  dueId: string;
  period: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  paidAmount: number | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  status: DueStatus;
};

export type CustomerCandidate = {
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  document: string | null;
  alreadyMember: boolean;
};

export type DivisionRow = { divisionId: string; name: string; monthlyFeeAmount: number; active: boolean; enrolledCount: number };

export type MembershipDivisionRow = {
  enrollmentId: string;
  divisionId: string;
  divisionName: string;
  monthlyFeeAmount: number;
  dueStatus: DueStatus | null;
  dueAmount: number | null;
  dueDate: string | null;
};

export type DivisionEnrollmentRow = {
  enrollmentId: string;
  membershipId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  dueStatus: DueStatus | null;
  dueAmount: number | null;
  dueDate: string | null;
};

export const membershipStatusLabels: Record<MembershipStatus, string> = {
  active: "Activo",
  suspended: "Suspendido",
  cancelled: "Baja",
};

export const dueStatusLabels: Record<DueStatus, string> = {
  paid: "Al día",
  pending: "Pendiente",
  overdue: "Con deuda",
};
