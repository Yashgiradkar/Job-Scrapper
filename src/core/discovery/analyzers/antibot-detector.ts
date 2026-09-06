/**
 * Anti-Bot & Bot Mitigation Detector
 *
 * Inspects HTTP headers, response bodies, challenge pages, scripts, and cookies
 * to identify major bot protection systems:
 * - Cloudflare (Turnstile, Challenge 503/403, cf_clearance, __cf_bm)
 * - DataDome
 * - PerimeterX / HUMAN Security
 * - Akamai Bot Manager
 * - AWS WAF
 * - Imperva / Incapsula
 * - Generic Captcha (reCAPTCHA, hCaptcha)
 */

import type { IAntiBotDetector } from '../interfaces/antibot-detector.interface.js';
import type {
  NetworkObservation,
  AntiBotDetectionResult,
} from '../types.js';

export class AntiBotDetector implements IAntiBotDetector {
  detect(
    observations: NetworkObservation[],
    pageHtml: string,
    pageTitle: string,
  ): AntiBotDetectionResult {
    const htmlLower = pageHtml.toLowerCase();
    const titleLower = pageTitle.toLowerCase();
    const signaturesFound: string[] = [];

    // 1. Cloudflare Detection
    const cloudflareSignatures = this.detectCloudflare(observations, htmlLower, titleLower);
    if (cloudflareSignatures.length > 0) {
      signaturesFound.push(...cloudflareSignatures);
      return {
        detected: true,
        provider: 'cloudflare',
        confidence: cloudflareSignatures.length >= 2 ? 0.98 : 0.85,
        signaturesFound,
        challengeType: htmlLower.includes('challenge') || htmlLower.includes('turnstile')
          ? 'js_challenge'
          : 'fingerprint',
        bypassRecommendations: [
          'Rotate residential proxy pool',
          'Use Playwright with realistic user-agent, viewport and TLS fingerprint',
          'Avoid rapid concurrent navigations; emulate human jitter (1.5s - 3s delay)',
          'Utilize Cloudflare Turnstile token solver or solver plugin if blocked by interactive challenge',
        ],
      };
    }

    // 2. DataDome Detection
    const datadomeSignatures = this.detectDataDome(observations, htmlLower);
    if (datadomeSignatures.length > 0) {
      signaturesFound.push(...datadomeSignatures);
      return {
        detected: true,
        provider: 'datadome',
        confidence: 0.95,
        signaturesFound,
        challengeType: htmlLower.includes('captcha') ? 'captcha' : 'fingerprint',
        bypassRecommendations: [
          'Route requests through high-reputation residential IPs',
          'Ensure browser automation flags (navigator.webdriver) are completely stealth-patched',
          'Synchronize device touch/mouse movements and hardware concurrency signatures',
        ],
      };
    }

    // 3. PerimeterX / HUMAN Security
    const perimeterXSignatures = this.detectPerimeterX(observations, htmlLower);
    if (perimeterXSignatures.length > 0) {
      signaturesFound.push(...perimeterXSignatures);
      return {
        detected: true,
        provider: 'perimeterx',
        confidence: 0.95,
        signaturesFound,
        challengeType: 'js_challenge',
        bypassRecommendations: [
          'Inject valid PX cookies or emulate sensor data generation',
          'Rotate user agents and canvas/webgl fingerprints consistently',
        ],
      };
    }

    // 4. Akamai Bot Manager
    const akamaiSignatures = this.detectAkamai(observations, htmlLower);
    if (akamaiSignatures.length > 0) {
      signaturesFound.push(...akamaiSignatures);
      return {
        detected: true,
        provider: 'akamai',
        confidence: 0.9,
        signaturesFound,
        challengeType: 'fingerprint',
        bypassRecommendations: [
          'Generate valid Akamai sensor telemetry via warm sessions',
          'Avoid headless automation leaks; use full headful Chromium or Camoufox/Brave wrappers',
        ],
      };
    }

    // 5. AWS WAF
    const awsWafSignatures = this.detectAwsWaf(observations, htmlLower);
    if (awsWafSignatures.length > 0) {
      signaturesFound.push(...awsWafSignatures);
      return {
        detected: true,
        provider: 'aws_waf',
        confidence: 0.88,
        signaturesFound,
        challengeType: 'captcha',
        bypassRecommendations: [
          'Solve AWS WAF CAPTCHA token and attach aws-waf-token cookie',
          'Throttle request rate below rate-based rule thresholds',
        ],
      };
    }

    // 6. Imperva / Incapsula
    const incapsulaSignatures = this.detectIncapsula(observations, htmlLower);
    if (incapsulaSignatures.length > 0) {
      signaturesFound.push(...incapsulaSignatures);
      return {
        detected: true,
        provider: 'imperva_incapsula',
        confidence: 0.92,
        signaturesFound,
        challengeType: 'js_challenge',
        bypassRecommendations: [
          'Allow Incapsula JavaScript challenge scripts to execute and set incap_ses cookies',
          'Maintain cookie jar across redirects',
        ],
      };
    }

    // 7. Generic Captchas
    if (htmlLower.includes('g-recaptcha') || htmlLower.includes('recaptcha/api.js')) {
      return {
        detected: true,
        provider: 'recaptcha',
        confidence: 0.9,
        signaturesFound: ['google_recaptcha_element_or_script'],
        challengeType: 'captcha',
        bypassRecommendations: ['Integrate automated audio or token captcha solver'],
      };
    }

    if (htmlLower.includes('hcaptcha') || htmlLower.includes('hcaptcha.com/1/api.js')) {
      return {
        detected: true,
        provider: 'hcaptcha',
        confidence: 0.9,
        signaturesFound: ['hcaptcha_element_or_script'],
        challengeType: 'captcha',
        bypassRecommendations: ['Integrate hCaptcha token solving provider'],
      };
    }

    return {
      detected: false,
      provider: 'none',
      confidence: 1.0,
      signaturesFound: [],
      challengeType: 'none',
      bypassRecommendations: [],
    };
  }

