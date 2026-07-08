/**
 * Tests for Patient Health State V2 and Event-Driven Queue
 */

const mongoose = require('mongoose');

// Mock dependencies
jest.mock('../../src/models/Patient');
jest.mock('../../src/models/MedicineLog');
jest.mock('../../src/models/VitalLog');
jest.mock('../../src/models/Medication');
jest.mock('../../src/models/SleepLog');
jest.mock('../../src/models/PatientHealthStateHistory');
jest.mock('../../src/models/AchievementEvent');
jest.mock('../../src/services/companionAiService', () => ({
  enqueueCompanionInsights: jest.fn().mockResolvedValue(undefined),
  generateAndCacheInsights: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/jobs/jobQueues', () => ({
  healthStateQueue: {
    add: jest.fn(),
  },
  PRIORITY: { HIGH: 5, MEDIUM: 15, LOW: 25 },
}));

const Patient = require('../../src/models/Patient');
const MedicineLog = require('../../src/models/MedicineLog');
const VitalLog = require('../../src/models/VitalLog');
const Medication = require('../../src/models/Medication');
const SleepLog = require('../../src/models/SleepLog');
const PatientHealthStateHistory = require('../../src/models/PatientHealthStateHistory');
const { healthStateQueue } = require('../../src/jobs/jobQueues');

const {
  getCachedHealthState,
  enqueueHealthStateRecompute,
  recomputeAndCacheHealthState,
} = require('../../src/services/patientHealthStateService');

