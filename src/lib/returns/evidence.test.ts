import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cloudinary", () => ({
  uploadCloudinaryAsset: vi.fn(),
  deleteCloudinaryAssets: vi.fn().mockResolvedValue(undefined),
}));

import {
  deleteCloudinaryAssets,
  uploadCloudinaryAsset,
} from "@/lib/cloudinary";
import { collectEvidence } from "./evidence";

const uploadMock = vi.mocked(uploadCloudinaryAsset);
const deleteMock = vi.mocked(deleteCloudinaryAssets);

function jpeg(name: string) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], name, {
    type: "image/jpeg",
  });
}

describe("returns/evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes earlier uploads when a later upload rejects", async () => {
    uploadMock
      .mockResolvedValueOnce({ url: "https://cdn.test/one", publicId: "one" })
      .mockRejectedValueOnce(new Error("cloudinary unavailable"));
    const form = new FormData();
    form.append("files", jpeg("one.jpg"));
    form.append("files", jpeg("two.jpg"));

    const result = await collectEvidence(form);

    expect(result).toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: "upload_failed" }) }),
    );
    expect(deleteMock).toHaveBeenCalledWith(["one"]);
  });
});
