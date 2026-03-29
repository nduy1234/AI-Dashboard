import { Queue, Worker } from "bullmq";
import { processOutboundJobById } from "../services/outboundService";

const queueName = "outbound-jobs";
const redisUrl = process.env.REDIS_URL;

let queue: Queue<{ jobId: number }> | null = null;
let worker: Worker<{ jobId: number }> | null = null;

function canUseQueue(): boolean {
  return !!redisUrl;
}

function getQueue(): Queue<{ jobId: number }> | null {
  if (!canUseQueue()) return null;
  if (!queue) {
    queue = new Queue<{ jobId: number }>(queueName, {
      connection: { url: redisUrl! },
    });
  }
  return queue;
}

export async function enqueueOutboundJob(jobId: number): Promise<void> {
  const instance = getQueue();
  if (!instance) {
    // Fallback mode for environments without Redis.
    setTimeout(() => {
      void processOutboundJobById(jobId);
    }, 0);
    return;
  }

  try {
    await instance.add("process", { jobId }, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  } catch (_error) {
    // Queue infrastructure unavailable, keep API behavior functional.
    setTimeout(() => {
      void processOutboundJobById(jobId);
    }, 0);
  }
}

export function startOutboundWorker(): void {
  if (!canUseQueue() || worker) return;
  worker = new Worker<{ jobId: number }>(
    queueName,
    async (job) => {
      await processOutboundJobById(job.data.jobId);
    },
    {
      connection: { url: redisUrl! },
      concurrency: 5,
    },
  );

  worker.on("failed", (job, error) => {
    console.error(`Outbound worker failed job ${job?.id}:`, error);
  });
  worker.on("error", (error) => {
    console.error("Outbound worker connection error:", error.message);
  });
}

export async function closeOutboundQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
