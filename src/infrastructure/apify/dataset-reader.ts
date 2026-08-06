import { ApifyClient } from './apify-client.js';

export interface ListItemsOptions {
  clean?: boolean;
  desc?: boolean;
  fields?: string[];
  limit?: number;
  offset?: number;
  omit?: string[];
  unwind?: string;
}

export class DatasetReader {
  constructor(private readonly apifyClient: ApifyClient) {}

  async readItems<T = Record<string, any>>(
    datasetId: string,
    options?: ListItemsOptions,
  ): Promise<T[]> {
    const client = this.apifyClient.getClient();
    const response = await client.dataset(datasetId).listItems(options);
    return response.items as T[];
  }
}
