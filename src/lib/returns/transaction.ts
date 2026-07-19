import mongoose, { type ClientSession } from "mongoose";

export class ReturnOperationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ReturnOperationError";
  }
}

export async function withReturnTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;
  let completed = false;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
      completed = true;
    });
  } finally {
    await session.endSession();
  }

  if (!completed) {
    throw new Error("Return transaction completed without a result");
  }
  return result as T;
}
