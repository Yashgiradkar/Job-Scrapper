import { ApifyClient } from './apify-client.js';

export interface ActorRunOptions {
  contentType?: string;
  memoryMbytes?: number;
  timeoutSecs?: number;
  waitSecs?: number;
}

export interface ActorRunResult {
  id: string;
  actId: string;
  defaultDatasetId: string;
  defaultKeyValueStoreId: string;
  defaultRequestQueueId: string;
  status: string;
}

export class ActorRunner {
  constructor(private readonly apifyClient: ApifyClient) {}

  async run(
    actorId: string,
    input: Record<string, any>,
    options?: ActorRunOptions,
  ): Promise<ActorRunResult> {
    const client = this.apifyClient.getClient();
    const run = await client.actor(actorId).call(input, options);

    return {
      id: run.id,
      actId: run.actId,
      defaultDatasetId: run.defaultDatasetId,
      defaultKeyValueStoreId: run.defaultKeyValueStoreId,
      defaultRequestQueueId: run.defaultRequestQueueId,
      status: run.status,
    };
  }
}
