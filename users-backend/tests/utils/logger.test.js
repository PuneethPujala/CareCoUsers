const { AsyncLocalStorage } = require("async_hooks");

// Mock bullmq so we can spy on Queue and Worker constructors and intercept methods cleanly.
jest.mock("bullmq", () => {
  const mockAdd = jest.fn().mockResolvedValue({ id: "mock-job-id" });
  class MockQueue {
    constructor(name, opts) {
      this.name = name;
      this.opts = opts;
    }
  }
  // Make sure Queue.prototype.add is a Jest mock function from the start
  MockQueue.prototype.add = mockAdd;

  return {
    Queue: MockQueue,
    Worker: class MockWorker {
      constructor(name, processor, opts) {
        this.name = name;
        this.processor = processor;
        this.opts = opts;
        MockWorker.lastInstance = this;
      }
    },
  };
});

const { Queue } = require("bullmq");
const {
  correlationIdMiddleware,
  getCorrelationId,
  getUserId,
  getLogContext,
  setLogContextUser,
  correlationLocalStorage,
} = require("../../src/middleware/correlationId");
const logger = require("../../src/utils/logger");

describe("Structured Logger & Context Propagation Tests", () => {
  let stdoutWriteSpy;
  let stderrWriteSpy;
  let stdoutLogs = [];
  let stderrLogs = [];

  beforeEach(() => {
    stdoutLogs = [];
    stderrLogs = [];

    // Spy on process.stdout.write and process.stderr.write
    stdoutWriteSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((str) => {
        stdoutLogs.push(str);
        return true;
      });

    stderrWriteSpy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation((str) => {
        stderrLogs.push(str);
        return true;
      });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe("Logger Output & Stream Routing", () => {
    it("should write info and debug logs to stdout", () => {
      logger.info("Test info message", { metaField: "infoValue" });
      logger.debug("Test debug message");

      expect(stdoutLogs.length).toBe(2);
      expect(stderrLogs.length).toBe(0);

      const parsedLog = JSON.parse(stdoutLogs[0].trim());
      expect(parsedLog.level).toBe("info");
      expect(parsedLog.message).toBe("Test info message");
      expect(parsedLog.metaField).toBe("infoValue");
      expect(parsedLog.timestamp).toBeDefined();
    });

    it("should write warn and error logs to stderr", () => {
      logger.warn("Test warn message");
      logger.error("Test error message", { error: new Error("Boom") });

      expect(stderrLogs.length).toBe(2);
      expect(stdoutLogs.length).toBe(0);

      const parsedWarn = JSON.parse(stderrLogs[0].trim());
      expect(parsedWarn.level).toBe("warn");
      expect(parsedWarn.message).toBe("Test warn message");

      const parsedError = JSON.parse(stderrLogs[1].trim());
      expect(parsedError.level).toBe("error");
      expect(parsedError.message).toBe("Test error message");
      expect(parsedError.error.message).toBe("Boom");
      expect(parsedError.error.stack).toBeDefined();
    });
  });

  describe("Middleware & Context Binding", () => {
    it("should bind correlationId and userId to logs when run within middleware context", (done) => {
      const req = { headers: { "x-correlation-id": "custom-req-123" } };
      const res = { setHeader: jest.fn() };
      const next = () => {
        expect(getCorrelationId()).toBe("custom-req-123");

        // Authenticate user in middle of request
        setLogContextUser("user-abc", "Profile");
        expect(getUserId()).toBe("user-abc");

        logger.info("Inside request");

        expect(stdoutLogs.length).toBe(1);
        const log = JSON.parse(stdoutLogs[0].trim());
        expect(log.correlationId).toBe("custom-req-123");
        expect(log.userId).toBe("user-abc");
        expect(log.userType).toBe("Profile");
        done();
      };

      correlationIdMiddleware(req, res, next);
    });

    it("should generate a random UUID if no correlation ID header is provided", (done) => {
      const req = { headers: {} };
      const res = { setHeader: jest.fn() };
      const next = () => {
        const cid = getCorrelationId();
        expect(cid).toBeDefined();
        expect(cid.length).toBe(36); // UUID length
        done();
      };

      correlationIdMiddleware(req, res, next);
    });
  });

  describe("Concurrency & Context Isolation", () => {
    it("should isolate context between interleaved concurrent requests", async () => {
      // Simulate two requests starting concurrently and yielding control to the event loop
      // to ensure genuine event-loop level interleaving before setting user IDs.
      const runSimulatedRequest = async (reqId, userId, delayMs) => {
        return new Promise((resolve) => {
          const req = { headers: { "x-correlation-id": reqId } };
          const res = { setHeader: jest.fn() };

          correlationIdMiddleware(req, res, async () => {
            // Assert that initially userId is null
            expect(getUserId()).toBeNull();
            expect(getCorrelationId()).toBe(reqId);

            // Deliberately yield control to the event loop.
            // This forces the requests to interleave mid-flight before the userId is set.
            await new Promise((r) => setTimeout(r, delayMs));

            // Context should still be isolated and correct for this execution path
            expect(getCorrelationId()).toBe(reqId);

            // Set userId for this specific execution context
            setLogContextUser(userId, "Patient");

            // Yield control again
            await new Promise((r) => setTimeout(r, 10));

            // Log message
            logger.info(`Log for ${reqId}`);

            resolve();
          });
        });
      };

      // Fire both requests concurrently
      // Use IDs that pass validation (regex requires 8 to 36 chars)
      // Request A starts first, yields, Request B starts, yields, then they complete.
      await Promise.all([
        runSimulatedRequest("req-A-long-id", "user-A", 20),
        runSimulatedRequest("req-B-long-id", "user-B", 5),
      ]);

      expect(stdoutLogs.length).toBe(2);

      const parsedLogs = stdoutLogs.map((logStr) => JSON.parse(logStr.trim()));
      const logA = parsedLogs.find(
        (l) => l.message === "Log for req-A-long-id",
      );
      const logB = parsedLogs.find(
        (l) => l.message === "Log for req-B-long-id",
      );

      expect(logA).toBeDefined();
      expect(logA.correlationId).toBe("req-A-long-id");
      expect(logA.userId).toBe("user-A");

      expect(logB).toBeDefined();
      expect(logB.correlationId).toBe("req-B-long-id");
      expect(logB.userId).toBe("user-B");
    });
  });

  describe("BullMQ / Worker Context Propagation", () => {
    it("should pack log context into job metadata and restore it in the worker thread", async () => {
      // 1. Pack test
      // Capture a reference to the original mock function on prototype before requiring jobQueues
      const mockAdd = Queue.prototype.add;

      // Load jobQueues to apply interceptor to Queue.prototype.add
      const { medicationReminderQueue } = require("../../src/jobs/jobQueues");

      const req = {
        headers: { "x-correlation-id": "job-trigger-correlation-id" },
      };
      const res = { setHeader: jest.fn() };

      let capturedJobData = null;

      await new Promise((resolve) => {
        correlationIdMiddleware(req, res, () => {
          setLogContextUser("job-trigger-user-id", "Caretaker");

          // Spy on the original mock function to capture the intercepted data
          mockAdd.mockImplementationOnce(function (name, data, opts) {
            capturedJobData = data;
            resolve();
            return Promise.resolve({ id: "mock-job-id" });
          });

          medicationReminderQueue.add("test-job", { some: "data" });
        });
      });

      expect(capturedJobData).toBeDefined();
      expect(capturedJobData.metadata).toBeDefined();
      expect(capturedJobData.metadata.correlationId).toBe(
        "job-trigger-correlation-id",
      );
      expect(capturedJobData.metadata.userId).toBe("job-trigger-user-id");
      expect(capturedJobData.metadata.userType).toBe("Caretaker");

      // 2. Restore test in Worker process
      // Load the worker module. Since bullmq is mocked, the custom Worker class
      // extends our MockWorker.
      const { Worker: CustomWorker } = require("../../worker");
      const { Worker: MockWorker } = require("bullmq");

      let processorContext = null;
      const mockProcessor = jest.fn().mockImplementation((job) => {
        // Capture context during worker execution
        processorContext = {
          correlationId: getCorrelationId(),
          userId: getUserId(),
        };
        logger.info("Log inside worker processor");
        return Promise.resolve("done");
      });

      // Instantiate CustomWorker. It will call super(name, wrappedProcessor, opts)
      // which sets MockWorker.lastInstance.
      new CustomWorker("test-queue", mockProcessor, { connection: {} });

      const lastWorkerInstance = MockWorker.lastInstance;
      expect(lastWorkerInstance).toBeDefined();
      expect(lastWorkerInstance.processor).toBeDefined();

      // Invoke the wrapped processor with the mock job containing metadata
      const mockJob = {
        id: "job-123",
        data: {
          some: "data",
          metadata: {
            correlationId: "job-trigger-correlation-id",
            userId: "job-trigger-user-id",
            userType: "Caretaker",
          },
        },
      };

      await lastWorkerInstance.processor(mockJob);

      // Verify context was correctly restored inside the worker thread
      expect(processorContext).toBeDefined();
      expect(processorContext.correlationId).toBe("job-trigger-correlation-id");
      expect(processorContext.userId).toBe("job-trigger-user-id");

      // Verify that logger output inside worker also carried the context
      expect(stdoutLogs.length).toBeGreaterThan(0);
      const workerLog = JSON.parse(stdoutLogs[stdoutLogs.length - 1].trim());
      expect(workerLog.message).toBe("Log inside worker processor");
      expect(workerLog.correlationId).toBe("job-trigger-correlation-id");
      expect(workerLog.userId).toBe("job-trigger-user-id");
    });
  });
});
