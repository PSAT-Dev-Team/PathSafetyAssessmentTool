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
 * Band thresholds: Low (0-5), Medium (5-10), High (10-20), Extreme (20+)
 */
export function getRiskBandColor(score: number): string {
  if (score <= 5) return RISK_BAND_COLORS.LOW;
  if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 20) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
}

/**
 * Get risk band label based on score
 */
export function getRiskBandLabel(score: number): 'Low' | 'Medium' | 'High' | 'Extreme' {
  if (score <= 5) return 'Low';
  if (score <= 10) return 'Medium';
  if (score <= 20) return 'High';
  return 'Extreme';
}

/**
 * Get risk band index based on score
 * Returns 1-5 where: 1=Low, 2=Medium, 3=High, 4=Extreme, 5=Extreme (for very high scores)
 */
export function getRiskBandIndex(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score <= 5) return 1;    // Low: 0-5
  if (score <= 10) return 2;   // Medium: 5-10
  if (score <= 20) return 3;   // High: 10-20
  return 4;                     // Extreme: 20+
}
