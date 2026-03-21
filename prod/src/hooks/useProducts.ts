import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSellerProducts,
  fetchProductById,
  fetchProductsByIds,
  fetchPublicProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchProductOffers,
  createProductOffer,
  updateProductOffer,
  deleteProductOffer,
  fetchCheckoutConfig,
  upsertCheckoutConfig,
  uploadProductImage,
  fetchProductDomains,
  createProductDomain,
  deleteProductDomain,
  fetchProductCoupons,
  createProductCoupon,
  deleteProductCoupon,
  fetchProductPixels,
  createProductPixel,
  updateProductPixel,
  deleteProductPixel,
  fetchUpsellConfig,
  upsertUpsellConfig,
  fetchDeliveryConfig,
  upsertDeliveryConfig,
  fetchCourseByProduct,
  createCourse,
  fetchCourseModules,
  createCourseModule,
  updateCourseModule,
  deleteCourseModule,
  fetchCourseLessons,
  createCourseLesson,
  updateCourseLesson,
  deleteCourseLesson,
  fetchAffiliateProgram,
  updateAffiliateProgram,
  fetchAffiliateLinks,
  createAffiliateLink,
  fetchAffiliateCommissions,
  fetchAffiliateSummary,
} from "@/services/product.service";
import type { DbProduct, DbProductOffer, DbProductCheckoutConfig, DbAffiliateProgram, DbAffiliateCommission } from "@/services/product.service";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDemo } from "@/lib/demo-utils";
// ============= Product Queries =============

export const useSellerProducts = () => {
  const { user } = useAuth();
  const demo = isDemo();
  return useQuery({
    queryKey: ["seller-products", demo ? "demo" : user?.id],
    queryFn: fetchSellerProducts,
    enabled: demo || !!user,
  });
};

export const useProduct = (id: string | undefined) => {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProductById(id!),
    enabled: !!id,
  });
};

export const useProductsByIds = (ids: string[]) => {
  const sortedIds = Array.from(new Set(ids.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["products-by-ids", sortedIds.join(",")],
    queryFn: () => fetchProductsByIds(sortedIds),
    enabled: sortedIds.length > 0,
  });
};

export const usePublicProducts = (params?: { q?: string; type?: "ebook" | "course" | "physical"; limit?: number; offset?: number }) => {
  const key = JSON.stringify({ q: params?.q || "", type: params?.type || "", limit: params?.limit ?? 24, offset: params?.offset ?? 0 });
  return useQuery({
    queryKey: ["public-products", key],
    queryFn: () => fetchPublicProducts(params),
  });
};

// ============= Product Mutations =============

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (product: { name: string; short_description?: string; price: number; type: "ebook" | "course" | "physical" }) =>
      createProduct({ ...product, seller_id: user!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      toast.success("Produto criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar produto: " + error.message);
    },
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<DbProduct, "name" | "short_description" | "long_description" | "price" | "status" | "image_url" | "warranty_days" | "delivery_type">> }) =>
      updateProduct(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      queryClient.invalidateQueries({ queryKey: ["product", data.id] });
      toast.success("Produto atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar produto: " + error.message);
    },
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      toast.success("Produto excluído!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao excluir produto: " + error.message);
    },
  });
};

// ============= Product Offers =============

export const useProductOffers = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["product-offers", productId],
    queryFn: () => fetchProductOffers(productId!),
    enabled: !!productId,
  });
};

export const useCreateProductOffer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProductOffer,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-offers", data.product_id] });
      toast.success("Oferta criada!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar oferta: " + error.message);
    },
  });
};

export const useUpdateProductOffer = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<DbProductOffer, "name" | "price" | "active" | "slug">> }) =>
      updateProductOffer(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-offers", productId] });
      toast.success("Oferta atualizada!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar oferta: " + error.message);
    },
  });
};

export const useDeleteProductOffer = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProductOffer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-offers", productId] });
      toast.success("Oferta excluída!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao excluir oferta: " + error.message);
    },
  });
};

