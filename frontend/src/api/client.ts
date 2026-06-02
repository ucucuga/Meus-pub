import type {
  AuthTelegramResponse,
  CreateDisputeRequest,
  CreateEscrowRequest,
  Dispute,
  Escrow,
  EscrowListResponse,
  EscrowStatus,
  SubmitEvidenceRequest,
  User,
  UserSearchResponse,
} from '../types/api';

const BASE_URL = import.meta.env.VITE_API_URL || '';
const isViteDevMode = import.meta.env.VITE_DEV_MODE === 'true';

let authToken: string | null = null;

export const setAuthToken = (token: string): void => {
  authToken = token;
};

export const getAuthToken = (): string | null => authToken;

export const clearAuthToken = (): void => {
  authToken = null;
  sessionStorage.removeItem('meus_jwt');
};

interface ErrorBody {
  message?: string;
  error?: string;
}

interface CreateEscrowBodyPayload {
  title?: string;
  projectName?: string;
  description?: string;
  amount?: string;
  deadline?: string | number;
}

const DEV_EMPLOYER_WALLET = 'EQDevMockWallet123';
const DEV_FREELANCER_WALLET = 'EQFreelancerMock456';

const MOCK_DESCRIPTION =
  'Design a system architecture for a microservices platform with authentication, API gateway, and database layer.';

function createDevMockEscrows(): Escrow[] {
  const now = new Date().toISOString();
  const reviewDeadline = new Date(Date.now() + 86400000 * 2).toISOString();

  return [
    {
      id: 'mock-1',
      title: 'Contract #1',
      description: MOCK_DESCRIPTION,
      status: 'INIT',
      amount: '50000000000',
      deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
      employerWallet: DEV_EMPLOYER_WALLET,
      freelancerWallet: DEV_FREELANCER_WALLET,
      employerId: 'dev-1',
      freelancerAccepted: false,
      commissionRate: 300,
      commissionAmount: '1500000000',
      createdAt: now,
      updatedAt: now,
      employer: {
        id: 'dev-employer',
        username: 'customer_dev',
        firstName: 'Customer',
        walletAddress: DEV_EMPLOYER_WALLET,
      },
      freelancer: {
        id: 'dev-freelancer',
        username: 'performer_dev',
        firstName: 'Performer',
        walletAddress: DEV_FREELANCER_WALLET,
      },
    },
    {
      id: 'mock-2',
      title: 'Contract #2',
      description: MOCK_DESCRIPTION,
      status: 'FUNDED',
      amount: '200000000000',
      deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
      employerWallet: DEV_EMPLOYER_WALLET,
      freelancerWallet: DEV_FREELANCER_WALLET,
      employerId: 'dev-1',
      freelancerAccepted: false,
      commissionRate: 200,
      commissionAmount: '4000000000',
      createdAt: now,
      updatedAt: now,
      employer: {
        id: 'dev-employer',
        username: 'customer_dev',
        firstName: 'Customer',
        walletAddress: DEV_EMPLOYER_WALLET,
      },
      freelancer: {
        id: 'dev-freelancer',
        username: 'performer_dev',
        firstName: 'Performer',
        walletAddress: DEV_FREELANCER_WALLET,
      },
    },
    {
      id: 'mock-3',
      title: 'Contract #3',
      description: MOCK_DESCRIPTION,
      status: 'SUBMITTED',
      amount: '300000000000',
      deadline: new Date(Date.now() + 86400000).toISOString(),
      reviewDeadline,
      employerWallet: DEV_EMPLOYER_WALLET,
      freelancerWallet: DEV_FREELANCER_WALLET,
      employerId: 'dev-1',
      freelancerAccepted: false,
      commissionRate: 200,
      commissionAmount: '6000000000',
      createdAt: now,
      updatedAt: now,
      employer: {
        id: 'dev-employer',
        username: 'customer_dev',
        firstName: 'Customer',
        walletAddress: DEV_EMPLOYER_WALLET,
      },
      freelancer: {
        id: 'dev-freelancer',
        username: 'performer_dev',
        firstName: 'Performer',
        walletAddress: DEV_FREELANCER_WALLET,
      },
    },
    {
      id: 'mock-4',
      title: 'Contract #4',
      description: MOCK_DESCRIPTION,
      status: 'DISPUTE',
      amount: '400000000000',
      deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
      reviewDeadline: new Date(Date.now() + 86400000 * 28).toISOString(),
      employerWallet: DEV_EMPLOYER_WALLET,
      freelancerWallet: DEV_FREELANCER_WALLET,
      employerId: 'dev-1',
      freelancerAccepted: false,
      commissionRate: 100,
      commissionAmount: '4000000000',
      createdAt: now,
      updatedAt: now,
      employer: {
        id: 'dev-employer',
        username: 'customer_dev',
        firstName: 'Customer',
        walletAddress: DEV_EMPLOYER_WALLET,
      },
      freelancer: {
        id: 'dev-freelancer',
        username: 'performer_dev',
        firstName: 'Performer',
        walletAddress: DEV_FREELANCER_WALLET,
      },
    },
    {
      id: 'mock-5',
      title: 'Contract #5',
      description: MOCK_DESCRIPTION,
      status: 'COMPLETED',
      amount: '600000000000',
      deadline: new Date(Date.now() - 86400000).toISOString(),
      employerWallet: DEV_EMPLOYER_WALLET,
      freelancerWallet: DEV_FREELANCER_WALLET,
      employerId: 'dev-1',
      freelancerAccepted: false,
      commissionRate: 100,
      commissionAmount: '6000000000',
      createdAt: now,
      updatedAt: now,
      employer: {
        id: 'dev-employer',
        username: 'customer_dev',
        firstName: 'Customer',
        walletAddress: DEV_EMPLOYER_WALLET,
      },
      freelancer: {
        id: 'dev-freelancer',
        username: 'performer_dev',
        firstName: 'Performer',
        walletAddress: DEV_FREELANCER_WALLET,
      },
    },
  ];
}

