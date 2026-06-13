# Plan: Cải thiện Mobile Responsive cho trang Quản lý Vendor

> Tài liệu này dành cho coding agent (codex). Mục tiêu: làm cho toàn bộ khu vực **Vendor management** đẹp & dùng được trên mobile (≤ 640px) và tablet (641–1024px), không phá vỡ desktop.
>
> **Ràng buộc quan trọng:**
> - Đây là Next.js bản tuỳ biến — **đọc `node_modules/next/dist/docs/`** trước khi đụng vào routing/API. Phần plan này chỉ sửa **component UI client-side**, không đụng API/route nên rủi ro thấp.
> - Dự án dùng **Tailwind** với cú pháp gradient mới `bg-linear-to-*` (KHÔNG dùng `bg-gradient-to-*`). Giữ nguyên quy ước này.
> - Dùng `motion/react` (không phải `framer-motion`).
> - Chỉ thay đổi className / cấu trúc layout. **Không đổi logic fetch, redux, socket, handler.**
> - Giữ nguyên màu sắc / theme emerald-on-dark hiện có. Đây là refactor responsive, không phải redesign.

---

## 0. Breakpoint & nguyên tắc chung

Tailwind breakpoints dùng trong dự án: `sm=640`, `md=768`, `lg=1024`, `xl=1280`.

Sidebar của Vendor panel ẩn dưới `lg` (xem `VendorDashBoard.tsx`). Vì vậy:
- **Mobile thực sự** = `< lg` (vì sidebar biến thành drawer ở mốc `lg`).
- Khi đặt layout 2 cột / bảng desktop, dùng mốc **`lg`** cho nội dung bên trong panel (vùng content chỉ rộng full khi `< lg`).

Nguyên tắc khi sửa:
1. **Touch target ≥ 44px**: nút bấm trên mobile padding tối thiểu `py-2.5`/`h-11`.
2. **Không tràn ngang**: mọi bảng phải có `overflow-x-auto` HOẶC chuyển sang card. Tránh `whitespace-nowrap` cố định gây tràn nếu không bọc scroll.
3. **Số tiền/giá trị dài**: tránh `truncate` cho số tiền — cho phép xuống dòng hoặc giảm `text-size` ở mobile (`text-lg sm:text-xl`).
4. **Padding vùng content**: dùng thang `p-4 sm:p-6 lg:p-10` thay vì `p-6 md:p-10` cứng (giảm padding trên màn rất nhỏ).
5. **Safe area**: thêm `pb-[env(safe-area-inset-bottom)]` cho các thanh cố định ở đáy (nếu có) và input chat.

---

## 1. 🔴 P0 — `src/app/component/Vendor/VendorMessages.tsx` (QUAN TRỌNG NHẤT)

### Vấn đề hiện tại
```tsx
<div className="h-[calc(100vh-5rem)] ...">
  <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_1fr]">
    <div> {/* panel danh sách + search */} </div>
    <div> {/* ChatWindow */} </div>
  </div>
</div>
```
Trên mobile (`grid-cols-1`), **cả danh sách hội thoại VÀ cửa sổ chat xếp chồng dọc** trong 1 container cao cố định → cả hai bị bóp méo, cuộn lộn xộn, không dùng được. Đây là lỗi "xấu" rõ nhất.

### Giải pháp: Master–Detail pattern
Trên `< md`: hiển thị **một trong hai** — danh sách HOẶC khung chat — với nút quay lại. Trên `≥ md`: giữ nguyên 2 cột như hiện tại.

#### Bước thực hiện
1. Thêm state để biết mobile đang xem gì:
   ```tsx
   // mobileView: 'list' khi chưa chọn / bấm back; 'chat' khi đã chọn 1 hội thoại
   const [mobileView, setMobileView] = useState<"list" | "chat">("list");
   ```
2. Khi `handleSelect(conversation)` được gọi → ngoài logic hiện có, set `setMobileView("chat")`.
3. Thêm hàm back: `const handleMobileBack = () => setMobileView("list");`
4. Đổi layout:
   - Container ngoài giữ `h-[calc(100vh-5rem)]`.
   - Panel danh sách (cột trái): thêm class điều khiển hiển thị theo breakpoint:
     ```tsx
     className={`min-h-0 flex flex-col border-r border-white/10 bg-black/20
       md:flex
       ${mobileView === "chat" ? "hidden" : "flex"}`}
     ```
     và bỏ width cố định cũ — ở mobile panel chiếm full width (grid 1 cột), ở `md` dùng cột `320px`. Giữ `md:grid-cols-[320px_1fr]` nhưng để 2 con `<div>` tự ẩn/hiện bằng `hidden md:flex`.
   - Panel chat (cột phải):
     ```tsx
     className={`min-h-0 flex-col md:flex
       ${mobileView === "chat" ? "flex" : "hidden"}`}
     ```
