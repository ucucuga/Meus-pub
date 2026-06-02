export interface User {
  id: string;
  telegramId: string | number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  walletAddress?: string | null;
  photoUrl?: string | null;
}

export type EscrowStatus =
  | 'DRAFT'
  | 'DEPLOYING'
  | 'INIT'
  | 'FUNDED'
  | 'SUBMITTED'
  | 'DISPUTE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface EscrowParty {
  id: string;
  username?: string | null;
  firstName?: string | null;
  walletAddress?: string | null;
}

export interface Escrow {
  id: string;
  title: string;
  description?: string | null;
  amount: string;
  deadline: string;
  status: EscrowStatus;
  contractAddress?: string | null;
  employerId: string;
  freelancerId?: string | null;
  freelancerAccepted: boolean;
  arbiterId?: string | null;
  employerWallet: string;
  employerUsername?: string | null;
  freelancerUsername?: string | null;
  freelancerWallet?: string | null;
  arbiterWallet?: string | null;
  workHash?: string | null;
  reviewDeadline?: string | null;
  commissionRate?: number;
  commissionAmount?: string;
  createdAt: string;
  updatedAt: string;
  employer?: EscrowParty | null;
  freelancer?: EscrowParty | null;
  arbiter?: EscrowParty | null;
  disputes?: Dispute[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}

export interface AuthTelegramResponse {
  token: string;
  user: User;
}

export interface EscrowListResponse {
  escrows: Escrow[];
  total: number;
}

export interface UserSearchResponse {
  users: User[];
  total: number;
}

export interface CreateEscrowRequest {
  title: string;
  description?: string;
  amount: string;
  deadline: string;
  freelancerWallet?: string;
  employerWallet?: string;
  freelancerTelegramId?: string;
  role: 'employer' | 'freelancer';
}

export interface EvidenceFilePayload {
  name: string;
  type: string;
  data: string;
  size: number;
}

export interface SubmitEvidenceRequest {
  escrowId: string;
  reason: string;
  files?: EvidenceFilePayload[];
}

export interface CreateDisputeRequest {
  escrowId: string;
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface Dispute {
  id: string;
  escrowId: string;
  reason: string;
  status: string;
  evidence?: Record<string, unknown> | null;
  createdAt: string;
}
