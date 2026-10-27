// Helpers for PocketBase ClientResponseError objects.
// Validation errors look like: err.response.data = { email: { code, message } }

/** Returns { field: message } for every field PocketBase rejected. */
export function getFieldErrors(err) {
  const data = err?.response?.data ?? {};
  const fieldErrors = {};
  for (const [field, info] of Object.entries(data)) {
    if (info?.message) {
      fieldErrors[field] = info.message;
    }
  }
  return fieldErrors;
}

/** True when PocketBase rejected `field` with the given validation `code`. */
export function hasErrorCode(err, field, code) {
  return err?.response?.data?.[field]?.code === code;
}

/** A user-facing message for errors that aren't about a specific field. */
export function describeError(
  err,
  fallback = "Something went wrong. Please try again.",
) {
  if (err?.status === 0) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (err?.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return fallback;
}
