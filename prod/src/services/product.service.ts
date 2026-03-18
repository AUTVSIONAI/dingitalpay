import { supabase } from "@/integrations/supabase/client";
import { isDemo } from "@/lib/demo-utils";
import {
  demoProducts, demoCourse, demoCourseModules, demoCourseLessons,
  demoProductOffers, demoCheckoutConfigs, demoUpsellConfigs,
  demoDeliveryConfigs, demoProductDomains, demoProductCoupons, demoProductPixels,
} from "@/data/customer-stubs/products";
import { demoCourseDetail } from "@/data/customer-stubs/courses";
import type { CourseDetailFull } from "@/types/api";

async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body != null && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers,
    ...init,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || "Request failed");
  }
  return payload?.data as T;
}

// ============= Types matching API schema =============
export interface DbProduct {
  id: string;
  seller_id: string;
  name: string;
  short_description: string;
  long_description: string;
  price: number;
  type: "ebook" | "course" | "physical";
  status: "active" | "inactive" | "draft";
  image_url: string;
  sales: number;
  revenue: number;
  warranty_days: number;
  delivery_type: string;
  created_at: string;
  updated_at: string;
}

export interface DbProductOffer {
  id: string;
  product_id: string;
  name: string;
  price: number;
  active: boolean;
  slug: string;
  created_at: string;
}

export interface DbProductCheckoutConfig {
  id: string;
  product_id: string;
  payment_methods: { pix: boolean; credit_card: boolean; boleto: boolean };
  required_fields: { name: boolean; email: boolean; cpf: boolean; phone: boolean; address?: boolean; birth_date?: boolean };
  countdown_enabled: boolean;
  countdown_minutes: number;
  countdown_phrase: string;
  countdown_expired_phrase: string;
  banner_url: string;
  colors: { primary: string; background: string; text: string; buy_button_color?: string; buy_button_text_color?: string; secondary?: string };
  buy_button_text: string;
  order_bump_items: { product_id: string; discount_enabled: boolean; discount_percentage: number }[];
  order_bump_product_id: string | null;
  order_bump_discount: number;
  social_proof_enabled: boolean;
  notification_interval: number;
  notification_names: string[];
  whatsapp_support: string;
  whatsapp_message: string;
  email_confirmation: boolean;
  reviews_enabled: boolean;
  reviews: { name: string; rating: number; comment: string }[];
  thank_you_config: { title: string; message: string; redirect_url: string };
  thank_you_redirect_delay: number;
  created_at: string;
  updated_at: string;
}

export interface DbProductDomain {
  id: string;
  product_id: string;
  domain: string;
  verified: boolean;
  created_at: string;
}

export interface DbProductCoupon {
  id: string;
  product_id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  usage_limit: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface DbProductPixel {
  id: string;
  product_id: string;
  platform: string;
  pixel_id: string;
  active: boolean;
  access_token: string;
  created_at: string;
}

export interface DbUpsellConfig {
  id: string;
  product_id: string;
  enabled: boolean;
  upsell_product_id: string | null;
  title: string;
  description: string;
  image_url: string;
  cta_text: string;
  decline_text: string;
  special_price: number;
  downsell_enabled: boolean;
  downsell_product_id: string | null;
  downsell_title: string;
  downsell_cta_text: string;
  downsell_special_price: number;
  created_at: string;
  updated_at: string;
}

export interface DbDeliveryConfig {
  id: string;
  product_id: string;
  delivery_method: string;
  email_subject: string;
  email_body: string;
  download_url: string;
  file_url: string;
  auto_send: boolean;
  shipping_method: string;
  processing_days: number;
  tracking_enabled: boolean;
  weight: string;
  dimensions: string;
  instructions: string;
  created_at: string;
  updated_at: string;
}

export interface DbCourse {
  id: string;
  product_id: string;
  title: string;
  description: string;
  image_url: string;
  created_at: string;
  updated_at: string;
}

export interface DbCourseModule {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  created_at: string;
}

export interface DbCourseLesson {
  id: string;
  module_id: string;
  title: string;
  video_url: string;
  duration: string;
  sort_order: number;
  locked: boolean;
  created_at: string;
}

// ============= Product CRUD =============

export const fetchSellerProducts = async (): Promise<DbProduct[]> => {
  if (isDemo()) return demoProducts;
  return await apiFetchJson<DbProduct[]>("/seller/products/overview");
};

export const fetchProductById = async (id: string): Promise<DbProduct | null> => {
  if (isDemo()) return demoProducts.find((p) => p.id === id) || null;
  return await apiFetchJson<DbProduct | null>(`/seller/products/${encodeURIComponent(id)}`);
};

export const fetchProductsByIds = async (ids: string[]): Promise<DbProduct[]> => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  if (isDemo()) return demoProducts.filter((product) => uniqueIds.includes(product.id));
  return await apiFetchJson<DbProduct[]>(`/seller/products/by-ids?ids=${encodeURIComponent(uniqueIds.join(","))}`);
};

