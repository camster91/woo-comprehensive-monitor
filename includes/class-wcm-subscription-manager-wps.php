<?php
/**
 * Subscription Manager for WPSubscription integration
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Subscription_Manager_WPS {

    public function __construct() {
        $this->init_hooks();
    }

    private function init_hooks() {
        // Add subscription health check
        add_filter( 'wcm_health_checks', array( $this, 'add_subscription_health_check' ) );
    }

    public function is_wpsubscription_active() {
        return class_exists( 'WPSubscription' ) || defined( 'WPS_PLUGIN_DIR' );
    }

    public function get_subscription_stats() {
        if ( ! $this->is_wpsubscription_active() ) {
            return array( 'total' => 0, 'active' => 0, 'cancelled' => 0 );
        }

        global $wpdb;
        $table = $wpdb->prefix . 'wps_subscriptions';

        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return array( 'total' => 0, 'active' => 0, 'cancelled' => 0 );
        }

        return array(
            'total'     => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ),
            'active'    => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'wps-active'" ),
            'cancelled' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'wps-cancelled'" ),
        );
    }

    public function add_subscription_health_check( $checks ) {
        if ( ! $this->is_wpsubscription_active() ) {
            return $checks;
        }

        $stats = $this->get_subscription_stats();

        $check = array(
            'name'    => 'WPSubscription',
            'status'  => 'good',
            'details' => array(
                'total_subscriptions'  => $stats['total'],
                'active_subscriptions' => $stats['active'],
                'cancelled'            => $stats['cancelled'],
            ),
        );

        if ( $stats['active'] === 0 && $stats['total'] > 0 ) {
            $check['status']                  = 'warning';
            $check['details']['subs_message'] = 'No active subscriptions found.';
        }

        $checks[] = $check;
        return $checks;
    }

    public function get_dashboard_stats() {
        if ( ! $this->is_wpsubscription_active() ) {
            return array();
        }
        return $this->get_subscription_stats();
    }
}
