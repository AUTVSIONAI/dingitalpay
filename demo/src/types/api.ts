// ============= API Contract Types =============

// --- Admin ---
export interface AdminMetrics {
  activeUsers: string;
  totalRevenue: string;
  approvedSales: string;
  activeProducts: string;
  usersTrend: string;
  revenueTrend: string;
  salesTrend: string;
  productsTrend: string;
}

export interface AdminChartPoint {
  name: string;
  value: number;
}

export interface AdminTopProduct {
  name: string;
  sales: number;
  revenue: string;
}

export interface AdminRecentUser {
  name: string;
  email: string;
  role: string;
  date: string;
}

export interface AdminDashboardSummary {
  metrics: {
    activeUsers: number;
    totalRevenue: number;
    approvedSales: number;
    activeProducts: number;
  };
  chartData: AdminChartPoint[];
  topProducts: Array<{
    id: string;
    name: string;
    sales: number;
    revenue: number;
  }>;
  recentUsers: AdminRecentUser[];
}

export interface RevenueDataPoint {
  name: string;
  revenue: number;
  orders: number;
}

export interface PaymentMethodStat {
  name: string;
  value: number;
  color: string;
}

export interface TopSeller {
  name: string;
  products: number;
  revenue: string;
  conversion: string;
}

export interface ReportMetrics {
  totalRevenue: string;
  avgTicket: string;
  totalSales: string;
  conversionRate: string;
  revenueTrend: string;
  ticketTrend: string;
  salesTrend: string;
  conversionTrend: string;
}

export interface AdminReportsSummary {
  metrics: {
    grossTotalRevenue: number;
    totalRevenue: number;
    avgTicket: number;
    totalSales: number;
    conversionRate: number;
  };
  chartData: RevenueDataPoint[];
}

export interface SmtpConfig {
  host: string;
  port: string;
  username: string;
  password: string;
  encryption: string;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}

export interface SmtpStatus {
  emailsSentToday: string;
  deliveryRate: string;
  bounces: string;
  lastTest: string;
}

export interface DnsRecord {
  type: string;
  value: string;
  status: "valid" | "pending";
}

export type CampaignStatus = "draft" | "scheduled" | "sent" | "sending" | "canceled";

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  recipients: number;
  openRate: string;
  clickRate: string;
  sentAt: string | null;
  scheduledAt: string | null;
  canceledAt?: string | null;
}

export type EmailTemplateCategory = "auth" | "purchases" | "courses" | "profile" | "seller" | "gamification";

export interface EmailTemplate {
  id: string;
  category: EmailTemplateCategory;
  eventKey: string;
  title: string;
  description: string;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  enabled: boolean;
  sentCount: number;
  openRate: string;
  clickRate: string;
}

export type EmailOutboxStatus = "queued" | "sending" | "sent" | "failed" | "canceled";

export interface EmailOutboxJob {
  id: string;
  campaignId: string | null;
  templateEventKey: string;
  toEmail: string;
  subject: string;
  status: EmailOutboxStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  createdAt: string;
  sentAt: string | null;
  openCount: number;
  openHumanCount: number;
  clickCount: number;
  clickHumanCount: number;
}

export interface EmailLogEntry {
  id: string;
  outboxId: string;
  level: "info" | "error";
  message: string;
  meta: Record<string, any>;
  createdAt: string;
}

export interface PlatformSettings {
  platformName: string;
  platformUrl: string;
  supportEmail: string;
  description: string;
  maintenanceMode: boolean;
  registrationOpen: boolean;
  emailVerification: boolean;
  twoFactor: boolean;
  language: string;
  termsOfUse: string;
  privacyPolicy: string;
  requireTermsAcceptance: boolean;
  logoUrl: string;
  darkLogoUrl: string;
  whiteLogoUrl: string;
  faviconUrl: string;
  palette: string;
  neonMode: boolean;
  glowMode: boolean;
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalFeeType: "percent" | "fixed";
  withdrawalFeePercent: number;
  withdrawalProcessingDays: number;
  withdrawalPixEnabled: boolean;
  withdrawalTedEnabled: boolean;
}

export type RewardType = "congratulation" | "delivery";

export interface Reward {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  minRevenue: number;
  maxRevenue: number;
  type: RewardType;
  deliveryInstructions?: string;
  status: "active" | "inactive";
}

