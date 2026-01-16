export function asMock<T>(value: Partial<T>): T {
  return value as T;
}

export async function readJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}
