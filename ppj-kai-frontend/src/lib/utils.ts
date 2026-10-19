/** Shape of an axios-style error carrying a server message. */
export interface ApiError {
  response?: { data?: { message?: string } };
}

/** Safely extract a server error message from an unknown caught error. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.response?.data?.message || fallback;
}
