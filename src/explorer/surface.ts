/**
 * Surface Explorer for RalphMeter
 *
 * AI-driven exploration that exercises all app surfaces using Playwright.
 * Clicks buttons, fills forms, navigates links to prove reachability.
 * Records HTTP responses including status codes for barrier detection.
 * This is a core component of G3 (Reachable) gate verification.
 */

import { chromium, type Browser, type Page, type Locator } from 'playwright';
import { type Result, ok, err } from '../shared/result.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for surface exploration
 */
export interface ExploreOptions {
  /** Maximum time to explore in milliseconds (default: 60000 = 1 minute) */
  timeout?: number;
  /** Maximum depth of navigation (default: 3) */
  maxDepth?: number;
  /** Whether to run browser in headless mode (default: true) */
  headless?: boolean;
  /** Viewport width (default: 1280) */
  viewportWidth?: number;
  /** Viewport height (default: 720) */
  viewportHeight?: number;
  /** Delay between actions in ms (default: 100) */
  actionDelay?: number;
  /** Additional headers to send with requests */
  extraHeaders?: Record<string, string>;
  /** Credentials for authenticated exploration */
  credentials?: {
    username: string;
    password: string;
  };
}

/**
 * A single action taken during exploration
 */
export interface ExplorationAction {
  /** Type of action performed */
  type: 'click' | 'fill' | 'navigate' | 'submit';
  /** Selector or URL related to the action */
  target: string;
  /** Human-readable description of the action */
  description: string;
  /** Timestamp when action was performed */
  timestamp: string;
  /** Value entered (for fill actions) */
  value?: string;
}

/**
 * HTTP response captured during exploration
 */
export interface CapturedResponse {
  /** Request URL */
  url: string;
  /** HTTP status code */
  status: number;
  /** HTTP method */
  method: string;
  /** Response content type */
  contentType: string | null;
  /** Timestamp when response was received */
  timestamp: string;
}

/**
 * Complete exploration log
 */
export interface ExplorationLog {
  /** Base URL that was explored */
  baseUrl: string;
  /** URLs visited during exploration */
  urlsVisited: string[];
  /** Actions taken during exploration */
  actions: ExplorationAction[];
  /** HTTP responses received */
  responses: CapturedResponse[];
  /** Total exploration time in milliseconds */
  duration: number;
  /** Whether exploration completed successfully */
  success: boolean;
  /** Error message if exploration failed */
  error?: string;
}

// ============================================================================
// SurfaceExplorer
// ============================================================================

/**
 * AI-driven surface explorer using Playwright
 */
