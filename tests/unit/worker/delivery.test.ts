import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB dependencies before importing the module under test
vi.mock('../../../src/db/queries/deliveries', () => ({
  dbGetPendingDeliveries: vi.fn(),
  dbMarkDeliverySuccess: vi.fn(),
  dbMarkDeliveryRetryOrFail: vi.fn(),
}));
vi.mock('../../../src/db/queries/jobs', () => ({
  dbGetJobById: vi.fn(),
}));

import {
  dbGetPendingDeliveries,
  dbMarkDeliveryRetryOrFail,
  dbMarkDeliverySuccess,
} from '../../../src/db/queries/deliveries';
import { dbGetJobById } from '../../../src/db/queries/jobs';
import { processDeliveries } from '../../../src/worker/delivery';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockDelivery = {
  id: 'delivery-uuid-1',
  jobId: 'job-uuid-1',
  subscriberUrl: 'https://subscriber.example.com/hook',
  status: 'pending',
  attemptCount: 0,
  nextRetryAt: null,
  responseStatus: null,
  responseBody: null,
  error: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockJob = {
  id: 'job-uuid-1',
  pipelineId: 'pipeline-uuid-1',
  status: 'completed',
  payload: { user: { id: 1 } },
  result: { userId: 1 },
  error: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  completedAt: new Date('2026-01-01T00:00:01Z'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function stubFetch(status: number, body: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status,
    text: () => Promise.resolve(body),
  }));
}

function stubFetchError(message: string) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processDeliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when there are no pending deliveries', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([]);

    await processDeliveries();

    expect(dbGetJobById).not.toHaveBeenCalled();
    expect(dbMarkDeliverySuccess).not.toHaveBeenCalled();
    expect(dbMarkDeliveryRetryOrFail).not.toHaveBeenCalled();
  });

  it('marks delivery as success on a 2xx response', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetch(200, 'OK');

    await processDeliveries();

    expect(dbMarkDeliverySuccess).toHaveBeenCalledWith('delivery-uuid-1', 200, 'OK');
    expect(dbMarkDeliveryRetryOrFail).not.toHaveBeenCalled();
  });

  it('marks delivery as success on a 201 response', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetch(201, 'Created');

    await processDeliveries();

    expect(dbMarkDeliverySuccess).toHaveBeenCalledWith('delivery-uuid-1', 201, 'Created');
  });

  it('schedules a retry on a 4xx response', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetch(400, 'Bad Request');

    await processDeliveries();

    expect(dbMarkDeliverySuccess).not.toHaveBeenCalled();
    expect(dbMarkDeliveryRetryOrFail).toHaveBeenCalledWith(
      'delivery-uuid-1',
      expect.stringContaining('400'),
      expect.any(Date), // nextRetryAt is a future Date (not null) since attempts < MAX
      400
    );
  });

  it('schedules a retry on a 5xx response', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetch(500, 'Internal Server Error');

    await processDeliveries();

    expect(dbMarkDeliverySuccess).not.toHaveBeenCalled();
    expect(dbMarkDeliveryRetryOrFail).toHaveBeenCalledWith(
      'delivery-uuid-1',
      expect.stringContaining('500'),
      expect.any(Date),
      500
    );
  });

  it('schedules a retry on a network error (fetch throws)', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetchError('ECONNREFUSED');

    await processDeliveries();

    expect(dbMarkDeliverySuccess).not.toHaveBeenCalled();
    expect(dbMarkDeliveryRetryOrFail).toHaveBeenCalledWith(
      'delivery-uuid-1',
      'ECONNREFUSED',
      expect.any(Date), // retry should be scheduled
      undefined         // no HTTP status on network error
    );
  });

  it('permanently fails delivery when max attempts is reached (no nextRetryAt)', async () => {
    // MAX_DELIVERY_ATTEMPTS = 3 (set in tests/setup.ts)
    // attemptCount = 2 → newCount = 3 → isLastAttempt = (3 >= 3) = true → nextRetryAt = null
    const exhaustedDelivery = { ...mockDelivery, attemptCount: 2 };

    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([exhaustedDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetch(503, 'Service Unavailable');

    await processDeliveries();

    expect(dbMarkDeliveryRetryOrFail).toHaveBeenCalledWith(
      'delivery-uuid-1',
      expect.stringContaining('503'),
      null, // nextRetryAt = null → permanently failed
      503
    );
  });

  it('still retries when attempt count is below max', async () => {
    // MAX_DELIVERY_ATTEMPTS = 3; attemptCount = 1 → newCount = 2 → not last attempt
    const partialDelivery = { ...mockDelivery, attemptCount: 1 };

    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([partialDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetch(502, 'Bad Gateway');

    await processDeliveries();

    expect(dbMarkDeliveryRetryOrFail).toHaveBeenCalledWith(
      'delivery-uuid-1',
      expect.stringContaining('502'),
      expect.any(Date), // nextRetryAt is set (not null)
      502
    );
  });

  it('skips delivery when job is not found in database', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(null);

    await processDeliveries();

    expect(dbMarkDeliverySuccess).not.toHaveBeenCalled();
    expect(dbMarkDeliveryRetryOrFail).not.toHaveBeenCalled();
  });

  it('skips delivery when job result is null', async () => {
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery] as any);
    vi.mocked(dbGetJobById).mockResolvedValue({ ...mockJob, result: null } as any);

    await processDeliveries();

    expect(dbMarkDeliverySuccess).not.toHaveBeenCalled();
    expect(dbMarkDeliveryRetryOrFail).not.toHaveBeenCalled();
  });

  it('processes multiple pending deliveries independently', async () => {
    const delivery2 = {
      ...mockDelivery,
      id: 'delivery-uuid-2',
      subscriberUrl: 'https://other-subscriber.example.com/hook',
    };
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery, delivery2] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);
    stubFetch(200, 'OK');

    await processDeliveries();

    expect(dbMarkDeliverySuccess).toHaveBeenCalledTimes(2);
    expect(dbMarkDeliverySuccess).toHaveBeenCalledWith('delivery-uuid-1', 200, 'OK');
    expect(dbMarkDeliverySuccess).toHaveBeenCalledWith('delivery-uuid-2', 200, 'OK');
  });

  it('continues processing remaining deliveries when one fails', async () => {
    const delivery2 = {
      ...mockDelivery,
      id: 'delivery-uuid-2',
      subscriberUrl: 'https://other-subscriber.example.com/hook',
    };
    vi.mocked(dbGetPendingDeliveries).mockResolvedValue([mockDelivery, delivery2] as any);
    vi.mocked(dbGetJobById).mockResolvedValue(mockJob as any);

    // First call fails with network error, second succeeds
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('OK') })
    );

    await processDeliveries();

    expect(dbMarkDeliveryRetryOrFail).toHaveBeenCalledWith(
      'delivery-uuid-1', 'ETIMEDOUT', expect.any(Date), undefined
    );
    expect(dbMarkDeliverySuccess).toHaveBeenCalledWith('delivery-uuid-2', 200, 'OK');
  });
});