describe('Patient Health State V2 & Event-Driven Queue', () => {
  const patientId = new mongoose.Types.ObjectId();
  let mockPatient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPatient = {
      _id: patientId,
      timezone: 'Asia/Kolkata',
      unlockedAchievements: ['badge_1'],
      moodHistory: [],
      save: jest.fn().mockResolvedValue(true),
    };
    Medication.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
    SleepLog.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    PatientHealthStateHistory.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    PatientHealthStateHistory.findOneAndUpdate.mockResolvedValue({});
  });

  describe('enqueueHealthStateRecompute', () => {
    it('should successfully add job to healthStateQueue with correct parameters', async () => {
      healthStateQueue.add.mockResolvedValue({ id: 'job_1' });

      await enqueueHealthStateRecompute(patientId);

      expect(healthStateQueue.add).toHaveBeenCalledWith(
        'recompute',
        { patientId },
        {
          jobId: `health-state-${patientId}`,
          delay: 5000,
          priority: 5,
        }
      );
      // Verify it did NOT fall back to database query / synchronous recomputation
      expect(Patient.findById).not.toHaveBeenCalled();
    });

    it('should fall back to synchronous recompute if healthStateQueue.add throws an error', async () => {
      healthStateQueue.add.mockRejectedValue(
        new Error('Redis Connection Failure')
      );

      // Mock Patient.findById & other DB queries for the fallback recompute
      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockPatient),
      });
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.findOne.mockResolvedValue(null);
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await enqueueHealthStateRecompute(patientId);

      expect(healthStateQueue.add).toHaveBeenCalled();
      // Verify fallback was triggered
      expect(Patient.findById).toHaveBeenCalledWith(patientId);
    });

    it('should fall back to synchronous recompute if healthStateQueue is not initialized', async () => {
      // Temporarily mock jobQueues to return undefined for healthStateQueue
      const jobQueues = require('../../src/jobs/jobQueues');
      const originalQueue = jobQueues.healthStateQueue;
      delete jobQueues.healthStateQueue;

      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockPatient),
      });
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.findOne.mockResolvedValue(null);
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await enqueueHealthStateRecompute(patientId);

      expect(Patient.findById).toHaveBeenCalledWith(patientId);

      // Restore queue
      jobQueues.healthStateQueue = originalQueue;
    });

    it('should successfully add job to healthStateQueue with targetDate when options.targetDate is provided', async () => {
      healthStateQueue.add.mockResolvedValue({ id: 'job_1' });

      await enqueueHealthStateRecompute(patientId, {
        targetDate: '2026-06-24',
      });

      expect(healthStateQueue.add).toHaveBeenCalledWith(
        'recompute',
        { patientId, options: { targetDate: '2026-06-24' } },
        {
          jobId: `health-state-${patientId}-2026-06-24`,
          delay: 5000,
          priority: 5,
        }
      );
    });
  });

  describe('getCachedHealthState', () => {
    it('should return cached health state directly if it is fresh (< 30 minutes old)', async () => {
      const freshTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 mins ago
      mockPatient.patient_health_state = {
        score: 95,
        grade: 'A',
        computed_at: freshTime,
      };

      const state = await getCachedHealthState(mockPatient);

      expect(state).toEqual(mockPatient.patient_health_state);
      expect(Patient.findById).not.toHaveBeenCalled();
    });

    it('should trigger synchronous recompute if cached state is stale (>= 30 minutes old)', async () => {
      const staleTime = new Date(Date.now() - 35 * 60 * 1000).toISOString(); // 35 mins ago
      mockPatient.patient_health_state = {
        score: 95,
        grade: 'A',
        computed_at: staleTime,
      };

      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockPatient),
      });
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.findOne.mockResolvedValue(null);
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const state = await getCachedHealthState(mockPatient);

      expect(Patient.findById).toHaveBeenCalledWith(patientId);
      expect(state).not.toBeNull();
      expect(state.computed_at).toBeDefined();
      // Verify new computed_at timestamp is fresh
      const age = Date.now() - new Date(state.computed_at).getTime();
      expect(age).toBeLessThan(10000);
    });

    it('should trigger synchronous recompute if cached state does not exist', async () => {
      mockPatient.patient_health_state = null;

      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockPatient),
      });
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.findOne.mockResolvedValue(null);
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const state = await getCachedHealthState(mockPatient);

      expect(Patient.findById).toHaveBeenCalledWith(patientId);
      expect(state).not.toBeNull();
    });
  });

  describe('BullMQ Integration (Requires Redis)', () => {
    let connection;
    let isRedisAvailable = false;
    let testQueue;
    let testWorker;
    const testQueueName = 'integration-health-state-recompute-test';

    beforeAll(async () => {
      const Redis = require('ioredis');
      const { getRedisConnection } = require('../../src/jobs/redisConnection');
      const connectionOpts = getRedisConnection();

      // Set a strict connection timeout for checking Redis presence
      const client = new Redis({
        ...connectionOpts,
        connectTimeout: 1000,
        maxRetriesPerRequest: 0,
      });

      try {
        await client.ping();
        isRedisAvailable = true;
        connection = connectionOpts;
      } catch (err) {
        console.log(
          '⚠️ Local Redis is offline. Skipping BullMQ integration tests.'
        );
      } finally {
        await client.quit();
      }
    });

    beforeEach(async () => {
      if (!isRedisAvailable) return;
      const { Queue } = jest.requireActual('bullmq');
      testQueue = new Queue(testQueueName, { connection });
      // Clean up any stale keys
      await testQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      if (testQueue) {
        await testQueue.close();
      }
      if (testWorker) {
        await testWorker.close();
      }
    });

    it('should deduplicate multiple delayed jobs with the same jobId and allow re-enqueueing after completion', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping integration test: Redis not available');
        return;
      }

      const { Worker } = jest.requireActual('bullmq');
      const processedJobs = [];

      // Define worker
      testWorker = new Worker(
        testQueueName,
        async (job) => {
          processedJobs.push(job.data);
        },
        { connection }
      );

      const jobId = 'test-patient-id';

      // 1. Add job multiple times with delay (debounce phase)
      // Expectation: Only one job is created/run
      const job1 = await testQueue.add(
        'recompute',
        { patientId: 'p1' },
        { jobId, delay: 500, removeOnComplete: true, removeOnFail: true }
      );
      const job2 = await testQueue.add(
        'recompute',
        { patientId: 'p1' },
        { jobId, delay: 500, removeOnComplete: true, removeOnFail: true }
      );

      // BullMQ dedupes duplicate jobIds in the waiting/delayed states
      expect(job1.id).toBe(job2.id);

      // Wait for worker to process it
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(processedJobs).toHaveLength(1);
      expect(processedJobs[0]).toEqual({ patientId: 'p1' });

      // 2. Add the job again after it has completed
      // Expectation: Because removeOnComplete is true, the completed job is removed and we can add it again.
      const job3 = await testQueue.add(
        'recompute',
        { patientId: 'p1' },
        { jobId, delay: 10, removeOnComplete: true, removeOnFail: true }
      );
      expect(job3.id).toBe(jobId);

      // Wait for worker to process it
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(processedJobs).toHaveLength(2);
    });
  });
});