// ============= Checkout Config =============

export const useCheckoutConfig = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["checkout-config", productId],
    queryFn: () => fetchCheckoutConfig(productId!),
    enabled: !!productId,
  });
};

export const useUpsertCheckoutConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, config }: { productId: string; config: any }) =>
      upsertCheckoutConfig(productId, config),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["checkout-config", data.product_id] });
      toast.success("Checkout salvo!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar checkout: " + error.message);
    },
  });
};

// ============= Product Domains =============

export const useProductDomains = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["product-domains", productId],
    queryFn: () => fetchProductDomains(productId!),
    enabled: !!productId,
  });
};

export const useCreateProductDomain = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domain: string) =>
      createProductDomain({ product_id: productId, domain }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-domains", productId] });
      toast.success("Domínio adicionado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao adicionar domínio: " + error.message);
    },
  });
};

export const useDeleteProductDomain = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProductDomain,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-domains", productId] });
      toast.success("Domínio removido!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover domínio: " + error.message);
    },
  });
};

export const useVerifyProductDomain = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domainId: string) => {
      const { data, error } = await supabase.functions.invoke("verify-domain", {
        body: { domainId },
      });
      if (error) throw new Error(error.message || "Erro ao verificar domínio");
      return data;
    },
    onSuccess: (data: { verified: boolean; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["product-domains", productId] });
      if (data.verified) {
        toast.success("Domínio verificado com sucesso!");
      } else {
        toast.error(data.message || "DNS ainda não está apontando corretamente.");
      }
    },
    onError: (error: Error) => {
      toast.error("Erro ao verificar: " + error.message);
    },
  });
};

export const useAffiliateProgram = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["affiliate-program", productId],
    queryFn: () => fetchAffiliateProgram(productId!),
    enabled: !!productId,
  });
};

export const useUpdateAffiliateProgram = (productId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Pick<DbAffiliateProgram, "enabled" | "commission_percent" | "cookie_days">>) =>
      updateAffiliateProgram(productId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["affiliate-program", productId] });
      toast.success("Afiliação atualizada!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar afiliação: " + error.message);
    },
  });
};

export const useAffiliateLinks = (params?: { product_id?: string }) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["affiliate-links", params?.product_id || ""],
    queryFn: () => fetchAffiliateLinks(params),
    enabled: !!user,
  });
};

export const useCreateAffiliateLink = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { product_id: string; offer_id?: string | null }) => createAffiliateLink(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["affiliate-links"] });
      toast.success("Link de afiliado gerado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao gerar link: " + error.message);
    },
  });
};

export const useAffiliateCommissions = (params?: { status?: DbAffiliateCommission["commission_status"] }) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["affiliate-commissions", params?.status || ""],
    queryFn: () => fetchAffiliateCommissions(params),
    enabled: !!user,
  });
};

export const useAffiliateSummary = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["affiliate-summary"],
    queryFn: fetchAffiliateSummary,
    enabled: !!user,
  });
};

// ============= Product Coupons =============

export const useProductCoupons = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["product-coupons", productId],
    queryFn: () => fetchProductCoupons(productId!),
    enabled: !!productId,
  });
};

export const useCreateProductCoupon = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (coupon: { code: string; type: string; value: number; usage_limit: number; expires_at?: string }) =>
      createProductCoupon({ product_id: productId, ...coupon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-coupons", productId] });
      toast.success("Cupom criado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar cupom: " + error.message);
    },
  });
};

export const useDeleteProductCoupon = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProductCoupon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-coupons", productId] });
      toast.success("Cupom removido!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover cupom: " + error.message);
    },
  });
};

// ============= Product Pixels =============

export const useProductPixels = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["product-pixels", productId],
    queryFn: () => fetchProductPixels(productId!),
    enabled: !!productId,
  });
};

