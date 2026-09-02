/**
 * Product templates for the seeding script, one entry per category that actually has a working
 * category page (the 10 labels in `CategorySlider` on the homepage — "Other" is excluded because
 * it has no dedicated `/category?cat=` link anywhere in the app, so a seeded "Other" product would
 * only be reachable via the raw product-detail URL).
 *
 * Names are generic/no-brand on purpose — the plan explicitly forbids implying Nike/Apple/etc. or
 * claiming "chính hãng" for products nobody actually sourced from those brands.
 */

export type CategoryKey =
  | "Fashion & Lifestyle"
  | "Electronics & Gadgets"
  | "Home & Living"
  | "Beauty & Personal Care"
  | "Toys, Kids & Baby"
  | "Food & Grocery"
  | "Sports & Fitness"
  | "Automotive Accessories"
  | "Gifts & Handcrafts"
  | "Books & Stationery";

export const CATEGORY_KEYS: CategoryKey[] = [
  "Fashion & Lifestyle",
  "Electronics & Gadgets",
  "Home & Living",
  "Beauty & Personal Care",
  "Toys, Kids & Baby",
  "Food & Grocery",
  "Sports & Fitness",
  "Automotive Accessories",
  "Gifts & Handcrafts",
  "Books & Stationery",
];

/** A product's `sizeStock` sizes when it's wearable — clothing vs. shoes use different sets. */
export const CLOTHING_SIZES = ["S", "M", "L", "XL"] as const;
export const SHOE_SIZES = ["38", "39", "40", "41", "42"] as const;

export interface ProductTemplate {
  /** Vietnamese product name shown in the storefront. */
  name: string;
  isWearable: boolean;
  /** Only meaningful when `isWearable`; picks which size set this item uses. */
  sizeKind?: "clothing" | "shoe";
  /** English keyword used for the Pexels photo search. */
  imageKeyword: string;
}

export interface CategoryConfig {
  priceRange: [number, number];
  weightRangeG: [number, number];
  lengthRangeCm: [number, number];
  widthRangeCm: [number, number];
  heightRangeCm: [number, number];
  warranty: string;
  replacementDaysRange: [number, number];
  freeDeliveryChance: number;
  payOnDeliveryChance: number;
  detailPoints: (name: string) => string[];
  description: (name: string) => string;
  /** Keywords matched (case-insensitive, substring) against a vendor's `shopName` when the vendor
   *  has no existing products to infer a category from. */
  shopNameKeywords: string[];
  templates: ProductTemplate[];
}

const DEMO_NOTE =
  "Đây là dữ liệu minh họa phục vụ demo, không phải hàng thật đang bán.";

