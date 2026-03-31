import { NextResponse } from "next/server";

export function paginated<T>(
  data: T[],
  meta: { total: number; limit: number; offset: number },
) {
  return NextResponse.json({ data, meta });
}

export function single<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function error(message: string, code: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