  private detectCloudflare(
    observations: NetworkObservation[],
    htmlLower: string,
    titleLower: string,
  ): string[] {
    const signatures: string[] = [];

    // Header checks
    for (const obs of observations) {
      if (obs.responseHeaders['cf-ray'] || obs.responseHeaders['cf-cache-status']) {
        signatures.push(`cf-ray-header:${obs.responseHeaders['cf-ray'] ?? 'present'}`);
      }
      if (obs.responseHeaders['server']?.toLowerCase().includes('cloudflare')) {
        signatures.push('server-cloudflare');
      }
    }

    // Cookie checks
    for (const obs of observations) {
      const cookie = (obs.responseHeaders['set-cookie'] || obs.requestHeaders['cookie'] || '').toLowerCase();
      if (cookie.includes('cf_clearance')) signatures.push('cookie:cf_clearance');
      if (cookie.includes('__cf_bm')) signatures.push('cookie:__cf_bm');
    }

    // HTML & Title checks
    if (titleLower.includes('just a moment...') || titleLower.includes('attention required! | cloudflare')) {
      signatures.push('title:cloudflare_challenge');
    }
    if (htmlLower.includes('cf-browser-verification') || htmlLower.includes('challenge-running') || htmlLower.includes('challenges.cloudflare.com/turnstile')) {
      signatures.push('html:cloudflare_turnstile_or_challenge');
    }

    return Array.from(new Set(signatures));
  }

  private detectDataDome(observations: NetworkObservation[], htmlLower: string): string[] {
    const signatures: string[] = [];
    for (const obs of observations) {
      const cookie = (obs.responseHeaders['set-cookie'] || obs.requestHeaders['cookie'] || '').toLowerCase();
      if (cookie.includes('datadome=')) signatures.push('cookie:datadome');
      if (obs.url.includes('datadome.co')) signatures.push('url:datadome.co');
      if (obs.responseHeaders['x-datadome']) signatures.push('header:x-datadome');
    }
    if (htmlLower.includes('datadome') || htmlLower.includes('ct.captcha-delivery.com')) {
      signatures.push('html:datadome_reference');
    }
    return Array.from(new Set(signatures));
  }

  private detectPerimeterX(observations: NetworkObservation[], htmlLower: string): string[] {
    const signatures: string[] = [];
    for (const obs of observations) {
      const cookie = (obs.responseHeaders['set-cookie'] || obs.requestHeaders['cookie'] || '').toLowerCase();
      if (cookie.includes('_pxhd') || cookie.includes('_px2') || cookie.includes('_px3')) {
        signatures.push('cookie:perimeterx');
      }
    }
    if (htmlLower.includes('px-captcha') || htmlLower.includes('perimeterx.net') || htmlLower.includes('humansecurity.com')) {
      signatures.push('html:perimeterx_challenge');
    }
    return Array.from(new Set(signatures));
  }

  private detectAkamai(observations: NetworkObservation[], htmlLower: string): string[] {
    const signatures: string[] = [];
    for (const obs of observations) {
      const cookie = (obs.responseHeaders['set-cookie'] || obs.requestHeaders['cookie'] || '').toLowerCase();
      if (cookie.includes('_abck') || cookie.includes('bm_sz') || cookie.includes('ak_bmsc')) {
        signatures.push('cookie:akamai_bot_manager');
      }
      if (obs.responseHeaders['server']?.toLowerCase().includes('akamaighost')) {
        signatures.push('server:akamaighost');
      }
    }
    if (htmlLower.includes('akamai') && htmlLower.includes('sensor_data')) {
      signatures.push('html:akamai_sensor');
    }
    return Array.from(new Set(signatures));
  }

  private detectAwsWaf(observations: NetworkObservation[], htmlLower: string): string[] {
    const signatures: string[] = [];
    for (const obs of observations) {
      const cookie = (obs.responseHeaders['set-cookie'] || obs.requestHeaders['cookie'] || '').toLowerCase();
      if (cookie.includes('aws-waf-token')) signatures.push('cookie:aws_waf_token');
      if (obs.responseHeaders['x-amzn-waf-action']) signatures.push('header:x-amzn-waf-action');
    }
    if (htmlLower.includes('aws-waf-captcha') || htmlLower.includes('token.awswaf.com')) {
      signatures.push('html:aws_waf_captcha');
    }
    return Array.from(new Set(signatures));
  }

  private detectIncapsula(observations: NetworkObservation[], htmlLower: string): string[] {
    const signatures: string[] = [];
    for (const obs of observations) {
      const cookie = (obs.responseHeaders['set-cookie'] || obs.requestHeaders['cookie'] || '').toLowerCase();
      if (cookie.includes('visid_incap') || cookie.includes('incap_ses')) {
        signatures.push('cookie:incapsula');
      }
      if (obs.responseHeaders['x-iinfo'] || obs.responseHeaders['x-cdn']?.includes('Incapsula')) {
        signatures.push('header:incapsula');
      }
    }
    if (htmlLower.includes('incapsula_resource') || htmlLower.includes('_incapsula_resource')) {
      signatures.push('html:incapsula_resource');
    }
    return Array.from(new Set(signatures));
  }
}
