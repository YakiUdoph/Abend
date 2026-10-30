export const ZERO_COST_PROVIDER = "google-gemini-free-tier";
export const ZERO_COST_MODEL = "gemini-3.5-flash";

export type ZeroCostReadiness =
  | { ready: true }
  | { ready: false; missing: string[]; reason: string };

export function checkZeroCostGeminiReadiness(
  env: NodeJS.ProcessEnv = process.env,
): ZeroCostReadiness {
  const missing: string[] = [];
  if (!env.GEMINI_API_KEY?.trim()) missing.push("GEMINI_API_KEY");
  if (env.ABEND_GEMINI_FREE_TIER_CONFIRMED !== "1") {
    missing.push("ABEND_GEMINI_FREE_TIER_CONFIRMED=1");
  }
  if (missing.length > 0) {
    return {
      ready: false,
      missing,
      reason:
        "No request is allowed until a Gemini API key exists and its AI Studio project is manually verified as Free Tier with billing disabled.",
    };
  }
  return { ready: true };
}
