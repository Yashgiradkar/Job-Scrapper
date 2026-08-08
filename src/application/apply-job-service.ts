import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { getBrowserManager } from '../infrastructure/browser/browser-manager.js';
import { loadRawResume } from '../infrastructure/config/profile-loader.js';
import { getApplyJobSessionStore } from './apply-job-session-store.js';
import { ApplicationError, ValidationError } from '../domain/errors/app-error.js';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('apply-job-service');

export interface ApplyJobResult {
  sessionId: string;
  status: string;
  previewScreenshotUrl?: string;
  pageTitle: string;
  currentUrl: string;
  logs: string[];
}

export interface SubmitResult {
  status: string;
  logs: string[];
}

export class ApplyJobService {
  private readonly sessionStore = getApplyJobSessionStore();

  async applyToJob(jobUrl: string): Promise<ApplyJobResult> {
    // 1. Validate the URL
    try {
      new URL(jobUrl);
    } catch {
      throw new ValidationError('Invalid job URL format');
    }

    const logs: string[] = [];
    this.log(logs, `Starting application flow for job URL: ${jobUrl}`);

    const browserManager = getBrowserManager();
    const page = await browserManager.createPage();

    try {
      // 2. Navigate to the job URL
      this.log(logs, `Navigating to job page...`);
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
      
      const title = await page.title();
      this.log(logs, `Successfully navigated to: ${title}`);

      // 3. Load profile candidate data
      const profile = loadRawResume();
      this.log(logs, `Loaded candidate profile for ${profile.personal_information.name} ${profile.personal_information.surname}`);

      // 4. Run multi-step form filler
      await this.fillAllSteps(page, profile, logs);

      // 5. Save the preview screenshot
      const sessionId = await this.savePreviewState(page, jobUrl, logs);

      return {
        sessionId,
        status: 'ready_for_review',
        previewScreenshotUrl: `/preview-${sessionId}.png`,
        pageTitle: title,
        currentUrl: page.url(),
        logs,
      };
    } catch (error: any) {
      this.log(logs, `Error during form filling: ${error.message}`);
      // Close the page on failure to avoid leaking resources
      try {
        await page.close();
        await page.context().close();
      } catch (closeErr) {
        // ignore close errors
      }
      throw new ApplicationError(error.message || 'Application automation failed', error);
    }
  }

  async submitApplication(sessionId: string): Promise<SubmitResult> {
    const logs: string[] = [];
    this.log(logs, `Initiating final submission for session: ${sessionId}`);

    const session = this.sessionStore.getSession(sessionId);
    if (session.status !== 'ready_for_review') {
      throw new ValidationError('Session is not in ready_for_review state');
    }

    const page = session.page;

    try {
      // 1. Find and click the submit button
      this.log(logs, 'Searching for final Submit button...');
      
      const submitSelectors = [
        'button:has-text("Submit")',
        'button:has-text("Submit Application")',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:has-text("Apply")',
        'button:has-text("Finish")',
        '[data-testid="submit-button"]'
      ];

      let clicked = false;
      for (const selector of submitSelectors) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible() && await btn.isEnabled()) {
          this.log(logs, `Clicking submit button matching: ${selector}`);
          await btn.click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        this.log(logs, 'No explicit submit button clicked. Attempting to click primary button containing "Submit"');
        const submitBtn = page.locator('button, input').filter({ hasText: /submit|apply|finish/i }).first();
        if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
          await submitBtn.click();
          clicked = true;
        }
      }

      if (!clicked) {
        throw new Error('Submit button not found or not interactable');
      }

      // 2. Wait for navigation or success indicator
      this.log(logs, 'Waiting for submission to complete...');
      await page.waitForTimeout(5000); // Wait 5s for network/DOM changes

      this.log(logs, 'Application submitted successfully');
      session.status = 'submitted';
      
