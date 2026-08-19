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

  // 409 phải tách khỏi 400. Cả hai đều làm token chết, nhưng 400 thì xin liên kết mới là cứu
  // được, còn 409 thì email đã thuộc về một tài khoản khác loại — mời gửi lại là mời người
  // dùng làm một việc chắc chắn thất bại.
  it("409 là email đã bị tài khoản khác loại chiếm, không phải token sai", () => {
    expect(classifyActivationStatus(409)).toBe("taken");
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
  it("vứt với 400, 409 và 2xx", () => {
    for (const status of [400, 409, 200]) {
      expect(
        shouldDiscardActivationToken(classifyActivationStatus(status)),
        String(status),
      ).toBe(true);
    }
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
