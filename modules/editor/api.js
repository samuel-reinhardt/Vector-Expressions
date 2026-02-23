/**
 * Vector Expressions — REST API helpers.
 *
 * Pure async functions — no React, no DOM. Easy to unit-test in isolation.
 */

/**
 * Fetch a server-evaluated preview for an expression.
 *
 * Returns `null` on network failure so callers can distinguish
 * "server returned empty string" from "request failed".
 *
 * @param {string} expr   Expression without curly braces.
 * @param {number} postId The post being edited.
 * @returns {Promise<{preview: string, valid: boolean}|null>} Preview info, or null on failure.
 */
export const fetchPreview = async (expr, postId = 0) => {
  try {
    const data = await window.wp.apiFetch({
      path: `vector-expressions/v1/preview?expr=${encodeURIComponent(expr)}&post_id=${postId}`,
    });
    // Return an explicit error format if the request failed or returned malformed data.
    if (data?.preview === undefined || data?.valid === undefined) {
      return { preview: "", valid: false };
    }
    return { preview: data.preview, valid: data.valid };
  } catch {
    return { preview: "", valid: false };
  }
};
