<?php
/**
 * Health Monitor - Performs comprehensive health checks on WooCommerce stores
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Health_Monitor {

    public function __construct() {
        $this->init_hooks();
    }

    private function init_hooks() {
        add_action( 'wcm_daily_health_check', array( $this, 'run_health_check' ) );
    }

    /**
     * Run all health checks
     */
    public function run_health_check() {
        if ( '1' !== get_option( 'wcm_enable_health_monitoring', '1' ) ) {
            return array();
        }

        $checks = array();
        $checks[] = $this->check_woocommerce_status();
        $checks[] = $this->check_stripe_gateway();
        $checks[] = $this->check_action_scheduler();
        $checks[] = $this->check_wordpress_cron();
        $checks[] = $this->check_ssl_certificate();
        $checks[] = $this->check_database_health();
        $checks[] = $this->check_plugin_updates();
        $checks[] = $this->check_server_resources();
        $checks[] = $this->check_api_connectivity();
        $checks[] = $this->check_shipping_tax();

        // Allow other modules (like subscription manager) to add checks
        $checks = apply_filters( 'wcm_health_checks', $checks );

        $this->log_health_check_results( $checks );
        $this->send_health_alerts( $checks );
        $this->update_health_score( $checks );

        return $checks;
    }

    private function check_woocommerce_status() {
        $check = array(
            'name'    => 'WooCommerce Status',
            'status'  => 'good',
            'details' => array(),
        );

        $check['details']['woocommerce_version'] = defined( 'WC_VERSION' ) ? WC_VERSION : 'Unknown';

        $required_pages = array( 'shop', 'cart', 'checkout', 'myaccount' );
        $missing_pages  = array();
        foreach ( $required_pages as $page ) {
            $page_id = wc_get_page_id( $page );
            if ( $page_id <= 0 || 'publish' !== get_post_status( $page_id ) ) {
                $missing_pages[] = $page;
            }
        }

        if ( ! empty( $missing_pages ) ) {
            $check['status']                   = 'warning';
            $check['details']['missing_pages'] = implode( ', ', $missing_pages );
        }

        return $check;
    }

    private function check_stripe_gateway() {
        $check = array(
            'name'    => 'Stripe Gateway',
            'status'  => 'good',
            'details' => array(),
        );

        if ( ! class_exists( 'WC_Stripe' ) ) {
            $check['status']                    = 'warning';
            $check['details']['stripe_message'] = 'Stripe gateway plugin not active';
            return $check;
        }

        $stripe_settings = get_option( 'woocommerce_stripe_settings' );
        if ( $stripe_settings ) {
            $check['details']['enabled']   = isset( $stripe_settings['enabled'] ) && 'yes' === $stripe_settings['enabled'] ? 'Yes' : 'No';
            $check['details']['test_mode'] = isset( $stripe_settings['testmode'] ) && 'yes' === $stripe_settings['testmode'] ? 'Yes' : 'No';

            if ( isset( $stripe_settings['enabled'] ) && 'yes' !== $stripe_settings['enabled'] ) {
                $check['status']                    = 'critical';
                $check['details']['stripe_message'] = 'Stripe gateway is DISABLED. Customers cannot pay.';
            }
        }

        return $check;
    }

    private function check_action_scheduler() {
        $check = array(
            'name'    => 'Action Scheduler',
            'status'  => 'good',
            'details' => array(),
        );

        if ( class_exists( 'ActionScheduler' ) ) {
            global $wpdb;
            $pending = $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}actionscheduler_actions WHERE status = 'pending'" );
            $failed  = $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}actionscheduler_actions WHERE status = 'failed'" );

            $check['details']['pending_actions'] = $pending;
            $check['details']['failed_actions']  = $failed;

            if ( $failed > 50 ) {
                $check['status']                     = 'critical';
                $check['details']['scheduler_message'] = $failed . ' failed tasks. WP-Cron may be broken.';
            } elseif ( $failed > 10 ) {
                $check['status'] = 'warning';
            }
        }

        return $check;
    }

    private function check_wordpress_cron() {
        $check = array(
            'name'    => 'WordPress Cron',
            'status'  => 'good',
            'details' => array(),
        );

        $check['details']['cron_enabled'] = defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ? 'No (external cron recommended)' : 'Yes';

        return $check;
    }

    private function check_ssl_certificate() {
        $check = array(
            'name'    => 'SSL Certificate',
            'status'  => 'good',
            'details' => array(),
        );

        $check['details']['https'] = is_ssl() ? 'Yes' : 'No';

        if ( ! is_ssl() ) {
            $check['status']                = 'critical';
            $check['details']['ssl_message'] = 'Site is not using HTTPS. Payment pages must be secure.';
        }

        return $check;
    }

    private function check_database_health() {
        $check = array(
            'name'    => 'Database Health',
            'status'  => 'good',
            'details' => array(),
        );

        global $wpdb;
        $db_size = $wpdb->get_var( "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) FROM information_schema.tables WHERE table_schema = DATABASE()" );
        $check['details']['database_size_mb'] = $db_size;

        $sessions = $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}woocommerce_sessions" );
        $check['details']['active_sessions'] = $sessions;

        if ( $sessions > 10000 ) {
            $check['status']                    = 'warning';
            $check['details']['session_message'] = 'High number of sessions. Consider cleanup.';
        }

        return $check;
    }

    private function check_plugin_updates() {
        $check = array(
            'name'    => 'Plugin & Theme Updates',
            'status'  => 'good',
            'details' => array(),
        );

        $update_plugins = get_site_transient( 'update_plugins' );
        $plugin_updates = $update_plugins && isset( $update_plugins->response ) ? count( $update_plugins->response ) : 0;
        $check['details']['plugin_updates'] = $plugin_updates;

        $update_themes = get_site_transient( 'update_themes' );
        $theme_updates = $update_themes && isset( $update_themes->response ) ? count( $update_themes->response ) : 0;
        $check['details']['theme_updates'] = $theme_updates;

        if ( $plugin_updates > 5 || $theme_updates > 2 ) {
            $check['status'] = 'warning';
        }

        return $check;
    }

    private function check_server_resources() {
        $check = array(
            'name'    => 'Server Resources',
            'status'  => 'good',
            'details' => array(),
        );

        $check['details']['php_version']       = phpversion();
        $check['details']['memory_limit']      = ini_get( 'memory_limit' );
        $check['details']['max_execution_time'] = ini_get( 'max_execution_time' );

        $memory_limit = wp_convert_hr_to_bytes( ini_get( 'memory_limit' ) );
        if ( $memory_limit < 128 * MB_IN_BYTES ) {
            $check['status']                     = 'warning';
            $check['details']['memory_message'] = 'Memory limit is below 128M. WooCommerce recommends at least 256M.';
        }

        return $check;
    }

    private function check_api_connectivity() {
        $check = array(
            'name'    => 'API Connectivity',
            'status'  => 'good',
            'details' => array(),
        );

        $monitoring_server = get_option( 'wcm_monitoring_server', '' );
        if ( ! empty( $monitoring_server ) ) {
            $response = wp_remote_get( str_replace( '/api/track-woo-error', '/api/health', $monitoring_server ), array( 'timeout' => 10 ) );
            if ( is_wp_error( $response ) ) {
                $check['status']                  = 'warning';
                $check['details']['server_message'] = 'Cannot reach monitoring server: ' . $response->get_error_message();
            } else {
                $check['details']['monitoring_server'] = 'Connected';
            }
        }

        $rest_url = rest_url( 'wc/v3/' );
        $check['details']['rest_api_url'] = $rest_url;

        return $check;
    }

    private function check_shipping_tax() {
        $check = array(
            'name'    => 'Shipping & Tax',
            'status'  => 'good',
            'details' => array(),
        );

        $shipping_zones = WC_Shipping_Zones::get_zones();
        $check['details']['shipping_zones'] = count( $shipping_zones );

        if ( 0 === count( $shipping_zones ) ) {
            $check['status']                       = 'warning';
            $check['details']['shipping_message'] = 'No shipping zones configured';
        }

        $tax_enabled = wc_tax_enabled();
        $check['details']['tax_enabled'] = $tax_enabled ? 'Yes' : 'No';

        if ( ! $tax_enabled ) {
            $check['status']                  = 'warning';
            $check['details']['tax_message'] = 'Tax calculation is disabled';
        }

        $check['details']['prices_include_tax'] = 'yes' === get_option( 'woocommerce_prices_include_tax' ) ? 'Yes' : 'No';

        return $check;
    }

    private function log_health_check_results( $checks ) {
        global $wpdb;
        $table_name = $wpdb->prefix . 'wcm_health_logs';

        foreach ( $checks as $check ) {
            $wpdb->insert(
                $table_name,
                array(
                    'check_type'  => $check['name'],
                    'status'      => $check['status'],
                    'details'     => wp_json_encode( $check['details'] ),
                    'created_at'  => current_time( 'mysql' ),
                )
            );
        }
    }

    private function send_health_alerts( $checks ) {
        $critical_checks = array_filter( $checks, function ( $check ) {
            return 'critical' === $check['status'];
        } );

        if ( empty( $critical_checks ) ) {
            return;
        }

        $monitoring_server = get_option( 'wcm_monitoring_server', '' );
        if ( empty( $monitoring_server ) ) {
            return;
        }

        $alert_data = array(
            'type'            => 'health_check_critical',
            'store_url'       => home_url(),
            'store_name'      => get_bloginfo( 'name' ),
            'critical_checks' => array(),
            'timestamp'       => current_time( 'mysql' ),
        );

        foreach ( $critical_checks as $check ) {
            $alert_data['critical_checks'][] = array(
                'name'    => $check['name'],
                'details' => $check['details'],
            );
        }

        wp_remote_post( $monitoring_server, array(
            'method'      => 'POST',
            'timeout'     => 10,
            'blocking'    => false,
            'headers'     => array( 'Content-Type' => 'application/json' ),
            'body'        => wp_json_encode( $alert_data ),
            'data_format' => 'body',
        ) );
    }

    private function update_health_score( $checks ) {
        $scores = array( 'good' => 100, 'warning' => 50, 'critical' => 0 );
        $total  = 0;
        $count  = count( $checks );

        foreach ( $checks as $check ) {
            $total += isset( $scores[ $check['status'] ] ) ? $scores[ $check['status'] ] : 50;
        }

        $average = $count > 0 ? round( $total / $count ) : 100;
        update_option( 'wcm_health_score', $average );
        update_option( 'wcm_health_score_updated', current_time( 'mysql' ) );

        $breakdown = array();
        foreach ( $checks as $check ) {
            $breakdown[ $check['name'] ] = array(
                'status' => $check['status'],
                'score'  => isset( $scores[ $check['status'] ] ) ? $scores[ $check['status'] ] : 50,
            );
        }
        update_option( 'wcm_health_breakdown', $breakdown );
    }

    public function get_health_score() {
        return array(
            'score'     => get_option( 'wcm_health_score', 100 ),
            'updated'   => get_option( 'wcm_health_score_updated', '' ),
            'breakdown' => get_option( 'wcm_health_breakdown', array() ),
        );
    }

    public function get_recent_health_logs( $limit = 50 ) {
        global $wpdb;
        $table_name = $wpdb->prefix . 'wcm_health_logs';
        return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table_name} ORDER BY created_at DESC LIMIT %d", $limit ) );
    }

    public function get_health_stats( $days = 30 ) {
        global $wpdb;
        $table_name  = $wpdb->prefix . 'wcm_health_logs';
        $date_cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days" ) );

        $stats = array(
            'total_checks'  => 0,
            'by_status'     => array( 'good' => 0, 'warning' => 0, 'critical' => 0 ),
            'by_check_type' => array(),
        );

        $stats['total_checks'] = $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table_name} WHERE created_at >= %s", $date_cutoff ) );

        $status_counts = $wpdb->get_results( $wpdb->prepare( "SELECT status, COUNT(*) as count FROM {$table_name} WHERE created_at >= %s GROUP BY status", $date_cutoff ) );
        foreach ( $status_counts as $s ) {
            $stats['by_status'][ $s->status ] = $s->count;
        }

        return $stats;
    }
}
