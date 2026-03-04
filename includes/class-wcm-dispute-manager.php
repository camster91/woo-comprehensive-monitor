<?php
/**
 * Dispute Manager — Stripe dispute detection, webhook handling, evidence generation.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Dispute_Manager {

    private $stripe_api_key = '';
    private $webhook_secret = '';

    public function __construct() {
        $this->load_stripe_config();
        $this->init_hooks();
    }

    private function init_hooks() {
        add_action( 'rest_api_init', array( $this, 'register_webhook_endpoint' ) );
        add_action( 'woocommerce_checkout_order_processed', array( $this, 'record_subscription_acknowledgment' ), 10, 3 );

        if ( ! wp_next_scheduled( 'wcm_hourly_dispute_check' ) ) {
            wp_schedule_event( time(), 'hourly', 'wcm_hourly_dispute_check' );
        }
        add_action( 'wcm_hourly_dispute_check', array( $this, 'check_for_disputes' ) );
    }

    private function load_stripe_config() {
        if ( ! class_exists( 'WC_Stripe' ) ) {
            return;
        }
        $settings = get_option( 'woocommerce_stripe_settings' );
        if ( ! $settings || ! isset( $settings['testmode'] ) ) {
            return;
        }
        $test = 'yes' === $settings['testmode'];
        $this->stripe_api_key = $test
            ? ( $settings['test_secret_key'] ?? '' )
            : ( $settings['secret_key'] ?? '' );
        $this->webhook_secret = $settings['webhook_secret'] ?? '';
    }

    // ================================================================
    // WEBHOOK ENDPOINT
    // ================================================================

    public function register_webhook_endpoint() {
        register_rest_route( 'wcm/v1', '/stripe-webhook', array(
            'methods'             => 'POST',
            'callback'            => array( $this, 'handle_stripe_webhook' ),
            'permission_callback' => '__return_true', // Stripe can't send auth headers; we verify via signature
        ) );
    }

    public function handle_stripe_webhook( $request ) {
        $payload    = $request->get_body();
        $sig_header = $request->get_header( 'stripe-signature' );

        try {
            $event = $this->verify_webhook_signature( $payload, $sig_header );

            switch ( $event->type ) {
                case 'charge.dispute.created':
                    $this->handle_new_dispute( $event->data->object );
                    break;
                case 'charge.dispute.updated':
                    $this->handle_updated_dispute( $event->data->object );
                    break;
                case 'charge.dispute.closed':
                    $this->handle_closed_dispute( $event->data->object );
                    break;
            }

            return new WP_REST_Response( array( 'status' => 'success' ), 200 );
        } catch ( Exception $e ) {
            error_log( 'WCM Dispute Webhook Error: ' . $e->getMessage() );
            return new WP_REST_Response( array( 'error' => $e->getMessage() ), 400 );
        }
    }

    /**
     * Verify Stripe webhook signature using HMAC-SHA256.
     *
     * @throws Exception If signature is invalid or webhook secret not configured.
     */
    private function verify_webhook_signature( $payload, $sig_header ) {
        if ( empty( $this->webhook_secret ) ) {
            throw new Exception( 'Webhook secret not configured. Set it in WooCommerce → Settings → Payments → Stripe.' );
        }

        if ( empty( $sig_header ) ) {
            throw new Exception( 'Missing Stripe-Signature header.' );
        }

        // Parse the signature header: t=timestamp,v1=signature
        $parts     = array();
        $timestamp = '';
        $signature = '';

        foreach ( explode( ',', $sig_header ) as $item ) {
            $kv = explode( '=', $item, 2 );
            if ( count( $kv ) !== 2 ) {
                continue;
            }
            if ( 't' === $kv[0] ) {
                $timestamp = $kv[1];
            }
            if ( 'v1' === $kv[0] ) {
                $signature = $kv[1];
            }
        }

        if ( empty( $timestamp ) || empty( $signature ) ) {
            throw new Exception( 'Invalid Stripe-Signature format.' );
        }

        // Reject events older than 5 minutes (replay protection)
        if ( abs( time() - (int) $timestamp ) > 300 ) {
            throw new Exception( 'Webhook timestamp too old (possible replay attack).' );
        }

        // Compute expected signature
        $signed_payload    = $timestamp . '.' . $payload;
        $expected_signature = hash_hmac( 'sha256', $signed_payload, $this->webhook_secret );

        if ( ! hash_equals( $expected_signature, $signature ) ) {
            throw new Exception( 'Webhook signature verification failed.' );
        }

        $event = json_decode( $payload );
        if ( ! $event || empty( $event->type ) ) {
            throw new Exception( 'Invalid JSON payload.' );
        }

        return $event;
    }

    // ================================================================
    // DISPUTE HANDLERS
    // ================================================================

    private function handle_new_dispute( $dispute ) {
        global $wpdb;

        $order_id = $this->find_order_by_charge_id( $dispute->charge );
        if ( ! $order_id ) {
            error_log( 'WCM: Could not find order for charge ' . $dispute->charge );
            return;
        }

        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        // Generate evidence automatically if enabled
        if ( '1' === get_option( 'wcm_auto_generate_evidence', '1' ) ) {
            $evidence = $this->generate_dispute_evidence( $order, $dispute );

            $wpdb->insert(
                $wpdb->prefix . 'wcm_dispute_evidence',
                array(
                    'dispute_id'       => $dispute->id,
                    'order_id'         => $order_id,
                    'customer_email'   => $order->get_billing_email(),
                    'stripe_dispute_id'=> $dispute->id,
                    'evidence_type'    => 'auto_generated',
                    'evidence_data'    => wp_json_encode( $evidence ),
                    'status'           => 'pending',
                )
            );

            $this->send_dispute_alert( $order, $dispute, $evidence );
        }

        $order->add_order_note(
            sprintf(
                __( '⚠️ Stripe dispute created: %s. Reason: %s. Amount: %s', 'woo-comprehensive-monitor' ),
                $dispute->id,
                $dispute->reason,
                wc_price( $dispute->amount / 100 )
            )
        );
    }

    private function handle_updated_dispute( $dispute ) {
        global $wpdb;
        $wpdb->update(
            $wpdb->prefix . 'wcm_dispute_evidence',
            array(
                'status'        => $dispute->status,
                'evidence_data' => wp_json_encode( array( 'status' => $dispute->status, 'reason' => $dispute->reason ) ),
            ),
            array( 'stripe_dispute_id' => $dispute->id )
        );
    }

    private function handle_closed_dispute( $dispute ) {
        global $wpdb;
        $outcome = 'won' === $dispute->status ? 'won' : 'lost';
        $wpdb->update(
            $wpdb->prefix . 'wcm_dispute_evidence',
            array( 'status' => $outcome ),
            array( 'stripe_dispute_id' => $dispute->id )
        );

        // Find the order and add a note
        $order_id = $this->find_order_by_charge_id( $dispute->charge );
        if ( $order_id ) {
            $order = wc_get_order( $order_id );
            if ( $order ) {
                $order->add_order_note(
                    sprintf( __( 'Stripe dispute %s: %s', 'woo-comprehensive-monitor' ), $outcome, $dispute->id )
                );
            }
        }
    }

    // ================================================================
    // EVIDENCE GENERATION
    // ================================================================

    private function generate_dispute_evidence( $order, $dispute ) {
        $evidence = array(
            'dispute_id'                  => $dispute->id,
            'order_id'                    => $order->get_id(),
            'customer_email'              => $order->get_billing_email(),
            'customer_name'               => $order->get_formatted_billing_full_name(),
            'order_date'                  => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : '',
            'order_total'                 => $order->get_total(),
            'currency'                    => $order->get_currency(),
            'products'                    => array(),
            'billing_address'             => $order->get_address( 'billing' ),
            'shipping_address'            => $order->get_address( 'shipping' ),
            'ip_address'                  => $order->get_customer_ip_address(),
            'user_agent'                  => $order->get_customer_user_agent(),
            'subscription_acknowledgment' => $this->get_subscription_acknowledgment( $order ),
            'evidence_generated_at'       => current_time( 'mysql' ),
        );

        foreach ( $order->get_items() as $item ) {
            $product              = $item->get_product();
            $evidence['products'][] = array(
                'name'     => $item->get_name(),
                'quantity' => $item->get_quantity(),
                'price'    => $item->get_total(),
                'sku'      => $product ? $product->get_sku() : '',
                'type'     => $product ? $product->get_type() : '',
            );
        }

        // Add WCS subscription details if applicable
        if ( function_exists( 'wcs_order_contains_subscription' ) && wcs_order_contains_subscription( $order ) ) {
            foreach ( wcs_get_subscriptions_for_order( $order ) as $sub ) {
                $evidence['subscriptions'][] = array(
                    'id'           => $sub->get_id(),
                    'status'       => $sub->get_status(),
                    'next_payment' => $sub->get_date( 'next_payment' ),
                );
            }
        }

        return $evidence;
    }

    private function get_subscription_acknowledgment( $order ) {
        // Try HPOS meta first, then postmeta
        $ack = $order->get_meta( '_wcm_subscription_acknowledgment' );
        if ( ! $ack ) {
            $ack = get_post_meta( $order->get_id(), '_wcm_subscription_acknowledgment', true );
        }
        return $ack ? $ack : null;
    }

    // ================================================================
    // CHECKOUT ACKNOWLEDGMENT
    // ================================================================

    public function record_subscription_acknowledgment( $order_id, $posted_data, $order ) {
        if ( function_exists( 'wcs_order_contains_subscription' ) && wcs_order_contains_subscription( $order ) ) {
            $ack = array(
                'timestamp'  => current_time( 'mysql' ),
                'ip_address' => WC_Geolocation::get_ip_address(),
                'user_agent' => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '',
            );
            $order->update_meta_data( '_wcm_subscription_acknowledgment', $ack );
            $order->save();
            $order->add_order_note( __( 'Customer acknowledged subscription terms at checkout.', 'woo-comprehensive-monitor' ) );
        }
    }

    // ================================================================
    // ALERTS
    // ================================================================

    private function send_dispute_alert( $order, $dispute, $evidence ) {
        if ( '1' !== get_option( 'wcm_send_dispute_alerts', '1' ) ) {
            return;
        }
        $server = get_option( 'wcm_monitoring_server', '' );
        if ( empty( $server ) ) {
            return;
        }

        wp_remote_post( $server, array(
            'method'   => 'POST',
            'timeout'  => 5,
            'blocking' => false,
            'headers'  => array( 'Content-Type' => 'application/json' ),
            'body'     => wp_json_encode( array(
                'type'               => 'dispute_created',
                'store_url'          => home_url(),
                'store_name'         => get_bloginfo( 'name' ),
                'dispute_id'         => $dispute->id,
                'order_id'           => $order->get_id(),
                'customer_email'     => $order->get_billing_email(),
                'amount'             => $dispute->amount / 100,
                'currency'           => strtoupper( $dispute->currency ),
                'reason'             => $dispute->reason,
                'evidence_generated' => true,
                'timestamp'          => current_time( 'mysql' ),
            ) ),
        ) );
    }

    // ================================================================
    // ORDER LOOKUP (HPOS compatible)
    // ================================================================

    private function find_order_by_charge_id( $charge_id ) {
        // Try HPOS first
        if ( class_exists( '\Automattic\WooCommerce\Utilities\OrderUtil' ) &&
             \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled() ) {
            $orders = wc_get_orders( array(
                'limit'      => 1,
                'meta_query' => array(
                    'relation' => 'OR',
                    array( 'key' => '_transaction_id', 'value' => $charge_id ),
                    array( 'key' => '_stripe_charge_id', 'value' => $charge_id ),
                ),
            ) );
            return ! empty( $orders ) ? $orders[0]->get_id() : 0;
        }

        // Legacy postmeta
        global $wpdb;
        $order_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_transaction_id' AND meta_value = %s",
            $charge_id
        ) );
        if ( ! $order_id ) {
            $order_id = $wpdb->get_var( $wpdb->prepare(
                "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_stripe_charge_id' AND meta_value = %s",
                $charge_id
            ) );
        }
        return (int) $order_id;
    }

    // ================================================================
    // ACTIVE DISPUTE CHECK VIA STRIPE API
    // ================================================================

    public function check_for_disputes() {
        if ( empty( $this->stripe_api_key ) ) {
            return;
        }

        $response = wp_remote_get( 'https://api.stripe.com/v1/disputes?limit=10', array(
            'headers' => array( 'Authorization' => 'Bearer ' . $this->stripe_api_key ),
            'timeout' => 15,
        ) );

        if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
            return;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ) );
        if ( ! $body || empty( $body->data ) ) {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'wcm_dispute_evidence';

        foreach ( $body->data as $dispute ) {
            // Skip if already tracked
            $exists = $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$table} WHERE stripe_dispute_id = %s",
                $dispute->id
            ) );
            if ( $exists ) {
                continue;
            }

            // Process as new dispute
            $this->handle_new_dispute( $dispute );
        }
    }

    /**
     * Get disputes for admin dashboard.
     */
    public function get_disputes( $limit = 50 ) {
        global $wpdb;
        return $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}wcm_dispute_evidence ORDER BY created_at DESC LIMIT %d",
            $limit
        ) );
    }
}
