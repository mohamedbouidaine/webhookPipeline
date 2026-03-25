import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all external dependencies before importing the module under test
vi.mock('../../../src/actions', () => ({
  executeAction: vi.fn(),
}));
vi.mock('../../../src/db/queries/deliveries', () => ({
  dbCreateDeliveryAttempts: vi.fn(),
}));
vi.mock('../../../src/db/queries/jobs', () => ({
  dbMarkJobCompleted: vi.fn(),
  dbMarkJobFailed: vi.fn(),
}));
vi.mock('../../../src/db/queries/pipelines', () => ({
  dbGetPipelineById: vi.fn(),
  dbGetSubscribersByPipelineId: vi.fn(),
}));

import { executeAction } from '../../../src/actions';
import { dbCreateDeliveryAttempts } from '../../../src/db/queries/deliveries';
import { dbMarkJobCompleted, dbMarkJobFailed } from '../../../src/db/queries/jobs';
import {
  dbGetPipelineById,
  dbGetSubscribersByPipelineId,
} from '../../../src/db/queries/pipelines';
import type { ClaimedJob } from '../../../src/queue/dequeue';
import { processJob } from '../../../src/worker/processor';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockJob: ClaimedJob = {
  id: 'job-uuid-1',
  pipeline_id: 'pipeline-uuid-1',
  payload: { user: { id: 42, email: 'alice@example.com' } },
  created_at: new Date('2026-01-01T00:00:00Z'),
};

const mockPipeline = {
  id: 'pipeline-uuid-1',
  name: 'Test Pipeline',
  sourceToken: 'source-token-uuid',
  actionType: 'json_transform',
  actionConfig: { userId: 'user.id', userEmail: 'user.email' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockSubscribers = [
  {
    id: 'sub-uuid-1',
    pipelineId: 'pipeline-uuid-1',
    url: 'https://subscriber-a.example.com/hook',
    createdAt: new Date(),
  },
  {
    id: 'sub-uuid-2',
    pipelineId: 'pipeline-uuid-1',
    url: 'https://subscriber-b.example.com/hook',
    createdAt: new Date(),
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks job failed when pipeline is not found', async () => {
    vi.mocked(dbGetPipelineById).mockResolvedValue(null);

    await processJob(mockJob);

    expect(dbMarkJobFailed).toHaveBeenCalledWith(
      mockJob.id,
      expect.stringContaining(mockJob.pipeline_id)
    );
    expect(dbMarkJobCompleted).not.toHaveBeenCalled();
    expect(dbCreateDeliveryAttempts).not.toHaveBeenCalled();
  });

  it('marks job failed when action throws an error', async () => {
    vi.mocked(dbGetPipelineById).mockResolvedValue(mockPipeline);
    vi.mocked(executeAction).mockImplementation(() => {
      throw new Error('Action execution failed');
    });

    await processJob(mockJob);

    expect(dbMarkJobFailed).toHaveBeenCalledWith(mockJob.id, 'Action execution failed');
    expect(dbMarkJobCompleted).not.toHaveBeenCalled();
    expect(dbCreateDeliveryAttempts).not.toHaveBeenCalled();
  });

  it('marks job failed with non-Error thrown value', async () => {
    vi.mocked(dbGetPipelineById).mockResolvedValue(mockPipeline);
    vi.mocked(executeAction).mockImplementation(() => {
      throw 'string error';
    });

    await processJob(mockJob);

    expect(dbMarkJobFailed).toHaveBeenCalledWith(mockJob.id, 'string error');
  });

  it('calls executeAction with the correct pipeline action type, payload, and config', async () => {
    const result = { userId: 42, userEmail: 'alice@example.com' };
    vi.mocked(dbGetPipelineById).mockResolvedValue(mockPipeline);
    vi.mocked(executeAction).mockReturnValue(result);
    vi.mocked(dbMarkJobCompleted).mockResolvedValue({ ...mockJob, status: 'completed', result } as any);
    vi.mocked(dbGetSubscribersByPipelineId).mockResolvedValue([]);

    await processJob(mockJob);

    expect(executeAction).toHaveBeenCalledWith(
      mockPipeline.actionType,
      mockJob.payload,
      mockPipeline.actionConfig
    );
  });

  it('marks job completed and creates delivery attempts for all subscribers', async () => {
    const result = { userId: 42, userEmail: 'alice@example.com' };
    vi.mocked(dbGetPipelineById).mockResolvedValue(mockPipeline);
    vi.mocked(executeAction).mockReturnValue(result);
    vi.mocked(dbMarkJobCompleted).mockResolvedValue({ ...mockJob, status: 'completed', result } as any);
    vi.mocked(dbGetSubscribersByPipelineId).mockResolvedValue(mockSubscribers);
    vi.mocked(dbCreateDeliveryAttempts).mockResolvedValue([]);

    await processJob(mockJob);

    expect(dbMarkJobCompleted).toHaveBeenCalledWith(mockJob.id, result);
    expect(dbCreateDeliveryAttempts).toHaveBeenCalledWith(mockJob.id, [
      'https://subscriber-a.example.com/hook',
      'https://subscriber-b.example.com/hook',
    ]);
  });

  it('marks job completed but skips delivery when result is filtered', async () => {
    const filteredResult = {
      filtered: true,
      reason: 'Field "event" did not satisfy operator "eq"',
    };
    vi.mocked(dbGetPipelineById).mockResolvedValue(mockPipeline);
    vi.mocked(executeAction).mockReturnValue(filteredResult);
    vi.mocked(dbMarkJobCompleted).mockResolvedValue({
      ...mockJob,
      status: 'completed',
      result: filteredResult,
    } as any);

    await processJob(mockJob);

    expect(dbMarkJobCompleted).toHaveBeenCalledWith(mockJob.id, filteredResult);
    // Filtered jobs must not trigger subscriber lookup or delivery creation
    expect(dbGetSubscribersByPipelineId).not.toHaveBeenCalled();
    expect(dbCreateDeliveryAttempts).not.toHaveBeenCalled();
  });

  it('marks job completed but skips delivery creation when pipeline has no subscribers', async () => {
    const result = { userId: 42 };
    vi.mocked(dbGetPipelineById).mockResolvedValue(mockPipeline);
    vi.mocked(executeAction).mockReturnValue(result);
    vi.mocked(dbMarkJobCompleted).mockResolvedValue({ ...mockJob, status: 'completed', result } as any);
    vi.mocked(dbGetSubscribersByPipelineId).mockResolvedValue([]);

    await processJob(mockJob);

    expect(dbMarkJobCompleted).toHaveBeenCalledWith(mockJob.id, result);
    expect(dbCreateDeliveryAttempts).not.toHaveBeenCalled();
  });

  it('marks job completed and creates a single delivery attempt for one subscriber', async () => {
    const result = { userId: 42 };
    vi.mocked(dbGetPipelineById).mockResolvedValue(mockPipeline);
    vi.mocked(executeAction).mockReturnValue(result);
    vi.mocked(dbMarkJobCompleted).mockResolvedValue({ ...mockJob, status: 'completed', result } as any);
    vi.mocked(dbGetSubscribersByPipelineId).mockResolvedValue([mockSubscribers[0]]);
    vi.mocked(dbCreateDeliveryAttempts).mockResolvedValue([]);

    await processJob(mockJob);

    expect(dbCreateDeliveryAttempts).toHaveBeenCalledWith(mockJob.id, [
      'https://subscriber-a.example.com/hook',
    ]);
  });
});