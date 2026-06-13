# Fix Plan (vòng 3): Sửa nốt các lỗi mobile responsive còn sót ở Vendor

> Dành cho Codex. Vòng 1 (`VENDOR_MOBILE_RESPONSIVE_PLAN.md`) và vòng 2 (`VENDOR_MOBILE_FIX_PLAN.md`) **đã hoàn thành** (master-detail Messages, drawer shell, KPI break-words, recent-orders → card, toast reposition, sửa mojibake, gộp back-button vào ChatWindow). Vòng này xử lý các lỗi **còn sót** mà 2 vòng trước chưa chạm tới.
>
> **Ràng buộc (giữ nguyên như các vòng trước):**
> - Đây là Next.js bản tuỳ biến — chỉ sửa **className / cấu trúc layout của component UI client-side**, KHÔNG đụng API/route/logic.
> - Giữ `bg-linear-to-*` (KHÔNG đổi sang `bg-gradient-to-*`). Dùng `motion/react`.
> - KHÔNG đổi logic fetch / redux / socket / handler. KHÔNG thêm thư viện.
> - Lưu file ở **UTF-8 (không BOM)**.
> - Sau khi sửa, chạy `npm run build` để chắc không lỗi type/JSX.
>
> Mỗi FIX nên là **1 commit riêng** để dễ review.

---

## FIX 1 — 🔴 P0: Khung Messages cao sai trên mobile (ô nhập tin bị khuất)

### Vấn đề (đã xác nhận trong code)
`src/app/component/Vendor/VendorMessages.tsx` dòng 138:
```tsx
<div className="h-[calc(100vh-5rem)] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
```

Chiều cao `100vh - 5rem` này **chỉ vừa khít desktop**. Lý do: shell `VendorDashBoard.tsx` (dòng 240) bọc mọi trang trong:
```tsx
className="flex-1 p-4 sm:p-6 lg:p-10 mt-20 lg:mt-0 ..."
```

Tính phần chiều cao bị "ăn" mất ở từng breakpoint:
| Breakpoint | Top bar (`mt-`) | Padding dọc (trên+dưới) | Tổng offset cần trừ |
|---|---|---|---|
| `< sm` (mobile) | `mt-20` = 5rem | `p-4` = 2rem | **7rem** |
| `sm`–`< lg` (tablet) | `mt-20` = 5rem | `p-6` = 3rem | **8rem** |
| `≥ lg` (desktop) | `mt-0` = 0 | `p-10` = 5rem | **5rem** |

→ Trên mobile khung Messages cao hơn vùng khả dụng **~2rem**, trên tablet **~3rem**. Hậu quả: khung chat tràn xuống dưới fold, cả trang phải cuộn, và **form nhập tin (`h-16` ở đáy `ChatWindow`) bị đẩy khuất**.

Thêm nữa: dùng `vh` (không phải `dvh`) → trên Safari/Chrome mobile, thanh địa chỉ động làm `100vh` lớn hơn vùng nhìn thấy thật, càng đẩy ô nhập tin xuống dưới thanh trình duyệt.

### Giải pháp: chiều cao responsive + `dvh`
Sửa dòng 138 thành:
```tsx
<div className="h-[calc(100dvh-7rem)] sm:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-5rem)] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
```

Giải thích:
- `dvh` (dynamic viewport height) co theo thanh trình duyệt mobile → ô nhập tin không bị che.
- 3 mốc khớp đúng bảng offset ở trên (mobile 7rem / tablet 8rem / desktop 5rem).
- `dvh` được Tailwind v4 + mọi trình duyệt hiện đại hỗ trợ. Desktop `lg:` giữ y như cũ (`-5rem`) nên **không regression**.

### Kết quả mong đợi
- Mobile/tablet: mở 1 hội thoại → khung chat vừa khít màn, **ô nhập tin luôn nhìn thấy**, không phải cuộn cả trang.
- Desktop: không đổi.

---

## FIX 2 — 🟠 P1: VendorProducts bị padding kép + dư chiều cao

### Vấn đề (đã xác nhận trong code)
Shell `VendorDashBoard.tsx` đã bọc mọi trang trong `flex-1 p-4 sm:p-6 lg:p-10`. Nhưng `src/app/component/Vendor/VendorProducts.tsx` lại **tự bọc thêm một lớp nữa**:

