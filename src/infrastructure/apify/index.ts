import { Configuration } from './config.js';
import { ApifyClient } from './apify-client.js';
import { ActorRunner } from './actor-runner.js';
import { DatasetReader } from './dataset-reader.js';

export * from './config.js';
export * from './apify-client.js';
export * from './actor-runner.js';
export * from './dataset-reader.js';
export * from './request-queue.js';

let sharedConfiguration: Configuration | undefined;
let sharedApifyClient: ApifyClient | undefined;
let sharedActorRunner: ActorRunner | undefined;
let sharedDatasetReader: DatasetReader | undefined;

export function getApifyConfiguration(): Configuration {
  if (!sharedConfiguration) {
    sharedConfiguration = new Configuration();
  }
  return sharedConfiguration;
}

export function getApifyClient(): ApifyClient {
  if (!sharedApifyClient) {
    sharedApifyClient = new ApifyClient(getApifyConfiguration());
  }
  return sharedApifyClient;
}

export function getActorRunner(): ActorRunner {
  if (!sharedActorRunner) {
    sharedActorRunner = new ActorRunner(getApifyClient());
  }
  return sharedActorRunner;
}

export function getDatasetReader(): DatasetReader {
  if (!sharedDatasetReader) {
    sharedDatasetReader = new DatasetReader(getApifyClient());
  }
  return sharedDatasetReader;
}

