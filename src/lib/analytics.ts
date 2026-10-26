import { capturePostHogEvent, capturePostHogPageView } from "@/lib/posthogClient";
import { insertVenueAnalyticsEvent } from "@/services/venueAnalyticsEventService";
import type { VenueAnalyticsEventInput } from "@/types/analytics";

export type AnalyticsEvent =
  | "venue_viewed"
  | "venue_saved"
  | "venue_unsaved"
  | "directions_clicked"
  | "website_clicked"
  | "instagram_clicked"
  | "discover_search_used"
  | "discover_filter_changed"
  | "location_enabled"
  | "recommendation_started"
  | "recommendation_completed"
  | "recommend_started"
  | "recommend_question_answered"
  | "recommend_back"
  | "recommend_results_shown"
  | "recommend_nomatch_shown"
  | "recommend_relax_applied"
  | "recommend_wildcard_swapped"
  | "recommend_pick_opened"
  | "recommend_saved"
  | "recommend_shared"
  | "map_home_viewed"
  | "map_home_venue_selected"
  | "map_home_filter_toggled"
  | "map_home_locate_clicked"
  | "map_home_searched"
  | "plan_viewed"
  | "plan_slot_changed"
  | "plan_venue_shortlisted"
  | "plan_shared"
  | "review_created"
  | "review_updated"
  | "suggestion_submitted"
  | "venue_claim_started"
  | "venue_claim_submitted"
  | "venue_claim_cancelled"
  | "venue_claim_approved"
  | "venue_claim_rejected"
  | "owner_landing_page_viewed"
  | "owner_claim_cta_clicked"
  | "owner_dashboard_first_viewed"
  | "owner_analytics_overview_viewed"
  | "owner_venue_analytics_viewed"
  | "owner_onboarding_task_clicked"
  | "owner_onboarding_task_completed"
  | "owner_onboarding_completed"
  | "owner_dashboard_viewed"
  | "owner_venue_dashboard_viewed"
  | "owner_public_venue_link_clicked"
  | "owner_contact_sheesha_clicked"
  | "owner_profile_update_started"
  | "owner_profile_update_submitted"
  | "owner_profile_update_cancelled"
  | "owner_upgrade_prompt_viewed"
  | "owner_upgrade_prompt_clicked"
  | "owner_pricing_viewed"
  | "owner_checkout_started"
  | "owner_checkout_redirected"
  | "owner_checkout_success_viewed"
  | "owner_billing_page_viewed"
  | "owner_billing_portal_opened"
  | "stripe_subscription_activated"
  | "stripe_subscription_updated"
  | "stripe_subscription_cancelled"
  | "stripe_payment_failed"
  | "admin_profile_update_approved"
  | "admin_profile_update_rejected"
  | "admin_profile_update_applied"
  | "admin_subscription_plan_updated"
  | "admin_subscription_trial_started"
  | "admin_subscription_cancelled"
  | "featured_placement_viewed"
  | "featured_placement_clicked"
  | "promoted_offer_viewed"
  | "promoted_offer_clicked"
  | "enquiry_cta_clicked"
  | "venue_enquiry_submitted"
  | "venue_enquiry_status_updated"
  | "booking_request_page_viewed"
  | "booking_request_started"
  | "booking_request_submitted"
  | "booking_request_submit_failed"
  | "booking_request_status_link_created"
  | "customer_booking_status_viewed"
  | "customer_booking_status_invalid_token"
  | "customer_booking_alternative_accepted"
  | "customer_booking_alternative_declined"
  | "customer_booking_status_cta_clicked"
  | "customer_bookings_page_viewed"
  | "customer_booking_card_clicked"
  | "customer_bookings_empty_state_viewed"
  | "notification_created"
  | "notification_bell_opened"
  | "notification_clicked"
  | "notification_marked_read"
  | "notification_marked_all_read"
  | "notification_dismissed"
  | "notification_email_skipped"
  | "notification_email_failed"
  | "notification_email_sent"
  | "email_notification_queued"
  | "email_notification_sent"
  | "email_notification_failed"
  | "email_notification_skipped"
  | "email_template_built"
  | "owner_bookings_viewed"
  | "owner_booking_calendar_viewed"
  | "owner_booking_calendar_view_changed"
  | "owner_booking_calendar_date_changed"
  | "owner_booking_calendar_event_opened"
  | "owner_booking_calendar_filter_changed"
  | "owner_booking_accepted"
  | "owner_booking_declined"
  | "owner_booking_alternative_proposed"
  | "owner_booking_completed"
  | "owner_booking_no_show"
  | "admin_bookings_viewed"
  | "admin_booking_marked_spam"
  | "admin_booking_answered_for_venue"
  | "owner_availability_viewed"
  | "owner_availability_settings_updated"
  | "owner_booking_window_added"
  | "owner_booking_window_updated"
  | "owner_booking_window_deleted"
  | "owner_booking_windows_replaced"
  | "owner_blackout_date_added"
  | "owner_blackout_date_deleted"
  | "booking_request_blocked_by_availability"
  | "booking_time_options_viewed"
  | "owner_enquiry_inbox_viewed"
  | "owner_enquiry_viewed"
  | "owner_enquiry_status_updated"
  | "owner_enquiry_marked_converted"
  | "owner_enquiry_upgrade_prompt_viewed"
  | "owner_enquiry_upgrade_prompt_clicked"
  | "owner_promotions_viewed"
  | "owner_promotion_request_started"
  | "owner_promotion_request_submitted"
  | "owner_promotion_request_cancelled"
  | "owner_promotion_upgrade_prompt_viewed"
  | "owner_promotion_upgrade_prompt_clicked"
  | "admin_promotion_request_approved"
  | "admin_promotion_request_rejected"
  | "admin_promotion_request_converted"
  | "owner_venue_bookings_viewed"
  | "owner_booking_rules_viewed"
  | "owner_booking_rules_saved"
  | "owner_menu_page_viewed"
  | "owner_menu_published"
  | "owner_menu_section_created"
  | "owner_menu_links_updated"
  | "owner_media_page_viewed"
  | "owner_media_upload_started"
  | "owner_media_upload_completed"
  | "owner_media_upload_failed"
  | "owner_media_metadata_updated"
  | "owner_media_pending_deleted"
  | "admin_media_review_viewed"
  | "admin_media_approved"
  | "admin_media_rejected";

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  try {
    const nextProperties = compactProperties(properties);
    capturePostHogEvent(event, nextProperties);
    if (import.meta.env.DEV) {
      console.info("[analytics]", event, nextProperties);
    }
  } catch {
    return;
  }
}

export function trackPageView(path: string, routePattern?: string): void {
  try {
    capturePostHogPageView(path, routePattern);
    if (import.meta.env.DEV) {
      console.info("[pageview]", path, routePattern);
    }
  } catch {
    return;
  }
}

export function trackVenueAnalyticsEvent(input: VenueAnalyticsEventInput): void {
  void insertVenueAnalyticsEvent(input).catch((error) => {
    if (import.meta.env.DEV) {
      console.info("[venue analytics]", error instanceof Error ? error.message : "Could not insert venue analytics event.");
    }
  });
}

function compactProperties(properties?: AnalyticsProperties): AnalyticsProperties | undefined {
  if (!properties) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
}