      return {
        status: 'submitted',
        logs: [...session.logs, ...logs],
      };
    } catch (error: any) {
      this.log(logs, `Submission failed: ${error.message}`);
      session.status = 'failed';
      throw new ApplicationError(`Submission failed: ${error.message}`, error);
    } finally {
      // Always cleanup session pages after submission attempt
      await this.sessionStore.closeSession(sessionId);
    }
  }

  private async fillAllSteps(page: Page, profile: any, logs: string[]): Promise<void> {
    const maxSteps = 10;
    let currentStep = 1;

    while (currentStep <= maxSteps) {
      this.log(logs, `Processing step ${currentStep}...`);
      
      // 1. Wait a moment for dynamic page elements
      await page.waitForTimeout(1000);

      // 2. Fill all input elements on current step/view
      await this.fillCurrentPageInputs(page, profile, logs);

      // 3. Detect if we are on the final review/preview step
      if (await this.isReviewOrPreviewPage(page, logs)) {
        this.log(logs, 'Detected review/preview page. Stopping application flow before final submission.');
        break;
      }

      // 4. Try to navigate to next step
      const nextButton = await this.findNextStepButton(page);
      if (nextButton) {
        this.log(logs, 'Clicking "Next" / "Continue" step button...');
        await nextButton.click();
        currentStep++;
      } else {
        this.log(logs, 'No further navigation buttons found. Assuming form is filled completely.');
        break;
      }
    }
  }

  private async fillCurrentPageInputs(page: Page, profile: any, logs: string[]): Promise<void> {
    // Fill text inputs & textareas
    const textInputs = await page.locator('input[type="text"], input[type="email"], input[type="tel"], textarea').all();
    for (const input of textInputs) {
      if (await input.isVisible() && await input.isEnabled()) {
        const val = await input.inputValue();
        if (!val) {
          await this.fillTextInput(input, profile, logs);
        }
      }
    }

    // Fill file inputs (Resume / CV)
    const fileInputs = await page.locator('input[type="file"]').all();
    for (const input of fileInputs) {
      if (await input.isVisible()) {
        await this.handleFileUpload(input, logs);
      }
    }

    // Handle selects (dropdowns)
    const selectElements = await page.locator('select').all();
    for (const select of selectElements) {
      if (await select.isVisible() && await select.isEnabled()) {
        await this.handleSelectDropdown(select, profile, logs);
      }
    }

    // Handle radio buttons and checkboxes
    const choiceElements = await page.locator('input[type="radio"], input[type="checkbox"]').all();
    for (const choice of choiceElements) {
      if (await choice.isVisible() && await choice.isEnabled()) {
        const isChecked = await choice.isChecked();
        if (!isChecked) {
          await this.handleChoiceInput(choice, profile, logs);
        }
      }
    }
  }

  private async fillTextInput(locator: any, profile: any, logs: string[]): Promise<void> {
    const name = (await locator.getAttribute('name')) || '';
    const id = (await locator.getAttribute('id')) || '';
    const placeholder = (await locator.getAttribute('placeholder')) || '';
    
    // Find associated label text if any
    let label = '';
    if (id) {
      const labelElement = locator.page().locator(`label[for="${id}"]`).first();
      if (await labelElement.isVisible()) {
        label = await labelElement.innerText();
      }
    }

    const context = `${name} ${id} ${placeholder} ${label}`.toLowerCase();

    // Map profile values based on field context heuristics
    let valueToFill = '';
    const personal = profile.personal_information || {};

    if (context.includes('first name') || context.includes('firstname') || (context.includes('name') && !context.includes('last') && !context.includes('full'))) {
      valueToFill = personal.name;
    } else if (context.includes('last name') || context.includes('lastname') || context.includes('surname')) {
      valueToFill = personal.surname;
    } else if (context.includes('email')) {
      valueToFill = personal.email;
    } else if (context.includes('phone') || context.includes('tel') || context.includes('mobile')) {
      valueToFill = (personal.phone_prefix || '') + (personal.phone || '');
    } else if (context.includes('linkedin')) {
      valueToFill = personal.linkedin || '';
    } else if (context.includes('github')) {
      valueToFill = personal.github || '';
    } else if (context.includes('website') || context.includes('portfolio')) {
      valueToFill = personal.github || personal.linkedin || '';
    } else if (context.includes('address')) {
      valueToFill = personal.address || '';
    } else if (context.includes('city')) {
      valueToFill = personal.city || '';
    } else if (context.includes('zip') || context.includes('postal')) {
      valueToFill = personal.zip_code || '';
    } else if (context.includes('country')) {
      valueToFill = personal.country || '';
    } else if (context.includes('salary') || context.includes('expectations') || context.includes('compensation')) {
      valueToFill = profile.salary_expectations?.salary_range_usd || '';
    } else if (context.includes('notice') || context.includes('availability') || context.includes('start date')) {
      valueToFill = profile.availability?.notice_period || '';
    }

    if (valueToFill) {
      this.log(logs, `Filling input [context: ${context.substring(0, 30)}] with value: ${valueToFill}`);
      await locator.fill(valueToFill);
    }
  }

  private async handleFileUpload(locator: any, logs: string[]): Promise<void> {
    const resumePath = path.resolve(process.cwd(), 'data_folder', 'resume.pdf');
    if (fs.existsSync(resumePath)) {
      this.log(logs, `Uploading resume file from: ${resumePath}`);
      await locator.setInputFiles(resumePath);
    } else {
      this.log(logs, `Warning: resume.pdf not found at ${resumePath}. Skipping upload step.`);
    }
  }

  private async handleSelectDropdown(locator: any, profile: any, logs: string[]): Promise<void> {
    const name = (await locator.getAttribute('name')) || '';
    const id = (await locator.getAttribute('id')) || '';
    let label = '';
    if (id) {
      const labelElement = locator.page().locator(`label[for="${id}"]`).first();
      if (await labelElement.isVisible()) {
        label = await labelElement.innerText();
      }
    }
    const context = `${name} ${id} ${label}`.toLowerCase();

    // Work authorization detection
    if (context.includes('authorized') || context.includes('legal') || context.includes('visa') || context.includes('sponsor')) {
      const usAuth = profile.legal_authorization?.us_work_authorization || 'No';
      const optionToSelect = usAuth.toLowerCase() === 'yes' ? 'yes' : 'no';
      await this.selectDropdownOption(locator, optionToSelect, logs);
    } 
    // Gender detection
    else if (context.includes('gender') || context.includes('sex')) {
      const gender = profile.self_identification?.gender || '';
      if (gender) {
        await this.selectDropdownOption(locator, gender, logs);
      }
    }
    // Veteran status
    else if (context.includes('veteran')) {
      const veteran = profile.self_identification?.veteran || 'No';
      await this.selectDropdownOption(locator, veteran, logs);
    }
    // Disability
    else if (context.includes('disability')) {
      const disability = profile.self_identification?.disability || 'No';
      await this.selectDropdownOption(locator, disability, logs);
    }
  }

  private async selectDropdownOption(locator: any, value: string, logs: string[]): Promise<void> {
    const options = await locator.locator('option').all();
    for (const option of options) {
      const text = (await option.innerText()).toLowerCase();
      const val = (await option.getAttribute('value'))?.toLowerCase() || '';
      
      if (text.includes(value.toLowerCase()) || val === value.toLowerCase() || (value.toLowerCase() === 'no' && text.includes('not'))) {
        this.log(logs, `Selecting dropdown option: ${await option.innerText()}`);
        await locator.selectOption({ value: await option.getAttribute('value') });
        return;
      }
    }
  }

  private async handleChoiceInput(locator: any, profile: any, logs: string[]): Promise<void> {
    const id = (await locator.getAttribute('id')) || '';
    const name = (await locator.getAttribute('name')) || '';
    let label = '';
    if (id) {
      const labelElement = locator.page().locator(`label[for="${id}"]`).first();
      if (await labelElement.isVisible()) {
        label = await labelElement.innerText();
      }
    }
    const context = `${id} ${name} ${label}`.toLowerCase();

    // Checkboxes / Radio buttons usually for yes/no questions (e.g. work authorization, agreement)
    if (context.includes('sponsor') || context.includes('visa') || context.includes('auth')) {
      const usSponsor = profile.legal_authorization?.requires_us_sponsorship || 'Yes';
      const requiresSponsor = usSponsor.toLowerCase() === 'yes';
      
      if (context.includes('yes') && requiresSponsor) {
        await locator.click();
      } else if (context.includes('no') && !requiresSponsor) {
        await locator.click();
      }
    }
    // General terms agreement
    else if (context.includes('agree') || context.includes('consent') || context.includes('acknowledge') || context.includes('terms')) {
      this.log(logs, `Checking consent/terms agreement: [label: ${label}]`);
      await locator.click();
    }
  }

  private async isReviewOrPreviewPage(page: Page, logs: string[]): Promise<boolean> {
    const pageText = (await page.locator('body').innerText()).toLowerCase();
    const indicators = [
      'review your application',
      'review application',
      'preview application',
      'please review',
      'almost done',
      'review and submit'
    ];

    for (const indicator of indicators) {
      if (pageText.includes(indicator)) {
        this.log(logs, `Review/preview page indicator matched: "${indicator}"`);
        return true;
      }
    }

    // Also check if the only major buttons visible are submit buttons
    const primaryButtons = await page.locator('button, input[type="submit"]').all();
    let hasNext = false;
    let hasSubmit = false;

    for (const btn of primaryButtons) {
      if (await btn.isVisible()) {
        const text = (await btn.innerText()).toLowerCase() || (await btn.getAttribute('value'))?.toLowerCase() || '';
        if (text.includes('next') || text.includes('continue') || text.includes('proceed')) {
          hasNext = true;
        }
        if (text.includes('submit') || text.includes('apply') || text.includes('finish')) {
          hasSubmit = true;
        }
      }
    }

    // If we have a submit button but no next/continue buttons, we are on the final page
    if (hasSubmit && !hasNext) {
      this.log(logs, 'Found submit button but no further next/continue buttons. Confirmed review page.');
      return true;
    }

    return false;
  }

  private async findNextStepButton(page: Page): Promise<any | null> {
    const nextSelectors = [
      'button:has-text("Next")',
      'button:has-text("Continue")',
      'button:has-text("Proceed")',
      'button:has-text("Review Application")',
      'button:has-text("Review")',
      'input[value="Next"]',
      'input[value="Continue"]'
    ];

    for (const selector of nextSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible() && await btn.isEnabled()) {
        return btn;
      }
    }

    // Try a broad filter search
    const broadButton = page.locator('button, input[type="button"]').filter({ hasText: /next|continue|proceed|review/i }).first();
    if (await broadButton.isVisible() && await broadButton.isEnabled()) {
      const text = (await broadButton.innerText()).toLowerCase() || '';
      if (!text.includes('submit') && !text.includes('apply')) {
        return broadButton;
      }
    }

    return null;
  }

  private async savePreviewState(page: Page, jobUrl: string, logs: string[]): Promise<string> {
    const sessionStore = getApplyJobSessionStore();
    const session = sessionStore.createSession(page, jobUrl, logs);
    
    // Save preview screenshot to public folder
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const screenshotPath = path.join(publicDir, `preview-${session.id}.png`);
    
    this.log(logs, `Taking preview screenshot...`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    this.log(logs, `Screenshot saved to: ${screenshotPath}`);

    return session.id;
  }

  private log(logs: string[], message: string): void {
    const logStr = `${new Date().toISOString()} ${message}`;
    logs.push(logStr);
    logger.info(message);
  }
}
