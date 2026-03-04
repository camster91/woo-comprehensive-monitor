<?php
/**
 * Helper functions — subscription detection, acknowledgment storage, evidence utils
 * Ported from woo-dispute-evidence plugin
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Helpers {

    private static $instance = null;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {}

    // ==========================================
    // SUBSCRIPTION DETECTION
    // ==========================================
    public static function cart_has_subscription() {
        if ( ! function_exists( 'WC' ) || ! WC()->cart ) {
            return false;
        }
        foreach ( WC()->cart->get_cart() as $item ) {
            if ( isset( $item['variation_id'] ) && ! empty( $item['variation_id'] ) ) {
                $variation = wc_get_product( $item['variation_id'] );
                if ( $variation && self::is_subscription_product( $variation ) ) {
                    return true;
                }
            }
            if ( isset( $item['product_id'] ) ) {
                $product = wc_get_product( $item['product_id'] );
                if ( $product && self::is_subscription_product( $product ) ) {
                    return true;
                }
            }
        }
        return false;
    }

    public static function is_subscription_product( $product ) {
        if ( ! $product ) {
            return false;
        }
        $product_id   = $product->get_id();
        $product_type = $product->get_type();

        // WooCommerce Subscriptions
        if ( in_array( $product_type, array( 'subscription', 'variable-subscription', 'subscription_variation' ), true ) ) {
            return true;
        }
        if ( 'variation' === $product_type ) {
            $parent = wc_get_product( $product->get_parent_id() );
            if ( $parent && 'variable-subscription' === $parent->get_type() ) {
                return true;
            }
        }

        // WPSubscription Pro
        $wps_keys = array( '_subscrpt_enabled', 'subscription_enable', '_wps_subscription_product', '_wps_subscription_type', '_wps_subscription', '_wps_subscription_enable' );
        foreach ( $wps_keys as $key ) {
            $val = get_post_meta( $product_id, $key, true );
            if ( in_array( $val, array( 'yes', 'true', '1', 1, true ), true ) || ( ! empty( $val ) && '_wps_subscription_type' === $key ) ) {
                return true;
            }
        }

        // YITH WooCommerce Subscription
        if ( in_array( get_post_meta( $product_id, '_ywsbs_subscription', true ), array( 'yes', '1' ), true ) ) {
            return true;
        }

        // Generic enable keys
        $enable_keys = array( '_subscription_enabled', '_is_subscription', '_subscription_active', '_recurring_enabled', '_auto_renew' );
        foreach ( $enable_keys as $meta_key ) {
            if ( in_array( get_post_meta( $product_id, $meta_key, true ), array( 'yes', 'true', '1', 'on' ), true ) ) {
                return true;
            }
        }

        return apply_filters( 'wcm_is_subscription_product', false, $product );
    }

    // ==========================================
    // ACKNOWLEDGMENT HELPERS
    // ==========================================
    public static function get_default_acknowledgment_text() {
        return __( 'I acknowledge that I will be charged recurring payments for future subscription renewals. I understand that these charges will continue until I cancel my subscription.', 'woo-comprehensive-monitor' );
    }

    public static function get_acknowledgment_text() {
        $text = get_option( 'wcm_acknowledgment_text', '' );
        return empty( $text ) ? self::get_default_acknowledgment_text() : $text;
    }

    public static function get_customer_ip() {
        if ( ! empty( $_SERVER['HTTP_CLIENT_IP'] ) ) {
            return sanitize_text_field( wp_unslash( $_SERVER['HTTP_CLIENT_IP'] ) );
        }
        if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
            return sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) );
        }
        if ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
            return sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );
        }
        return '';
    }

    public static function save_acknowledgment( $user_id, $order_id, $ip_address ) {
        global $wpdb;
        $table = $wpdb->prefix . 'woo_subscription_acknowledgments';

        $result = $wpdb->insert( $table, array(
            'user_id'             => $user_id,
            'order_id'            => $order_id,
            'acknowledgment_text' => self::get_acknowledgment_text(),
            'ip_address'          => $ip_address,
            'user_agent'          => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '',
            'created_at'          => current_time( 'mysql' ),
        ) );

        if ( $result ) {
            $order = wc_get_order( $order_id );
            if ( $order ) {
                $acknowledgment = array(
                    'timestamp'  => current_time( 'mysql' ),
                    'ip_address' => $ip_address,
                    'user_agent' => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '',
                );
                $order->update_meta_data( '_wcm_subscription_acknowledgment', $acknowledgment );
                // Keep old keys for backward compatibility
                $order->update_meta_data( '_wcm_acknowledgment', 'yes' );
                $order->update_meta_data( '_wcm_acknowledgment_timestamp', current_time( 'mysql' ) );
                $order->update_meta_data( '_wcm_acknowledgment_ip', $ip_address );
                $order->save();
            }
        }
        return $result;
    }

    public static function get_acknowledgments( $user_id, $order_id = null ) {
        global $wpdb;
        $table = $wpdb->prefix . 'woo_subscription_acknowledgments';

        if ( $order_id ) {
            return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE user_id = %d AND order_id = %d ORDER BY created_at DESC", $user_id, $order_id ), ARRAY_A );
        }
        return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE user_id = %d ORDER BY created_at DESC", $user_id ), ARRAY_A );
    }

    public static function get_customer_subscription_orders( $email ) {
        $all_orders = wc_get_orders( array( 'customer' => $email, 'limit' => 100, 'status' => array( 'completed', 'processing' ), 'orderby' => 'date', 'order' => 'DESC' ) );
        $sub_orders = array();
        foreach ( $all_orders as $order ) {
            foreach ( $order->get_items() as $item ) {
                $product = $item->get_product();
                if ( $product && self::is_subscription_product( $product ) ) {
                    $sub_orders[] = $order;
                    break;
                }
            }
        }
        return $sub_orders;
    }

    public static function generate_evidence_filename( $dispute_id, $order_id ) {
        return 'dispute-evidence-' . sanitize_title( $dispute_id ) . '-order-' . $order_id . '-' . current_time( 'Y-m-d-H-i-s' ) . '.html';
    }

    public static function get_upload_dir() {
        static $dir = null;
        if ( null === $dir ) {
            $dir = wp_upload_dir()['basedir'] . '/wcm-evidence/';
        }
        return $dir;
    }

    public static function get_upload_url() {
        static $url = null;
        if ( null === $url ) {
            $url = wp_upload_dir()['baseurl'] . '/wcm-evidence/';
        }
        return $url;
    }

    public static function log( $message, $type = 'info' ) {
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            error_log( '[WCM][' . $type . '] ' . $message );
        }
    }

    /**
     * Send event to monitoring server
     *
     * @param string $event_type Type of event (e.g., 'preorder_charged', 'subscription_price_adjustment')
     * @param array  $data       Event data
     * @return bool|WP_Error True on success (or async send started), WP_Error on failure
     */
    public static function send_event_to_server( $event_type, $data = array() ) {
        $server = get_option( 'wcm_monitoring_server', '' );
        if ( empty( $server ) ) {
            return new WP_Error( 'no_server', 'No monitoring server configured.' );
        }

        $event_data = array_merge( array(
            'type'       => $event_type,
            'store_url'  => home_url(),
            'store_name' => get_bloginfo( 'name' ),
            'store_id'   => get_option( 'wcm_store_id' ),
            'timestamp'  => current_time( 'mysql' ),
        ), $data );

        $response = wp_remote_post( $server, array(
            'method'      => 'POST',
            'timeout'     => 5,
            'blocking'    => false, // Async
            'headers'     => array( 'Content-Type' => 'application/json' ),
            'body'        => wp_json_encode( $event_data ),
            'data_format' => 'body',
        ) );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        return true;
    }
}
