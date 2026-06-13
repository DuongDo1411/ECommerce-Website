# Fix Plan (vòng 2): Sửa lỗi sau review responsive Vendor

> Dành cho Codex. Đây là các lỗi phát hiện khi review code responsive vừa làm. Chỉ sửa đúng các mục dưới, **không refactor thêm**.
>
> Ràng buộc cũ vẫn áp dụng: giữ `bg-linear-to-*`, dùng `motion/react`, không đổi logic data/redux/socket, giữ theme. Sau khi sửa chạy `npm run build`.

---

## FIX 1 — 🔴 Lỗi encoding (mojibake) ký tự tiếng Việt

Có vài chuỗi tiếng Việt/ký tự bị ghi sai encoding (UTF-8 bị hỏng), hiển thị ra ký tự rác.

### 1a. `src/app/orders/page.tsx` (dòng ~820)
Hiện tại:
```tsx
<p className="text-sm">Äang táº£i Ä‘Æ¡n hÃ ng...</p>
```
Sửa thành:
```tsx
<p className="text-sm">Đang tải đơn hàng...</p>
```

### 1b. `src/app/component/Vendor/Dashboard.tsx` — ĐÃ SỬA
Literal `"â€”"` → `"—"` (dòng ~344, card mobile) đã được sửa thủ công. **Bỏ qua, không cần làm lại.**

### 1c. Quét toàn bộ phần code vừa sửa
Tìm và sửa mọi mojibake còn sót. Các pattern dấu hiệu hỏng UTF-8 cần grep:
`â€`, `Ã¢`, `áº`, `Ä‘`, `Ã `, `Ã©`, `Æ¡`, `ï¿½`
Đặc biệt rà các file Codex đã đụng ở vòng trước: `src/app/component/Admin/*.tsx`, `src/app/component/Navbar.tsx`, `src/app/shop/[shopId]/ShopDetailClient.tsx`, `src/app/orders/page.tsx`.
**Quan trọng:** khi sửa, đảm bảo file được lưu ở **UTF-8 (không BOM)** để không tái hỏng.

---

## FIX 2 — 🟠 Messages mobile: 2 header chồng nhau

### Vấn đề
Trong `src/app/component/Vendor/VendorMessages.tsx`, ở nhánh chat mobile Codex thêm 1 thanh back-bar riêng:
```tsx
<div className="flex items-center gap-2 border-b ... px-3 py-2 md:hidden">
  <button onClick={handleMobileBack} ...><FaArrowLeft/></button>
  <span ...>{other?.shopName || other?.name || "Chat"}</span>
</div>
<div className="min-h-0 flex-1">
  <ChatWindow ... />
</div>
```
Nhưng `ChatWindow` (`src/app/component/Chat/ChatWindow.tsx`) **đã tự render 1 header** (avatar + tên + có thể nút đóng). Kết quả trên mobile: **2 thanh header xếp chồng**, lặp tên cửa hàng → xấu.

### Giải pháp: gộp nút back vào header của ChatWindow
1. Thêm prop optional `onBack` vào `ChatWindow`:
   ```tsx
   export default function ChatWindow({
     conversationId, currentUserId, title = "Chat", avatarUrl,
     onClose, onBack, embedded = false,
   }: {
     // ...thêm:
     onBack?: () => void;
   }) {
   ```
2. Trong header của `ChatWindow` (khối `<div className="relative flex h-16 ...">`), thêm nút back **chỉ hiện mobile** ở mép trái, trước cụm avatar:
   ```tsx
   {onBack && (
     <button
       type="button"
       onClick={onBack}
       className="relative mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-gray-300 transition hover:bg-white/[0.08] hover:text-white md:hidden"
       aria-label="Quay lại danh sách"
     >
       <FaArrowLeft size={15} />
     </button>
   )}
   ```
   (import `FaArrowLeft` từ `react-icons/fa` trong ChatWindow — file này hiện đã import `FaPaperPlane, FaTimes`, thêm `FaArrowLeft` vào.)
   Đặt nút này bên trong `<div className="relative flex min-w-0 items-center gap-3">` ngay trước avatar, hoặc làm anh em cùng cấp đứng trước cụm đó. Miễn là nằm bên trái tên.
3. Trong `VendorMessages.tsx`:
   - **Xoá** thanh back-bar `md:hidden` riêng (cả khối `<div className="flex items-center gap-2 border-b ... md:hidden">...</div>`).
   - Truyền `onBack={handleMobileBack}` vào `<ChatWindow .../>`.
   - Kết quả JSX nhánh chat gọn lại:
     ```tsx
     {activeConversation ? (
       <div className="min-h-0 flex-1">
         <ChatWindow
           conversationId={activeConversation._id}
           currentUserId={currentUserId}
           title={other?.shopName || other?.name || "Chat"}
           avatarUrl={other?.image}
           onBack={handleMobileBack}
           embedded
         />
       </div>
     ) : (
       <div className="flex h-full items-center justify-center text-sm text-gray-500">
         Chọn một cuộc trò chuyện
       </div>
     )}
     ```
4. Vì `onBack` chỉ render nút khi có truyền vào VÀ chỉ hiện `md:hidden`, nên:
   - Desktop: không có nút back (đúng — desktop dùng 2 cột).
   - Mobile: nút back nằm gọn trong header chat, **chỉ 1 header**.
5. Lưu ý không phá `ChatButton.tsx` / chỗ khác dùng `ChatWindow`: vì `onBack` là optional, các nơi không truyền vẫn chạy như cũ. Kiểm tra `ChatButton.tsx` (popup chat nổi) vẫn truyền `onClose` bình thường, không cần `onBack`.

### Kết quả mong đợi
Mobile: mở 1 hội thoại → 1 header duy nhất có `← avatar Tên` → bấm ← về danh sách. Desktop không đổi.

---

## FIX 3 — 🟡 Kiểm tra thay đổi logic ngoài phạm vi ở VendorOrders

Trong `src/app/component/Vendor/VendorOrders.tsx`, hàm `allowedTransitions` có thêm dòng:
```tsx
if (current === "shipped") return ["delivered", "cancelled"];
```
Đây là **thay đổi hành vi** (cho phép vendor tự chuyển `shipped → delivered`), KHÔNG thuộc task responsive.

**Hành động:** KHÔNG tự ý sửa/revert. Chỉ **báo lại** trong phần tổng kết: nêu rõ thay đổi này tồn tại để chủ dự án quyết định. (Nếu trạng thái "delivered" do GHN webhook tự cập nhật thì việc cho vendor set tay có thể gây lệch — cần xác nhận nghiệp vụ.)

> Lý do để Codex không tự revert: thay đổi này có thể là việc làm có chủ đích từ trước, không phải lỗi.

---

## Thứ tự & kiểm tra
1. FIX 1 (encoding) — nhanh, ít rủi ro.
2. FIX 2 (Messages double-header).
3. FIX 3 — chỉ báo cáo, không sửa.
4. Chạy `npm run build`, đảm bảo không lỗi type/JSX.
5. Test mobile (DevTools 390px): mở Messages → chọn hội thoại → chỉ 1 header, nút ← hoạt động; trang Orders không còn chữ rác khi loading.
</content>
