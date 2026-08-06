import { ApifyClient } from './apify-client.js';

export interface RequestQueueInfo {
  id: string;
  name?: string;
  userId: string;
  createdAt: string;
  modifiedAt: string;
  accessedAt: string;
  totalRequestCount: number;
  handledRequestCount: number;
  pendingRequestCount: number;
}

export interface QueueRequestOptions {
  id?: string;
  uniqueKey: string;
  url: string;
  method?: string;
  payload?: string;
  retryCount?: number;
  noRetry?: boolean;
  loadedUrl?: string;
  handledAt?: string;
  userData?: Record<string, any>;
}

export class RequestQueue {
  constructor(private readonly apifyClient: ApifyClient) {}

  async getOrCreate(queueName: string): Promise<RequestQueueInfo> {
    const client = this.apifyClient.getClient();
    const queue = await client.requestQueues().getOrCreate(queueName);
    return {
      id: queue.id,
      name: queue.name,
      userId: queue.userId,
      createdAt: queue.createdAt.toISOString(),
      modifiedAt: queue.modifiedAt.toISOString(),
      accessedAt: queue.accessedAt.toISOString(),
      totalRequestCount: queue.totalRequestCount,
      handledRequestCount: queue.handledRequestCount,
      pendingRequestCount: queue.pendingRequestCount,
    };
  }

  async addRequest(
    queueId: string,
    request: QueueRequestOptions,
    options?: { forefront?: boolean },
  ): Promise<any> {
    const client = this.apifyClient.getClient();
    return await client.requestQueue(queueId).addRequest(request as any, options);
  }

  async getRequest(queueId: string, requestId: string): Promise<any> {
    const client = this.apifyClient.getClient();
    return await client.requestQueue(queueId).getRequest(requestId);
  }

  async deleteQueue(queueId: string): Promise<void> {
    const client = this.apifyClient.getClient();
    await client.requestQueue(queueId).delete();
  }
}
