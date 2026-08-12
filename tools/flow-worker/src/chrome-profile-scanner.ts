import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ChromeProfileMetadata } from '@ancv/shared';

interface ChromeLocalState {
  profile?: {
    info_cache?: Record<string, {
      name?: string;
      gaia_name?: string;
      user_name?: string;
    }>;
  };
}

const profileIdPattern = /^(?:Default|Profile(?: \d+)?)$/;

export function chromeUserDataDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return resolve(localAppData, 'Google', 'Chrome', 'User Data');
}

export function parseChromeProfiles(localState: ChromeLocalState, detectedAt: string): ChromeProfileMetadata[] {
  const cache = localState.profile?.info_cache ?? {};
  return Object.entries(cache)
    .filter(([chromeProfileId]) => profileIdPattern.test(chromeProfileId))
    .map(([chromeProfileId, metadata]) => {
      const email = metadata.user_name?.trim().toLowerCase();
      return {
        chromeProfileId,
        profileLabel: metadata.name?.trim() || metadata.gaia_name?.trim() || chromeProfileId,
        ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
        detectedAt,
      };
    })
    .sort((left, right) => left.chromeProfileId.localeCompare(right.chromeProfileId, undefined, { numeric: true }));
}

export async function scanChromeProfiles(): Promise<ChromeProfileMetadata[]> {
  const statePath = join(chromeUserDataDirectory(), 'Local State');
  const raw = await readFile(statePath, 'utf8');
  return parseChromeProfiles(JSON.parse(raw) as ChromeLocalState, new Date().toISOString());
}
