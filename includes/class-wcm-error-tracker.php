<?php
/**
 * Error Tracker — frontend JS/AJAX/checkout error tracking with rate limiting.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Error_Tracker {

    /** Max errors per IP per hour */
    const RATE_LIMIT = 30;

    public function __construct() {
        $this->init_hooks();
    }

    private function init_hooks() {
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_tracking_scripts' ) );
        add_action( 'rest_api_init', array( $this, 'register_error_endpoint' ) );
        add_action( 'woocommerce_before_checkout_form', array( $this, 'add_checkout_tracking' ) );
        add_action( 'woocommerce_before_cart', array( $this, 'add_cart_tracking' ) );
        add_action( 'woocommerce_before_single_product', array( $this, 'add_product_tracking' ) );

        // AJAX: test connection to monitoring server (settings page)
        add_action( 'wp_ajax_wcm_test_connection', array( $this, 'ajax_test_connection' ) );
        // AJAX: fallback error reporting (if REST API fails)
        add_action( 'wp_ajax_wcm_report_error', array( $this, 'ajax_report_error' ) );
        add_action( 'wp_ajax_nopriv_wcm_report_error', array( $this, 'ajax_report_error' ) );
    }

    // ================================================================
    // SCRIPTS
    // ================================================================

    public function enqueue_tracking_scripts() {
        if ( ! is_woocommerce() && ! is_cart() && ! is_checkout() && ! is_account_page() ) {
            return;
        }

        wp_enqueue_script( 'wcm-error-tracker', WCM_PLUGIN_URL . 'assets/js/error-tracker.js', array( 'jquery' ), WCM_VERSION, true );

        wp_localize_script( 'wcm-error-tracker', 'wcm_tracker', array(
            'ajax_url'              => admin_url( 'admin-ajax.php' ),
            'rest_url'              => rest_url( 'wcm/v1/report-error' ),
            'nonce'                 => wp_create_nonce( 'wcm_error_tracking' ),
            'track_js_errors'       => get_option( 'wcm_track_js_errors', '1' ),
            'track_ajax_errors'     => get_option( 'wcm_track_ajax_errors', '1' ),
            'track_checkout_errors' => get_option( 'wcm_track_checkout_errors', '1' ),
            'store_url'             => home_url(),
            'store_name'            => get_bloginfo( 'name' ),
        ) );
    }

    // ================================================================
    // REST ENDPOINT WITH RATE LIMITING
    // ================================================================

    public function register_error_endpoint() {
        register_rest_route( 'wcm/v1', '/report-error', array(
            'methods'             => 'POST',
            'callback'            => array( $this, 'handle_error_report' ),
            'permission_callback' => array( $this, 'check_rate_limit' ),
        ) );
    }

    /**
     * Rate limit: max 30 errors per IP per hour.
     */
    public function check_rate_limit( $request ) {
        $ip  = $this->get_client_ip();
        $key = 'wcm_err_' . md5( $ip );
        $count = (int) get_transient( $key );

        if ( $count >= self::RATE_LIMIT ) {
            return new WP_Error( 'rate_limited', 'Too many error reports. Try again later.', array( 'status' => 429 ) );
        }

        set_transient( $key, $count + 1, HOUR_IN_SECONDS );
        return true;
    }

    private function get_client_ip() {
        foreach ( array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR' ) as $key ) {
            if ( ! empty( $_SERVER[ $key ] ) ) {
                $ip = explode( ',', sanitize_text_field( wp_unslash( $_SERVER[ $key ] ) ) );
                return trim( $ip[0] );
            }
        }
        return '0.0.0.0';
    }

    public function handle_error_report( $request ) {
        $params = $request->get_json_params();

        if ( empty( $params['error_type'] ) || empty( $params['error_message'] ) ) {
            return new WP_REST_Response( array( 'error' => 'Missing required fields' ), 400 );
        }

        $error_type     = sanitize_text_field( $params['error_type'] );
        $error_message  = sanitize_textarea_field( $params['error_message'] );
        $page_url       = isset( $params['page_url'] ) ? esc_url_raw( $params['page_url'] ) : '';
        $user_agent     = isset( $params['user_agent'] ) ? sanitize_text_field( $params['user_agent'] ) : '';
        $customer_email = isset( $params['customer_email'] ) ? sanitize_email( $params['customer_email'] ) : '';
        $order_id       = isset( $params['order_id'] ) ? absint( $params['order_id'] ) : 0;

        $this->log_error( $error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id );
        $this->send_to_monitoring_server( $error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id );

        return new WP_REST_Response( array( 'status' => 'success' ), 200 );
    }

    // ================================================================
    // DATABASE
    // ================================================================

    private function log_error( $error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id ) {
        global $wpdb;
        
        // Check if error should be suppressed based on patterns
        if ( $this->should_suppress_error( $error_message ) ) {
            return false;
        }
        
        // Check for duplicate error in the last 5 minutes to avoid flooding
        $error_hash = md5( $error_type . $error_message . $page_url );
        $duplicate_key = 'wcm_err_dup_' . $error_hash;
        
        // If same error occurred in last 5 minutes, skip logging (but still send to monitoring server)
        if ( get_transient( $duplicate_key ) ) {
            return false;
        }
        
        // Set transient for 5 minutes to prevent duplicate logging
        set_transient( $duplicate_key, true, 5 * MINUTE_IN_SECONDS );
        
        $wpdb->insert( $wpdb->prefix . 'wcm_error_logs', array(
            'error_type'     => $error_type,
            'error_message'  => $error_message,
            'page_url'       => $page_url,
            'user_agent'     => $user_agent,
            'customer_email' => $customer_email,
            'order_id'       => $order_id,
            'created_at'     => current_time( 'mysql' ),
        ) );
        
        return true;
    }
    
    /**
     * Check if error should be suppressed based on patterns
     */
    private function should_suppress_error( $error_message ) {
        $suppression_patterns = get_option( 'wcm_suppress_error_patterns', '' );
        if ( empty( $suppression_patterns ) ) {
            return false;
        }
        
        $patterns = explode( "\n", $suppression_patterns );
        foreach ( $patterns as $pattern ) {
            $pattern = trim( $pattern );
            if ( ! empty( $pattern ) && false !== stripos( $error_message, $pattern ) ) {
                return true;
            }
        }
        
        return false;
    }

    private function send_to_monitoring_server( $error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id ) {
        $server = get_option( 'wcm_monitoring_server', '' );
        if ( empty( $server ) ) {
            return;
        }

        $payload = array(
            'type'           => $error_type,
            'error_message'  => $error_message,
            'site'           => home_url(),
            'url'            => $page_url,
            'user_agent'     => $user_agent,
            'customer_email' => $customer_email,
            'order_id'       => $order_id,
            'time'           => current_time( 'mysql' ),
        );

        // Try to send with retry logic
        $max_retries = 2;
        $retry_delay = 1; // seconds
        
        for ( $attempt = 1; $attempt <= $max_retries; $attempt++ ) {
            $response = wp_remote_post( $server, array(
                'method'   => 'POST',
                'timeout'  => 5,
                'blocking' => false, // Non-blocking for first attempt
                'headers'  => array( 'Content-Type' => 'application/json' ),
                'body'     => wp_json_encode( $payload ),
            ) );
            
            // If non-blocking, we can't check response
            if ( $attempt === 1 ) {
                break; // First attempt is non-blocking
            }
            
            // For retries, use blocking to check
            if ( ! is_wp_error( $response ) ) {
                $code = wp_remote_retrieve_response_code( $response );
                if ( $code >= 200 && $code < 300 ) {
                    // Success
                    return;
                }
            }
            
            // Wait before retry
            if ( $attempt < $max_retries ) {
                sleep( $retry_delay );
                $retry_delay *= 2; // Exponential backoff
            }
        }
        
        // If we get here and have retries enabled, log the failure
        if ( $max_retries > 1 ) {
            error_log( '[WCM] Failed to send error to monitoring server after ' . $max_retries . ' attempts: ' . $error_type );
        }
    }

    // ================================================================
    // AJAX: TEST CONNECTION (settings page)
    // ================================================================

    public function ajax_test_connection() {
        check_ajax_referer( 'wcm_test_connection', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( 'Permission denied.' );
        }

        $server_url = isset( $_POST['server_url'] ) ? esc_url_raw( wp_unslash( $_POST['server_url'] ) ) : '';
        if ( empty( $server_url ) ) {
            wp_send_json_error( 'No monitoring server URL provided.' );
        }

        // Extract base URL (remove /api/track-woo-error if present)
        $base = preg_replace( '#/api/track-woo-error$#', '', rtrim( $server_url, '/' ) );
        $health_url = $base . '/api/health';

        $response = wp_remote_get( $health_url, array( 'timeout' => 10 ) );

        if ( is_wp_error( $response ) ) {
            wp_send_json_error( 'Connection failed: ' . $response->get_error_message() );
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( 200 === $code && isset( $body['status'] ) && 'ok' === $body['status'] ) {
            wp_send_json_success( array(
                'message' => sprintf( 'Connected! Server v%s — %d stores monitored.', $body['version'] ?? '?', $body['features']['sites_monitored'] ?? 0 ),
            ) );
        }

        wp_send_json_error( sprintf( 'Server returned HTTP %d.', $code ) );
    }

    /**
     * AJAX handler for error reporting (fallback when REST API fails)
     */
    public function ajax_report_error() {
        // Check nonce
        check_ajax_referer( 'wcm_error_tracking', 'nonce' );
        
        // Rate limiting (same as REST endpoint)
        $ip  = $this->get_client_ip();
        $key = 'wcm_err_' . md5( $ip );
        $count = (int) get_transient( $key );
        
        if ( $count >= self::RATE_LIMIT ) {
            wp_send_json_error( 'Too many error reports. Try again later.', 429 );
            wp_die();
        }
        
        set_transient( $key, $count + 1, HOUR_IN_SECONDS );
        
        // Check if error_data is sent as JSON string (from error-tracker.js fallback)
        if ( isset( $_POST['error_data'] ) && is_string( $_POST['error_data'] ) ) {
            $error_data = json_decode( wp_unslash( $_POST['error_data'] ), true );
            if ( json_last_error() === JSON_ERROR_NONE && is_array( $error_data ) ) {
                // Extract from JSON object
                $error_type     = isset( $error_data['error_type'] ) ? sanitize_text_field( $error_data['error_type'] ) : '';
                $error_message  = isset( $error_data['error_message'] ) ? sanitize_textarea_field( $error_data['error_message'] ) : '';
                $page_url       = isset( $error_data['page_url'] ) ? esc_url_raw( $error_data['page_url'] ) : '';
                $user_agent     = isset( $error_data['user_agent'] ) ? sanitize_text_field( $error_data['user_agent'] ) : '';
                $customer_email = isset( $error_data['customer_email'] ) ? sanitize_email( $error_data['customer_email'] ) : '';
                $order_id       = isset( $error_data['order_id'] ) ? absint( $error_data['order_id'] ) : 0;
            } else {
                wp_send_json_error( 'Invalid error_data JSON format', 400 );
                wp_die();
            }
        } else {
            // Legacy: individual POST fields
            $error_type     = isset( $_POST['error_type'] ) ? sanitize_text_field( wp_unslash( $_POST['error_type'] ) ) : '';
            $error_message  = isset( $_POST['error_message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['error_message'] ) ) : '';
            $page_url       = isset( $_POST['page_url'] ) ? esc_url_raw( wp_unslash( $_POST['page_url'] ) ) : '';
            $user_agent     = isset( $_POST['user_agent'] ) ? sanitize_text_field( wp_unslash( $_POST['user_agent'] ) ) : '';
            $customer_email = isset( $_POST['customer_email'] ) ? sanitize_email( wp_unslash( $_POST['customer_email'] ) ) : '';
            $order_id       = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
        }
        
        if ( empty( $error_type ) || empty( $error_message ) ) {
            wp_send_json_error( 'Missing required fields', 400 );
            wp_die();
        }
        
        $this->log_error( $error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id );
        $this->send_to_monitoring_server( $error_type, $error_message, $page_url, $user_agent, $customer_email, $order_id );
        
        wp_send_json_success();
        wp_die();
    }

    // ================================================================
    // INLINE TRACKING (checkout, cart, product pages)
    // ================================================================

    public function add_checkout_tracking() {
        ?>
        <script>
        jQuery(function($) {
            $(document).on('checkout_error', function(e, msg) {
                if (typeof wcm_tracker !== 'undefined' && wcm_tracker.track_checkout_errors === '1') {
                    $.post(wcm_tracker.rest_url, JSON.stringify({
                        error_type: 'checkout_error', error_message: msg,
                        page_url: location.href, user_agent: navigator.userAgent,
                        customer_email: $('#billing_email').val() || ''
                    }), null, 'json');
                }
            });
        });
        </script>
        <?php
    }

    public function add_cart_tracking() {
        ?>
        <script>
        jQuery(function($) {
            $(document).ajaxError(function(e, xhr, settings, error) {
                if (settings.url && settings.url.indexOf('add_to_cart') !== -1 && typeof wcm_tracker !== 'undefined' && wcm_tracker.track_ajax_errors === '1') {
                    $.post(wcm_tracker.rest_url, JSON.stringify({
                        error_type: 'ajax_add_to_cart_error', error_message: error,
                        page_url: location.href, user_agent: navigator.userAgent
                    }), null, 'json');
                }
            });
        });
        </script>
        <?php
    }

    public function add_product_tracking() {
        ?>
        <script>
        jQuery(function($) {
            if (typeof wcm_tracker !== 'undefined' && wcm_tracker.track_js_errors === '1') {
                window.addEventListener('error', function(e) {
                    if (e.filename && e.filename.indexOf(location.origin) !== -1) {
                        $.post(wcm_tracker.rest_url, JSON.stringify({
                            error_type: 'javascript_error',
                            error_message: e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno,
                            page_url: location.href, user_agent: navigator.userAgent
                        }), null, 'json');
                    }
                }, true);
            }
        });
        </script>
        <?php
    }

    // ================================================================
    // STATS
    // ================================================================

    public function get_error_stats( $days = 7 ) {
        global $wpdb;
        $table  = $wpdb->prefix . 'wcm_error_logs';
        $cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days" ) );

        return array(
            'total_errors' => (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE created_at >= %s", $cutoff ) ),
            'by_type'      => wp_list_pluck(
                $wpdb->get_results( $wpdb->prepare( "SELECT error_type, COUNT(*) as cnt FROM {$table} WHERE created_at >= %s GROUP BY error_type ORDER BY cnt DESC", $cutoff ) ),
                'cnt', 'error_type'
            ),
        );
    }

    public function get_recent_errors( $limit = 50 ) {
        global $wpdb;
        return $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}wcm_error_logs ORDER BY created_at DESC LIMIT %d",
            $limit
        ) );
    }

    /**
     * Get error groups (similar errors grouped together)
     */
    public function get_error_groups( $days = 7, $min_occurrences = 2 ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_error_logs';
        $cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days" ) );
        
        // Group by error message and page URL pattern
        return $wpdb->get_results( $wpdb->prepare(
            "SELECT 
                error_type,
                SUBSTRING(error_message, 1, 100) as error_snippet,
                COUNT(*) as occurrences,
                MIN(created_at) as first_seen,
                MAX(created_at) as last_seen,
                GROUP_CONCAT(DISTINCT page_url) as urls
            FROM {$table} 
            WHERE created_at >= %s
            GROUP BY error_type, SUBSTRING(error_message, 1, 100)
            HAVING occurrences >= %d
            ORDER BY occurrences DESC
            LIMIT 50",
            $cutoff,
            $min_occurrences
        ) );
    }

    /**
     * Get error trends over time
     */
    public function get_error_trends( $days = 30 ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_error_logs';
        $cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days" ) );
        
        return $wpdb->get_results( $wpdb->prepare(
            "SELECT 
                DATE(created_at) as date,
                COUNT(*) as count,
                SUM(CASE WHEN error_type = 'javascript_error' THEN 1 ELSE 0 END) as js_errors,
                SUM(CASE WHEN error_type = 'checkout_error' THEN 1 ELSE 0 END) as checkout_errors,
                SUM(CASE WHEN error_type = 'ajax_add_to_cart_error' THEN 1 ELSE 0 END) as ajax_errors
            FROM {$table}
            WHERE created_at >= %s
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 30",
            $cutoff
        ) );
    }

    /**
     * Clear old errors based on retention setting
     */
    public function cleanup_old_errors() {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_error_logs';
        $retention_days = get_option( 'wcm_log_retention_days', 30 );
        
        if ( $retention_days < 1 ) {
            return 0;
        }
        
        $cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$retention_days} days" ) );
        $deleted = $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$table} WHERE created_at < %s",
            $cutoff
        ) );
        
        return $deleted;
    }
}
