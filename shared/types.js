// Stack choice: Node + Express + SQLite keeps local dev fast and testable with minimal tooling.

const ApplicationStatus = Object.freeze({
  APPLIED: 'APPLIED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  INTERVIEW_REQUESTED: 'INTERVIEW_REQUESTED',
  INTERVIEW_COMPLETED: 'INTERVIEW_COMPLETED',
  OFFER_RECEIVED: 'OFFER_RECEIVED',
  REJECTED: 'REJECTED',
  GHOSTED: 'GHOSTED',
  UNKNOWN: 'UNKNOWN'
});

module.exports = {
  ApplicationStatus
};
