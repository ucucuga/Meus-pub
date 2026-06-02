export type EvidenceFileRecord = {
  name: string;
  type: string;
  data: string;
  size: number;
};

export type PartyEvidenceRecord = {
  reason: string;
  fileNames: string[];
  files?: EvidenceFileRecord[];
  submittedAt: string;
};

export type ParsedDisputeEvidence = {
  employer: PartyEvidenceRecord | null;
  freelancer: PartyEvidenceRecord | null;
};

export function parseDisputeEvidence(evidence: unknown): ParsedDisputeEvidence {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { employer: null, freelancer: null };
  }
  const record = evidence as Record<string, unknown>;
  return {
    employer: parseParty(record.employer),
    freelancer: parseParty(record.freelancer),
  };
}

function parseEvidenceFiles(value: unknown): EvidenceFileRecord[] {
  if (!Array.isArray(value)) return [];
  const files: EvidenceFileRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.name === 'string' &&
      typeof row.type === 'string' &&
      typeof row.data === 'string' &&
      typeof row.size === 'number'
    ) {
      files.push({
        name: row.name,
        type: row.type,
        data: row.data,
        size: row.size,
      });
    }
  }
  return files;
}

function parseParty(value: unknown): PartyEvidenceRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.reason !== 'string') return null;
  const files = parseEvidenceFiles(row.files);
  const fileNames = Array.isArray(row.fileNames)
    ? row.fileNames.filter((n): n is string => typeof n === 'string')
    : files.map((f) => f.name);
  return {
    reason: row.reason,
    fileNames,
    files: files.length > 0 ? files : undefined,
    submittedAt: typeof row.submittedAt === 'string' ? row.submittedAt : '',
  };
}