export const CATEGORY_CONFIG: Record<CategoryKey, CategoryConfig> = {
  "Fashion & Lifestyle": {
    priceRange: [120_000, 1_500_000],
    weightRangeG: [250, 700],
    lengthRangeCm: [25, 35],
    widthRangeCm: [20, 28],
    heightRangeCm: [5, 12],
    warranty: "Không bảo hành (hàng thời trang)",
    replacementDaysRange: [7, 15],
    freeDeliveryChance: 0.5,
    payOnDeliveryChance: 0.8,
    detailPoints: (name) => [
      `${name} form chuẩn, dễ phối đồ hằng ngày`,
      "Chất liệu bền, thoáng khí",
      DEMO_NOTE,
    ],
    description: (name) =>
      `${name} chất liệu bền, form chuẩn, phù hợp mặc hằng ngày. ${DEMO_NOTE}`,
    shopNameKeywords: ["fashion", "style", "boutique", "thời trang", "giày", "shoe", "nike", "adidas"],
    templates: [
      { name: "Áo thun cotton basic", isWearable: true, sizeKind: "clothing", imageKeyword: "plain cotton t-shirt" },
      { name: "Áo sơ mi tay dài công sở", isWearable: true, sizeKind: "clothing", imageKeyword: "long sleeve office shirt" },
      { name: "Quần jean slimfit", isWearable: true, sizeKind: "clothing", imageKeyword: "slim fit jeans" },
      { name: "Quần short kaki", isWearable: true, sizeKind: "clothing", imageKeyword: "khaki shorts" },
      { name: "Giày sneaker thể thao", isWearable: true, sizeKind: "shoe", imageKeyword: "sneakers shoes" },
      { name: "Giày lười da nam", isWearable: true, sizeKind: "shoe", imageKeyword: "men loafers shoes" },
      { name: "Dép sandal quai ngang", isWearable: true, sizeKind: "shoe", imageKeyword: "sandals" },
      { name: "Áo khoác gió 2 lớp", isWearable: true, sizeKind: "clothing", imageKeyword: "windbreaker jacket" },
      { name: "Váy liền hoa nhí", isWearable: true, sizeKind: "clothing", imageKeyword: "floral summer dress" },
      { name: "Chân váy xếp ly", isWearable: true, sizeKind: "clothing", imageKeyword: "pleated skirt" },
      { name: "Túi tote vải canvas", isWearable: false, imageKeyword: "canvas tote bag" },
      { name: "Ví da nam cầm tay", isWearable: false, imageKeyword: "leather wallet" },
      { name: "Thắt lưng da thật", isWearable: false, imageKeyword: "leather belt" },
      { name: "Mũ lưỡi trai thêu", isWearable: false, imageKeyword: "baseball cap" },
      { name: "Kính mát tròng phân cực", isWearable: false, imageKeyword: "polarized sunglasses" },
      { name: "Áo hoodie nỉ bông", isWearable: true, sizeKind: "clothing", imageKeyword: "hoodie sweatshirt" },
      { name: "Áo len cổ lọ", isWearable: true, sizeKind: "clothing", imageKeyword: "turtleneck sweater" },
    ],
  },

  "Electronics & Gadgets": {
    // Toàn bộ 16 mẫu trong danh mục này là phụ kiện tầm trung (tai nghe, sạc, chuột, loa mini,
    // ...), không có mẫu nào tầm cao (laptop, điện thoại, TV) — trần giá cũ 15 triệu khiến một
    // sợi cáp sạc hay đế điện thoại ngẫu nhiên rơi vào giá 10-14 triệu, phi thực tế khi xem demo.
    priceRange: [80_000, 3_000_000],
    weightRangeG: [150, 900],
    lengthRangeCm: [10, 30],
    widthRangeCm: [8, 22],
    heightRangeCm: [3, 12],
    warranty: "Bảo hành 12 tháng",
    replacementDaysRange: [3, 7],
    freeDeliveryChance: 0.4,
    payOnDeliveryChance: 0.6,
    detailPoints: (name) => [
      `${name} hoạt động ổn định, tương thích đa thiết bị`,
      "Bảo hành 12 tháng 1 đổi 1 lỗi nhà sản xuất",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, bảo hành 12 tháng. ${DEMO_NOTE}`,
    shopNameKeywords: ["tech", "electronic", "gadget", "digital", "điện tử", "công nghệ", "gigabyte"],
    templates: [
      { name: "Tai nghe bluetooth nhét tai", isWearable: false, imageKeyword: "wireless earbuds" },
      { name: "Tai nghe chụp tai chống ồn", isWearable: false, imageKeyword: "noise cancelling headphones" },
      { name: "Loa bluetooth mini di động", isWearable: false, imageKeyword: "portable bluetooth speaker" },
      { name: "Sạc dự phòng 10000mAh", isWearable: false, imageKeyword: "power bank" },
      { name: "Sạc dự phòng 20000mAh nhanh", isWearable: false, imageKeyword: "fast charging power bank" },
      { name: "Cáp sạc type-C bện dù", isWearable: false, imageKeyword: "usb c cable" },
      { name: "Bàn phím cơ có đèn LED", isWearable: false, imageKeyword: "mechanical keyboard rgb" },
      { name: "Chuột không dây văn phòng", isWearable: false, imageKeyword: "wireless mouse" },
      { name: "Webcam full HD 1080p", isWearable: false, imageKeyword: "webcam" },
      { name: "Đồng hồ thông minh đa năng", isWearable: false, imageKeyword: "smartwatch" },
      { name: "Vòng đeo tay theo dõi sức khỏe", isWearable: false, imageKeyword: "fitness tracker band" },
      { name: "Đèn LED để bàn chống cận", isWearable: false, imageKeyword: "led desk lamp" },
      { name: "Giá đỡ điện thoại đa năng", isWearable: false, imageKeyword: "phone stand holder" },
      { name: "Ổ cắm điện thông minh wifi", isWearable: false, imageKeyword: "smart plug" },
      { name: "Máy chiếu mini di động", isWearable: false, imageKeyword: "mini projector" },
      { name: "Loa soundbar mini cho TV", isWearable: false, imageKeyword: "soundbar speaker" },
    ],
  },

  "Home & Living": {
    priceRange: [80_000, 2_000_000],
    weightRangeG: [300, 2000],
    lengthRangeCm: [20, 45],
    widthRangeCm: [15, 35],
    heightRangeCm: [8, 25],
    warranty: "Bảo hành 6 tháng",
    replacementDaysRange: [7, 15],
    freeDeliveryChance: 0.3,
    payOnDeliveryChance: 0.8,
    detailPoints: (name) => [
      `${name} chất liệu an toàn, dễ vệ sinh`,
      "Phù hợp không gian nhà ở hiện đại",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, chất liệu bền, dễ vệ sinh, phù hợp mọi không gian. ${DEMO_NOTE}`,
    shopNameKeywords: ["home", "living", "house", "nội thất", "gia dụng"],
    templates: [
      { name: "Bộ chăn ga gối cotton", isWearable: false, imageKeyword: "bedding set" },
      { name: "Gối ôm cao su non", isWearable: false, imageKeyword: "memory foam pillow" },
      { name: "Thảm trải sàn phòng khách", isWearable: false, imageKeyword: "living room rug" },
      { name: "Rèm cửa sổ chống nắng", isWearable: false, imageKeyword: "window curtains" },
      { name: "Bộ nồi chống dính 3 món", isWearable: false, imageKeyword: "non stick cookware set" },
      { name: "Bình giữ nhiệt inox 500ml", isWearable: false, imageKeyword: "stainless steel thermos bottle" },
      { name: "Hộp đựng thực phẩm thủy tinh", isWearable: false, imageKeyword: "glass food container" },
      { name: "Kệ để đồ đa năng góc bếp", isWearable: false, imageKeyword: "kitchen corner shelf" },
      { name: "Máy lọc không khí mini", isWearable: false, imageKeyword: "mini air purifier" },
      { name: "Đèn ngủ cảm ứng để bàn", isWearable: false, imageKeyword: "touch night lamp" },
      { name: "Móc treo quần áo inox", isWearable: false, imageKeyword: "clothes hanger" },
      { name: "Thùng rác có nắp đạp", isWearable: false, imageKeyword: "pedal trash bin" },
      { name: "Khăn tắm cotton cao cấp", isWearable: false, imageKeyword: "cotton bath towel" },
      { name: "Nến thơm để phòng", isWearable: false, imageKeyword: "scented candle" },
      { name: "Bình hoa gốm sứ trang trí", isWearable: false, imageKeyword: "ceramic vase" },
    ],
  },

  "Beauty & Personal Care": {
    priceRange: [50_000, 800_000],
    weightRangeG: [80, 400],
    lengthRangeCm: [8, 18],
    widthRangeCm: [5, 12],
    heightRangeCm: [4, 10],
    warranty: "Không bảo hành (mỹ phẩm)",
    replacementDaysRange: [3, 7],
    freeDeliveryChance: 0.35,
    payOnDeliveryChance: 0.75,
    detailPoints: (name) => [
      `${name} dịu nhẹ, phù hợp da nhạy cảm`,
      "Kiểm nghiệm da liễu trước khi lưu hành",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, dịu nhẹ, phù hợp dùng hằng ngày. ${DEMO_NOTE}`,
    shopNameKeywords: ["beauty", "cosmetic", "skincare", "mỹ phẩm", "làm đẹp"],
    templates: [
      { name: "Sữa rửa mặt dịu nhẹ", isWearable: false, imageKeyword: "facial cleanser bottle" },
      { name: "Kem chống nắng SPF50", isWearable: false, imageKeyword: "sunscreen tube" },
      { name: "Serum dưỡng da vitamin C", isWearable: false, imageKeyword: "vitamin c serum bottle" },
      { name: "Mặt nạ giấy cấp ẩm", isWearable: false, imageKeyword: "sheet mask skincare" },
      { name: "Son dưỡng môi không màu", isWearable: false, imageKeyword: "lip balm" },
      { name: "Nước hoa hồng cân bằng da", isWearable: false, imageKeyword: "toner bottle skincare" },
      { name: "Dầu gội thảo dược", isWearable: false, imageKeyword: "herbal shampoo bottle" },
      { name: "Dầu xả phục hồi hư tổn", isWearable: false, imageKeyword: "hair conditioner bottle" },
      { name: "Sữa tắm dưỡng ẩm", isWearable: false, imageKeyword: "body wash bottle" },
      { name: "Kem dưỡng thể toàn thân", isWearable: false, imageKeyword: "body lotion jar" },
      { name: "Bàn chải đánh răng lông mềm", isWearable: false, imageKeyword: "toothbrush" },
      { name: "Máy massage mặt mini", isWearable: false, imageKeyword: "facial massager device" },
      { name: "Bộ cọ trang điểm 8 món", isWearable: false, imageKeyword: "makeup brush set" },
      { name: "Nước tẩy trang dịu nhẹ", isWearable: false, imageKeyword: "micellar water bottle" },
      { name: "Xịt khoáng cấp ẩm da", isWearable: false, imageKeyword: "facial mist spray" },
    ],
  },

  "Toys, Kids & Baby": {
    priceRange: [70_000, 900_000],
    weightRangeG: [150, 900],
    lengthRangeCm: [15, 35],
    widthRangeCm: [12, 28],
    heightRangeCm: [6, 20],
    warranty: "Đổi mới nếu lỗi nhà sản xuất",
    replacementDaysRange: [7, 15],
    freeDeliveryChance: 0.45,
    payOnDeliveryChance: 0.85,
    detailPoints: (name) => [
      `${name} chất liệu an toàn cho trẻ, không góc cạnh sắc`,
      "Kích thích vận động và tư duy cho bé",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, chất liệu an toàn cho trẻ nhỏ. ${DEMO_NOTE}`,
    shopNameKeywords: ["baby", "kids", "toy", "trẻ em", "em bé", "mẹ và bé"],
    templates: [
      { name: "Bộ xếp hình gỗ cho bé", isWearable: false, imageKeyword: "wooden blocks toy" },
      { name: "Xe đẩy đồ chơi mini", isWearable: false, imageKeyword: "toy stroller" },
      { name: "Gấu bông ôm ngủ", isWearable: false, imageKeyword: "teddy bear plush" },
      { name: "Bộ đồ chơi nấu ăn mini", isWearable: false, imageKeyword: "kids kitchen toy set" },
      { name: "Xe tập đi cho bé", isWearable: false, imageKeyword: "baby walker" },
      { name: "Bình sữa chống sặc", isWearable: false, imageKeyword: "baby bottle" },
      { name: "Yếm ăn dặm silicon", isWearable: false, imageKeyword: "baby bib silicone" },
      { name: "Bộ chăn ủ cho bé sơ sinh", isWearable: false, imageKeyword: "baby swaddle blanket" },
      { name: "Đồ chơi lắp ráp thông minh", isWearable: false, imageKeyword: "building blocks toy" },
      { name: "Bảng vẽ điện tử cho bé", isWearable: false, imageKeyword: "kids drawing tablet" },
      { name: "Xe điều khiển từ xa mini", isWearable: false, imageKeyword: "remote control car toy" },
      { name: "Bóng nảy vận động cho bé", isWearable: false, imageKeyword: "kids bounce ball" },
      { name: "Đồ chơi phát nhạc cho bé", isWearable: false, imageKeyword: "baby musical toy" },
      { name: "Balo mẫu giáo hình thú", isWearable: false, imageKeyword: "kids animal backpack" },
      { name: "Bộ bút màu sáp cho bé", isWearable: false, imageKeyword: "crayons kids" },
    ],
  },

  "Food & Grocery": {
    priceRange: [15_000, 350_000],
    weightRangeG: [150, 1200],
    lengthRangeCm: [10, 25],
    widthRangeCm: [8, 18],
    heightRangeCm: [4, 15],
    warranty: "Không áp dụng (thực phẩm)",
    replacementDaysRange: [1, 3],
    freeDeliveryChance: 0.3,
    payOnDeliveryChance: 0.85,
    detailPoints: (name) => [
      `${name} đóng gói kín, hạn sử dụng rõ ràng`,
      "Nguồn nguyên liệu chọn lọc",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, đóng gói kín, bảo quản nơi khô ráo. ${DEMO_NOTE}`,
    shopNameKeywords: ["food", "grocery", "thực phẩm", "đặc sản", "hoa quả", "trái cây", "fruit"],
    templates: [
      { name: "Trà túi lọc thảo mộc", isWearable: false, imageKeyword: "herbal tea bags" },
      { name: "Cà phê rang xay nguyên chất", isWearable: false, imageKeyword: "ground coffee bag" },
      { name: "Mật ong nguyên chất", isWearable: false, imageKeyword: "honey jar" },
      { name: "Hạt điều rang muối", isWearable: false, imageKeyword: "roasted cashew nuts" },
      { name: "Snack rong biển sấy giòn", isWearable: false, imageKeyword: "seaweed snack" },
      { name: "Ngũ cốc ăn sáng dinh dưỡng", isWearable: false, imageKeyword: "breakfast cereal bowl" },
      { name: "Mì Ý nguyên cám", isWearable: false, imageKeyword: "whole wheat pasta" },
      { name: "Sốt mì Ý cà chua", isWearable: false, imageKeyword: "tomato pasta sauce jar" },
      { name: "Dầu ô liu nguyên chất", isWearable: false, imageKeyword: "olive oil bottle" },
      { name: "Bột yến mạch ăn liền", isWearable: false, imageKeyword: "instant oatmeal" },
      { name: "Trái cây sấy dẻo thập cẩm", isWearable: false, imageKeyword: "dried fruit mix" },
      { name: "Nước ép trái cây đóng chai", isWearable: false, imageKeyword: "fruit juice bottle" },
      { name: "Gia vị lẩu thái đóng gói", isWearable: false, imageKeyword: "thai hotpot spice packet" },
      { name: "Bánh quy yến mạch", isWearable: false, imageKeyword: "oatmeal cookies" },
      { name: "Socola đen nguyên chất", isWearable: false, imageKeyword: "dark chocolate bar" },
    ],
  },

  "Sports & Fitness": {
    priceRange: [90_000, 3_000_000],
    weightRangeG: [200, 3000],
    lengthRangeCm: [15, 60],
    widthRangeCm: [12, 30],
    heightRangeCm: [6, 20],
    warranty: "Bảo hành 6 tháng",
    replacementDaysRange: [7, 10],
    freeDeliveryChance: 0.35,
    payOnDeliveryChance: 0.75,
    detailPoints: (name) => [
      `${name} bền, chịu lực tốt cho tập luyện thường xuyên`,
      "Thiết kế tối ưu cho vận động",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, hỗ trợ tập luyện hằng ngày. ${DEMO_NOTE}`,
    shopNameKeywords: ["sport", "fitness", "gym", "thể thao"],
    templates: [
      { name: "Thảm tập yoga chống trượt", isWearable: false, imageKeyword: "yoga mat" },
      { name: "Dây kháng lực tập gym", isWearable: false, imageKeyword: "resistance bands" },
      { name: "Găng tay tập gym", isWearable: false, imageKeyword: "gym gloves" },
      { name: "Bình nước thể thao", isWearable: false, imageKeyword: "sports water bottle" },
      { name: "Áo thun tập gym thấm hút mồ hôi", isWearable: true, sizeKind: "clothing", imageKeyword: "gym t-shirt" },
      { name: "Quần legging tập yoga", isWearable: true, sizeKind: "clothing", imageKeyword: "yoga leggings" },
      { name: "Giày chạy bộ êm chân", isWearable: true, sizeKind: "shoe", imageKeyword: "running shoes" },
      { name: "Bóng tập yoga", isWearable: false, imageKeyword: "yoga exercise ball" },
      { name: "Dây nhảy thể thao", isWearable: false, imageKeyword: "jump rope" },
      { name: "Con lăn massage cơ", isWearable: false, imageKeyword: "foam roller" },
      { name: "Túi đựng đồ tập gym", isWearable: false, imageKeyword: "gym duffel bag" },
      { name: "Băng quấn cổ tay tập gym", isWearable: false, imageKeyword: "wrist wrap gym" },
      { name: "Xe đạp tập tại nhà mini", isWearable: false, imageKeyword: "mini exercise bike" },
      { name: "Tạ tay điều chỉnh mức", isWearable: false, imageKeyword: "adjustable dumbbell" },
      { name: "Đồng hồ đo nhịp tim thể thao", isWearable: false, imageKeyword: "heart rate monitor watch" },
    ],
  },

  "Automotive Accessories": {
    priceRange: [60_000, 2_500_000],
    weightRangeG: [150, 2500],
    lengthRangeCm: [10, 40],
    widthRangeCm: [8, 30],
    heightRangeCm: [4, 20],
    warranty: "Bảo hành 6 tháng",
    replacementDaysRange: [5, 10],
    freeDeliveryChance: 0.3,
    payOnDeliveryChance: 0.7,
    detailPoints: (name) => [
      `${name} lắp đặt dễ dàng, tương thích đa số dòng xe`,
      "Chất liệu bền, chịu được thời tiết",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, lắp đặt dễ dàng, bền theo thời gian sử dụng. ${DEMO_NOTE}`,
    shopNameKeywords: ["auto", "car", "moto", "xe", "phụ tùng"],
    templates: [
      { name: "Bọc vô lăng da ô tô", isWearable: false, imageKeyword: "car steering wheel cover" },
      { name: "Thảm lót sàn ô tô 5D", isWearable: false, imageKeyword: "car floor mat" },
      { name: "Camera hành trình ô tô", isWearable: false, imageKeyword: "car dash camera" },
      { name: "Sạc nhanh ô tô 2 cổng", isWearable: false, imageKeyword: "car charger" },
      { name: "Nước hoa treo ô tô", isWearable: false, imageKeyword: "car air freshener" },
      { name: "Gối tựa đầu ô tô", isWearable: false, imageKeyword: "car headrest pillow" },
      { name: "Bao tay lái xe máy", isWearable: false, imageKeyword: "motorcycle handlebar cover" },
      { name: "Áo mưa bộ đi xe máy", isWearable: false, imageKeyword: "motorcycle raincoat" },
      { name: "Găng tay lái xe máy", isWearable: false, imageKeyword: "motorcycle gloves" },
      { name: "Ốp gương chiếu hậu chống chói", isWearable: false, imageKeyword: "car side mirror cover" },
      { name: "Bơm lốp điện di động", isWearable: false, imageKeyword: "portable tire inflator" },
      { name: "Móc treo đồ ô tô đa năng", isWearable: false, imageKeyword: "car seat hook organizer" },
      { name: "Khăn lau kính chuyên dụng", isWearable: false, imageKeyword: "microfiber cleaning cloth" },
      { name: "Đèn led trang trí nội thất xe", isWearable: false, imageKeyword: "car interior led light" },
      { name: "Giá đỡ điện thoại trên xe", isWearable: false, imageKeyword: "car phone mount" },
    ],
  },

  "Gifts & Handcrafts": {
    priceRange: [50_000, 700_000],
    weightRangeG: [100, 800],
    lengthRangeCm: [12, 30],
    widthRangeCm: [10, 22],
    heightRangeCm: [5, 15],
    warranty: "Không bảo hành (quà tặng thủ công)",
    replacementDaysRange: [5, 10],
    freeDeliveryChance: 0.35,
    payOnDeliveryChance: 0.75,
    detailPoints: (name) => [
      `${name} làm thủ công, mỗi sản phẩm có nét riêng`,
      "Phù hợp làm quà tặng dịp đặc biệt",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, làm thủ công tỉ mỉ, phù hợp làm quà tặng. ${DEMO_NOTE}`,
    shopNameKeywords: ["gift", "handmade", "craft", "quà tặng", "thủ công"],
    templates: [
      { name: "Hộp quà tặng handmade", isWearable: false, imageKeyword: "gift box handmade" },
      { name: "Thiệp chúc mừng thủ công", isWearable: false, imageKeyword: "handmade greeting card" },
      { name: "Vòng tay handmade đá tự nhiên", isWearable: false, imageKeyword: "natural stone bracelet" },
      { name: "Móc khóa gỗ khắc tên", isWearable: false, imageKeyword: "wooden keychain" },
      { name: "Tranh treo tường thủ công", isWearable: false, imageKeyword: "handmade wall art" },
      { name: "Nến thơm handmade", isWearable: false, imageKeyword: "handmade candle" },
      { name: "Sổ tay bìa da thủ công", isWearable: false, imageKeyword: "leather journal notebook" },
      { name: "Túi vải thêu tay", isWearable: false, imageKeyword: "embroidered fabric bag" },
      { name: "Đồ trang trí gốm sứ mini", isWearable: false, imageKeyword: "mini ceramic decor" },
      { name: "Khung ảnh gỗ handmade", isWearable: false, imageKeyword: "wooden photo frame" },
      { name: "Bộ ly sứ vẽ tay", isWearable: false, imageKeyword: "hand painted ceramic mug" },
      { name: "Hộp bút gỗ khắc laser", isWearable: false, imageKeyword: "wooden pen box" },
      { name: "Vòng cổ handmade phong cách", isWearable: false, imageKeyword: "handmade necklace" },
      { name: "Đèn lồng trang trí thủ công", isWearable: false, imageKeyword: "decorative paper lantern" },
      { name: "Set quà tặng sinh nhật", isWearable: false, imageKeyword: "birthday gift set" },
    ],
  },

  "Books & Stationery": {
    priceRange: [15_000, 250_000],
    weightRangeG: [80, 500],
    lengthRangeCm: [12, 25],
    widthRangeCm: [9, 20],
    heightRangeCm: [1, 6],
    warranty: "Không áp dụng (sách/văn phòng phẩm)",
    replacementDaysRange: [3, 7],
    freeDeliveryChance: 0.3,
    payOnDeliveryChance: 0.85,
    detailPoints: (name) => [
      `${name} chất lượng in ấn/hoàn thiện tốt`,
      "Phù hợp học tập và làm việc hằng ngày",
      DEMO_NOTE,
    ],
    description: (name) => `${name}, phù hợp học tập và làm việc hằng ngày. ${DEMO_NOTE}`,
    shopNameKeywords: ["book", "stationery", "sách", "văn phòng phẩm"],
    templates: [
      { name: "Sổ tay bìa cứng ghi chú", isWearable: false, imageKeyword: "hardcover notebook" },
      { name: "Bút bi cao cấp", isWearable: false, imageKeyword: "premium ballpoint pen" },
      { name: "Bút gel nhiều màu", isWearable: false, imageKeyword: "gel pens colorful" },
      { name: "Bộ bút highlight đánh dấu", isWearable: false, imageKeyword: "highlighter pens set" },
      { name: "Vở kẻ ngang học sinh", isWearable: false, imageKeyword: "school notebook" },
      { name: "Giấy note dán nhiều màu", isWearable: false, imageKeyword: "sticky notes colorful" },
      { name: "Bìa hồ sơ đựng tài liệu", isWearable: false, imageKeyword: "document folder" },
      { name: "Kẹp giấy văn phòng", isWearable: false, imageKeyword: "paper clips" },
      { name: "Bảng kế hoạch tuần để bàn", isWearable: false, imageKeyword: "desk weekly planner" },
      { name: "Hộp bút đựng đồ dùng học tập", isWearable: false, imageKeyword: "pencil case" },
      { name: "Sách kỹ năng sống", isWearable: false, imageKeyword: "self help book" },
      { name: "Sách phát triển bản thân", isWearable: false, imageKeyword: "personal development book" },
      { name: "Truyện tranh thiếu nhi", isWearable: false, imageKeyword: "children comic book" },
      { name: "Từ điển bỏ túi", isWearable: false, imageKeyword: "pocket dictionary" },
      { name: "Bộ compa thước kẻ học sinh", isWearable: false, imageKeyword: "geometry compass ruler set" },
    ],
  },
};