5. **Nút Back trên mobile**: truyền `onBack` vào `ChatWindow` hoặc render 1 header riêng phía trên `ChatWindow` chỉ hiện `< md`:
   - Cách gọn: bọc `ChatWindow` và thêm 1 thanh nút back `md:hidden` ngay trên nó:
     ```tsx
     <div className="flex md:hidden items-center gap-2 border-b border-white/10 bg-[#101827] px-3 py-2">
       <button onClick={handleMobileBack} className="grid h-9 w-9 place-items-center rounded-xl text-gray-300 hover:bg-white/10">
         <FaArrowLeft size={16} />
       </button>
       <span className="text-sm font-semibold text-white truncate">
         {other?.shopName || other?.name || "Chat"}
       </span>
     </div>
     ```
     (import `FaArrowLeft` từ `react-icons/fa`)
   - Lưu ý: `ChatWindow` đã có prop `onClose` + render nút đóng. Có thể tái dùng: truyền `onClose={handleMobileBack}` nhưng như vậy nút sẽ hiện cả desktop. Nên KHÔNG dùng `onClose` cho mục đích back; làm thanh back riêng `md:hidden` như trên là sạch nhất.
6. **Khi không có hội thoại nào được chọn trên mobile**: vì mặc định `mobileView="list"`, người dùng luôn thấy danh sách trước → tốt. Bỏ trạng thái "Chọn một cuộc trò chuyện" trên mobile (nó chỉ cần cho desktop). Khối placeholder đó đặt trong panel chat nên ở mobile sẽ bị ẩn theo `mobileView` — OK, không cần sửa thêm.
7. Đảm bảo header của panel danh sách (search + filter "Tất cả/Chưa đọc") nằm trong phần `flex flex-col`, còn `ConversationList` có `flex-1 overflow-y-auto` để cuộn độc lập. Hiện `ConversationList` đã có `min-h-0 flex-1 overflow-y-auto` — chỉ cần panel cha là `flex flex-col` (đang là `div` thường, hãy đổi thành `flex flex-col`).

### Kết quả mong đợi
- Mobile: mở Messages → thấy danh sách full màn → bấm 1 hội thoại → chuyển sang khung chat full màn có nút ← back → bấm back về lại danh sách.
- Desktop (`≥ md`): không đổi, vẫn 2 cột song song.

---

## 2. 🟠 P1 — `src/app/component/Vendor/Dashboard.tsx`

### 2.1. Bảng "Đơn hàng gần đây" tràn ngang trên mobile
Hiện dùng `<table>` trong `overflow-x-auto`. Trên mobile bảng 5 cột bị bóp/tràn, xấu.

