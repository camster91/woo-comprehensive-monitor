<?php
/**
 * Plugin Name: WooCommerce Comprehensive Monitor & Dispute Protection
 * Plugin URI: https://ashbi.ca
 * Description: Complete WooCommerce monitoring, error tracking, dispute protection, and health alerts. Combines frontend monitoring, dispute evidence generation, and centralized health reporting.
 * Version: 3.0.0
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
define('WCM_VERSION', '3.0.0');
define('WCM_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WCM_PLUGIN_URL', plugin_dir_url(__FILE__));
define('WCM_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Include required files
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-dispute-manager.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-error-tracker.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-health-monitor.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-admin-dashboard.php';
require_once WCM_PLUGIN_DIR . 'includes/class-wcm-subscription-manager-wps.php';

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

        // Initialize components
        add_action('plugins_loaded', array($this, 'init_components'));
        
        // Load text domain
        add_action('init', array($this, 'load_textdomain'));
        
        // Add settings link
        add_filter('plugin_action_links_' . WCM_PLUGIN_BASENAME, array($this, 'add_settings_link'));
    }

    /**
     * Initialize plugin components
     */
    public function init_components() {
        // Check if WooCommerce is active
        if (!class_exists('WooCommerce')) {
            add_action('admin_notices', array($this, 'woocommerce_missing_notice'));
            return;
        }

        // Check if Stripe is active
        if (!class_exists('WC_Stripe')) {
            add_action('admin_notices', array($this, 'stripe_missing_notice'));
        }

        // Initialize components
        $this->dispute_manager = new WCM_Dispute_Manager();
        $this->error_tracker = new WCM_Error_Tracker();
        $this->health_monitor = new WCM_Health_Monitor();
        $this->admin_dashboard = new WCM_Admin_Dashboard();
        $this->subscription_manager = new WCM_Subscription_Manager_WPS();
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
     * Plugin activation
     */
    public function activate() {
        // Create database tables
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Dispute evidence table
        $table_name = $wpdb->prefix . 'wcm_dispute_evidence';
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            dispute_id varchar(100) NOT NULL,
            order_id bigint(20) NOT NULL,
            customer_email varchar(255) NOT NULL,
            evidence_type varchar(50) NOT NULL,
            evidence_data longtext NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY dispute_id (dispute_id),
            KEY order_id (order_id),
            KEY customer_email (customer_email)
        ) $charset_collate;";
        
        // Error tracking table
        $table_name = $wpdb->prefix . 'wcm_error_logs';
        $sql .= "CREATE TABLE IF NOT EXISTS $table_name (
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
        ) $charset_collate;";
        
        // Health check logs table
        $table_name = $wpdb->prefix . 'wcm_health_logs';
        $sql .= "CREATE TABLE IF NOT EXISTS $table_name (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            check_type varchar(100) NOT NULL,
            status varchar(50) NOT NULL,
            details text NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY check_type (check_type),
            KEY status (status),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        // Set default options
        add_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        add_option('wcm_track_js_errors', '1');
        add_option('wcm_track_ajax_errors', '1');
        add_option('wcm_track_checkout_errors', '1');
        add_option('wcm_alert_email', get_option('admin_email'));
        add_option('wcm_enable_dispute_protection', '1');
        add_option('wcm_auto_generate_evidence', '1');
        add_option('wcm_send_dispute_alerts', '1');
        add_option('wcm_enable_health_monitoring', '1');
        add_option('wcm_health_check_interval', '3600'); // 1 hour
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Clear scheduled events
        wp_clear_scheduled_hook('wcm_daily_health_check');
        wp_clear_scheduled_hook('wcm_hourly_dispute_check');
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
}

// Initialize the plugin
function wcm() {
    return WooComprehensiveMonitor::get_instance();
}
wcm();

// Include admin settings
require_once WCM_PLUGIN_DIR . 'admin/settings.php';