let devMockEscrows: Escrow[] = createDevMockEscrows();

function findDevMockEscrow(id: string): Escrow | undefined {
  return devMockEscrows.find((e) => e.id === id);
}

function updateDevMockEscrow(id: string, status: EscrowStatus): Escrow {
  const existing = findDevMockEscrow(id);
  const base = existing ?? { ...devMockEscrows[0]!, id };
  const reviewDeadline =
    status === 'SUBMITTED' || status === 'DISPUTE'
      ? base.reviewDeadline ?? new Date(Date.now() + 86400000 * 2).toISOString()
      : base.reviewDeadline;
  const updated: Escrow = {
    ...base,
    id,
    status,
    reviewDeadline,
    updatedAt: new Date().toISOString(),
  };

  const index = devMockEscrows.findIndex((e) => e.id === id);
  if (index >= 0) {
    devMockEscrows[index] = updated;
  } else {
    devMockEscrows.push(updated);
  }

  return updated;
}

function parseCreateBody(options?: RequestInit): CreateEscrowBodyPayload {
  if (!options?.body || typeof options.body !== 'string') {
    return {};
  }
  try {
    return JSON.parse(options.body) as CreateEscrowBodyPayload;
  } catch {
    return {};
  }
}

function handleDevMock<T>(path: string, options?: RequestInit): Promise<T> | null {
  const method = (options?.method ?? 'GET').toUpperCase();
  const pathWithoutQuery = path.split('?')[0] ?? path;

  if (method === 'POST' && pathWithoutQuery === '/api/v1/auth/telegram') {
    const response: AuthTelegramResponse = {
      token: 'dev-token',
      user: {
        id: 'dev-1',
        telegramId: '123456789',
        username: 'devuser',
        firstName: 'Dev',
        lastName: 'User',
      },
    };
    return Promise.resolve(response as T);
  }

  if (method === 'POST' && pathWithoutQuery === '/api/v1/escrows') {
    const body = parseCreateBody(options);
    const now = new Date().toISOString();
    const escrow: Escrow = {
      id: `mock-escrow-${Date.now()}`,
      title: body.title ?? body.projectName ?? 'Mock Contract',
      description: body.description ?? '',
      status: 'INIT',
      amount: body.amount ?? '100000000000',
      deadline:
        typeof body.deadline === 'number'
          ? new Date(body.deadline * 1000).toISOString()
          : body.deadline
            ? new Date(body.deadline).toISOString()
            : new Date(Date.now() + 86400000 * 7).toISOString(),
      employerWallet: DEV_EMPLOYER_WALLET,
      freelancerWallet: DEV_FREELANCER_WALLET,
      employerId: 'dev-1',
      freelancerAccepted: false,
      commissionRate: 300,
      commissionAmount: '3000000000',
      createdAt: now,
      updatedAt: now,
    };
    devMockEscrows = [escrow, ...devMockEscrows];
    return Promise.resolve(escrow as T);
  }

  if (method === 'GET' && pathWithoutQuery === '/api/v1/escrows') {
    const queryString = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(queryString);
    const statusFilter = params.get('status');
    const filtered = statusFilter
      ? devMockEscrows.filter((e) => e.status === statusFilter)
      : devMockEscrows;
    const response: EscrowListResponse = {
      escrows: filtered,
      total: filtered.length,
    };
    return Promise.resolve(response as T);
  }

  const getByIdMatch = pathWithoutQuery.match(/^\/api\/v1\/escrows\/([^/]+)$/);
  if (method === 'GET' && getByIdMatch) {
    const id = getByIdMatch[1]!;
    const found = findDevMockEscrow(id);
    const escrow: Escrow = found ?? { ...devMockEscrows[0]!, id };
    return Promise.resolve(escrow as T);
  }

  const approveMatch = pathWithoutQuery.match(/^\/api\/v1\/escrows\/([^/]+)\/approve$/);
  if (method === 'POST' && approveMatch) {
    return Promise.resolve(updateDevMockEscrow(approveMatch[1]!, 'COMPLETED') as T);
  }

  const cancelMatch = pathWithoutQuery.match(/^\/api\/v1\/escrows\/([^/]+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    return Promise.resolve(updateDevMockEscrow(cancelMatch[1]!, 'CANCELLED') as T);
  }

  const submitMatch = pathWithoutQuery.match(/^\/api\/v1\/escrows\/([^/]+)\/submit$/);
  if (method === 'POST' && submitMatch) {
    return Promise.resolve(updateDevMockEscrow(submitMatch[1]!, 'SUBMITTED') as T);
  }

  if (method === 'POST' && pathWithoutQuery === '/api/v1/disputes') {
    const body = parseCreateBody(options) as { escrowId?: string; reason?: string };
    const dispute: Dispute = {
      id: `mock-dispute-${Date.now()}`,
      escrowId: body.escrowId ?? 'unknown',
      reason: body.reason ?? '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    if (body.escrowId) {
      updateDevMockEscrow(body.escrowId, 'DISPUTE');
    }
    return Promise.resolve(dispute as T);
  }

  const deployMatch = pathWithoutQuery.match(/^\/api\/v1\/escrows\/([^/]+)\/deploy$/);
  if (method === 'POST' && deployMatch) {
    return Promise.resolve(updateDevMockEscrow(deployMatch[1]!, 'FUNDED') as T);
  }

  return null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (isViteDevMode) {
    const devResult = handleDevMock<T>(path, options);
    if (devResult !== null) {
      return devResult;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = authToken || sessionStorage.getItem('meus_jwt');

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as ErrorBody;
      message = body.message ?? body.error ?? message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  auth: {
    telegram: (initData: string) =>
      request<AuthTelegramResponse>('/api/v1/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      }),
    connectWallet: (walletAddress: string) =>
      request<User>('/api/v1/auth/connect-wallet', {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }),
  },
  escrows: {
    list: async (params?: { status?: string; role?: string }): Promise<Escrow[]> => {
      const query = params
        ? `?${new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
          ).toString()}`
        : '';
      const result = await request<EscrowListResponse>(`/api/v1/escrows${query}`);
      return result.escrows;
    },
    get: (id: string) => request<Escrow>(`/api/v1/escrows/${id}`),
    create: (data: CreateEscrowRequest) =>
      request<Escrow>('/api/v1/escrows', {
        method: 'POST',
        body: JSON.stringify({
          projectName: data.title,
          description: data.description,
          amount: data.amount,
          deadline: Math.floor(new Date(data.deadline).getTime() / 1000),
          freelancerWallet: data.freelancerWallet,
          role: data.role,
          ...(data.employerWallet ? { employerWallet: data.employerWallet } : {}),
        }),
      }),
    accept: (id: string) =>
      request<Escrow>(`/api/v1/escrows/${id}/accept`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    decline: (id: string) =>
      request<Escrow>(`/api/v1/escrows/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    submitWork: (id: string, workHash = 'completed') =>
      request<Escrow>(`/api/v1/escrows/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ workHash }),
      }),
    approve: (id: string) =>
      request<Escrow>(`/api/v1/escrows/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    dispute: (id: string) =>
      request<Escrow>(`/api/v1/escrows/${id}/dispute`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },
  users: {
    me: () => request<User>('/api/v1/users/me'),
    search: async (query: string) => {
      const result = await request<UserSearchResponse>(
        `/api/v1/users/search?username=${encodeURIComponent(query)}`,
      );
      return result.users;
    },
  },
  disputes: {
    create: (data: CreateDisputeRequest) =>
      request<Dispute>('/api/v1/disputes', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    submitEvidence: (data: SubmitEvidenceRequest) =>
      request<Dispute>('/api/v1/disputes/evidence', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
};
