<?php
/**
 * Uninstall handler — removes all plugin data when deleted via WordPress admin.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

global $wpdb;

// ── Drop custom tables ──
$tables = array(
    $wpdb->prefix . 'wcm_error_logs',
    $wpdb->prefix . 'wcm_health_logs',
    $wpdb->prefix . 'wcm_dispute_evidence',
    $wpdb->prefix . 'wcm_recovery_log',
    $wpdb->prefix . 'woo_subscription_acknowledgments',
);
foreach ( $tables as $table ) {
    $wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore
}

// ── Delete all plugin options ──
$options = $wpdb->get_col(
    "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'wcm_%'"
);
foreach ( $options as $option ) {
    delete_option( $option );
}

// ── Clean up all order/product meta ──
$meta_keys = array(
    // Pre-orders
    '_preorder_charge_status',
    '_preorder_payment_token',
    '_preorder_stripe_customer_id',
    '_preorder_stripe_payment_intent',
    '_preorder_button_text',
    '_preorder_availability_date',
    '_preorder_message',
    // Subscription protector (order meta)
    '_wcm_price_adjustment',
    '_wcm_source_subscription',
    '_wcm_adjustment_amount',
    '_wcm_onetime_total',
    '_wcm_subscription_total',
    '_wcm_difference_charged',
    '_wcm_difference_order_id',
    // Subscription protector (product meta)
    '_wcm_onetime_price',
    '_wcm_onetime_product_id',
    // Legacy (from old recovery/price-diff classes)
    '_wcm_recovery_order',
    '_wcm_subscription_id',
    '_wcm_recovery_amount',
    '_wcm_regular_total',
    '_spd_difference_charged',
    '_spd_difference_order_id',
    '_spd_onetime_price',
    '_wcm_spd_source_subscription',
    '_wcm_spd_charge_type',
    // Dispute/acknowledgment
    '_wcm_subscription_acknowledgment',
);

// Clean postmeta (legacy orders + product meta)
$placeholders = implode( ',', array_fill( 0, count( $meta_keys ), '%s' ) );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->postmeta} WHERE meta_key IN ({$placeholders})", $meta_keys ) ); // phpcs:ignore

// Clean HPOS orders meta table
$hpos_table = $wpdb->prefix . 'wc_orders_meta';
if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $hpos_table ) ) === $hpos_table ) {
    $wpdb->query( $wpdb->prepare( "DELETE FROM {$hpos_table} WHERE meta_key IN ({$placeholders})", $meta_keys ) ); // phpcs:ignore
}

// ── Remove evidence files ──
$upload_dir   = wp_upload_dir();
$evidence_dir = $upload_dir['basedir'] . '/wcm-evidence/';
if ( is_dir( $evidence_dir ) ) {
    $files = glob( $evidence_dir . '*' );
    if ( $files ) {
        foreach ( $files as $file ) {
            if ( is_file( $file ) ) {
                unlink( $file );
            }
        }
    }
    rmdir( $evidence_dir );
}

// ── Clear all scheduled events ──
wp_clear_scheduled_hook( 'wcm_daily_health_check' );
wp_clear_scheduled_hook( 'wcm_hourly_dispute_check' );
wp_clear_scheduled_hook( 'wcm_preorder_retry_charge' );

// ── Clean up transients ──
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_wcm_%' OR option_name LIKE '_transient_timeout_wcm_%'" );
