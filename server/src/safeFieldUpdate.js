const SOURCE_PRIORITY = Object.freeze({
  user: 1000,
  hint: 900,
  parser: 500,
  system: 300
});

function normalizeFieldSource(source, fallback = 'parser') {
  const normalizedFallback = String(fallback || 'parser').trim().toLowerCase();
  const value = String(source || '').trim().toLowerCase();
  const candidate = value || normalizedFallback || 'parser';

  if (candidate === 'user' || candidate === 'manual' || candidate === 'manual_edit' || candidate === 'override') {
    return 'user';
  }
  if (candidate === 'hint') {
    return 'hint';
  }
  if (candidate === 'system' || candidate === 'inferred' || candidate === 'inference' || candidate === 'automation') {
    return 'system';
  }
  if (candidate === 'parser') {
    return 'parser';
  }
  return 'parser';
}

function sourcePriorityOf(source) {
  const normalized = normalizeFieldSource(source);
  return SOURCE_PRIORITY[normalized] || SOURCE_PRIORITY.parser;
}

function normalizeFieldConfidenceForComparison(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric >= 0 && numeric <= 1) {
    return numeric * 100;
  }
  return numeric;
}

function normalizeFieldConfidenceForStorage(value) {
  const normalized = normalizeFieldConfidenceForComparison(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function hasValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
}

function normalizeValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return value;
}

function applyFieldUpdate({
  existingValue,
  existingConfidence,
  existingSource,
  newValue,
  newConfidence,
  newSource
}) {
  const normalizedExistingSource = normalizeFieldSource(existingSource);
  const normalizedNewSource = normalizeFieldSource(newSource);

  const previousValue = normalizeValue(existingValue);
  const candidateValue = normalizeValue(newValue);

  const previousConfidence = normalizeFieldConfidenceForStorage(existingConfidence);
  const candidateConfidence = normalizeFieldConfidenceForStorage(newConfidence);

  const existingPriority = sourcePriorityOf(normalizedExistingSource);
  const nextPriority = sourcePriorityOf(normalizedNewSource);

  const existingHasValue = hasValue(previousValue);
  const newHasValue = hasValue(candidateValue);

  if (!newHasValue) {
    return {
      accepted: false,
      reason: 'rejected_lower_priority',
      value: previousValue,
      confidence: previousConfidence,
      source: normalizedExistingSource
    };
  }

  if (normalizedExistingSource === 'user' && existingHasValue) {
    return {
      accepted: false,
      reason: 'locked_user',
      value: previousValue,
      confidence: previousConfidence,
      source: normalizedExistingSource
    };
  }

  if (!existingHasValue) {
    return {
      accepted: true,
      reason: 'confidence_upgrade',
      value: candidateValue,
      confidence: candidateConfidence,
      source: normalizedNewSource
    };
  }

  if (nextPriority < existingPriority) {
    return {
      accepted: false,
      reason: 'rejected_lower_priority',
      value: previousValue,
      confidence: previousConfidence,
      source: normalizedExistingSource
    };
  }

  if (nextPriority === existingPriority) {
    const previousComparable = normalizeFieldConfidenceForComparison(existingConfidence);
    const candidateComparable = normalizeFieldConfidenceForComparison(newConfidence);
    if (candidateComparable > previousComparable) {
      return {
        accepted: true,
        reason: 'confidence_upgrade',
        value: candidateValue,
        confidence: candidateConfidence,
        source: normalizedNewSource
      };
    }
    return {
      accepted: false,
      reason: 'rejected_lower_priority',
      value: previousValue,
      confidence: previousConfidence,
      source: normalizedExistingSource
    };
  }

  return {
    accepted: true,
    reason: 'source_priority',
    value: candidateValue,
    confidence: candidateConfidence,
    source: normalizedNewSource
  };
}

module.exports = {
  SOURCE_PRIORITY,
  normalizeFieldSource,
  sourcePriorityOf,
  normalizeFieldConfidenceForComparison,
  normalizeFieldConfidenceForStorage,
  applyFieldUpdate
};
