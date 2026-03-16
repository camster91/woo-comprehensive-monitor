<?php
/**
 * Plugin Name: WooCommerce Comprehensive Monitor & Dispute Protection
 * Plugin URI: https://ashbi.ca
 * Description: Complete WooCommerce monitoring, error tracking, dispute protection, and health alerts. Combines frontend monitoring, dispute evidence generation, and centralized health reporting.
 * Version: 4.7.0
 * Author: Ashbi
 * Author URI: https://ashbi.ca
 * License: GPL2
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: woo-comprehensive-monitor
 * Domain Path: /languages
 *
 * @package WooComprehensiveMonitor
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('WCM_VERSION', '4.7.0');
define('WCM_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WCM_PLUGIN_URL', plugin_dir_url(__FILE__));
define('WCM_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Declare HPOS compatibility
add_action( 'before_woocommerce_init', function () {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
    }
} );

// Include required files
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-helpers.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-dispute-manager.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-error-tracker.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-health-monitor.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-admin-dashboard.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-subscription-manager-wps.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-checkout.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-evidence-generator.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-evidence-submitter.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-subscription-protector.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-preorder.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-auto-updater.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-file-analyzer.php';

/**
 * Main plugin class
 */
class WooComprehensiveMonitor {

    private static $instance = null;
    private $dispute_manager;
    private $error_tracker;
    private $health_monitor;
    private $admin_dashboard;
    private $subscription_manager;
    private $checkout;
    private $subscription_protector;
    private $preorder;
    private $auto_updater;
    private $file_analyzer;

