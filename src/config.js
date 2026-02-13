import dotenv from 'dotenv';

dotenv.config();

export const WEBHOOK_SECRET = process.env.SPORTFENGUR_WEBHOOK_SECRET || '';
export const WEBHOOK_SECRET_REQUIRED = process.env.WEBHOOK_SECRET_REQUIRED === 'true';
export const EXCEL_PATH = process.env.EXCEL_PATH || './raslistar.xlsx';
export const EXCEL_OUTPUT_PATH =
  process.env.EXCEL_OUTPUT_PATH || EXCEL_PATH;
export const SPORTFENGUR_BASE_URL =
  process.env.SPORTFENGUR_BASE_URL || 'https://sportfengur.com/api/v1';
export const SPORTFENGUR_LOCALE = process.env.SPORTFENGUR_LOCALE || 'is';
export const SPORTFENGUR_USERNAME = process.env.EIDFAXI_USERNAME || '';
export const SPORTFENGUR_PASSWORD = process.env.EIDFAXI_PASSWORD || '';
export const DEDUPE_TTL_MS = Number(process.env.DEDUPE_TTL_MS || 30000);
export const MIN_FETCH_INTERVAL_MS = Number(
  process.env.MIN_FETCH_INTERVAL_MS || 1500,
);
export const FETCH_MAX_RETRIES = Number(process.env.FETCH_MAX_RETRIES || 3);
export const FETCH_RETRY_BASE_MS = Number(process.env.FETCH_RETRY_BASE_MS || 750);
export const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
export const DEBUG_LOGS = DEBUG_MODE;
const parsedEventId = Number(process.env.EVENT_ID);
export const EVENT_ID_FILTER = Number.isInteger(parsedEventId)
  ? parsedEventId
  : null;