export const fetchPublicProductById = async (id: string): Promise<DbProduct | null> => {
  if (isDemo()) return demoProducts.find((p) => p.id === id) || null;
  return await apiFetchJson<DbProduct | null>(`/public/products/${encodeURIComponent(id)}`);
};

export const fetchPublicProductsByIds = async (ids: string[]): Promise<DbProduct[]> => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  if (isDemo()) return demoProducts.filter((product) => uniqueIds.includes(product.id));
  return await apiFetchJson<DbProduct[]>(`/public/products/by-ids?ids=${encodeURIComponent(uniqueIds.join(","))}`);
};

export const createProduct = async (product: {
  name: string;
  short_description?: string;
  price: number;
  type: "ebook" | "course" | "physical";
  seller_id: string;
}): Promise<DbProduct> => {
  if (!product.seller_id) {
    throw new Error("Usuário não autenticado. Faça login novamente.");
  }
  return await apiFetchJson<DbProduct>("/seller/products", {
    method: "POST",
    body: JSON.stringify({
      name: product.name,
      short_description: product.short_description || "",
      price: product.price,
      type: product.type,
    }),
  });
};

export const updateProduct = async (
  id: string,
  updates: Partial<Pick<DbProduct, "name" | "short_description" | "long_description" | "price" | "status" | "image_url" | "warranty_days" | "delivery_type">>,
): Promise<DbProduct> => {
  return await apiFetchJson<DbProduct>(`/seller/products/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
};

export const deleteProduct = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

// ============= Product Offers =============

export const fetchProductOffers = async (productId: string): Promise<DbProductOffer[]> => {
  if (isDemo()) return demoProductOffers.filter((offer) => offer.product_id === productId);
  return await apiFetchJson<DbProductOffer[]>(`/seller/products/${encodeURIComponent(productId)}/offers`);
};

export const createProductOffer = async (offer: {
  product_id: string;
  name: string;
  price: number;
  slug: string;
}): Promise<DbProductOffer> => {
  return await apiFetchJson<DbProductOffer>(`/seller/products/${encodeURIComponent(offer.product_id)}/offers`, {
    method: "POST",
    body: JSON.stringify({
      name: offer.name,
      price: offer.price,
      slug: offer.slug,
    }),
  });
};

export const updateProductOffer = async (
  id: string,
  updates: Partial<Pick<DbProductOffer, "name" | "price" | "active" | "slug">>,
): Promise<DbProductOffer> => {
  return await apiFetchJson<DbProductOffer>(`/seller/product-offers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
};

export const deleteProductOffer = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/product-offers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

// ============= Checkout Config =============

export const fetchCheckoutConfig = async (productId: string): Promise<DbProductCheckoutConfig | null> => {
  if (isDemo()) return demoCheckoutConfigs[productId] || null;
  return await apiFetchJson<DbProductCheckoutConfig | null>(`/seller/products/${encodeURIComponent(productId)}/checkout-config`);
};

export const fetchPublicCheckoutConfig = async (productId: string): Promise<DbProductCheckoutConfig | null> => {
  if (isDemo()) return demoCheckoutConfigs[productId] || null;
  return await apiFetchJson<DbProductCheckoutConfig | null>(`/public/products/${encodeURIComponent(productId)}/checkout-config`);
};

export const upsertCheckoutConfig = async (
  productId: string,
  config: Partial<Omit<DbProductCheckoutConfig, "id" | "product_id" | "created_at" | "updated_at">>,
): Promise<DbProductCheckoutConfig> => {
  return await apiFetchJson<DbProductCheckoutConfig>(`/seller/products/${encodeURIComponent(productId)}/checkout-config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

// ============= Product Domains =============

export const fetchProductDomains = async (productId: string): Promise<DbProductDomain[]> => {
  if (isDemo()) return demoProductDomains.filter((domain) => domain.product_id === productId);
  return await apiFetchJson<DbProductDomain[]>(`/seller/products/${encodeURIComponent(productId)}/domains`);
};

export const createProductDomain = async (domain: {
  product_id: string;
  domain: string;
}): Promise<DbProductDomain> => {
  return await apiFetchJson<DbProductDomain>(`/seller/products/${encodeURIComponent(domain.product_id)}/domains`, {
    method: "POST",
    body: JSON.stringify({ domain: domain.domain }),
  });
};

export const deleteProductDomain = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/product-domains/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

// ============= Product Coupons =============

export const fetchProductCoupons = async (productId: string): Promise<DbProductCoupon[]> => {
  if (isDemo()) return demoProductCoupons.filter((coupon) => coupon.product_id === productId);
  return await apiFetchJson<DbProductCoupon[]>(`/seller/products/${encodeURIComponent(productId)}/coupons`);
};

export const createProductCoupon = async (coupon: {
  product_id: string;
  code: string;
  type: string;
  value: number;
  usage_limit: number;
  expires_at?: string;
}): Promise<DbProductCoupon> => {
  return await apiFetchJson<DbProductCoupon>(`/seller/products/${encodeURIComponent(coupon.product_id)}/coupons`, {
    method: "POST",
    body: JSON.stringify({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      usage_limit: coupon.usage_limit,
      expires_at: coupon.expires_at || null,
    }),
  });
};

export const deleteProductCoupon = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/product-coupons/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

// ============= Product Pixels =============

export const fetchProductPixels = async (productId: string): Promise<DbProductPixel[]> => {
  if (isDemo()) return demoProductPixels.filter((pixel) => pixel.product_id === productId);
  return await apiFetchJson<DbProductPixel[]>(`/seller/products/${encodeURIComponent(productId)}/pixels`);
};

/** Public version: excludes access_token for checkout/frontend use */
export const fetchProductPixelsPublic = async (productId: string): Promise<Omit<DbProductPixel, "access_token">[]> => {
  return await apiFetchJson<Omit<DbProductPixel, "access_token">[]>(`/public/products/${encodeURIComponent(productId)}/pixels`);
};

export const createProductPixel = async (pixel: {
  product_id: string;
  platform: string;
  pixel_id: string;
  access_token?: string;
}): Promise<DbProductPixel> => {
  return await apiFetchJson<DbProductPixel>(`/seller/products/${encodeURIComponent(pixel.product_id)}/pixels`, {
    method: "POST",
    body: JSON.stringify({
      platform: pixel.platform,
      pixel_id: pixel.pixel_id,
      access_token: pixel.access_token || "",
    }),
  });
};

export const updateProductPixel = async (
  id: string,
  updates: Partial<Pick<DbProductPixel, "platform" | "pixel_id" | "active" | "access_token">>,
): Promise<DbProductPixel> => {
  return await apiFetchJson<DbProductPixel>(`/seller/product-pixels/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
};

export const deleteProductPixel = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/product-pixels/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

// ============= Upsell Config =============

export const fetchUpsellConfig = async (productId: string): Promise<DbUpsellConfig | null> => {
  if (isDemo()) return demoUpsellConfigs[productId] || null;
  return await apiFetchJson<DbUpsellConfig | null>(`/seller/products/${encodeURIComponent(productId)}/upsell-config`);
};

export const upsertUpsellConfig = async (
  productId: string,
  config: Partial<Omit<DbUpsellConfig, "id" | "product_id" | "created_at" | "updated_at">>,
): Promise<DbUpsellConfig> => {
  return await apiFetchJson<DbUpsellConfig>(`/seller/products/${encodeURIComponent(productId)}/upsell-config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

// ============= Delivery Config =============

export const fetchDeliveryConfig = async (productId: string): Promise<DbDeliveryConfig | null> => {
  if (isDemo()) return demoDeliveryConfigs[productId] || null;
  return await apiFetchJson<DbDeliveryConfig | null>(`/seller/products/${encodeURIComponent(productId)}/delivery-config`);
};

export const upsertDeliveryConfig = async (
  productId: string,
  config: Partial<Omit<DbDeliveryConfig, "id" | "product_id" | "created_at" | "updated_at">>,
): Promise<DbDeliveryConfig> => {
  return await apiFetchJson<DbDeliveryConfig>(`/seller/products/${encodeURIComponent(productId)}/delivery-config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

// ============= Course / Modules / Lessons =============

export const fetchCourseByProduct = async (productId: string): Promise<DbCourse | null> => {
  if (isDemo()) return productId === "demo-prod-001" ? demoCourse : null;
  return await apiFetchJson<DbCourse | null>(`/seller/products/${encodeURIComponent(productId)}/course`);
};

export const fetchCoursePreviewTokenByProduct = async (productId: string): Promise<string | null> => {
  if (isDemo()) return "demo-preview-token";
  return await apiFetchJson<string | null>(`/seller/products/${encodeURIComponent(productId)}/course/preview-token`);
};

export const fetchCoursePreviewByProduct = async (productId: string): Promise<CourseDetailFull | null> => {
  if (isDemo()) return demoCourseDetail;
  return await apiFetchJson<CourseDetailFull | null>(`/seller/products/${encodeURIComponent(productId)}/course/preview`);
};

export interface PublicOfferSummary {
  id: string;
  product_id: string;
  price: number;
  active: boolean;
  name: string | null;
}

export const fetchPublicOfferById = async (offerId: string): Promise<PublicOfferSummary | null> => {
  return await apiFetchJson<PublicOfferSummary | null>(`/public/offers/${encodeURIComponent(offerId)}`);
};

export const fetchPublicOfferBySlug = async (slug: string): Promise<PublicOfferSummary | null> => {
  return await apiFetchJson<PublicOfferSummary | null>(`/public/offers/slug/${encodeURIComponent(slug)}`);
};

export const createCourse = async (course: { product_id: string; title: string }): Promise<DbCourse> => {
  return await apiFetchJson<DbCourse>(`/seller/products/${encodeURIComponent(course.product_id)}/course`, {
    method: "POST",
    body: JSON.stringify({ title: course.title }),
  });
};

export const fetchCourseModules = async (courseId: string): Promise<DbCourseModule[]> => {
  if (isDemo()) return demoCourseModules.filter((module) => module.course_id === courseId);
  return await apiFetchJson<DbCourseModule[]>(`/seller/courses/${encodeURIComponent(courseId)}/modules`);
};

export const createCourseModule = async (mod: { course_id: string; title: string; sort_order: number }): Promise<DbCourseModule> => {
  return await apiFetchJson<DbCourseModule>(`/seller/courses/${encodeURIComponent(mod.course_id)}/modules`, {
    method: "POST",
    body: JSON.stringify({
      title: mod.title,
      sort_order: mod.sort_order,
    }),
  });
};

export const updateCourseModule = async (
  id: string,
  updates: Partial<Pick<DbCourseModule, "title" | "sort_order">>,
): Promise<DbCourseModule> => {
  return await apiFetchJson<DbCourseModule>(`/seller/course-modules/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
};

export const deleteCourseModule = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/course-modules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

export const fetchCourseLessons = async (moduleId: string): Promise<DbCourseLesson[]> => {
  if (isDemo()) return demoCourseLessons.filter((lesson) => lesson.module_id === moduleId);
  return await apiFetchJson<DbCourseLesson[]>(`/seller/course-modules/${encodeURIComponent(moduleId)}/lessons`);
};

export const createCourseLesson = async (lesson: { module_id: string; title: string; sort_order: number }): Promise<DbCourseLesson> => {
  return await apiFetchJson<DbCourseLesson>(`/seller/course-modules/${encodeURIComponent(lesson.module_id)}/lessons`, {
    method: "POST",
    body: JSON.stringify({
      title: lesson.title,
      sort_order: lesson.sort_order,
    }),
  });
};

export const updateCourseLesson = async (
  id: string,
  updates: Partial<Pick<DbCourseLesson, "title" | "video_url" | "duration" | "sort_order" | "locked">>,
): Promise<DbCourseLesson> => {
  return await apiFetchJson<DbCourseLesson>(`/seller/course-lessons/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
};

export const deleteCourseLesson = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/course-lessons/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

// ============= Image Upload =============

export const uploadProductImage = async (file: File, productId: string): Promise<string> => {
  const ext = file.name.split(".").pop();
  const path = `${productId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { upsert: true });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(path);

  return urlData.publicUrl;
};
