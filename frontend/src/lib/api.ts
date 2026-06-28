import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function buildApiError(res: Response): Promise<ApiError> {
  const raw = await res.text().catch(() => "");
  let message = res.statusText;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      message = parsed.detail || message;
    } catch {
      message = raw;
    }
  }
  return new ApiError(res.status, message);
}

// Shared handling for non-OK responses: redirect to /login on 401, otherwise
// surface the error via a toast. Always throws (or hangs on redirect).
async function handleErrorResponse(res: Response): Promise<never> {
  const error = await buildApiError(res);
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
      await new Promise(() => {}); // hang until redirect
    }
  } else {
    toast.error(error.message);
  }
  throw error;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    await handleErrorResponse(res);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, {}, token),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, token),
  delete: <T>(path: string, token?: string) =>
    request<T>(path, { method: "DELETE" }, token),
  upload: <T>(path: string, formData: FormData, token?: string) => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, {
      method: "POST",
      headers,
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        await handleErrorResponse(res);
      }
      return res.json() as Promise<T>;
    });
  },

  stream: async function* <T = Record<string, unknown>>(
    path: string,
    body: unknown,
    token?: string,
  ): AsyncGenerator<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      await handleErrorResponse(res);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as T;
          } catch {
            // skip malformed lines
          }
        }
      }
    }
    if (buffer.startsWith("data: ")) {
      try {
        yield JSON.parse(buffer.slice(6)) as T;
      } catch {
        // skip
      }
    }
  },
};

export { ApiError };
