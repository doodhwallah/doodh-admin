/**
 * Retry utility for resilient operations
 * Implements exponential backoff for transient failures
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error) => boolean;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  shouldRetry: (error: Error) => {
    // Retry on network errors or timeouts
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    );
  },
};

/**
 * Execute a function with automatic retry on transient failures
 * Uses exponential backoff with jitter
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error = new Error('Unknown error');
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry if we've exhausted attempts or error is not retryable
      if (attempt >= opts.maxRetries || !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay;
      const waitTime = Math.min(delay + jitter, opts.maxDelayMs);
      
      console.warn(
        `[retry] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed, retrying in ${Math.round(waitTime)}ms:`,
        lastError.message
      );

      await new Promise(resolve => setTimeout(resolve, waitTime));
      delay *= opts.backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return ((...args: Parameters<T>) => 
    withRetry(() => fn(...args), options)
  ) as T;
}