**Giải pháp:** giữ bảng cho `≥ sm`, thêm danh sách card cho `< sm`.
- Bọc `<table>` hiện tại trong `<div className="hidden sm:block overflow-x-auto">`.
- Thêm khối card `sm:hidden space-y-2` lặp qua `data.recentOrders`, mỗi đơn 1 card nhỏ:
  ```tsx
  <div className="sm:hidden space-y-2">
    {data.recentOrders.map((order) => (
      <div key={order._id} className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-gray-300">#{String(order._id).slice(-6).toUpperCase()}</span>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${STATUS_COLORS[order.orderStatus]}22`,
              color: STATUS_COLORS[order.orderStatus] || "#9ca3af",
            }}
          >
            {STATUS_LABELS[order.orderStatus] || order.orderStatus}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-sm text-gray-200 truncate max-w-[55%]">{order.buyer?.name || "—"}</span>
          <span className="text-sm font-medium text-emerald-400">{formatVND(order.totalAmount)}</span>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">{formatDate(order.createdAt)}</p>
      </div>
    ))}
  </div>
  ```
- Tái dùng đúng `STATUS_COLORS` / `STATUS_LABELS` đã có để badge đồng bộ màu.

### 2.2. KPI cards — giá trị tiền bị truncate
Hiện: `<p className="text-white font-bold text-xl mt-1 truncate">{card.value}</p>`.
Với "Doanh thu tháng này" = chuỗi VND dài → bị cắt mất số.

**Giải pháp:**
- Đổi thành `text-base sm:text-lg xl:text-xl` và bỏ `truncate`, thêm `break-words leading-tight`. Hoặc giữ `truncate` nhưng thêm `title={card.value}`.
- Grid KPI hiện `grid-cols-2 xl:grid-cols-3`. Tốt cho mobile (2 cột). Cân nhắc thêm mốc `sm:grid-cols-3` cho tablet để đỡ trống — tuỳ chọn, không bắt buộc.

### 2.3. Charts row chỉ breakpoint ở `xl`
Hiện `grid-cols-1 xl:grid-cols-3` → từ 0 đến 1279px luôn 1 cột (biểu đồ doanh thu chồng lên donut). Chấp nhận được trên mobile, nhưng trên tablet/`lg` hơi phí. Ưu tiên thấp — **chỉ sửa nếu còn thời gian**: đổi donut + revenue chart sang `lg:grid-cols-3` để tablet ngang tận dụng tốt hơn. Kiểm tra `ResponsiveContainer` vẫn co giãn đúng (đã dùng `width="100%"`).

### 2.4. Header padding
Component này render bên trong vùng content của `VendorDashBoard` (đã có padding). Không cần thêm padding. Bỏ qua.

---

## 3. 🟡 P2 — `src/app/component/Vendor/VendorDashBoard.tsx` (shell)

Shell đã có: top bar mobile (`lg:hidden`), drawer trượt + overlay, sidebar desktop. Khá tốt. Tinh chỉnh:

### 3.1. Padding vùng content
Hiện: `className="flex-1 p-6 md:p-10 mt-20 lg:mt-0 ..."`.
- Đổi `p-6` → `p-4 sm:p-6 lg:p-10` để màn rất nhỏ (360px) đỡ chật.
- `mt-20` để chừa chỗ cho top bar mobile (top bar `py-4` + nội dung ~ 64–72px). Kiểm tra top bar thực tế cao bao nhiêu; nếu top bar cao ~64px thì `mt-16` đủ, `mt-20` an toàn. Giữ `mt-20 lg:mt-0`.

### 3.2. Drawer width trên màn rất nhỏ
Drawer mobile: `w-72` (288px). Trên iPhone SE (375px) còn ~87px lộ nền — OK. Không cần đổi. Nếu muốn chắc: `w-72 max-w-[80vw]`.

### 3.3. Top bar mobile — thêm badge unread cho nút menu (tuỳ chọn)
Hiện badge unread chỉ hiện trong menu item "Messages". Khi drawer đóng, user không thấy có tin chưa đọc. **Tuỳ chọn (nice-to-have):** hiện 1 chấm đỏ nhỏ trên icon `AiOutlineMenu` khi `totalUnread > 0`:
```tsx
<div className="relative">
  <AiOutlineMenu size={28} />
  {totalUnread > 0 && (
    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-black" />
  )}
