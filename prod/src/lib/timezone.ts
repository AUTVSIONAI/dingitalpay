import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const PLATFORM_TZ = "America/Sao_Paulo" as const;

type IsoLike = string | Date;

const toDate = (value: IsoLike) => (value instanceof Date ? value : new Date(value));

// YYYY-MM-DD in platform timezone (used for daily grouping keys)
export const formatDateKey = (value: IsoLike): string =>
  formatInTimeZone(toDate(value), PLATFORM_TZ, "yyyy-MM-dd");

// YYYY-MM in platform timezone (used for monthly grouping keys)
export const formatMonthKey = (value: IsoLike): string =>
  formatInTimeZone(toDate(value), PLATFORM_TZ, "yyyy-MM");

// dd/MM/yyyy HH:mm in platform timezone (tables / audit)
export const formatDateTimePtBr = (value: IsoLike): string =>
  formatInTimeZone(toDate(value), PLATFORM_TZ, "dd/MM/yyyy HH:mm");

// dd/MM/yyyy às HH:mm in platform timezone (detail views / timelines)
export const formatDateTimeWithAtPtBr = (value: IsoLike): string =>
  formatInTimeZone(toDate(value), PLATFORM_TZ, "dd/MM/yyyy 'às' HH:mm");

// dd/MM/yyyy in platform timezone (date-only fields)
export const formatDatePtBr = (value: IsoLike): string =>
  formatInTimeZone(toDate(value), PLATFORM_TZ, "dd/MM/yyyy");

// HH:mm in platform timezone
export const formatTimePtBr = (value: IsoLike): string =>
  formatInTimeZone(toDate(value), PLATFORM_TZ, "HH:mm");

// Value for <input type="datetime-local"> in platform timezone
export const toDatetimeLocalValue = (isoUtc: string): string =>
  formatInTimeZone(new Date(isoUtc), PLATFORM_TZ, "yyyy-MM-dd'T'HH:mm");

// Convert <input type="datetime-local"> value interpreted in platform timezone to ISO UTC
export const fromDatetimeLocalValue = (value: string): string =>
  fromZonedTime(value, PLATFORM_TZ).toISOString();

// Convert a date-key (YYYY-MM-DD) interpreted in platform timezone to a UTC Date
export const fromDateKeyToUtcDate = (dateKey: string): Date =>
  fromZonedTime(`${dateKey}T00:00`, PLATFORM_TZ);
