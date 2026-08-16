import { describe, expect, it } from "vitest";

import {
  classifyActivationStatus,
  shouldDiscardActivationToken,
} from "./activationOutcome";

// Token kích hoạt chỉ tồn tại một bản duy nhất, nằm trong liên kết đã gửi tới hộp thư. Vứt
// nó vì một lỗi tạm thời là bắt người dùng đi xin liên kết mới cho tình huống mà chỉ cần bấm
// lại là xong. Đây là chỗ quyết định điều đó, nên nó được kiểm riêng.
describe("phân loại phản hồi kích hoạt", () => {
  it("2xx là kích hoạt xong", () => {
    expect(classifyActivationStatus(200)).toBe("activated");
    expect(classifyActivationStatus(204)).toBe("activated");
  });

  it("400 là kết luận dứt khoát rằng token đã chết", () => {
    expect(classifyActivationStatus(400)).toBe("invalid");
  });

  it("429 là lời hẹn thử lại, không phải kết luận về token", () => {
    expect(classifyActivationStatus(429)).toBe("retryable");
  });

  it("5xx là lỗi phía máy chủ, token vẫn nguyên", () => {
    expect(classifyActivationStatus(500)).toBe("retryable");
    expect(classifyActivationStatus(503)).toBe("retryable");
  });

  it("không nhận được phản hồi nào thì coi là thử lại được", () => {
    expect(classifyActivationStatus(null)).toBe("retryable");
  });
});

describe("quyết định giữ hay vứt token", () => {
  it("vứt với 400 và với 2xx", () => {
    expect(shouldDiscardActivationToken(classifyActivationStatus(400))).toBe(
      true,
    );
    expect(shouldDiscardActivationToken(classifyActivationStatus(200))).toBe(
      true,
    );
  });

  it("giữ với 429, 500 và lỗi mạng", () => {
    for (const status of [429, 500, null]) {
      expect(
        shouldDiscardActivationToken(classifyActivationStatus(status)),
        String(status),
      ).toBe(false);
    }
  });
});
