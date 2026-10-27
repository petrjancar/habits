// Builds an error shaped like the PocketBase SDK's ClientResponseError.
export function pbError(status, data = {}) {
  return Object.assign(new Error("PocketBase error"), {
    status,
    response: { status, data, message: "PocketBase error" },
  });
}
