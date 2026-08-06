import { ApifyClient as OfficialApifyClient } from 'apify-client';
import { Configuration } from './config.js';

export class ApifyClient {
  private client: OfficialApifyClient | null = null;

  constructor(private readonly configuration: Configuration) {}

  getClient(): OfficialApifyClient {
    if (!this.client) {
      const config = this.configuration.get();
      this.client = new OfficialApifyClient({
        token: config.token,
      });
    }
    return this.client;
  }
}