Dòng 259–262:
```tsx
<div
  className="w-full min-h-screen text-white"
  style={{ fontFamily: "'DM Sans', 'Sora', sans-serif" }}
>
```
Dòng 264 (ambient background):
```tsx
<div className="fixed inset-0 pointer-events-none z-0">
```
Dòng 269:
```tsx
<div className="relative z-10 w-full p-5 sm:p-8 lg:p-10">
```

Hậu quả trên mobile:
1. **Padding kép**: shell `p-4` (16px) + Products `p-5` (20px) = **36px mỗi bên**, trong khi Dashboard/Orders chỉ có 16px → nội dung Products hẹp hơn hẳn & lệch giao diện so với các trang anh em (rõ nhất ở 360px: vùng dùng được chỉ còn ~288px).
2. **`min-h-screen` thừa**: trang đã nằm trong vùng `flex-1` (đã cao tối thiểu full screen) → thêm `min-h-screen` tạo dư chiều cao, cuộn ra khoảng trống ở cuối.
3. **Ambient background có thể gây cuộn ngang**: các vòng blur `w-[500px]`/`w-[400px]` đặt ở `left-[20%]`/`right-[10%]` trong container `fixed inset-0` **không có** `overflow-hidden`. Vì `body` (xem `globals.css`) cũng không có `overflow-x: hidden` → trên màn nhỏ có nguy cơ xuất hiện thanh cuộn ngang.

### Giải pháp
1. Bỏ `min-h-screen` ở wrapper ngoài (dòng 259–262):
   ```tsx
   <div
     className="w-full text-white"
     style={{ fontFamily: "'DM Sans', 'Sora', sans-serif" }}
   >
   ```
2. Thêm `overflow-hidden` cho container ambient background (dòng 264):
   ```tsx
   <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
   ```
3. Bỏ padding nội bộ (dòng 269) — để dùng padding của shell, đồng bộ với Dashboard/Orders:
   ```tsx
   <div className="relative z-10 w-full">
   ```

> Giữ nguyên `fontFamily`, ambient background, và toàn bộ nội dung bên trong. Đây chỉ là gỡ lớp bọc thừa.

### Kết quả mong đợi
- Products có padding & bề rộng nội dung **giống hệt** Dashboard/Orders ở mọi breakpoint.
- Không còn khoảng trống dư ở cuối trang; **không có cuộn ngang** ở 360px.

### Kiểm tra bắt buộc
Mở DevTools 360px: xác nhận **không có thanh cuộn ngang** (kéo ngang không thấy gì lòi ra). Nếu vẫn còn, kiểm tra lại bước (2).

---

## FIX 3 — 🟡 P2: Dashboard — hàng "Đơn gần đây + Cảnh báo" chỉ tách cột ở `xl`

### Vấn đề
`src/app/component/Vendor/Dashboard.tsx` dòng 304:
```tsx
<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
```
và dòng 306:
```tsx
<div className="xl:col-span-2 bg-gray-900/60 border border-white/10 rounded-2xl p-5">
```

→ "Đơn hàng gần đây" và "Cảnh báo" **xếp dọc tới tận 1280px**. Trong khi hàng biểu đồ ngay phía trên (dòng 219) đã dùng `lg:grid-cols-3` (vòng 1). Không nhất quán: ở tablet/lg (1024–1279px) hàng dưới phí một nửa chiều ngang và trang bị kéo dài.

### Giải pháp: hạ mốc xuống `lg` cho đồng bộ
- Dòng 304: `xl:grid-cols-3` → `lg:grid-cols-3`
  ```tsx
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  ```
- Dòng 306: `xl:col-span-2` → `lg:col-span-2`
  ```tsx
  <div className="lg:col-span-2 bg-gray-900/60 border border-white/10 rounded-2xl p-5">
  ```

(Tuỳ chọn) Lưới KPI (dòng 201) hiện `grid-cols-2 xl:grid-cols-3` — có thể thêm mốc tablet cho đỡ trống:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
```
Chỉ làm nếu thấy hợp, không bắt buộc.

### Kết quả mong đợi
Từ `lg` (1024px) trở lên: đơn gần đây (2/3) + cảnh báo (1/3) nằm cạnh nhau như hàng biểu đồ. Mobile vẫn xếp dọc như cũ.

---

## FIX 4 — 🟢 P3 (tuỳ chọn): Safe-area cho ô nhập tin chat trên máy có "tai thỏ"

### Vấn đề
`src/app/component/Chat/ChatWindow.tsx` dòng 538–541, form nhập tin:
```tsx
<form
  onSubmit={handleSubmit}
  className="flex h-16 shrink-0 items-center gap-2.5 border-t border-white/[0.07] bg-[#101827] px-3"
