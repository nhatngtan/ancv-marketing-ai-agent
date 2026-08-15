import type { FlowAccountRecord, FlowJobRecord } from '@ancv/shared';
import type { LocalProfileMapping } from './config.js';

function normalizedProjectUrl(value: string | undefined): string {
  return String(value ?? '').replace(/\/+$/, '');
}

export function assertFlowRuntimeSnapshot(
  job: FlowJobRecord,
  account: FlowAccountRecord,
  mapping: LocalProfileMapping,
): void {
  if (account.profileKind !== 'managed' || job.profileKind !== 'managed' || mapping.kind !== 'managed') {
    throw new Error('FLOW_SYSTEM_PROFILE_NOT_ALLOWED');
  }
  const managedProfileId = account.managedProfileId?.trim();
  if (!managedProfileId || job.managedProfileId !== managedProfileId || mapping.logicalId !== managedProfileId) {
    throw new Error('FLOW_PROFILE_MAPPING_MISMATCH');
  }
  if (!normalizedProjectUrl(account.projectUrl) || normalizedProjectUrl(account.projectUrl) !== normalizedProjectUrl(job.flowProjectUrl)) {
    throw new Error('FLOW_PROJECT_MAPPING_MISMATCH');
  }
  const accountEmail = (account.expectedAccount ?? account.email)?.trim().toLowerCase();
  const expectedAccount = job.expectedAccount?.trim().toLowerCase();
  if (!accountEmail || !expectedAccount || accountEmail !== expectedAccount) {
    throw new Error('FLOW_EXPECTED_ACCOUNT_MISMATCH');
  }
  if (mapping.expectedAccount?.trim().toLowerCase() !== expectedAccount) {
    throw new Error('FLOW_LOCAL_PROFILE_ACCOUNT_MISMATCH');
  }
}
