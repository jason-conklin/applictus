function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function domainIncludes(domain, token) {
  const normalizedDomain = normalize(domain);
  const normalizedToken = normalize(token);
  if (!normalizedDomain || !normalizedToken) {
    return false;
  }
  return normalizedDomain === normalizedToken || normalizedDomain.endsWith(`.${normalizedToken}`);
}

function includesAny(text, patterns) {
  const source = normalize(text);
  return patterns.some((pattern) => pattern.test(source));
}

function buildDetection(id, matches, reason) {
  if (!matches) {
    return null;
  }
  return {
    providerId: id,
    reason
  };
}

const PROVIDERS = [
  {
    id: 'linkedin_jobs',
    detect({ fromEmail, fromDomain, subject }) {
      const sender = normalize(fromEmail);
      const domain = normalize(fromDomain);
      const subj = String(subject || '');
      const directSender = sender === 'jobs-noreply@linkedin.com';
      const subjectMatch = /your application was sent to/i.test(subj);
      if (directSender && subjectMatch) {
        return buildDetection(this.id, true, 'linkedin jobs sender + application sent subject');
      }
      if (domain.endsWith('linkedin.com') && subjectMatch) {
        return buildDetection(this.id, true, 'linkedin domain + application sent subject');
      }
      return null;
    }
  },
  {
    id: 'workable_candidates',
    detect({ fromEmail, fromDomain, text }) {
      const sender = normalize(fromEmail);
      const domain = normalize(fromDomain);
      const body = String(text || '');
      const senderMatch = sender.endsWith('@candidates.workablemail.com') || domain.endsWith('workablemail.com');
      if (!senderMatch) {
        return null;
      }
      const bodyMatch = /your application for the/i.test(body) && /submitted successfully/i.test(body);
      return buildDetection(this.id, bodyMatch || senderMatch, bodyMatch ? 'workable sender + confirmation body' : 'workable sender domain');
    }
  },
  {
    id: 'indeed_apply',
    detect({ fromEmail, fromDomain, subject }) {
      const sender = normalize(fromEmail);
      const domain = normalize(fromDomain);
      const subj = String(subject || '');
      if (sender === 'indeedapply@indeed.com') {
        return buildDetection(this.id, true, 'indeed apply sender');
      }
      if (domain.endsWith('indeed.com') && /indeed application:/i.test(subj)) {
        return buildDetection(this.id, true, 'indeed domain + subject');
      }
      return null;
    }
  },
  {
    id: 'workday',
    detect({ fromDomain, text }) {
      const domain = normalize(fromDomain);
      const body = String(text || '');
      if (domain.includes('myworkday.com')) {
        return buildDetection(this.id, true, 'myworkday sender domain');
      }
      if (/thank you for applying for the role of/i.test(body)) {
        return buildDetection(this.id, true, 'workday role phrase in body');
      }
      return null;
    }
  },
  {
    id: 'greenhouse',
    detect({ fromEmail, fromDomain, subject, text }) {
      const sender = normalize(fromEmail);
      const domain = normalize(fromDomain);
      const subj = String(subject || '');
      const body = String(text || '');
      const senderMatch =
        sender.includes('@greenhouse.io') ||
        sender.includes('@greenhouse-mail.io') ||
        domainIncludes(domain, 'greenhouse.io') ||
        domainIncludes(domain, 'greenhouse-mail.io');
      const phraseMatch =
        /your application was submitted/i.test(subj) ||
        /thank you for applying to/i.test(subj) ||
        /your application has been received/i.test(subj) ||
        /your application was submitted/i.test(body);
      if (senderMatch && phraseMatch) {
        return buildDetection(this.id, true, 'greenhouse sender/domain + application confirmation phrase');
      }
      return null;
    }
  },
  {
    id: 'lever',
    detect({ fromDomain, subject, text }) {
      const domain = normalize(fromDomain);
      const subj = String(subject || '');
      const body = String(text || '');
      const domainMatch = domainIncludes(domain, 'lever.co');
      const phraseMatch =
        /application confirmation/i.test(subj) ||
        /thanks for applying to/i.test(subj) ||
        /application received/i.test(subj) ||
        /application confirmation/i.test(body) ||
        /thanks for applying to/i.test(body);
      if (domainMatch && phraseMatch) {
        return buildDetection(this.id, true, 'lever sender domain + application confirmation phrase');
      }
      return null;
    }
  },
  {
    id: 'icims',
    detect({ fromDomain, subject, text }) {
      const domain = normalize(fromDomain);
      const subj = String(subject || '');
      const body = String(text || '');
      const domainMatch = domainIncludes(domain, 'icims.com');
      const phraseMatch =
        /thank you for your interest in/i.test(subj) ||
        /thank you for your interest in/i.test(body) ||
        /requisition/i.test(body);
      if (domainMatch && phraseMatch) {
        return buildDetection(this.id, true, 'icims sender domain + requisition/interest phrase');
      }
      return null;
    }
  },
  {
    id: 'smartrecruiters',
    detect({ fromDomain, subject, text }) {
      const domain = normalize(fromDomain);
      const subj = String(subject || '');
      const body = String(text || '');
      const domainMatch =
        domainIncludes(domain, 'smartrecruiters.com') || domainIncludes(domain, 'smartrecruitersmail.com');
      const phraseMatch =
        /your application has been received/i.test(subj) ||
        /application has been received/i.test(body) ||
        /smartrecruiters/i.test(body);
      if (domainMatch && phraseMatch) {
        return buildDetection(this.id, true, 'smartrecruiters domain + application received phrase');
      }
      return null;
    }
  },
  {
    id: 'taleo',
    detect({ fromDomain, subject, text }) {
      const domain = normalize(fromDomain);
      const subj = String(subject || '');
      const body = String(text || '');
      const domainMatch = domainIncludes(domain, 'taleo.net') || domainIncludes(domain, 'taleo.com');
      const phraseMatch =
        /submission status/i.test(subj) ||
        /thank you for applying/i.test(subj) ||
        /submission status/i.test(body) ||
        /taleo/i.test(body);
      if (domainMatch && phraseMatch) {
        return buildDetection(this.id, true, 'taleo domain + submission status phrase');
      }
      return null;
    }
  },
  {
    id: 'generic',
    detect() {
      return buildDetection(this.id, true, 'fallback');
    }
  }
];

function detectProvider({ fromEmail, fromDomain, subject, headers, text }) {
  const payload = {
    fromEmail,
    fromDomain,
    subject,
    headers,
    text
  };
  for (const provider of PROVIDERS) {
    const result = provider.detect(payload);
    if (result && result.providerId) {
      return result;
    }
  }
  return {
    providerId: 'generic',
    reason: 'fallback'
  };
}

module.exports = {
  PROVIDERS,
  detectProvider,
  includesAny
};