export interface RewardClaim {
  id: string;
  rewardId: string;
  rewardName: string;
  rewardImageUrl: string;
  sellerName: string;
  sellerEmail: string;
  revenueAchieved: number;
  claimedAt: string;
  sentAt: string | null;
  status: "pending" | "sent";
}

export type UpdateType = "feature" | "fix" | "improvement" | "maintenance";

export interface UpdateEntry {
  id: string;
  version: string;
  title: string;
  description: string;
  type: UpdateType;
  date: string;
  changes: string[];
}

// --- Seller ---
export interface SellerMetrics {
  revenue: string;
  approvedSales: string;
  conversionRate: string;
  pageViews: string;
  revenueTrend: string;
  salesTrend: string;
  conversionTrend: string;
  viewsTrend: string;
}

export interface SellerChartPoint {
  name: string;
  value: number;
}

export interface SellerRecentSale {
  buyer: string;
  product: string;
  amount: string;
  method: string;
  status: "approved" | "pending" | "refunded" | "chargeback" | "abandoned";
  date: string;
}

export type ProductType = "ebook" | "course" | "physical";

export interface SellerProduct {
  id: string;
  name: string;
  shortDescription?: string;
  price: number;
  status: "active" | "inactive" | "draft";
  sales: number;
  revenue: number;
  imageUrl: string;
  type: ProductType;
}

export interface CheckoutLink {
  id: string;
  label: string;
  product: string;
  url: string;
  clicks: number;
  conversions: number;
  revenue: number;
  utm: string;
}

export interface ProductPaymentLink {
  id: string;
  name: string;
  price: number;
  active: boolean;
  slug: string;
}

export interface WithdrawalStatusEvent {
  status: "pending" | "in_review" | "approved" | "rejected";
  date: string;
  note?: string;
}

export interface WithdrawalBankInfo {
  type: "PIX" | "TED";
  pixKey?: string;
  bankName?: string;
  agency?: string;
  account?: string;
  holder?: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  status: "approved" | "pending" | "rejected";
  method: string;
  requestedAt: string;
  processedAt: string | null;
  rejectionReason?: string;
  bankInfo: WithdrawalBankInfo;
  statusHistory: WithdrawalStatusEvent[];
}

export interface WithdrawalMetrics {
  availableBalance: string;
  pending: string;
  totalWithdrawn: string;
  lastWithdrawal: string;
  lastWithdrawalDate: string;
}

export interface Integration {
  name: string;
  description: string;
  iconName: string;
  connected: boolean;
  category: string;
  comingSoon?: boolean;
}

// --- Webhooks ---
export interface WebhookLog {
  id: string;
  event: string;
  statusCode: number;
  responseTime: number;
  triggeredAt: string;
  success: boolean;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
  createdAt: string;
  lastTriggeredAt: string | null;
  successRate: number;
  logs: WebhookLog[];
}

// --- Zapier ---
export interface ZapierLog {
  id: string;
  event: string;
  triggeredAt: string;
  success: boolean;
}

export interface ZapierIntegration {
  id: string;
  name: string;
  webhookUrl: string;
  active: boolean;
  events: string[];
  createdAt: string;
  lastTriggeredAt: string | null;
  logs: ZapierLog[];
}

// --- WhatsApp ---
export type WhatsAppInstanceStatus = "connected" | "disconnected" | "qr_pending";

export interface WhatsAppInstance {
  id: string;
  name: string;
  phone: string | null;
  status: WhatsAppInstanceStatus;
  events: string[];
  createdAt: string;
  lastActiveAt: string | null;
  messagesSent24h: number;
  deliveryRate: number;
  lastMessageAt: string | null;
}

// --- Buyer ---
export interface Purchase {
  id: string;
  product: string;
  date: string;
  status: "active" | "completed" | "refunded";
  price: string;
  courseId: string | null;
}

// --- Members ---
export interface MemberCourse {
  id: string;
  title: string;
  description: string;
  image: string;
  totalLessons: number;
  completedLessons: number;
  status: "in_progress" | "completed";
}

export interface Lesson {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  locked: boolean;
}

export interface LessonFull extends Lesson {
  videoUrl: string;
}

export interface CourseModule {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface CourseModuleFull {
  id: string;
  title: string;
  lessons: LessonFull[];
}

export interface CourseDetail {
  title: string;
  description: string;
  modules: CourseModule[];
}

export interface CourseDetailFull {
  title: string;
  description: string;
  modules: CourseModuleFull[];
}
