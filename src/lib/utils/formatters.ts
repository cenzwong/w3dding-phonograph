export const BYTES_IN_MB = 1024 * 1024;
export const bytesToMB = (bytes: number): number => bytes / BYTES_IN_MB;
export const formatBytesToMB = (bytes: number, decimals: number = 1): string => bytesToMB(bytes).toFixed(decimals);
