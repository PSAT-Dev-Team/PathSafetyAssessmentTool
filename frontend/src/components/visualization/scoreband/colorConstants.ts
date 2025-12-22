/**
 * Standardized CycleRAP Risk Band Colors
 * These colors are used consistently throughout the application for:
 * - Risk Score visualization
 * - Crash Type Risk bands
 * - Score-based UI elements
 */

export const RISK_BAND_COLORS = {
  LOW: '#87C424',
  MEDIUM: '#FFCC1A',
  HIGH: '#FF5B1A',
  EXTREME: '#CD1AFF',
} as const;

/**
 * Get risk band color based on score
 * Band thresholds: Low (≤3), Medium (3-6), High (6-10), Extreme (>10)
 */
export function getRiskBandColor(score: number): string {
  if (score <= 3) return RISK_BAND_COLORS.LOW;
  if (score <= 6) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 10) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
}

/**
 * Get risk band label based on score
 */
export function getRiskBandLabel(score: number): 'Low' | 'Medium' | 'High' | 'Extreme' {
  if (score <= 3) return 'Low';
  if (score <= 6) return 'Medium';
  if (score <= 10) return 'High';
  return 'Extreme';
}

/**
 * Get risk band index (1-4) based on score
 */
export function getRiskBandIndex(score: number): 1 | 2 | 3 | 4 {
  if (score <= 3) return 1;
  if (score <= 6) return 2;
  if (score <= 10) return 3;
  return 4;
}