>
```
Trên iPhone (home indicator) ở chế độ standalone/PWA, đáy form có thể nằm sát/khuất dưới thanh gesture.

### Giải pháp (an toàn, không phá ChatWindow ở chỗ khác)
Đổi `h-16` cố định → tự co + thêm safe-area padding:
```tsx
className="flex min-h-16 shrink-0 items-center gap-2.5 border-t border-white/[0.07] bg-[#101827] px-3 pb-[env(safe-area-inset-bottom)]"
```

> **Cẩn trọng:** `ChatWindow` là component dùng chung (còn dùng ở popup chat nổi `ChatButton`). `min-h-16` + safe-area bottom padding an toàn cho cả 2 ngữ cảnh (trên thiết bị không có safe-area thì `env()` = 0, không đổi gì). KHÔNG sửa logic, chỉ sửa className. Nếu không chắc, **bỏ qua FIX này** — nó chỉ là polish.

---

## FIX 5 — 🟢 P3 (tuỳ chọn): Căn giữa nội dung hero ShopView trên mobile

### Vấn đề
`src/app/component/Vendor/VendorShopView.tsx`: hero dùng `flex-col sm:flex-row items-center` (dòng 272) → trên mobile logo căn giữa nhưng khối info (tên shop + thống kê) lại căn trái, nhìn lệch.

### Giải pháp
Dòng 298, thêm `text-center sm:text-left` cho khối info:
```tsx
<div className="text-center sm:text-left">
```
Và khối thống kê bên trong (dòng 302) đảm bảo căn giữa trên mobile:
```tsx
<div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm text-gray-300">
```

Chỉ là polish, làm nếu còn thời gian.

---

## Thứ tự thực hiện đề xuất
1. **FIX 1** (Messages height) — impact cao nhất, đây là lỗi mobile rõ nhất còn lại.
2. **FIX 2** (Products padding kép) — gỡ lệch giao diện & cuộn ngang.
3. **FIX 3** (Dashboard bottom row) — nhất quán tablet/lg.
4. **FIX 4, 5** — polish, tuỳ chọn.

Gợi ý commit:
- `fix(vendor): correct Messages mobile height with dvh + per-breakpoint offset`
- `fix(vendor): remove double padding & min-h-screen on Products page`
- `fix(vendor): break Dashboard recent-orders/alerts row at lg`

---

## Checklist QA (Chrome DevTools device toolbar)
Test ở **360px, 390px, 768px, 1024px, 1280px+**.

- [ ] **Messages (FIX 1)**: mobile/tablet mở hội thoại → khung chat vừa khít, **ô nhập tin luôn thấy**, không cuộn cả trang; cuộn danh sách & cuộn tin nhắn độc lập; desktop 2 cột không đổi.
- [ ] **Products (FIX 2)**: padding & bề rộng nội dung **giống** Dashboard/Orders; **không có cuộn ngang** ở 360px; không dư khoảng trống cuối trang; modal edit vẫn mở/scroll bình thường.
- [ ] **Dashboard (FIX 3)**: từ 1024px, đơn gần đây + cảnh báo nằm cạnh nhau; mobile vẫn xếp dọc; KPI không bị cắt số tiền.
- [ ] **Orders / ShopView**: không regression (toast, card, filter wrap vẫn như cũ).
- [ ] **Toàn cục**: không có cuộn ngang ở bất kỳ breakpoint nào; desktop (`≥ lg`) mọi trang giữ nguyên.
- [ ] `npm run build` chạy sạch, không lỗi type/JSX.

---

## Lưu ý kỹ thuật cho Codex
- `dvh` là đơn vị hợp lệ trong Tailwind v4 arbitrary value (`h-[calc(100dvh-7rem)]`). Không cần thêm plugin.
- KHÔNG đổi `bg-linear-to-*` → `bg-gradient-to-*`.
- KHÔNG sửa logic data/redux/socket. Chỉ className & cấu trúc layout.
- FIX 4 đụng vào `ChatWindow.tsx` (component dùng chung) — chỉ sửa className form, không đổi prop/logic; nếu không chắc thì bỏ qua.
- Lưu UTF-8 (không BOM).