export const useCreateProductPixel = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pixel: { platform: string; pixel_id: string; access_token?: string }) =>
      createProductPixel({ product_id: productId, ...pixel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-pixels", productId] });
      toast.success("Pixel adicionado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao adicionar pixel: " + error.message);
    },
  });
};

export const useUpdateProductPixel = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<import("@/services/product.service").DbProductPixel, "platform" | "pixel_id" | "active" | "access_token">> }) =>
      updateProductPixel(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-pixels", productId] });
      toast.success("Pixel atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar pixel: " + error.message);
    },
  });
};

export const useDeleteProductPixel = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProductPixel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-pixels", productId] });
      toast.success("Pixel removido!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover pixel: " + error.message);
    },
  });
};

// ============= Upsell Config =============

export const useUpsellConfig = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["upsell-config", productId],
    queryFn: () => fetchUpsellConfig(productId!),
    enabled: !!productId,
  });
};

export const useUpsertUpsellConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, config }: { productId: string; config: any }) =>
      upsertUpsellConfig(productId, config),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["upsell-config", data.product_id] });
      toast.success("Upsell salvo!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar upsell: " + error.message);
    },
  });
};

// ============= Delivery Config =============

export const useDeliveryConfig = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["delivery-config", productId],
    queryFn: () => fetchDeliveryConfig(productId!),
    enabled: !!productId,
  });
};

export const useUpsertDeliveryConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, config }: { productId: string; config: any }) =>
      upsertDeliveryConfig(productId, config),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-config", data.product_id] });
      toast.success("Configuração de entrega salva!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar entrega: " + error.message);
    },
  });
};

// ============= Course / Modules / Lessons =============

export const useCourseByProduct = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["course", productId],
    queryFn: () => fetchCourseByProduct(productId!),
    enabled: !!productId,
  });
};

export const useCreateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCourse,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["course", data.product_id] });
      toast.success("Área de membros criada!");
    },
    onError: (error: Error) => toast.error("Erro ao criar área de membros: " + error.message),
  });
};

export const useCourseModules = (courseId: string | undefined) => {
  return useQuery({
    queryKey: ["course-modules", courseId],
    queryFn: () => fetchCourseModules(courseId!),
    enabled: !!courseId,
  });
};

export const useCreateCourseModule = (courseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mod: { title: string; sort_order: number }) =>
      createCourseModule({ course_id: courseId, ...mod }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-modules", courseId] });
      toast.success("Módulo criado!");
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
};

export const useUpdateCourseModule = (courseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<import("@/services/product.service").DbCourseModule, "title" | "sort_order">> }) =>
      updateCourseModule(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-modules", courseId] });
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
};

export const useDeleteCourseModule = (courseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCourseModule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-modules", courseId] });
      toast.success("Módulo removido!");
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
};

export const useCourseLessons = (moduleId: string | undefined) => {
  return useQuery({
    queryKey: ["course-lessons", moduleId],
    queryFn: () => fetchCourseLessons(moduleId!),
    enabled: !!moduleId,
  });
};

export const useCreateCourseLesson = (moduleId: string, courseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lesson: { title: string; sort_order: number }) =>
      createCourseLesson({ module_id: moduleId, ...lesson }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-lessons", moduleId] });
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
};

export const useUpdateCourseLesson = (moduleId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<import("@/services/product.service").DbCourseLesson, "title" | "video_url" | "duration" | "sort_order" | "locked">> }) =>
      updateCourseLesson(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-lessons", moduleId] });
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
};

export const useDeleteCourseLesson = (moduleId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCourseLesson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-lessons", moduleId] });
      toast.success("Aula removida!");
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
};

// ============= Image Upload =============

export const useUploadProductImage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, productId }: { file: File; productId: string }) => {
      const url = await uploadProductImage(file, productId);
      await updateProduct(productId, { image_url: url });
      return url;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["product", variables.productId] });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      toast.success("Imagem enviada!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao enviar imagem: " + error.message);
    },
  });
};
