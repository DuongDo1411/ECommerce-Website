/**
 * Phân loại phản hồi của `/api/auth/activate` cho trang kích hoạt.
 *
 * Tách khỏi component vì đây là chỗ dễ sai mà hậu quả im lặng: vứt token khi gặp lỗi tạm
 * thời làm người dùng mất luôn liên kết trong mail và phải đi xin liên kết mới, dù nguyên
 * nhân chỉ là mạng chập chờn hay một lượt 500. Ngược lại, giữ token sau khi server đã kết
 * luận nó chết thì trang mời người dùng bấm lại một thứ không bao giờ chạy được.
 */

export type ActivationOutcome = "activated" | "invalid" | "taken" | "retryable";

/**
 * `status` là null khi request không nhận được phản hồi nào — mạng đứt, timeout, DNS hỏng.
 *
 * 429 xếp cùng nhóm với 5xx chứ không cùng nhóm 4xx: nó là lời hẹn "thử lại sau", không phải
 * kết luận về token.
 */
export function classifyActivationStatus(
  status: number | null,
): ActivationOutcome {
  if (status === null) return "retryable";
  if (status >= 200 && status < 300) return "activated";
  if (status === 429) return "retryable";
  // 409 nghĩa là email đã bị một tài khoản khác loại chiếm. Token chết hẳn, và gửi lại không
  // cứu được: người dùng phải đăng ký lại bằng email khác.
  if (status === 409) return "taken";
  if (status >= 400 && status < 500) return "invalid";
  return "retryable";
}

/** Chỉ vứt token khi server đã kết luận dứt khoát về nó. */
export function shouldDiscardActivationToken(
  outcome: ActivationOutcome,
): boolean {
  return outcome !== "retryable";
}
