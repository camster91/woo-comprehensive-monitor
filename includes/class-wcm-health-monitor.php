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
        add_action( 'wp_ajax_wcm_fix_action_scheduler', array( $this, 'ajax_fix_action_scheduler' ) );
        add_action( 'wp_ajax_wcm_fix_wp_cron', array( $this, 'ajax_fix_wp_cron' ) );
        add_action( 'wp_ajax_wcm_review_stuck_orders', array( $this, 'ajax_review_stuck_orders' ) );
        add_action( 'wp_ajax_wcm_review_overdue_subscriptions', array( $this, 'ajax_review_overdue_subscriptions' ) );
        add_action( 'wp_ajax_wcm_configure_shipstation', array( $this, 'ajax_configure_shipstation' ) );
        add_action( 'wp_ajax_wcm_configure_stripe_webhooks', array( $this, 'ajax_configure_stripe_webhooks' ) );
        add_action( 'wp_ajax_wcm_enable_stripe_gateway', array( $this, 'ajax_enable_stripe_gateway' ) );
    }

    /**
     * Run all health checks
     */
    public function run_health_check() {
        if ( '1' !== get_option( 'wcm_enable_health_monitoring', '1' ) ) {
            return array();
        }
        
        // Respect health check interval — default 6 hours (was 1 hour, too expensive).
        // Each health check runs 14 queries including very heavy ones (subscription N+1,
        // information_schema scan, blocking HTTP). 6h is a safe default.
        $interval = (int) get_option( 'wcm_health_check_interval', 6 * HOUR_IN_SECONDS );
        $last_run = (int) get_option( 'wcm_health_last_run', 0 );
        $now      = time();

        if ( $last_run && ( $now - $last_run ) < $interval ) {
            return array();
        }

        update_option( 'wcm_health_last_run', $now, false ); // false = don't autoload every page

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
        $checks[] = $this->check_order_flow();
        $checks[] = $this->check_subscription_timing();
        $checks[] = $this->check_shipstation_integration();
        $checks[] = $this->check_stripe_webhooks();

        // Allow other modules (like subscription manager) to add checks
        $checks = apply_filters( 'wcm_health_checks', $checks );

        $this->log_health_check_results( $checks );
        $this->send_health_alerts( $checks );
        $this->update_health_score( $checks );

        // Send a lightweight heartbeat to the monitoring server so it can detect
        // stores that go silent (plugin deactivated, site down, cron broken).
        // This fires on every successful health-check run regardless of result.
        WCM_Helpers::send_event_to_server( 'heartbeat', array(
            'plugin_version' => WCM_VERSION,
            'health_score'   => $this->get_health_score(),
        ) );

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

        // Check for Stripe plugin classes (different versions)
        $stripe_active = false;
        $stripe_gateway_enabled = false;
        
        if ( class_exists( 'WC_Stripe' ) || class_exists( 'WC_Stripe_API' ) || class_exists( 'WooCommerce\\Stripe\\Gateway' ) ) {
            $stripe_active = true;
            $check['details']['plugin_active'] = 'Yes';
            
            // Check if Stripe gateway is enabled in WooCommerce settings
            if ( function_exists( 'WC' ) && method_exists( WC(), 'payment_gateways' ) ) {
                $gateways = WC()->payment_gateways()->payment_gateways();
                if ( isset( $gateways['stripe'] ) ) {
                    $check['details']['enabled'] = $gateways['stripe']->enabled === 'yes' ? 'Yes' : 'No';
                    $stripe_gateway_enabled = $gateways['stripe']->enabled === 'yes';
                    
                    // Check test mode
                    $stripe_settings = get_option( 'woocommerce_stripe_settings' );
                    if ( $stripe_settings ) {
                        $check['details']['test_mode'] = isset( $stripe_settings['testmode'] ) && 'yes' === $stripe_settings['testmode'] ? 'Yes' : 'No';
                    }
                }
            }
        } else {
            $check['status'] = 'warning';
            $check['details']['stripe_message'] = 'Stripe gateway plugin not installed or activated';
            return $check;
        }

        if ( ! $stripe_gateway_enabled ) {
            $check['status'] = 'critical';
            $check['details']['stripe_message'] = 'Stripe gateway is DISABLED in WooCommerce settings. Customers cannot pay.';
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

        // information_schema.tables acquires metadata locks and is slow on busy servers.
        // Cache the result for 6 hours — DB size doesn't change meaningfully in minutes.
        $db_size = get_transient( 'wcm_db_size_mb' );
        if ( false === $db_size ) {
            $db_size = $wpdb->get_var( "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) FROM information_schema.tables WHERE table_schema = DATABASE()" );
            set_transient( 'wcm_db_size_mb', $db_size, 6 * HOUR_IN_SECONDS );
        }
        $check['details']['database_size_mb'] = $db_size;

        $sessions = $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}woocommerce_sessions" );
        $check['details']['active_sessions'] = $sessions;

        if ( $sessions > 10000 ) {
            $check['status']                     = 'warning';
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
            // Cache connectivity status for 1 hour — avoids a blocking HTTP call on
            // every health check run. A 10s blocking wp_remote_get ties up the entire
            // PHP-FPM worker and starves other incoming requests.
            $cache_key = 'wcm_api_connectivity';
            $cached    = get_transient( $cache_key );

            if ( false !== $cached ) {
                $check['details']['monitoring_server'] = $cached;
                if ( 'Unreachable' === $cached ) {
                    $check['status']                    = 'warning';
                    $check['details']['server_message'] = 'Monitoring server unreachable (cached result).';
                }
            } else {
                $server_url = str_replace( '/api/track-woo-error', '/api/health', $monitoring_server );
                $response   = wp_remote_get( $server_url, array(
                    'timeout'   => 3,
                    'sslverify' => false,
                ) );

                if ( is_wp_error( $response ) ) {
                    $check['status']                    = 'warning';
                    $check['details']['server_message'] = 'Cannot reach monitoring server: ' . $response->get_error_message();
                    set_transient( $cache_key, 'Unreachable', 2 * HOUR_IN_SECONDS );
                } else {
                    $check['details']['monitoring_server'] = 'Connected';
                    set_transient( $cache_key, 'Connected', 6 * HOUR_IN_SECONDS );
                }
            }
        }

        $check['details']['rest_api_url'] = rest_url( 'wc/v3/' );

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

    /**
     * Check for stuck orders in the workflow
     */
    private function check_order_flow() {
        $check = array(
            'name'    => 'Order Flow',
            'status'  => 'good',
            'details' => array(),
        );

        if ( ! function_exists( 'wc_get_orders' ) ) {
            $check['details']['error'] = 'WooCommerce not loaded';
            return $check;
        }

        // Cache for 2 hours — 3 wc_get_orders() calls with date+status filters each do
        // complex SQL JOINs. No need to re-run every health check cycle.
        $cached = get_transient( 'wcm_order_flow_check' );
        if ( false !== $cached ) {
            return $cached;
        }

        $one_hour_ago     = gmdate( 'Y-m-d H:i:s', strtotime( '-1 hour' ) );
        $twentyfour_ago   = gmdate( 'Y-m-d H:i:s', strtotime( '-24 hours' ) );
        $fortyeight_ago   = gmdate( 'Y-m-d H:i:s', strtotime( '-48 hours' ) );

        $pending_orders = wc_get_orders( array(
            'status'       => 'pending',
            'date_created' => '<' . $one_hour_ago,
            'limit'        => 20,
            'return'       => 'ids',
        ) );
        $check['details']['pending_stuck'] = count( $pending_orders );
        if ( ! empty( $pending_orders ) ) {
            $check['details']['pending_order_ids'] = implode( ', ', $pending_orders );
        }

        $processing_orders = wc_get_orders( array(
            'status'       => 'processing',
            'date_created' => '<' . $twentyfour_ago,
            'limit'        => 20,
            'return'       => 'ids',
        ) );
        $check['details']['processing_stuck'] = count( $processing_orders );
        if ( ! empty( $processing_orders ) ) {
            $check['details']['processing_order_ids'] = implode( ', ', $processing_orders );
        }

        $onhold_orders = wc_get_orders( array(
            'status'       => 'on-hold',
            'date_created' => '<' . $fortyeight_ago,
            'limit'        => 20,
            'return'       => 'ids',
        ) );
        $check['details']['onhold_stuck'] = count( $onhold_orders );
        if ( ! empty( $onhold_orders ) ) {
            $check['details']['onhold_order_ids'] = implode( ', ', $onhold_orders );
        }

        $total_stuck = $check['details']['pending_stuck'] + $check['details']['processing_stuck'] + $check['details']['onhold_stuck'];
        if ( $total_stuck > 5 ) {
            $check['status']             = 'critical';
            $check['details']['message'] = $total_stuck . ' orders stuck in workflow';
        } elseif ( $total_stuck > 0 ) {
            $check['status']             = 'warning';
            $check['details']['message'] = $total_stuck . ' orders stuck in workflow';
        }

        set_transient( 'wcm_order_flow_check', $check, 2 * HOUR_IN_SECONDS );
        return $check;
    }

    /**
     * Check subscription timing and renewals
     */
    private function check_subscription_timing() {
        $check = array(
            'name'    => 'Subscription Timing',
            'status'  => 'good',
            'details' => array(),
        );

        if ( ! function_exists( 'wcs_get_subscriptions' ) ) {
            $check['details']['message'] = 'WooCommerce Subscriptions not active';
            return $check;
        }

        // Cache for 4 hours. This check was the single biggest server killer:
        // the old code did wcs_get_subscriptions(per_page=-1) loading ALL subscriptions
        // with no limit, then for each subscription called get_related_orders() + wc_get_order()
        // per related order — an N×M query loop. 500 subs × 5 orders = 2,500 DB queries/hour.
        $cached = get_transient( 'wcm_sub_timing_check' );
        if ( false !== $cached ) {
            return $cached;
        }

        $now             = current_time( 'timestamp' );
        $now_gmt         = gmdate( 'Y-m-d H:i:s', $now );
        $seven_days_gmt  = gmdate( 'Y-m-d H:i:s', $now + ( 7 * DAY_IN_SECONDS ) );

        // Use direct SQL COUNT queries instead of loading 500 full WC_Subscription objects.
        // Each hydrated subscription object loads meta, items, and addresses on access,
        // consuming 60-120 MB on sites with 500+ subscriptions.
        global $wpdb;

        // Count total active/pending-cancel subscriptions
        $total_subscriptions = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->posts}
             WHERE post_type = 'shop_subscription'
               AND post_status IN ('wc-active','wc-pending-cancel')"
        );

        // Overdue renewals: next_payment is in the past
        $overdue_renewals = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE p.post_type = 'shop_subscription'
               AND p.post_status IN ('wc-active','wc-pending-cancel')
               AND pm.meta_key = '_schedule_next_payment'
               AND pm.meta_value != ''
               AND pm.meta_value < %s",
            $now_gmt
        ) );

        // Expiring soon: end date within next 7 days
        $expiring_soon = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE p.post_type = 'shop_subscription'
               AND p.post_status IN ('wc-active','wc-pending-cancel')
               AND pm.meta_key = '_schedule_end'
               AND pm.meta_value != ''
               AND pm.meta_value > %s
               AND pm.meta_value < %s",
            $now_gmt,
            $seven_days_gmt
        ) );

        $thirty_days_ago = gmdate( 'Y-m-d H:i:s', $now - 30 * DAY_IN_SECONDS );

        if ( class_exists( 'Automattic\WooCommerce\Utilities\OrderUtil' ) &&
             \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled() ) {
            // HPOS: orders are in wc_orders table
            $failed_renewals = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(DISTINCT o.id)
                 FROM {$wpdb->prefix}wc_orders o
                 INNER JOIN {$wpdb->prefix}wc_orders_meta om ON o.id = om.order_id
                 WHERE o.status = 'wc-failed'
                   AND o.date_created_gmt >= %s
                   AND om.meta_key = '_subscription_renewal'
                   AND om.meta_value != ''",
                $thirty_days_ago
            ) );
        } else {
            // Legacy post-based orders
            $failed_renewals = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(DISTINCT p.ID)
                 FROM {$wpdb->posts} p
                 INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
                 WHERE p.post_type    = 'shop_order'
                   AND p.post_status  = 'wc-failed'
                   AND p.post_date_gmt >= %s
                   AND pm.meta_key   = '_subscription_renewal'
                   AND pm.meta_value != ''",
                $thirty_days_ago
            ) );
        }

        $check['details']['total_subscriptions'] = $total_subscriptions;
        $check['details']['overdue_renewals']    = $overdue_renewals;
        $check['details']['failed_renewals']     = $failed_renewals;
        $check['details']['expiring_soon']       = $expiring_soon;

        if ( $overdue_renewals > 0 ) {
            $check['status']             = 'critical';
            $check['details']['message'] = $overdue_renewals . ' subscription renewals overdue';
        } elseif ( $failed_renewals > 0 ) {
            $check['status']             = 'warning';
            $check['details']['message'] = $failed_renewals . ' failed renewal orders in last 30 days';
        }

        set_transient( 'wcm_sub_timing_check', $check, 4 * HOUR_IN_SECONDS );
        return $check;
    }

    /**
     * Check ShipStation integration health
     */
    private function check_shipstation_integration() {
        $check = array(
            'name'    => 'ShipStation Integration',
            'status'  => 'good',
            'details' => array(),
        );

        // Check if ShipStation plugin is active
        $shipstation_active = class_exists( 'WC_ShipStation' ) || class_exists( 'WooCommerce\\ShipStation\\Integration' );
        
        if ( ! $shipstation_active ) {
            $check['status'] = 'warning';
            $check['details']['message'] = 'ShipStation plugin not detected';
            $check['details']['plugin_active'] = 'No';
            return $check;
        }
        
        $check['details']['plugin_active'] = 'Yes';
        
        // Check last order export time (if we can determine it)
        // This is a simple check - in production you might want to check API connectivity
        $last_export = get_option( 'wc_shipstation_last_export', 0 );
        
        if ( $last_export ) {
            $check['details']['last_export'] = date_i18n( 'Y-m-d H:i:s', $last_export );
            $hours_since_export = ( current_time( 'timestamp' ) - $last_export ) / HOUR_IN_SECONDS;
            
            if ( $hours_since_export > 2 ) {
                $check['status'] = 'warning';
                $check['details']['message'] = 'No ShipStation export in last ' . round( $hours_since_export ) . ' hours';
            }
        } else {
            $check['details']['last_export'] = 'Never';
            $check['status'] = 'warning';
            $check['details']['message'] = 'ShipStation has never exported orders';
        }

        return $check;
    }

    /**
     * Check Stripe webhook health
     */
    private function check_stripe_webhooks() {
        $check = array(
            'name'    => 'Stripe Webhooks',
            'status'  => 'good',
            'details' => array(),
        );

        // Check if Stripe is active
        if ( ! class_exists( 'WC_Stripe' ) && ! class_exists( 'WooCommerce\\Stripe\\Gateway' ) ) {
            $check['details']['message'] = 'Stripe plugin not active';
            return $check;
        }
        
        // Check for recent webhook failures in Stripe logs
        $stripe_settings = get_option( 'woocommerce_stripe_settings' );
        if ( ! $stripe_settings ) {
            $check['details']['message'] = 'Stripe settings not found';
            return $check;
        }
        
        // Check webhook endpoint URL
        $site_url = home_url( '/' );
        $webhook_url = isset( $stripe_settings['webhook_url'] ) ? $stripe_settings['webhook_url'] : '';
        
        if ( $webhook_url ) {
            $check['details']['webhook_configured'] = 'Yes';
            $check['details']['webhook_url'] = $webhook_url;
            
            // Basic check if webhook URL matches site URL
            if ( false === strpos( $webhook_url, $site_url ) ) {
                $check['status'] = 'warning';
                $check['details']['message'] = 'Webhook URL may not match this site';
            }
        } else {
            $check['details']['webhook_configured'] = 'No';
            $check['status'] = 'warning';
            $check['details']['message'] = 'Stripe webhook not configured';
        }
        
        // Check for recent failed webhooks in order meta
        $one_day_ago = gmdate( 'Y-m-d H:i:s', strtotime( '-1 day' ) );
        $failed_webhook_orders = wc_get_orders( array(
            'status'       => 'pending',
            'date_created' => '<' . $one_day_ago,
            'limit'        => 5,
            'return'       => 'ids',
        ) );
        
        if ( ! empty( $failed_webhook_orders ) ) {
            $check['details']['potential_webhook_failures'] = count( $failed_webhook_orders );
            $check['details']['potential_failed_order_ids'] = implode( ', ', $failed_webhook_orders );
            
            if ( $check['status'] !== 'critical' ) {
                $check['status'] = 'warning';
                $check['details']['message'] = 'Potential webhook failures detected';
            }
        }

        return $check;
    }

    private function log_health_check_results( $checks ) {
        global $wpdb;
        $table_name = $wpdb->prefix . 'wcm_health_logs';

        if ( empty( $checks ) ) {
            return;
        }

        // Single multi-row INSERT instead of 14 individual round-trips
        $rows = array();
        $now  = current_time( 'mysql' );
        foreach ( $checks as $check ) {
            $rows[] = $wpdb->prepare(
                '(%s, %s, %s, %s)',
                $check['name'],
                $check['status'],
                wp_json_encode( $check['details'] ),
                $now
            );
        }
        // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- each row is individually prepared above
        $wpdb->query( "INSERT INTO {$table_name} (check_type, status, details, created_at) VALUES " . implode( ',', $rows ) );
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

    /**
     * AJAX: Fix Action Scheduler failed tasks
     */
    public function ajax_fix_action_scheduler() {
        check_ajax_referer( 'wcm_admin', 'nonce' );
        
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        $results = $this->fix_action_scheduler();
        
        wp_send_json_success( array(
            'message' => 'Action Scheduler cleanup completed',
            'results' => $results,
        ) );
    }

    /**
     * AJAX: Fix WordPress Cron issues
     */
    public function ajax_fix_wp_cron() {
        check_ajax_referer( 'wcm_admin', 'nonce' );
        
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        $results = $this->fix_wp_cron();
        
        wp_send_json_success( array(
            'message' => 'WP-Cron fixes applied',
            'results' => $results,
        ) );
    }

    /**
     * AJAX: Review stuck orders
     */
    public function ajax_review_stuck_orders() {
        check_ajax_referer( 'wcm_admin', 'nonce' );
        
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        wp_send_json_success( array(
            'message' => 'Redirecting to orders page',
            'redirect' => admin_url( 'edit.php?post_type=shop_order' ),
        ) );
    }

    /**
     * AJAX: Review overdue subscriptions
     */
    public function ajax_review_overdue_subscriptions() {
        check_ajax_referer( 'wcm_admin', 'nonce' );
        
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        wp_send_json_success( array(
            'message' => 'Redirecting to subscriptions page',
            'redirect' => admin_url( 'edit.php?post_type=shop_subscription' ),
        ) );
    }

    /**
     * AJAX: Configure ShipStation
     */
    public function ajax_configure_shipstation() {
        check_ajax_referer( 'wcm_admin', 'nonce' );
        
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        wp_send_json_success( array(
            'message' => 'Redirecting to ShipStation settings',
            'redirect' => admin_url( 'admin.php?page=wc-settings&tab=integration&section=shipstation' ),
        ) );
    }

    /**
     * AJAX: Configure Stripe webhooks
     */
    public function ajax_configure_stripe_webhooks() {
        check_ajax_referer( 'wcm_admin', 'nonce' );
        
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        wp_send_json_success( array(
            'message' => 'Redirecting to Stripe settings',
            'redirect' => admin_url( 'admin.php?page=wc-settings&tab=checkout&section=stripe' ),
        ) );
    }

    /**
     * AJAX: Enable Stripe gateway
     */
    public function ajax_enable_stripe_gateway() {
        check_ajax_referer( 'wcm_admin', 'nonce' );
        
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        // Try to enable Stripe gateway programmatically
        $gateways = WC()->payment_gateways()->payment_gateways();
        if ( isset( $gateways['stripe'] ) ) {
            $gateways['stripe']->update_option( 'enabled', 'yes' );
            
            wp_send_json_success( array(
                'message' => 'Stripe gateway enabled successfully',
                'redirect' => admin_url( 'admin.php?page=wc-settings&tab=checkout&section=stripe' ),
            ) );
        } else {
            wp_send_json_error( array(
                'message' => 'Stripe gateway not found',
            ) );
        }
    }

    /**
     * Fix Action Scheduler failed tasks
     */
    public function fix_action_scheduler() {
        $results = array(
            'cleaned_failed' => 0,
            'cleaned_old' => 0,
            'total_before' => 0,
            'total_after' => 0,
            'batch_size' => 1000, // Clean in batches to avoid timeouts
        );
        
        if ( ! class_exists( 'ActionScheduler' ) ) {
            $results['error'] = 'Action Scheduler not available';
            return $results;
        }
        
        global $wpdb;
        
        // Get counts before cleanup
        $results['total_before'] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}actionscheduler_actions" );
        $results['failed_before'] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}actionscheduler_actions WHERE status = 'failed'" );
        
        // Check if we should use batch processing (more than 5000 tasks)
        $use_batches = $results['failed_before'] > 5000;
        
        if ( $use_batches ) {
            // Batch cleanup for large sites to avoid timeouts
            $cutoff_date = gmdate( 'Y-m-d H:i:s', strtotime( '-7 days' ) );
            $batch_limit = 1000;
            $cleaned = 0;
            
            do {
                $batch_cleaned = $wpdb->query( 
                    $wpdb->prepare( 
                        "DELETE FROM {$wpdb->prefix}actionscheduler_actions WHERE status = 'failed' AND scheduled_date_gmt < %s LIMIT %d",
                        $cutoff_date,
                        $batch_limit
                    )
                );
                $cleaned += $batch_cleaned;
                
                // Small delay between batches to avoid overwhelming the server
                if ( $batch_cleaned > 0 ) {
                    usleep( 100000 ); // 0.1 second
                }
            } while ( $batch_cleaned > 0 );
            
            $results['cleaned_failed'] = $cleaned;
            $results['batches_used'] = true;
        } else {
            // Single query for smaller sites
            $cutoff_date = gmdate( 'Y-m-d H:i:s', strtotime( '-7 days' ) );
            $failed_cleaned = $wpdb->query( 
                $wpdb->prepare( 
                    "DELETE FROM {$wpdb->prefix}actionscheduler_actions WHERE status = 'failed' AND scheduled_date_gmt < %s",
                    $cutoff_date
                )
            );
            $results['cleaned_failed'] = $failed_cleaned;
        }
        
        // Clean up completed tasks older than 30 days (always batch for safety)
        $cutoff_old = gmdate( 'Y-m-d H:i:s', strtotime( '-30 days' ) );
        $batch_limit = 1000;
        $old_cleaned = 0;
        
        do {
            $batch_cleaned = $wpdb->query( 
                $wpdb->prepare( 
                    "DELETE FROM {$wpdb->prefix}actionscheduler_actions WHERE status IN ('complete', 'canceled') AND scheduled_date_gmt < %s LIMIT %d",
                    $cutoff_old,
                    $batch_limit
                )
            );
            $old_cleaned += $batch_cleaned;
            
            if ( $batch_cleaned > 0 ) {
                usleep( 100000 ); // 0.1 second
            }
        } while ( $batch_cleaned > 0 );
        
        $results['cleaned_old'] = $old_cleaned;
        
        // Get counts after cleanup
        $results['total_after'] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}actionscheduler_actions" );
        $results['failed_after'] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}actionscheduler_actions WHERE status = 'failed'" );
        
        // If DISABLE_WP_CRON is true, add a warning
        if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
            $results['cron_warning'] = 'DISABLE_WP_CRON is true. External cron job required for scheduled tasks.';
        }
        
        // Check if there are still recent failed tasks (last 7 days)
        $recent_cutoff = gmdate( 'Y-m-d H:i:s', strtotime( '-1 day' ) );
        $recent_failed = (int) $wpdb->get_var( 
            $wpdb->prepare( 
                "SELECT COUNT(*) FROM {$wpdb->prefix}actionscheduler_actions WHERE status = 'failed' AND scheduled_date_gmt >= %s",
                $recent_cutoff
            )
        );
        
        if ( $recent_failed > 0 ) {
            $results['recent_failed'] = $recent_failed;
            $results['warning'] = $recent_failed . ' tasks failed in the last 24 hours. WP-Cron may still be broken.';
        }
        
        // Log the cleanup
        $this->log_health_check_results( array(
            array(
                'name' => 'Action Scheduler Cleanup',
                'status' => 'good',
                'details' => array(
                    'failed_cleaned' => $results['cleaned_failed'],
                    'old_cleaned' => $results['cleaned_old'],
                    'total_before' => $results['total_before'],
                    'total_after' => $results['total_after'],
                    'recent_failed' => isset( $results['recent_failed'] ) ? $results['recent_failed'] : 0,
                ),
            ),
        ) );
        
        // Send email notification for large cleanups
        if ( $results['cleaned_failed'] > 100 || $results['cleaned_old'] > 1000 ) {
            $this->send_cleanup_notification( $results );
        }
        
        return $results;
    }
    
    /**
     * Send email notification for large cleanups
     */
    private function send_cleanup_notification( $results ) {
        $alert_email = get_option( 'wcm_alert_email', 'cameron@ashbi.ca' );
        $site_name = get_bloginfo( 'name' );
        $site_url = get_site_url();
        
        $subject = sprintf( '[%s] Action Scheduler Cleanup Completed', $site_name );
        
        $message = sprintf(
            "Action Scheduler cleanup completed on %s (%s)\n\n",
            $site_name,
            $site_url
        );
        
        $message .= sprintf( "Total tasks before cleanup: %d\n", $results['total_before'] );
        $message .= sprintf( "Failed tasks cleaned: %d\n", $results['cleaned_failed'] );
        $message .= sprintf( "Old tasks cleaned: %d\n", $results['cleaned_old'] );
        $message .= sprintf( "Total tasks after cleanup: %d\n", $results['total_after'] );
        
        if ( isset( $results['recent_failed'] ) && $results['recent_failed'] > 0 ) {
            $message .= sprintf( "\n⚠️ Warning: %d tasks failed in the last 24 hours.\n", $results['recent_failed'] );
            $message .= "WP-Cron may still be broken. Check Health Checks page for details.\n";
        }
        
        if ( isset( $results['cron_warning'] ) ) {
            $message .= sprintf( "\nℹ️ Note: %s\n", $results['cron_warning'] );
        }
        
        $message .= "\n--\n";
        $message .= "WooCommerce Comprehensive Monitor v" . WCM_VERSION . "\n";
        
        wp_mail( $alert_email, $subject, $message );
    }

    /**
     * Fix WordPress Cron issues
     */
    public function fix_wp_cron() {
        $results = array(
            'cron_enabled' => true,
            'spawn_called' => false,
            'scheduled_events' => array(),
        );
        
        // Check if DISABLE_WP_CRON is set
        if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
            $results['cron_enabled'] = false;
            $results['warning'] = 'DISABLE_WP_CRON is true. External cron job required.';
        }
        
        // Try to spawn cron (non-blocking)
        $cron_spawn = wp_remote_post( 
            admin_url( 'admin-ajax.php' ), 
            array(
                'timeout' => 0.01,
                'blocking' => false,
                'sslverify' => false,
                'body' => array( 'action' => 'wp-cron' ),
            )
        );
        
        $results['spawn_called'] = ! is_wp_error( $cron_spawn );
        
        // Get scheduled events
        $cron_events = _get_cron_array();
        $results['scheduled_events'] = is_array( $cron_events ) ? count( $cron_events ) : 0;
        
        // Reschedule our own health check if missing
        if ( ! wp_next_scheduled( 'wcm_daily_health_check' ) ) {
            wp_schedule_event( time(), 'twicedaily', 'wcm_daily_health_check' ); // was 'hourly'
            $results['rescheduled_health_check'] = true;
        }

        // Reschedule dispute check if missing
        if ( ! wp_next_scheduled( 'wcm_hourly_dispute_check' ) ) {
            wp_schedule_event( time(), 'hourly', 'wcm_hourly_dispute_check' );
            $results['rescheduled_dispute_check'] = true;
        }

        // Reschedule log cleanup if missing
        if ( ! wp_next_scheduled( 'wcm_daily_log_cleanup' ) ) {
            wp_schedule_event( time(), 'daily', 'wcm_daily_log_cleanup' );
            $results['rescheduled_log_cleanup'] = true;
        }
        
        return $results;
    }

    /**
     * Get actionable fixes for health issues
     */
    public function get_actionable_fixes( $health_checks ) {
        $fixes = array();
        
        foreach ( $health_checks as $check ) {
            if ( $check['status'] === 'critical' || $check['status'] === 'warning' ) {
                switch ( $check['name'] ) {
                    case 'Action Scheduler':
                        if ( isset( $check['details']['failed_actions'] ) && $check['details']['failed_actions'] > 10 ) {
                            $fixes[] = array(
                                'name' => 'Action Scheduler',
                                'issue' => $check['details']['failed_actions'] . ' failed tasks',
                                'action' => 'fix_action_scheduler',
                                'button_text' => 'Clean Failed Tasks',
                                'description' => 'Clean up failed Action Scheduler tasks older than 7 days.',
                            );
                        }
                        break;
                        
                    case 'WordPress Cron':
                        if ( isset( $check['details']['cron_enabled'] ) && strpos( $check['details']['cron_enabled'], 'No' ) !== false ) {
                            $fixes[] = array(
                                'name' => 'WordPress Cron',
                                'issue' => 'WP-Cron disabled',
                                'action' => 'fix_wp_cron',
                                'button_text' => 'Fix WP-Cron',
                                'description' => 'Check and reschedule cron events.',
                            );
                        }
                        break;
                        
                    case 'Stripe Gateway':
                        if ( isset( $check['details']['stripe_message'] ) && strpos( $check['details']['stripe_message'], 'DISABLED' ) !== false ) {
                            $fixes[] = array(
                                'name' => 'Stripe Gateway',
                                'issue' => 'Stripe gateway disabled',
                                'action' => 'enable_stripe_gateway',
                                'button_text' => 'Enable Stripe',
                                'description' => 'Enable Stripe gateway in WooCommerce settings.',
                                'external_link' => admin_url( 'admin.php?page=wc-settings&tab=checkout&section=stripe' ),
                            );
                        }
                        break;
                        
                    case 'Order Flow':
                        if ( isset( $check['details']['pending_stuck'] ) || isset( $check['details']['processing_stuck'] ) || isset( $check['details']['onhold_stuck'] ) ) {
                            $total_stuck = ( $check['details']['pending_stuck'] ?? 0 ) + ( $check['details']['processing_stuck'] ?? 0 ) + ( $check['details']['onhold_stuck'] ?? 0 );
                            if ( $total_stuck > 0 ) {
                                $fixes[] = array(
                                    'name' => 'Order Flow',
                                    'issue' => $total_stuck . ' stuck orders',
                                    'action' => 'review_stuck_orders',
                                    'button_text' => 'Review Orders',
                                    'description' => 'Review orders stuck in workflow (pending >1h, processing >24h, on-hold >48h).',
                                    'external_link' => admin_url( 'edit.php?post_type=shop_order' ),
                                );
                            }
                        }
                        break;
                        
                    case 'Subscription Timing':
                        if ( isset( $check['details']['overdue_renewals'] ) && $check['details']['overdue_renewals'] > 0 ) {
                            $fixes[] = array(
                                'name' => 'Subscription Timing',
                                'issue' => $check['details']['overdue_renewals'] . ' overdue renewals',
                                'action' => 'review_overdue_subscriptions',
                                'button_text' => 'Review Subscriptions',
                                'description' => 'Review subscription renewals that are overdue.',
                                'external_link' => admin_url( 'edit.php?post_type=shop_subscription' ),
                            );
                        }
                        break;
                        
                    case 'ShipStation Integration':
                        if ( isset( $check['details']['message'] ) && strpos( $check['details']['message'], 'Never' ) !== false ) {
                            $fixes[] = array(
                                'name' => 'ShipStation Integration',
                                'issue' => 'No exports ever',
                                'action' => 'configure_shipstation',
                                'button_text' => 'Configure ShipStation',
                                'description' => 'Configure ShipStation plugin for order exports.',
                                'external_link' => admin_url( 'admin.php?page=wc-settings&tab=integration&section=shipstation' ),
                            );
                        }
                        break;
                        
                    case 'Stripe Webhooks':
                        if ( isset( $check['details']['webhook_configured'] ) && 'No' === $check['details']['webhook_configured'] ) {
                            $fixes[] = array(
                                'name' => 'Stripe Webhooks',
                                'issue' => 'Webhook not configured',
                                'action' => 'configure_stripe_webhooks',
                                'button_text' => 'Configure Webhooks',
                                'description' => 'Configure Stripe webhooks for payment processing.',
                                'external_link' => admin_url( 'admin.php?page=wc-settings&tab=checkout&section=stripe' ),
                            );
                        }
                        break;
                }
            }
        }
        
        return $fixes;
    }
}
