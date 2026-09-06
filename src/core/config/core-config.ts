/**
 * CoreConfig — centralised typed configuration for the automation platform.
 *
 * Every value is read from environment variables with safe defaults.
 * Import `getCoreConfig()` anywhere you need platform-level settings.
 */
import { z } from 'zod';

const schema = z.object({
  // Browser
  headless:      z.coerce.boolean().default(true),
  slowMo:        z.coerce.number().default(0),
  userAgent:     z.string().default('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'),
  locale:        z.string().default('en-US'),
  timezone:      z.string().default('America/New_York'),
  viewportWidth: z.coerce.number().default(1280),
  viewportHeight:z.coerce.number().default(800),

  // Timeouts (ms)
  navigationTimeoutMs: z.coerce.number().default(30_000),
  actionTimeoutMs:     z.coerce.number().default(10_000),
  stepTimeoutMs:       z.coerce.number().default(30_000),

  // Retry
  maxRetries:   z.coerce.number().default(3),
  retryDelayMs: z.coerce.number().default(2_000),

  // Proxy (optional)
  proxyServer:   z.string().optional(),
  proxyUsername: z.string().optional(),
  proxyPassword: z.string().optional(),

  // Resume paths
  resumePdfPath:  z.string().default('data_folder/resume.pdf'),
  resumeYamlPath: z.string().default('data_folder/plain_text_resume.yaml'),
  preferencesPath:z.string().default('data_folder/work_preferences.yaml'),

  // Screenshots & logging
  screenshotsDir: z.string().default('public/screenshots'),
  captureScreenshotOnFail: z.coerce.boolean().default(true),
});

export type CoreConfig = z.infer<typeof schema>;

let _config: CoreConfig | undefined;

export function getCoreConfig(): CoreConfig {
  if (_config) return _config;
  const raw = {
    headless:            process.env.BROWSER_HEADLESS,
    slowMo:              process.env.BROWSER_SLOW_MO,
    userAgent:           process.env.BROWSER_USER_AGENT,
    locale:              process.env.BROWSER_LOCALE,
    timezone:            process.env.BROWSER_TIMEZONE,
    viewportWidth:       process.env.BROWSER_VIEWPORT_WIDTH,
    viewportHeight:      process.env.BROWSER_VIEWPORT_HEIGHT,
    navigationTimeoutMs: process.env.NAVIGATION_TIMEOUT_MS,
    actionTimeoutMs:     process.env.ACTION_TIMEOUT_MS,
    stepTimeoutMs:       process.env.STEP_TIMEOUT_MS,
    maxRetries:          process.env.MAX_RETRIES,
    retryDelayMs:        process.env.RETRY_DELAY_MS,
    proxyServer:         process.env.PROXY_SERVER,
    proxyUsername:       process.env.PROXY_USERNAME,
    proxyPassword:       process.env.PROXY_PASSWORD,
    resumePdfPath:       process.env.RESUME_PDF_PATH,
    resumeYamlPath:      process.env.RESUME_YAML_PATH,
    preferencesPath:     process.env.PREFERENCES_PATH,
    screenshotsDir:      process.env.SCREENSHOTS_DIR,
    captureScreenshotOnFail: process.env.CAPTURE_SCREENSHOT_ON_FAIL,
  };
  _config = schema.parse(raw);
  return _config;
}

export function resetCoreConfig(): void {
  _config = undefined;
}

export { schema as CoreConfigSchema };