export class SurfaceExplorer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private visitedUrls = new Set<string>();
  private actions: ExplorationAction[] = [];
  private responses: CapturedResponse[] = [];

  /**
   * Explore all visible UI surfaces starting from baseUrl
   *
   * @param baseUrl - Starting URL to explore
   * @param options - Exploration configuration
   * @returns Result with exploration log or error
   */
  async explore(
    baseUrl: string,
    options: ExploreOptions = {}
  ): Promise<Result<ExplorationLog, string>> {
    const startTime = Date.now();

    try {
      // Validate baseUrl
      const trimmed = baseUrl.trim();
      if (trimmed === '') {
        return err('baseUrl cannot be empty');
      }

      // Initialize browser and page
      const initResult = await this.initialize(options);
      if (!initResult.ok) {
        return err(initResult.error);
      }

      // Set up response listener
      this.setupResponseListener();

      // Start exploration
      await this.explorePage(baseUrl, options.maxDepth ?? 3, 0);

      const duration = Date.now() - startTime;

      // Cleanup
      await this.cleanup();

      return ok({
        baseUrl,
        urlsVisited: Array.from(this.visitedUrls),
        actions: this.actions,
        responses: this.responses,
        duration,
        success: true,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Cleanup on error
      await this.cleanup();

      return err(errorMessage);
    }
  }

  /**
   * Initialize browser and page
   */
  private async initialize(
    options: ExploreOptions
  ): Promise<Result<void, string>> {
    try {
      // Launch browser
      this.browser = await chromium.launch({
        headless: options.headless ?? true,
      });

      // Create context with viewport
      const context = await this.browser.newContext({
        viewport: {
          width: options.viewportWidth ?? 1280,
          height: options.viewportHeight ?? 720,
        },
        extraHTTPHeaders: options.extraHeaders ?? {},
      });

      // Create page
      this.page = await context.newPage();

      // Set navigation timeout
      this.page.setDefaultNavigationTimeout(options.timeout ?? 60000);
      this.page.setDefaultTimeout(options.timeout ?? 60000);

      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Failed to initialize browser: ${message}`);
    }
  }

  /**
   * Set up listener to capture HTTP responses
   */
  private setupResponseListener(): void {
    if (this.page === null) {
      return;
    }

    this.page.on('response', (response) => {
      this.responses.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
        contentType: response.headers()['content-type'] ?? null,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Recursively explore a page and its interactive elements
   */
  private async explorePage(
    url: string,
    maxDepth: number,
    currentDepth: number
  ): Promise<void> {
    if (this.page === null) {
      return;
    }

    // Check depth limit
    if (currentDepth > maxDepth) {
      return;
    }

    // Check if already visited
    const normalizedUrl = this.normalizeUrl(url);
    if (this.visitedUrls.has(normalizedUrl)) {
      return;
    }

    try {
      // Navigate to URL
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      this.visitedUrls.add(normalizedUrl);

      this.actions.push({
        type: 'navigate',
        target: url,
        description: `Navigate to ${url}`,
        timestamp: new Date().toISOString(),
      });

      // Wait for page to be ready
      await this.page.waitForLoadState('domcontentloaded');

      // Collect links first (before interactions modify the page)
      const linksToFollow: string[] = [];
      if (currentDepth < maxDepth) {
        linksToFollow.push(...(await this.collectLinks(url)));
      }

      // Find and interact with elements
      await this.interactWithElements(currentDepth);

      // Follow collected links
      for (const linkUrl of linksToFollow) {
        await this.explorePage(linkUrl, maxDepth, currentDepth + 1);
      }
    } catch {
      // Continue on error
    }
  }

  /**
   * Interact with interactive elements on current page
   */
  private async interactWithElements(_currentDepth: number): Promise<void> {
    if (this.page === null) {
      return;
    }

    try {
      // Wait for page to be interactive
      await this.page.waitForLoadState('domcontentloaded');

      // Find all buttons (not in forms)
      const buttons = await this.page
        .locator('button:not(form button), input[type="button"]')
        .all();

      for (const button of buttons) {
        try {
          // Check if button is visible and enabled
          const isVisible = await button.isVisible();
          const isEnabled = await button.isEnabled();

          if (isVisible && isEnabled) {
            const text = await button.textContent();
            const buttonText = text?.trim() ?? 'button';

            // Click the button
            await button.click({ timeout: 5000 });

            this.actions.push({
              type: 'click',
              target: 'button',
              description: `Click button: ${buttonText}`,
              timestamp: new Date().toISOString(),
            });

            // Wait for any responses
            await this.page.waitForTimeout(100);
          }
        } catch {
          // Continue on error (element might be stale)
          continue;
        }
      }

      // Find and fill forms
      const forms = await this.page.locator('form').all();

      for (const form of forms) {
        try {
          await this.fillForm(form);
        } catch {
          // Continue on error
          continue;
        }
      }
    } catch {
      // Continue on error
    }
  }

  /**
   * Fill a form with sample data
   */
  private async fillForm(form: Locator): Promise<void> {
    if (this.page === null) {
      return;
    }

    try {
      // Find text inputs within the form
      const textInputs = await form
        .locator(
          'input[type="text"], input[type="email"], input[type="password"], input:not([type]), textarea'
        )
        .all();

      for (const input of textInputs) {
        try {
          const isVisible = await input.isVisible();
          const isEnabled = await input.isEnabled();

          if (isVisible && isEnabled) {
            const inputType = (await input.getAttribute('type')) ?? 'text';
            const inputName = (await input.getAttribute('name')) ?? 'field';

            // Use appropriate test data based on type
            let testValue = 'test';
            if (inputType === 'email') {
              testValue = 'test@example.com';
            } else if (inputType === 'password') {
              testValue = 'password123';
            }

            await input.fill(testValue);

            this.actions.push({
              type: 'fill',
              target: inputName,
              description: `Fill ${inputType} field: ${inputName}`,
              timestamp: new Date().toISOString(),
              value: testValue,
            });

            // Small delay between fields
            await this.page.waitForTimeout(50);
          }
        } catch {
          // Continue on error (element might be stale)
          continue;
        }
      }

      // Find and click submit button within the form
      const submitButtons = await form
        .locator('button[type="submit"], input[type="submit"]')
        .all();

      for (const submitButton of submitButtons) {
        try {
          const isVisible = await submitButton.isVisible();
          const isEnabled = await submitButton.isEnabled();

          if (isVisible && isEnabled) {
            await submitButton.click({ timeout: 5000 });

            this.actions.push({
              type: 'submit',
              target: 'form',
              description: 'Submit form',
              timestamp: new Date().toISOString(),
            });

            // Wait for response
            await this.page.waitForTimeout(500);

            // Only submit once per form
            break;
          }
        } catch {
          // Continue on error
          continue;
        }
      }
    } catch {
      // Continue on error
    }
  }

  /**
   * Collect links from the current page
   */
  private async collectLinks(baseUrl: string): Promise<string[]> {
    if (this.page === null) {
      return [];
    }

    const linksToFollow: string[] = [];

    try {
      // Get all links on the page
      const links = await this.page.locator('a[href]').all();
      const baseDomain = new URL(baseUrl).origin;

      for (const link of links) {
        try {
          const href = await link.getAttribute('href');

          if (href === null || href === '#' || href === '') {
            continue;
          }

          // Resolve relative URLs
          let fullUrl: string;
          if (href.startsWith('http')) {
            fullUrl = href;
          } else {
            fullUrl = new URL(href, baseUrl).href;
          }

          // Only follow links on the same domain
          if (fullUrl.startsWith(baseDomain)) {
            const normalized = this.normalizeUrl(fullUrl);

            if (!this.visitedUrls.has(normalized)) {
              linksToFollow.push(fullUrl);
            }
          }
        } catch {
          // Continue on error
          continue;
        }
      }
    } catch {
      // Continue on error
    }

    return linksToFollow;
  }

  /**
   * Follow links to explore more pages (deprecated - use collectLinks instead)
   */
  private async followLinks(
    baseUrl: string,
    maxDepth: number,
    currentDepth: number
  ): Promise<void> {
    const links = await this.collectLinks(baseUrl);
    for (const linkUrl of links) {
      await this.explorePage(linkUrl, maxDepth, currentDepth + 1);
    }
  }

  /**
   * Normalize URL by removing trailing slashes and fragments
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove fragment and trailing slash
      parsed.hash = '';
      let normalized = parsed.href;
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }

  /**
   * Cleanup browser resources
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.page !== null) {
        await this.page.close();
        this.page = null;
      }

      if (this.browser !== null) {
        await this.browser.close();
        this.browser = null;
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Check if explorer is currently running
   */
  isRunning(): boolean {
    return this.browser !== null;
  }
}
