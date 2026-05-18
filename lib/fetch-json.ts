"use client";

export async function parseJsonResponse<T>(
  response: Response,
  fallbackMessage: string,
  source: string
): Promise<T> {
  const responseText = await response.text();

  if (!responseText) {
    throw new Error(fallbackMessage);
  }

  try {
    return JSON.parse(responseText) as T;
  } catch (error) {
    console.warn(`Could not parse ${source} response as JSON.`, {
      status: response.status,
      contentType: response.headers.get("content-type"),
      preview: responseText.slice(0, 180),
      error
    });
    throw new Error(fallbackMessage);
  }
}
