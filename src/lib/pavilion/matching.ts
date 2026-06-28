import type { SupabaseClient } from '@supabase/supabase-js';
import type { Occupation } from './parser';

export type MatchStatus = 'existing' | 'new' | 'uncertain';

export interface MatchResult {
  status: MatchStatus;
  matchedActivityId?: string;
  matchedName?: string;
  matchedColor?: string;
  confidence?: number;
}

function normalize(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  const dist = levenshtein(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

export async function preMatchOccupations(
  supabase: SupabaseClient,
  occupations: Occupation[],
): Promise<MatchResult[]> {
  const { data: allActivities } = await supabase
    .from('activities')
    .select('id, external_name, color')
    .not('external_name', 'is', null);

  const activities = (allActivities ?? []) as { id: string; external_name: string; color: string | null }[];

  return occupations.map((occ) => {
    const rawName = occ.activity.trim();
    const normInput = normalize(rawName);

    const exactMatch = activities.find(
      (a) => normalize(a.external_name) === normInput,
    );
    if (exactMatch) {
      return {
        status: 'existing' as const,
        matchedActivityId: exactMatch.id,
        matchedName: exactMatch.external_name,
        matchedColor: exactMatch.color || undefined,
        confidence: 1,
      };
    }

    let bestScore = 0;
    let bestMatch: { id: string; external_name: string; color: string | null } | null = null;
    for (const a of activities) {
      const score = similarity(rawName, a.external_name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = a;
      }
    }

    if (bestMatch && bestScore > 0.6 && bestScore < 1) {
      return {
        status: 'uncertain' as const,
        matchedActivityId: bestMatch.id,
        matchedName: bestMatch.external_name,
        matchedColor: bestMatch.color || undefined,
        confidence: Math.round(bestScore * 100) / 100,
      };
    }

    return {
      status: 'new' as const,
    };
  });
}
