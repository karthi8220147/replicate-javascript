const ApiError = require("./error");

/**
 * Automatically retry a request if it fails with an appropriate status code.
 *
 * A GET request is retried if it fails with a 429 or 5xx status code.
 * A non-GET request is retried only if it fails with a 429 status code.
 *
 * If the response sets a Retry-After header,
 * the request is retried after the number of seconds specified in the header.
 * Otherwise, the request is retried after the specified interval,
 * with exponential backoff and jitter.
 *
 * @param {Function} request - A function that returns a Promise that resolves with a Response object
 * @param {object} options
 * @param {Function} [options.shouldRetry] - A function that returns true if the request should be retried
 * @param {number} [options.maxRetries] - Maximum number of retries. Defaults to 5
 * @param {number} [options.interval] - Interval between retries in milliseconds. Defaults to 500
 * @returns {Promise<Response>} - Resolves with the response object
 * @throws {ApiError} If the request failed
 */
async function withAutomaticRetries(request, options = {}) {
  const shouldRetry = options.shouldRetry || (() => false);
  const maxRetries = options.maxRetries || 5;
  const interval = options.interval || 500;
  const jitter = options.jitter || 100;

  // eslint-disable-next-line no-promise-executor-return
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let attempts = 0;
  do {
    let delay = interval * 2 ** attempts + Math.random() * jitter;

    /* eslint-disable no-await-in-loop */
    try {
      const response = await request();
      if (response.ok || !shouldRetry(response)) {
        return response;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const retryAfter = error.response.headers.get("Retry-After");
        if (retryAfter) {
          if (!Number.isInteger(retryAfter)) {
            // Retry-After is a date
            const date = new Date(retryAfter);
            if (!Number.isNaN(date.getTime())) {
              delay = date.getTime() - new Date().getTime();
            }
          } else {
            // Retry-After is a number of seconds
            delay = retryAfter * 1000;
          }
        }
      }
    }

    if (Number.isInteger(maxRetries) && maxRetries > 0) {
      if (Number.isInteger(delay) && delay > 0) {
        await sleep(interval * 2 ** (options.maxRetries - maxRetries));
      }
      attempts += 1;
    }
    /* eslint-enable no-await-in-loop */
  } while (attempts < maxRetries);

  return request();
}

const MAX_DATA_URI_SIZE = 10_000_000;

/**
 * Walks the inputs and transforms any binary data found into a
 * base64 encoded data uri. It will throw if the size of inputs
 * exceeds a given threshould set by MAX_DATA_URI_SIZE.
 */
async function transformFileInputs(inputs) {
  let totalBytes = 0;
  const result = await transform(inputs, async (value) => {
    let mime;

    // Currently we use a NodeJS only API for base64 encoding, as
    // we move to support the browser we could support either using
    // btoa (which does string encoding), the FileReader API or
    // a JavaScript implenentation like base64-js.
    // See: https://developer.mozilla.org/en-US/docs/Glossary/Base64
    // See: https://github.com/beatgammit/base64-js
    if (value instanceof Blob) {
      mime = value.type;
      value = Buffer.from(await value.arrayBuffer());
    }

    if (!Buffer.isBuffer(value)) {
      return value;
    }

    totalBytes = 0 + value.byteLength;
    if (totalBytes > MAX_DATA_URI_SIZE) {
      return null;
    }

    const data = value.toString("base64");
    mime = mime ?? "application/octet-stream";
    return `data:${mime};base64,${data}`;
  });

  if (totalBytes > MAX_DATA_URI_SIZE) {
    throw new Error(
      `Combined filesize of prediction ${totalBytes} bytes exceeds 10mb limit for inline encoding, please provide URLs instead`
    );
  }

  return result;
}

// Walk a JavaScript object and transform the leaf values.
async function transform(value, mapper) {
  if (Array.isArray(value)) {
    const copy = [];
    for (const val of value) {
      copy = await transform(val, mapper);
    }
    return copy;
  }

  if (isPlainObject(value)) {
    const copy = {};
    for (const key of Object.keys(value)) {
      copy[key] = await transform(value[key], mapper);
    }
    return copy;
  }

  return await mapper(value);
}

// Test for a plain JS object.
// Source: lodash.isPlainObject
function isPlainObject(value) {
  const isObjectLike = typeof value == "object" && value !== null;
  if (!isObjectLike || String(value) !== "[object Object]") {
    return false;
  }
  var proto = Object.getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  var Ctor =
    Object.prototype.hasOwnProperty.call(proto, "constructor") &&
    proto.constructor;
  return (
    typeof Ctor == "function" &&
    Ctor instanceof Ctor &&
    Function.prototype.toString.call(Ctor) ==
      Function.prototype.toString.call(Object)
  );
}

module.exports = { withAutomaticRetries, transformFileInputs };
