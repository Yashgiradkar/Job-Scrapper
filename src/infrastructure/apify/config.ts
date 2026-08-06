import { getConfig } from '../config/config.js';
import { ConfigError } from '../../domain/errors/app-error.js';

export interface ApifyConfig {
  token: string;
  actorMapping: Record<string, string>;
}

export class Configuration {
  get(): ApifyConfig {
    const appConfig = getConfig();
    const token = appConfig.apify.token;

    if (!token) {
      throw new ConfigError(
        'APIFY_TOKEN is required for Apify operations but was not provided.',
      );
    }

    return {
      token,
      actorMapping: appConfig.apify.actorMapping,
    };
  }
}

