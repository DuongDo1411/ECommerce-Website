import type { IUser } from "@/model/user.model";

/**
 * A saved delivery address as stored on a User document (Mongoose subdocument).
 *
 * Derived from {@link IUser} so the field list stays in sync with the schema.
 * A persisted subdocument always carries an `_id`, so it is narrowed to be
 * required here (the schema interface marks it optional for the create case).
 */
export type AddressSubdoc = NonNullable<IUser["addresses"]>[number] & {
  _id: { toString(): string };
};
