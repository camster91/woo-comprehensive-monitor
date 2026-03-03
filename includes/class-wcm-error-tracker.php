<?php
/**
 * Error Tracker - Handles frontend error tracking and reporting
 */

class WCM_Error_Tracker {

    public function __construct() {
        $this->init_hooks();
    }

    private function init_hooks() {
        // Enqueue tracking scripts
        add_action('wp_enqueue_scripts', array($this, 'enqueue_tracking_scripts'));
        
        // Register REST endpoint for error reporting
        add_action('rest_api_init', array($this, 'register_error_endpoint'));
        
        // Track WooCommerce-specific errors
        add_action('woocommerce_before_checkout_form', array($this, 'add_checkout_tracking'));
        add_action('woocommerce_before_cart', array($this, 'add_cart_tracking'));
        add_action('woocommerce_before_single_product', array($this, 'add_product_tracking'));
    }

    /**
     * Enqueue error tracking scripts
     */
    public function enqueue_tracking_scripts() {
        // Only load on WooCommerce pages
        if (!is_woocommerce() && !is_cart() && !is_checkout() && !is_account_page()) {
            return;
        }
        
        wp_enqueue_script(
            'wcm-error-tracker',
            WCM_PLUGIN_URL . 'assets/js/error-tracker.js',
            array('jquery'),
            WCM_VERSION,
            true
        );
        
        // Localize script with settings
        wp_localize_script('wcm-error-tracker', 'wcm_tracker', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'rest_url' => rest_url('wcm/v1/report-error'),
            'nonce' => wp_create_nonce('wcm_error_tracking'),
            'track_js_errors' => get_option('wcm_track_js_errors', '1'),
            'track_ajax_errors' => get_option('wcm_track_ajax_errors', '1'),
            'track_checkout_errors' => get_option('wcm_track_checkout_errors', '1'),
            'store_url' => home_url(),
            'store_name' => get_bloginfo('name'),
        ));
    }

    /**
     * Register REST endpoint for error reporting
     */
    public function register_error_endpoint() {
        register_rest_route('wcm/v1', '/report-error', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_error_report'),
            'permission_callback' => '__return_true',
        ));
    }

    /**
     * Handle error reports from frontend
     */
    public function handle_error_report($request) {
        $params = $request->get_json_params();
        
        // Validate required fields
        if (empty($params['error_type']) || empty($params['error_message'])) {
            return new WP_REST_Response(array('error' => 'Missing required fields'), 400);
        }
        
        // Sanitize input
        $error_type = sanitize_text_field($params['error_type']);
        $error_message = sanitize_textarea_field($params['error_message']);
        $page_url = isset($params['page_url']) ? esc_url_raw($params['page_url']) : '';
        $user_agent = isset($params['user_agent']) ? sanitize_text_field($params['user_agent']) : '';
        $customer_email = isset($params['customer_email']) ? sanitize_email($params['customer_email']) : '';
        $order_id = isset($params['order_id']) ? absint($params['order_id']) : 0;
        
        // Log error to database
        $this->log_error_to_database($error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id);
        
        // Send to monitoring server
        $this->send_to_monitoring_server($error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id);
        
        return new WP_REST_Response(array('status' => 'success'), 200);
    }

    /**
     * Log error to database
     */
    private function log_error_to_database($error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_error_logs';
        $wpdb->insert(
            $table_name,
            array(
                'error_type' => $error_type,
                'error_message' => $error_message,
                'page_url' => $page_url,
                'user_agent' => $user_agent,
                'customer_email' => $customer_email,
                'order_id' => $order_id,
                'created_at' => current_time('mysql'),
            )
        );
    }

    /**
     * Send error to monitoring server
     */
    private function send_to_monitoring_server($error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id) {
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        if (empty($monitoring_server)) {
            return;
        }
        
        $error_data = array(
            'type' => $error_type,
            'error_message' => $error_message,
            'site' => home_url(),
            'url' => $page_url,
            'user_agent' => $user_agent,
            'customer_email' => $customer_email,
            'order_id' => $order_id,
            'time' => current_time('mysql'),
        );
        
        wp_remote_post($monitoring_server, array(
            'method' => 'POST',
            'timeout' => 30,
            'redirection' => 5,
            'httpversion' => '1.0',
            'blocking' => false,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($error_data),
            'data_format' => 'body',
        ));
    }

    /**
     * Add checkout-specific tracking
     */
    public function add_checkout_tracking() {
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            // Track WooCommerce checkout errors
            $(document).on('checkout_error', function(event, error_message) {
                if (typeof wcm_tracker !== 'undefined' && wcm_tracker.track_checkout_errors === '1') {
                    $.ajax({
                        url: wcm_tracker.rest_url,
                        method: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify({
                            error_type: 'checkout_error',
                            error_message: error_message,
                            page_url: window.location.href,
                            user_agent: navigator.userAgent,
                            customer_email: $('#billing_email').val() || ''
                        })
                    });
                }
            });
            
            // Track payment gateway errors
            $(document).on('payment_method_selected', function() {
                // Monitor payment form submissions
                $('form.woocommerce-checkout').on('submit', function() {
                    // This would track form submission errors
                });
            });
        });
        </script>
        <?php
    }

    /**
     * Add cart-specific tracking
     */
    public function add_cart_tracking() {
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            // Track AJAX add to cart errors
            $(document).on('added_to_cart', function(event, fragments, cart_hash, $button) {
                // Success - no error
            }).on('ajax_error', function(event, xhr, settings, error) {
                if (settings.url.includes('add_to_cart')) {
                    if (typeof wcm_tracker !== 'undefined' && wcm_tracker.track_ajax_errors === '1') {
                        $.ajax({
                            url: wcm_tracker.rest_url,
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify({
                                error_type: 'ajax_add_to_cart_error',
                                error_message: error,
                                page_url: window.location.href,
                                user_agent: navigator.userAgent
                            })
                        });
                    }
                }
            });
        });
        </script>
        <?php
    }

    /**
     * Add product page tracking
     */
    public function add_product_tracking() {
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            // Track product page JavaScript errors
            if (typeof wcm_tracker !== 'undefined' && wcm_tracker.track_js_errors === '1') {
                window.addEventListener('error', function(event) {
                    // Don't track errors from external domains
                    if (!event.filename || event.filename.includes(window.location.origin)) {
                        $.ajax({
                            url: wcm_tracker.rest_url,
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify({
                                error_type: 'javascript_error',
                                error_message: event.message + ' at ' + event.filename + ':' + event.lineno + ':' + event.colno,
                                page_url: window.location.href,
                                user_agent: navigator.userAgent
                            })
                        });
                    }
                }, true);
            }
        });
        </script>
        <?php
    }

    /**
     * Get error statistics
     */
    public function get_error_stats($days = 7) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_error_logs';
        $date_cutoff = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        $stats = array(
            'total_errors' => 0,
            'by_type' => array(),
            'by_day' => array(),
        );
        
        // Total errors
        $stats['total_errors'] = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table_name} WHERE created_at >= %s",
            $date_cutoff
        ));
        
        // Errors by type
        $error_types = $wpdb->get_results($wpdb->prepare(
            "SELECT error_type, COUNT(*) as count 
             FROM {$table_name} 
             WHERE created_at >= %s 
             GROUP BY error_type 
             ORDER BY count DESC",
            $date_cutoff
        ));
        
        foreach ($error_types as $type) {
            $stats['by_type'][$type->error_type] = $type->count;
        }
        
        // Errors by day
        $errors_by_day = $wpdb->get_results($wpdb->prepare(
            "SELECT DATE(created_at) as date, COUNT(*) as count 
             FROM {$table_name} 
             WHERE created_at >= %s 
             GROUP BY DATE(created_at) 
             ORDER BY date DESC",
            $date_cutoff
        ));
        
        foreach ($errors_by_day as $day) {
            $stats['by_day'][$day->date] = $day->count;
        }
        
        return $stats;
    }

    /**
     * Get recent errors
     */
    public function get_recent_errors($limit = 50) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_error_logs';
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table_name} ORDER BY created_at DESC LIMIT %d", $limit)
        );
    }
}