</div>
```

---

## 4. 🟡 P2 — `src/app/component/Vendor/VendorProducts.tsx` (Edit Modal)

Trang list đã responsive tốt (desktop table + mobile cards + stats grid `grid-cols-3`). Chỉ cần soi modal edit:

### 4.1. Modal trên màn nhỏ
Modal: `max-w-2xl`, body `max-h-[76vh] overflow-y-auto`, padding `px-6`.
- Trên mobile padding `px-6` hơi rộng → đổi header & body sang `px-4 sm:px-6`.
- `max-h-[76vh]` có thể che mất nút submit khi bàn phím ảo bật. Đảm bảo modal wrapper có `py-4 sm:py-6` và body `max-h-[78vh] sm:max-h-[76vh]`. Đủ.

### 4.2. Grid ảnh `grid-cols-4`
4 ô upload ảnh trên màn 360px → mỗi ô ~70px, hơi nhỏ nhưng vẫn bấm được. Giữ `grid-cols-4` (đổi sang 2 cột sẽ làm modal dài thêm). **Không đổi.**

### 4.3. Stats grid mobile
`grid-cols-3` cho 3 thẻ thống kê — trên 360px mỗi thẻ chật, số `text-2xl` + icon `w-10 h-10` có thể tràn. **Giải pháp nhẹ:** giảm icon & font ở mobile — số `text-xl sm:text-2xl`, icon `w-9 h-9 sm:w-10 sm:h-10`, padding `p-3 sm:p-4`. Giữ 3 cột.

---

## 5. 🟢 P3 — `src/app/component/Vendor/VendorOrders.tsx`

Đã làm rất tốt: `hidden lg:block` table + `lg:hidden` cards. Chỉ rà soát nhỏ:

### 5.1. Toast vị trí cố định
Toast: `fixed top-6 right-6`. Trên mobile có thể đè lên top bar của shell (cũng `fixed top-0`). **Giải pháp:** đổi `top-6` → `top-20 lg:top-6`; và `right-6` → `right-4 lg:right-6`. Thêm `max-w-[calc(100vw-2rem)]` để không tràn.

### 5.2. Hàng filter dropdown
`flex flex-wrap gap-2` — đã wrap tốt. Các `<select>` `text-xs px-3 py-2`. OK. Không đổi.

---

## 6. 🟢 P3 — `src/app/component/Vendor/VendorShopView.tsx`

Đã responsive khá tốt (`flex-col sm:flex-row`, `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`). Tinh chỉnh nhỏ:

### 6.1. Toast trùng vị trí top bar (giống 5.1)
`fixed top-6 right-6` → `top-20 lg:top-6 right-4 lg:right-6`.

### 6.2. Hero hint text
Dòng `Hover vào logo để đổi ảnh • Nhấn "Đổi ảnh nền"...` — trên mobile không có hover. **Giải pháp:** đổi text thân thiện mobile, vd `Chạm vào logo để đổi ảnh • Nhấn "Đổi ảnh nền" để thay background`. Nhỏ, tuỳ chọn.

### 6.3. Nút "Đổi ảnh nền" `absolute top-3 right-3`
Trên mobile vẫn ổn (nằm trong hero). Không đổi.

---

## 7. Thứ tự thực hiện đề xuất

1. **P0 — VendorMessages master/detail** (impact lớn nhất, đây là chỗ "xấu" rõ ràng).
2. **P1 — Dashboard** (bảng recent orders → card; KPI truncate).
3. **P2 — Shell padding + VendorProducts modal padding/stats**.
4. **P3 — Toast positioning (Orders + ShopView) + tinh chỉnh nhỏ**.

Mỗi mục là 1 commit riêng để dễ review:
- `fix(vendor): mobile master-detail layout for Messages`
- `fix(vendor): responsive recent-orders & KPI on Dashboard`
- `fix(vendor): tighten mobile padding on shell & product edit modal`
- `fix(vendor): reposition toasts below mobile topbar`

---

## 8. Checklist QA (test trên Chrome DevTools device toolbar)

Kiểm ở các kích thước: **360px (Galaxy S), 390px (iPhone 12), 768px (iPad), 1024px, 1280px+**.

- [ ] **Messages**: mobile thấy list full màn; chọn hội thoại → chat full màn + nút back hoạt động; desktop vẫn 2 cột; cuộn tin nhắn & cuộn danh sách độc lập, không cuộn cả trang.
- [ ] **Messages**: bàn phím ảo bật không che mất ô nhập (input chat vẫn thấy).
- [ ] **Dashboard**: KPI hiển thị đủ số tiền (không bị cắt); bảng đơn gần đây → card trên mobile, không tràn ngang.
- [ ] **Dashboard**: biểu đồ doanh thu & donut không vỡ, không tràn.
- [ ] **Products**: list cards mobile OK; modal edit mở full, scroll mượt, nút Save luôn bấm được; stats 3 thẻ không tràn số.
- [ ] **Orders**: cards mobile OK; toast không đè top bar; filter wrap đẹp.
- [ ] **ShopView**: hero + grid sản phẩm + reviews co giãn đúng; toast không đè top bar.
- [ ] **Shell**: drawer mở/đóng mượt, overlay bấm để đóng; padding content không quá chật ở 360px; không có thanh cuộn ngang toàn trang ở bất kỳ breakpoint nào.
- [ ] Desktop (`≥ lg`): **không có regression** — mọi trang giữ nguyên như trước.

---

## 9. Lưu ý kỹ thuật cho codex

- KHÔNG đổi `bg-linear-to-*` thành `bg-gradient-to-*`.
- KHÔNG thêm thư viện mới. Dùng `react-icons` (đã có), `motion/react` (đã có).
- KHÔNG sửa logic trong `ChatWindow.tsx`, `ConversationList.tsx` — chỉ thêm thanh back `md:hidden` ở `VendorMessages.tsx` (component cha). Nếu buộc phải truyền prop `onBack` vào `ChatWindow`, thêm prop optional, không phá API cũ.
- Giữ nguyên toàn bộ data fetching, redux dispatch, socket events.
- Sau khi sửa, chạy `npm run build` (hoặc `next build`) để chắc không lỗi type/JSX.
</content>
