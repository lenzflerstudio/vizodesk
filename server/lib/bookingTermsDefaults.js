/**
 * Default portal terms copy for seeding `booking_terms_templates` (keep in sync with client defaultBookingTerms.js).
 */

const DEFAULT_PHOTO_VIDEO_TERMS = `• Cancellation: In the event of cancellation, the deposit is non-refundable.
• Creative Control: Photographer/Videographer has creative control over the shoot.
• Refund Policy: No refunds will be given once the services have been rendered. Raw Images/Footage: Raw images/footage are not included unless specifically agreed upon in writing.
• Delivery of Content: Final photo and video content will be delivered within 6-8 weeks of the event date. Delivery timeframe begins once full payment has been received.
• Usage Rights: Photographer/Videographer retains full copyright ownership. Client receives personal-use rights only.
• Injury/Loss: Photographer/Videographer is not liable for injury, property damage, or circumstances beyond reasonable control.
• Equipment Damage: Client is responsible for any damage to equipment caused by the Client or guests. Repair or replacement costs must be reimbursed.
• Safe Working Environment: Photographer/Videographer may stop coverage if conditions become unsafe. No refund will be issued in such cases.
• Force Majeure: Photographer/Videographer is not liable for failure to perform due to illness, emergency, natural disaster, or events beyond control.
• Limitation of Liability: Total liability is limited to the amount paid under this agreement.`;

const STARTER_SOCIAL_RETAINER_TERMS = `• Scope: Social media management and related deliverables are limited to what is described in your booking summary (platforms, frequency, and monthly deliverables).
• Billing: Fees follow the monthly price and billing cycle shown on your booking page unless otherwise agreed in writing.
• Approvals & timing: Client feedback is due within the timeframe stated in your project plan. Delays may shift the posting schedule.
• Content: The provider may use third-party or licensed assets where appropriate; usage rights for final deliverables are scoped per engagement.
• Cancellation: Either party may end the engagement as described in your written agreement or with reasonable notice as required by law.
• Performance: Results depend on platform algorithms and audience behavior; specific reach or growth is not guaranteed.
• Liability: Total liability is limited to fees paid for the current billing period unless a higher limit is required by law.`;

function getDefaultPhotoVideoTerms() {
  return DEFAULT_PHOTO_VIDEO_TERMS;
}

function getStarterSocialRetainerTerms() {
  return STARTER_SOCIAL_RETAINER_TERMS;
}

module.exports = {
  getDefaultPhotoVideoTerms,
  getStarterSocialRetainerTerms,
};
