import type { IUser } from "@/model/user.model";

/**
 * A cart line as stored on a User document (Mongoose subdocument).
 *
 * Derived from {@link IUser}. In the write paths (add / update / remove) the
 * cart is never populated, so `product` is an `ObjectId` — which still exposes
 * `toString()`, the only thing these routes need to match it against an id.
 */
export type CartItemSubdoc = NonNullable<IUser["cart"]>[number];