    /**
     * Get singleton instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Plugin activation/deactivation
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));

        // Show welcome notice after activation
        add_action('admin_notices', array($this, 'show_activation_notice'));
        
        // Show activation errors if any
        add_action('admin_notices', array($this, 'show_activation_errors'));

        // Initialize components (includes auto-updater)
        add_action('plugins_loaded', array($this, 'init_components'));

        // Load text domain
        add_action('init', array($this, 'load_textdomain'));

        // Add settings link
        add_filter('plugin_action_links_' . WCM_PLUGIN_BASENAME, array($this, 'add_settings_link'));

        // Set activation transient
        if (get_option('wcm_auto_connected') === '1' && !get_transient('wcm_show_welcome_notice')) {
            set_transient('wcm_show_welcome_notice', true, 60); // Show for 1 minute
        }

        // Custom cron schedules
        add_filter('cron_schedules', array($this, 'add_custom_schedules'));

        // Log cleanup hook
        add_action('wcm_daily_log_cleanup', array($this, 'cleanup_old_logs'));
    }

    /**
     * Initialize plugin components
     */
    public function init_components() {
        try {
            // Check version upgrade
            $stored_version = get_option( 'wcm_plugin_version', '0' );
            if ( version_compare( $stored_version, WCM_VERSION, '<' ) ) {
                $this->upgrade_plugin( $stored_version, WCM_VERSION );
                update_option( 'wcm_plugin_version', WCM_VERSION );
            }

            // Fix cron schedule on existing installs without requiring deactivation.
            // wcm_daily_health_check was scheduled 'hourly' but runs 14 expensive checks
            // including subscription N+1 queries and a blocking HTTP call.
            // Migrate to 'twicedaily' automatically.
            $this->maybe_fix_health_check_schedule();
            
            // Ensure database tables exist (safe, won't break activation)
            $this->ensure_tables_exist();
            
            // Auto-configure plugin if this is fresh install or missing essential options
            $is_fresh_install = $stored_version === '0';
            $missing_essential_options = !get_option('wcm_monitoring_server') || !get_option('wcm_store_id');
            
            if ($is_fresh_install || $missing_essential_options) {
                $this->auto_configure_plugin($is_fresh_install);
                
                // Send activation notice for fresh installs
                if ($is_fresh_install) {
                    $this->send_activation_notice();
                }
            }
            
            // Check if WooCommerce is active
            if (!class_exists('WooCommerce')) {
                add_action('admin_notices', array($this, 'woocommerce_missing_notice'));
                return;
            }

            // Check if Stripe is active - use multiple checks for compatibility
            // We'll check at admin_init time when WC is fully loaded
            add_action('admin_init', array($this, 'check_stripe_status'));

            // Initialize components with error handling
            WCM_Helpers::get_instance();
            $this->dispute_manager = new WCM_Dispute_Manager();
            $this->error_tracker = new WCM_Error_Tracker();
            $this->health_monitor = new WCM_Health_Monitor();
            $this->admin_dashboard = new WCM_Admin_Dashboard();
            $this->subscription_manager = new WCM_Subscription_Manager_WPS();
            $this->checkout = WCM_Checkout::get_instance();
            $this->subscription_protector = WCM_Subscription_Protector::get_instance();
            $this->preorder = WCM_PreOrder::get_instance();
            
            // Initialize auto-updater (moved from constructor to avoid early errors)
            $this->auto_updater = new WCM_Auto_Updater();
            
            // Initialize file analyzer for AI file access
            $this->file_analyzer = WCM_File_Analyzer::get_instance();
            
        } catch (Exception $e) {
            // Log error but don't crash
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('[WCM] Error in init_components: ' . $e->getMessage());
            }
            // Show admin notice
            add_action('admin_notices', function() use ($e) {
                echo '<div class="notice notice-error"><p>';
                echo '<strong>WooCommerce Comprehensive Monitor Error:</strong> ' . esc_html($e->getMessage());
                echo '</p></div>';
            });
        }
    }

    /**
     * Handle plugin upgrades between versions
     */
    private function upgrade_plugin( $from_version, $to_version ) {
        // Flush rewrite rules for new endpoints
        flush_rewrite_rules();

        // Reschedule cron jobs with updated intervals
        wp_clear_scheduled_hook( 'wcm_daily_health_check' );
        wp_clear_scheduled_hook( 'wcm_hourly_dispute_check' );
        wp_clear_scheduled_hook( 'wcm_daily_log_cleanup' );
        wp_clear_scheduled_hook( 'wcm_check_for_updates' );

        // Health check: twicedaily (was hourly — too expensive for 14 heavy DB checks)
        if ( ! wp_next_scheduled( 'wcm_daily_health_check' ) ) {
            wp_schedule_event( time(), 'twicedaily', 'wcm_daily_health_check' );
        }
        if ( ! wp_next_scheduled( 'wcm_hourly_dispute_check' ) ) {
            wp_schedule_event( time(), 'hourly', 'wcm_hourly_dispute_check' );
        }
        if ( ! wp_next_scheduled( 'wcm_daily_log_cleanup' ) ) {
            wp_schedule_event( time(), 'daily', 'wcm_daily_log_cleanup' );
        }
        if ( ! wp_next_scheduled( 'wcm_check_for_updates' ) ) {
            wp_schedule_event( time(), 'twicedaily', 'wcm_check_for_updates' );
        }

        // Log the upgrade
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            error_log( sprintf( '[WCM] Upgraded from v%s to v%s', $from_version, $to_version ) );
        }
    }

    /**
     * Ensure database tables exist (safe method that won't break activation)
     */
    private function ensure_tables_exist() {
        global $wpdb;
        
        // Check if tables already exist
        $table_to_check = $wpdb->prefix . 'wcm_error_logs';
        $tables_exist = $wpdb->get_var("SHOW TABLES LIKE '$table_to_check'") === $table_to_check;
        
        if ($tables_exist) {
            // Tables already exist, nothing to do
            return;
        }
        
        // Tables don't exist, create them safely
        try {
            // Make sure upgrade.php is available
            if (!function_exists('dbDelta')) {
                require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
            }
            
            if (!function_exists('dbDelta')) {
                error_log('[WCM] dbDelta function not available for table creation');
                return;
            }
            
            $charset_collate = $wpdb->get_charset_collate();
            
            // Error tracking table
            $sql = "CREATE TABLE IF NOT EXISTS " . $wpdb->prefix . "wcm_error_logs (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                error_type varchar(100) NOT NULL,
                error_message text NOT NULL,
                page_url varchar(500) NOT NULL,
                user_agent text,
                customer_email varchar(255),
                order_id bigint(20),
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY error_type (error_type),
                KEY created_at (created_at),
                KEY order_id (order_id)
            ) $charset_collate";
            dbDelta($sql);
            
            // Health check logs table
            $sql = "CREATE TABLE IF NOT EXISTS " . $wpdb->prefix . "wcm_health_logs (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                check_type varchar(100) NOT NULL,
                status varchar(50) NOT NULL,
                details text NOT NULL,
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY check_type (check_type),
                KEY status (status),
                KEY created_at (created_at)
            ) $charset_collate";
            dbDelta($sql);
            
            // Recovery log table
            $sql = "CREATE TABLE IF NOT EXISTS " . $wpdb->prefix . "wcm_recovery_log (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                subscription_id bigint(20) unsigned NOT NULL,
                order_id bigint(20) unsigned DEFAULT NULL,
                recovery_order_id bigint(20) unsigned DEFAULT NULL,
                customer_id bigint(20) unsigned NOT NULL,
                discount_amount decimal(10,2) NOT NULL DEFAULT 0.00,
                regular_total decimal(10,2) NOT NULL DEFAULT 0.00,
                subscription_total decimal(10,2) NOT NULL DEFAULT 0.00,
                charge_status varchar(20) NOT NULL DEFAULT 'pending',
                charge_type varchar(30) DEFAULT NULL,
                charge_date datetime DEFAULT NULL,
                created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                notes text DEFAULT NULL,
                PRIMARY KEY (id),
                KEY subscription_id (subscription_id),
                KEY customer_id (customer_id),
                KEY charge_status (charge_status)
            ) $charset_collate";
            dbDelta($sql);
            
            // Subscription acknowledgments table
            $sql = "CREATE TABLE IF NOT EXISTS " . $wpdb->prefix . "woo_subscription_acknowledgments (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                user_id bigint(20) NOT NULL DEFAULT 0,
                order_id bigint(20) NOT NULL,
                acknowledgment_text text,
                ip_address varchar(45),
                user_agent text,
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY user_id (user_id),
                KEY order_id (order_id),
                KEY created_at (created_at)
            ) $charset_collate";
            dbDelta($sql);
            
            // Dispute evidence table
            $sql = "CREATE TABLE IF NOT EXISTS " . $wpdb->prefix . "wcm_dispute_evidence (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                dispute_id varchar(100) NOT NULL,
                order_id bigint(20) NOT NULL,
                customer_email varchar(255) NOT NULL,
                stripe_dispute_id varchar(100),
                evidence_file_path varchar(500),
                evidence_file_url varchar(500),
                evidence_type varchar(50) NOT NULL DEFAULT 'auto_generated',
                evidence_data longtext,
                status varchar(50) DEFAULT 'pending',
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                updated_at datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY stripe_dispute_id (stripe_dispute_id),
                KEY dispute_id (dispute_id),
                KEY order_id (order_id),
                KEY status (status),
                KEY customer_email (customer_email)
            ) $charset_collate";
            dbDelta($sql);
            
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('[WCM] Tables created successfully via ensure_tables_exist()');
            }
            
        } catch (Exception $e) {
            // Log error but don't crash
            error_log('[WCM] Error creating tables: ' . $e->getMessage());
        }
    }

    /**
     * Load text domain for translations
     */
    public function load_textdomain() {
        load_plugin_textdomain(
            'woo-comprehensive-monitor',
            false,
            dirname(WCM_PLUGIN_BASENAME) . '/languages'
        );
    }

    /**
     * Plugin activation with auto-connect (ULTRA-MINIMAL for seamless updates)
     */
    public function activate() {
        // ULTRA-MINIMAL activation - just set version, nothing else
        // Absolutely cannot fail - all other initialization happens in init_components()
        
        // Set version immediately with no conditions
        update_option('wcm_plugin_version', WCM_VERSION);
        
        // That's it! No cron jobs, no options, no flush_rewrite_rules
        // All other initialization happens in init_components() which has try-catch
    }

    /**
     * Auto-configure plugin with smart defaults
     * @param bool $is_update Whether this is an update vs fresh install
     */
    private function auto_configure_plugin($is_update = false) {
        // For updates, only set essential defaults that don't exist
        // For fresh installs, set all defaults
        
        // Always ensure monitoring server URL is set
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        
        // Check if we should use a different server based on environment
        if (defined('WCM_MONITORING_SERVER')) {
            $monitoring_server = WCM_MONITORING_SERVER;
        } elseif (getenv('WCM_MONITORING_SERVER')) {
            $monitoring_server = getenv('WCM_MONITORING_SERVER');
        }

        // Essential defaults that should always be set if missing
        $essential_defaults = array(
            'wcm_monitoring_server' => $monitoring_server,
            'wcm_alert_email' => 'cameron@ashbi.ca',
            'wcm_store_id' => get_option('wcm_store_id', $this->generate_store_id()),
            'wcm_plugin_version' => WCM_VERSION,
        );

        // Full defaults for fresh installs
        $full_defaults = array(
            'wcm_monitoring_server' => $monitoring_server,
            'wcm_track_js_errors' => '1',
            'wcm_track_ajax_errors' => '1',
            'wcm_track_checkout_errors' => '1',
            'wcm_alert_email' => 'cameron@ashbi.ca',
            'wcm_enable_dispute_protection' => class_exists('WC_Stripe') ? '1' : '0',
            'wcm_auto_generate_evidence' => '1',
            'wcm_send_dispute_alerts' => '1',
            'wcm_enable_health_monitoring' => '1',
            'wcm_health_check_interval' => '21600', // 6 hours (was 1 hour — too expensive)
            'wcm_store_id' => get_option('wcm_store_id', $this->generate_store_id()),
            'wcm_acknowledgment_text' => 'I acknowledge that I will be charged recurring payments for future subscription renewals. I understand that these charges will continue until I cancel my subscription.',
            'wcm_force_all_products' => '0',
            // Subscription price protection settings
            'wcm_sp_auto_charge_on_cancel' => 'yes',
            'wcm_sp_customer_conversion' => 'yes',
            'wcm_sp_charge_method' => 'automatic',
            'wcm_sp_notify_customer' => 'yes',
            'wcm_sp_notify_admin' => 'yes',
            // Auto-update settings (only set on fresh install or if missing)
            'wcm_auto_updates' => 'yes',
            'wcm_create_backups' => 'yes',
            'wcm_check_compatibility' => 'yes',
            'wcm_major_updates' => 'auto',
            // Connection tracking
            'wcm_auto_connected' => '1',
            'wcm_connection_time' => current_time('mysql'),
            'wcm_plugin_version' => WCM_VERSION,
        );

        // Use appropriate defaults based on update status
        $defaults = $is_update ? $essential_defaults : $full_defaults;

        foreach ($defaults as $key => $value) {
            if (!get_option($key)) {
                add_option($key, $value);
            } elseif ($key === 'wcm_plugin_version') {
                // Always update version
                update_option($key, $value);
            }
        }

        // Schedule health checks — twicedaily (was hourly, too expensive for 14 heavy checks)
        if (!wp_next_scheduled('wcm_daily_health_check')) {
            wp_schedule_event(time(), 'twicedaily', 'wcm_daily_health_check');
        }

        // Schedule dispute checks
        if (!wp_next_scheduled('wcm_hourly_dispute_check')) {
            wp_schedule_event(time(), 'hourly', 'wcm_hourly_dispute_check');
        }

        // Schedule log cleanup
        if (!wp_next_scheduled('wcm_daily_log_cleanup')) {
            wp_schedule_event(time(), 'daily', 'wcm_daily_log_cleanup');
        }

        // Schedule auto-update check (moved from WCM_Auto_Updater constructor)
        if (!wp_next_scheduled('wcm_check_for_updates')) {
            wp_schedule_event(time(), 'twicedaily', 'wcm_check_for_updates');
        }
    }

    /**
     * Migrate existing hourly health check cron to twicedaily.
     * Runs once per version bump via a stored marker.
     */
    private function maybe_fix_health_check_schedule() {
        // Only migrate if still on the old 'hourly' schedule.
        $event = wp_get_scheduled_event( 'wcm_daily_health_check' );
        if ( $event && 'hourly' === $event->schedule ) {
            wp_clear_scheduled_hook( 'wcm_daily_health_check' );
            // Offset 15 min from now so it doesn't fire immediately on every page load.
            wp_schedule_event( time() + 15 * MINUTE_IN_SECONDS, 'twicedaily', 'wcm_daily_health_check' );
        }
    }

    /**
     * Generate unique store ID
     */
    private function generate_store_id() {
        $site_url = get_site_url();
        
        // Check if we already have a store ID
        $existing_id = get_option('wcm_store_id');
        if ($existing_id && strpos($existing_id, 'store-') === 0) {
            return $existing_id;
        }
        
        // Create a consistent store ID based on site URL
        $store_id = 'store-' . substr(md5($site_url), 0, 8);
        
        // Make it URL-safe
        $store_id = sanitize_title($store_id);

        return $store_id;
    }

    /**
     * Send activation notice to monitoring server
     */
    private function send_activation_notice() {
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        
        // Get store ID, generate if not exists
        $store_id = get_option('wcm_store_id');
        if (!$store_id) {
            $store_id = $this->generate_store_id();
            update_option('wcm_store_id', $store_id);
        }

        $activation_data = array(
            'type' => 'plugin_activated',
            'store_url' => get_site_url(),
            'store_name' => get_bloginfo('name'),
            'store_id' => $store_id,
            'plugin_version' => WCM_VERSION,
            'woocommerce_version' => defined('WC_VERSION') ? WC_VERSION : 'Not active',
            'wordpress_version' => get_bloginfo('version'),
            'php_version' => phpversion(),
            'timestamp' => current_time('mysql'),
        );

        // Send activation notice (non-blocking)
        wp_remote_post($monitoring_server, array(
            'method' => 'POST',
            'timeout' => 5,
            'redirection' => 2,
            'httpversion' => '1.0',
            'blocking' => false,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($activation_data),
            'data_format' => 'body',
        ));
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Clear scheduled events
        wp_clear_scheduled_hook('wcm_daily_health_check');
        wp_clear_scheduled_hook('wcm_hourly_dispute_check');
        wp_clear_scheduled_hook('wcm_daily_log_cleanup');

        // Send deactivation notice
        $this->send_deactivation_notice();

        // Clean up rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Send deactivation notice to monitoring server
     */
    private function send_deactivation_notice() {
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        
        // Get store ID, generate if not exists (should exist but be safe)
        $store_id = get_option('wcm_store_id');
        if (!$store_id) {
            $store_id = $this->generate_store_id();
        }

        $deactivation_data = array(
            'type' => 'plugin_deactivated',
            'store_url' => get_site_url(),
            'store_name' => get_bloginfo('name'),
            'store_id' => $store_id,
            'timestamp' => current_time('mysql'),
        );

        wp_remote_post($monitoring_server, array(
            'method' => 'POST',
            'timeout' => 5,
            'redirection' => 2,
            'httpversion' => '1.0',
            'blocking' => false,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($deactivation_data),
            'data_format' => 'body',
        ));
    }

    /**
     * Show activation errors as admin notices
     */
    public function show_activation_errors() {
        $errors = get_transient('wcm_activation_errors');
        if ($errors && is_array($errors)) {
            ?>
            <div class="notice notice-error is-dismissible">
                <p><strong>WooCommerce Comprehensive Monitor - Activation Issues:</strong></p>
                <ul style="list-style-type: disc; margin-left: 20px;">
                    <?php foreach ($errors as $error): ?>
                        <li><?php echo esc_html($error); ?></li>
                    <?php endforeach; ?>
                </ul>
                <p>Please check your error logs and ensure database user has CREATE TABLE permission.</p>
            </div>
            <?php
            delete_transient('wcm_activation_errors');
        }
    }

    /**
     * Clean up old logs based on retention setting
     */
    public function cleanup_old_logs() {
        $retention_days = get_option( 'wcm_log_retention_days', 30 );
        if ( $retention_days < 1 ) {
            return;
        }
        global $wpdb;
        $cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$retention_days} days" ) );

        // Clean error logs
        $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wcm_error_logs WHERE created_at < %s",
            $cutoff
        ) );

        // Clean health logs
        $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wcm_health_logs WHERE created_at < %s",
            $cutoff
        ) );

        // Clean dispute evidence older than double retention (disputes need longer history)
        $dispute_cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-" . ( $retention_days * 2 ) . " days" ) );
        $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wcm_dispute_evidence WHERE created_at < %s",
            $dispute_cutoff
        ) );
    }

    /**
     * Add custom cron schedules
     */
    public function add_custom_schedules( $schedules ) {
        $interval = get_option( 'wcm_health_check_interval', 3600 );
        // Ensure interval is at least 300 seconds (5 minutes) and not more than 86400 (1 day)
        $interval = max( 300, min( 86400, $interval ) );

        $schedules['wcm_health_check_interval'] = array(
            'interval' => $interval,
            'display'  => sprintf( __( 'Every %d seconds', 'woo-comprehensive-monitor' ), $interval ),
        );
        return $schedules;
    }

    /**
     * Show welcome notice after activation
     */
    public function show_activation_notice() {
        if (get_transient('wcm_show_welcome_notice')) {
            $store_id = get_option('wcm_store_id');
            $monitoring_server = get_option('wcm_monitoring_server');

            ?>
            <div class="notice notice-success is-dismissible">
                <div style="display: flex; align-items: center; gap: 15px; padding: 15px 0;">
                    <div style="font-size: 32px;">🎉</div>
                    <div>
                        <h3 style="margin-top: 0;">WooCommerce Comprehensive Monitor Activated!</h3>
                        <p>Your store is now connected to the monitoring server.</p>
                        <p><strong>Store ID:</strong> <code><?php echo esc_html($store_id); ?></code></p>
                        <p><strong>Monitoring Server:</strong> <code><?php echo esc_html($monitoring_server); ?></code></p>
                        <p>
                            <a href="<?php echo admin_url('admin.php?page=woo-comprehensive-monitor'); ?>" class="button button-primary">
                                Go to Dashboard
                            </a>
                            <a href="<?php echo esc_url($monitoring_server . '/dashboard'); ?>" target="_blank" class="button">
                                View Central Dashboard
                            </a>
                        </p>
                    </div>
                </div>
            </div>
            <?php

            delete_transient('wcm_show_welcome_notice');
        }
    }

    /**
     * Add settings link to plugin page
     */
    public function add_settings_link($links) {
        $settings_link = '<a href="' . admin_url('admin.php?page=woo-comprehensive-monitor') . '">' . __('Settings', 'woo-comprehensive-monitor') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }

    /**
     * WooCommerce missing notice
     */
    public function woocommerce_missing_notice() {
        ?>
        <div class="notice notice-error">
            <p><?php _e('WooCommerce Comprehensive Monitor & Dispute Protection requires WooCommerce to be installed and activated.', 'woo-comprehensive-monitor'); ?></p>
        </div>
        <?php
    }

    /**
     * Stripe missing notice
     */
    public function stripe_missing_notice() {
        ?>
        <div class="notice notice-warning">
            <p><?php _e('WooCommerce Comprehensive Monitor: Stripe Gateway is not active. Dispute protection features will be limited.', 'woo-comprehensive-monitor'); ?></p>
        </div>
        <?php
    }

    /**
     * Stripe disabled notice (plugin active but gateway disabled)
     */
    public function stripe_disabled_notice() {
        ?>
        <div class="notice notice-warning">
            <p><?php _e('WooCommerce Comprehensive Monitor: Stripe Gateway is installed but <strong>disabled</strong> in WooCommerce settings. Please enable it at WooCommerce → Settings → Payments → Stripe for full dispute protection features.', 'woo-comprehensive-monitor'); ?></p>
        </div>
        <?php
    }

    /**
     * Get dispute manager instance
     */
    public function get_dispute_manager() {
        return $this->dispute_manager;
    }

    /**
     * Get error tracker instance
     */
    public function get_error_tracker() {
        return $this->error_tracker;
    }

    /**
     * Get health monitor instance
     */
    public function get_health_monitor() {
        return $this->health_monitor;
    }

    /**
     * Get admin dashboard instance
     */
    public function get_admin_dashboard() {
        return $this->admin_dashboard;
    }

    /**
     * Get subscription manager instance
     */
    public function get_subscription_manager() {
        return $this->subscription_manager;
    }

    /**
     * Get auto-updater instance
     */
    public function get_auto_updater() {
        return $this->auto_updater;
    }

    /**
     * Get file analyzer instance
     */
    public function get_file_analyzer() {
        return $this->file_analyzer;
    }

    /**
     * Check Stripe status and show appropriate notices
     */
    public function check_stripe_status() {
        // Only run once per hour — loading all payment gateways on every admin_init is expensive
        if ( get_transient( 'wcm_stripe_status_checked' ) ) {
            return;
        }

        $stripe_active = false;
        $stripe_gateway_enabled = false;

        if (class_exists('WC_Stripe') || class_exists('WC_Stripe_API') || class_exists('WooCommerce\\Stripe\\Gateway')) {
            $stripe_active = true;

            if (function_exists('WC') && method_exists(WC(), 'payment_gateways')) {
                $gateways = WC()->payment_gateways()->payment_gateways();
                if (isset($gateways['stripe']) && $gateways['stripe']->enabled === 'yes') {
                    $stripe_gateway_enabled = true;
                }
            }
        }

        if (!$stripe_active) {
            add_action('admin_notices', array($this, 'stripe_missing_notice'));
            $this->log_admin_notice_to_server('stripe_missing', 'Stripe Gateway plugin is not installed or activated.');
        } else if (!$stripe_gateway_enabled) {
            add_action('admin_notices', array($this, 'stripe_disabled_notice'));
            $this->log_admin_notice_to_server('stripe_disabled', 'Stripe Gateway is installed but disabled in WooCommerce settings.');
        }

        set_transient( 'wcm_stripe_status_checked', true, HOUR_IN_SECONDS );
    }

    /**
     * Log admin notice to monitoring server
     */
    private function log_admin_notice_to_server($notice_type, $message) {
        if (!class_exists('WCM_Helpers')) {
            return;
        }
        
        try {
            WCM_Helpers::send_event_to_server('admin_notice', array(
                'notice_type' => $notice_type,
                'message' => $message,
                'plugin_version' => WCM_VERSION,
                'woocommerce_version' => defined('WC_VERSION') ? WC_VERSION : 'N/A',
                'wordpress_version' => get_bloginfo('version'),
                'php_version' => PHP_VERSION,
            ));
        } catch (Exception $e) {
            // Silently fail
        }
    }
}

// Initialize the plugin
function wcm() {
    return WooComprehensiveMonitor::get_instance();
}
wcm();

// Include admin settings
require_once WCM_PLUGIN_DIR . 'admin/settings.php';