<?php
/**
 * Subscription Convert & Cancel — Adds "Convert to One-Time" and improved
 * cancel flow to the WPSubscription My Account page.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Subscription_Convert {

    private static $instance = null;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Add buttons to subscription detail page
        add_filter( 'subscrpt_single_action_buttons', array( $this, 'add_convert_button' ), 20, 4 );

        // AJAX handlers
        add_action( 'wp_ajax_wcm_convert_to_onetime', array( $this, 'ajax_convert_to_onetime' ) );
        add_action( 'wp_ajax_wcm_cancel_subscription', array( $this, 'ajax_cancel_subscription' ) );
        add_action( 'wp_ajax_wcm_get_convert_details', array( $this, 'ajax_get_convert_details' ) );

        // Enqueue frontend scripts on My Account page
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
    }

    /**
     * Add "Convert to One-Time" button to subscription action buttons.
     */
    public function add_convert_button( $buttons, $id, $nonce, $status ) {
        if ( 'active' !== $status ) {
            return $buttons;
        }

        // Check if within 30-day window of next renewal
        $next_date = get_post_meta( $id, '_subscrpt_next_date', true );
        if ( ! $next_date ) {
            return $buttons;
        }

        $next_timestamp = is_numeric( $next_date ) ? (int) $next_date : strtotime( $next_date );
        $days_until     = ( $next_timestamp - time() ) / DAY_IN_SECONDS;

        if ( $days_until > 0 && $days_until <= 30 ) {
            $buttons['wcm-convert'] = array(
                'url'   => '#wcm-convert-modal',
                'label' => __( 'Switch to One-Time Purchase', 'woo-comprehensive-monitor' ),
                'class' => 'wcm-convert-btn button',
                'attrs' => 'data-sub-id="' . esc_attr( $id ) . '"',
            );
        }

        // Improve cancel button with confirmation
        if ( isset( $buttons['cancel'] ) || isset( $buttons['cancelled'] ) ) {
            $cancel_key = isset( $buttons['cancel'] ) ? 'cancel' : 'cancelled';
            $original_url = $buttons[ $cancel_key ]['url'] ?? '';
            $buttons[ $cancel_key ] = array(
                'url'   => '#wcm-cancel-modal',
                'label' => __( 'Cancel Subscription', 'woo-comprehensive-monitor' ),
                'class' => 'wcm-cancel-btn button',
                'attrs' => 'data-sub-id="' . esc_attr( $id ) . '" data-cancel-url="' . esc_attr( $original_url ) . '"',
            );
        }

        return $buttons;
    }

    /**
     * Enqueue scripts on My Account subscription pages.
     */
    public function enqueue_scripts() {
        if ( ! is_account_page() ) {
            return;
        }

        wp_enqueue_style( 'wcm-subscription-convert', WCM_PLUGIN_URL . 'assets/css/subscription-convert.css', array(), WCM_VERSION );
        wp_enqueue_script( 'wcm-subscription-convert', WCM_PLUGIN_URL . 'assets/js/subscription-convert.js', array( 'jquery' ), WCM_VERSION, true );
        wp_localize_script( 'wcm-subscription-convert', 'wcm_convert', array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce'    => wp_create_nonce( 'wcm_convert_nonce' ),
        ) );
    }

    /**
     * AJAX: Get conversion price details for the modal.
     */
    public function ajax_get_convert_details() {
        check_ajax_referer( 'wcm_convert_nonce', 'nonce' );

        $sub_id = intval( $_POST['subscription_id'] ?? 0 );
        if ( ! $sub_id ) {
            wp_send_json_error( array( 'message' => 'Invalid subscription ID' ) );
        }

        // Verify ownership
        $sub = get_post( $sub_id );
        if ( ! $sub || 'subscrpt_order' !== $sub->post_type ) {
            wp_send_json_error( array( 'message' => 'Subscription not found' ) );
        }

        $current_user = get_current_user_id();
        $order_id     = get_post_meta( $sub_id, '_subscrpt_order_id', true );
        $order        = wc_get_order( $order_id );
        if ( ! $order || ( $order->get_customer_id() !== $current_user && $sub->post_author !== $current_user ) ) {
            wp_send_json_error( array( 'message' => 'Unauthorized' ) );
        }

        $pricing = $this->calculate_price_difference( $sub_id );
        if ( is_wp_error( $pricing ) ) {
            wp_send_json_error( array( 'message' => $pricing->get_error_message() ) );
        }

        wp_send_json_success( $pricing );
    }

    /**
     * AJAX: Convert subscription to one-time purchase.
     */
    public function ajax_convert_to_onetime() {
        check_ajax_referer( 'wcm_convert_nonce', 'nonce' );

        $sub_id = intval( $_POST['subscription_id'] ?? 0 );
        if ( ! $sub_id ) {
            wp_send_json_error( array( 'message' => 'Invalid subscription ID' ) );
        }

        // Verify ownership
        $sub = get_post( $sub_id );
        if ( ! $sub || 'subscrpt_order' !== $sub->post_type || 'active' !== $sub->post_status ) {
            wp_send_json_error( array( 'message' => 'Subscription not found or not active' ) );
        }

        $current_user = get_current_user_id();
        $order_id     = get_post_meta( $sub_id, '_subscrpt_order_id', true );
        $order        = wc_get_order( $order_id );
        if ( ! $order || ( $order->get_customer_id() !== $current_user && $sub->post_author !== $current_user ) ) {
            wp_send_json_error( array( 'message' => 'Unauthorized' ) );
        }

        // Verify 30-day window
        $next_date      = get_post_meta( $sub_id, '_subscrpt_next_date', true );
        $next_timestamp = is_numeric( $next_date ) ? (int) $next_date : strtotime( $next_date );
        $days_until     = ( $next_timestamp - time() ) / DAY_IN_SECONDS;

        if ( $days_until <= 0 || $days_until > 30 ) {
            wp_send_json_error( array( 'message' => 'Conversion is only available within 30 days of your next renewal.' ) );
        }

        // Calculate price difference
        $pricing = $this->calculate_price_difference( $sub_id );
        if ( is_wp_error( $pricing ) ) {
            wp_send_json_error( array( 'message' => $pricing->get_error_message() ) );
        }

        $difference = $pricing['difference'];

        // Charge the difference if > 0
        if ( $difference > 0 ) {
            $charge_result = $this->charge_stripe_difference( $order, $difference, $sub_id );
            if ( is_wp_error( $charge_result ) ) {
                wp_send_json_error( array( 'message' => 'Payment failed: ' . $charge_result->get_error_message() ) );
            }
        }

        // Cancel the subscription
        if ( class_exists( 'SpringDevs\Subscription\Illuminate\Action' ) ) {
            \SpringDevs\Subscription\Illuminate\Action::status( 'cancelled', $sub_id );
        } else {
            wp_update_post( array( 'ID' => $sub_id, 'post_status' => 'cancelled' ) );
        }

        // Add order note
        $note = sprintf(
            __( 'Subscription #%d converted to one-time purchase. Subscription price: $%s, Regular price: $%s, Difference charged: $%s', 'woo-comprehensive-monitor' ),
            $sub_id,
            number_format( $pricing['subscription_price'], 2 ),
            number_format( $pricing['regular_price'], 2 ),
            number_format( $difference, 2 )
        );
        $order->add_order_note( $note );

        // Store conversion record on the subscription
        update_post_meta( $sub_id, '_wcm_converted_to_onetime', array(
            'timestamp'          => current_time( 'mysql' ),
            'subscription_price' => $pricing['subscription_price'],
            'regular_price'      => $pricing['regular_price'],
            'difference_charged' => $difference,
            'order_id'           => $order_id,
            'customer_ip'        => WCM_Helpers::get_customer_ip(),
        ) );

        // Send event to monitoring server
        $this->send_conversion_event( $order, $sub_id, $pricing, $difference );

        wp_send_json_success( array(
            'message'    => sprintf(
                __( 'Your subscription has been converted to a one-time purchase. %s', 'woo-comprehensive-monitor' ),
                $difference > 0 ? sprintf( 'A charge of $%s has been applied.', number_format( $difference, 2 ) ) : ''
            ),
            'difference' => $difference,
        ) );
    }

    /**
     * AJAX: Cancel subscription with confirmation (enhanced flow).
     */
    public function ajax_cancel_subscription() {
        check_ajax_referer( 'wcm_convert_nonce', 'nonce' );

        $sub_id = intval( $_POST['subscription_id'] ?? 0 );
        $reason = sanitize_text_field( $_POST['reason'] ?? '' );

        if ( ! $sub_id ) {
            wp_send_json_error( array( 'message' => 'Invalid subscription ID' ) );
        }

        $sub = get_post( $sub_id );
        if ( ! $sub || 'subscrpt_order' !== $sub->post_type || 'active' !== $sub->post_status ) {
            wp_send_json_error( array( 'message' => 'Subscription not found or not active' ) );
        }

        // Verify ownership
        $current_user = get_current_user_id();
        $order_id     = get_post_meta( $sub_id, '_subscrpt_order_id', true );
        $order        = wc_get_order( $order_id );
        if ( ! $order || ( $order->get_customer_id() !== $current_user && $sub->post_author !== $current_user ) ) {
            wp_send_json_error( array( 'message' => 'Unauthorized' ) );
        }

        // Cancel the subscription
        if ( class_exists( 'SpringDevs\Subscription\Illuminate\Action' ) ) {
            \SpringDevs\Subscription\Illuminate\Action::status( 'pe_cancelled', $sub_id );
        } else {
            wp_update_post( array( 'ID' => $sub_id, 'post_status' => 'cancelled' ) );
        }

        // Store cancellation reason
        update_post_meta( $sub_id, '_wcm_cancel_reason', $reason );
        update_post_meta( $sub_id, '_wcm_cancel_timestamp', current_time( 'mysql' ) );

        $order->add_order_note( sprintf(
            __( 'Subscription #%d cancelled by customer. Reason: %s', 'woo-comprehensive-monitor' ),
            $sub_id,
            $reason ?: 'No reason provided'
        ) );

        // Send event to monitoring server
        $this->send_cancel_event( $order, $sub_id, $reason );

        wp_send_json_success( array(
            'message' => __( 'Your subscription has been cancelled.', 'woo-comprehensive-monitor' ),
        ) );
    }

    // ================================================================
    // PRICING
    // ================================================================

    /**
     * Calculate the price difference between subscription rate and regular retail.
     */
    private function calculate_price_difference( $sub_id ) {
        $subscription_price = (float) get_post_meta( $sub_id, '_subscrpt_price', true );
        $product_id         = get_post_meta( $sub_id, '_subscrpt_product_id', true );
        $variation_id       = get_post_meta( $sub_id, '_subscrpt_variation_id', true );

        // Get the product
        $product = $variation_id ? wc_get_product( $variation_id ) : wc_get_product( $product_id );
        if ( ! $product ) {
            // Product deleted — use subscription price as-is, no difference
            return array(
                'subscription_price' => $subscription_price,
                'regular_price'      => $subscription_price,
                'difference'         => 0,
                'product_name'       => __( 'Product no longer available', 'woo-comprehensive-monitor' ),
            );
        }

        // Regular price = non-subscription, non-sale price
        $regular_price = (float) $product->get_regular_price();

        // If regular price is empty or 0, try parent product
        if ( $regular_price <= 0 && $variation_id && $product_id ) {
            $parent = wc_get_product( $product_id );
            if ( $parent ) {
                $regular_price = (float) $parent->get_regular_price();
            }
        }

        // If still no regular price, use subscription price (no charge)
        if ( $regular_price <= 0 ) {
            $regular_price = $subscription_price;
        }

        $difference = max( 0, $regular_price - $subscription_price );

        return array(
            'subscription_price' => $subscription_price,
            'regular_price'      => $regular_price,
            'difference'         => round( $difference, 2 ),
            'product_name'       => $product->get_name(),
            'currency'           => get_woocommerce_currency(),
            'currency_symbol'    => get_woocommerce_currency_symbol(),
        );
    }

    // ================================================================
    // STRIPE CHARGE
    // ================================================================

    /**
     * Charge the price difference to the customer's saved Stripe payment method.
     */
    private function charge_stripe_difference( $order, $amount, $sub_id ) {
        $stripe_settings = get_option( 'woocommerce_stripe_settings' );
        if ( ! $stripe_settings ) {
            return new WP_Error( 'no_stripe', 'Stripe is not configured' );
        }

        $test_mode = 'yes' === ( $stripe_settings['testmode'] ?? 'no' );
        $secret_key = $test_mode
            ? ( $stripe_settings['test_secret_key'] ?? '' )
            : ( $stripe_settings['secret_key'] ?? '' );

        if ( empty( $secret_key ) ) {
            return new WP_Error( 'no_key', 'Stripe API key not set' );
        }

        // Get Stripe customer ID from the order
        $stripe_customer_id = $order->get_meta( '_stripe_customer_id' );
        if ( empty( $stripe_customer_id ) ) {
            // Try to find it from user meta
            $user_id = $order->get_customer_id();
            if ( $user_id ) {
                $stripe_customer_id = get_user_meta( $user_id, '_stripe_customer_id', true );
            }
        }

        if ( empty( $stripe_customer_id ) ) {
            return new WP_Error( 'no_customer', 'No saved payment method found. Please update your payment method and try again.' );
        }

        // Get default payment method
        $response = wp_remote_get( 'https://api.stripe.com/v1/customers/' . $stripe_customer_id, array(
            'headers' => array( 'Authorization' => 'Bearer ' . $secret_key ),
            'timeout' => 10,
        ) );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $customer = json_decode( wp_remote_retrieve_body( $response ) );
        $payment_method = $customer->invoice_settings->default_payment_method ?? $customer->default_source ?? null;

        if ( ! $payment_method ) {
            return new WP_Error( 'no_payment_method', 'No saved payment method found on your account.' );
        }

        // Create a PaymentIntent for the difference
        $charge_response = wp_remote_post( 'https://api.stripe.com/v1/payment_intents', array(
            'headers' => array( 'Authorization' => 'Bearer ' . $secret_key ),
            'body'    => array(
                'amount'               => round( $amount * 100 ), // Stripe uses cents
                'currency'             => strtolower( $order->get_currency() ),
                'customer'             => $stripe_customer_id,
                'payment_method'       => $payment_method,
                'off_session'          => 'true',
                'confirm'              => 'true',
                'description'          => sprintf( 'Subscription #%d conversion to one-time — price difference', $sub_id ),
                'metadata[order_id]'   => $order->get_id(),
                'metadata[sub_id]'     => $sub_id,
                'metadata[type]'       => 'subscription_conversion_difference',
            ),
            'timeout' => 15,
        ) );

        if ( is_wp_error( $charge_response ) ) {
            return $charge_response;
        }

        $result = json_decode( wp_remote_retrieve_body( $charge_response ) );

        if ( isset( $result->error ) ) {
            return new WP_Error( 'stripe_error', $result->error->message ?? 'Payment failed' );
        }

        if ( 'succeeded' !== ( $result->status ?? '' ) ) {
            return new WP_Error( 'payment_incomplete', 'Payment requires additional authentication. Please contact support.' );
        }

        return $result;
    }

    // ================================================================
    // MONITORING EVENTS
    // ================================================================

    private function send_conversion_event( $order, $sub_id, $pricing, $difference ) {
        if ( ! class_exists( 'WCM_Helpers' ) ) return;

        WCM_Helpers::send_event_to_server( array(
            'type'               => 'subscription_converted',
            'site'               => home_url(),
            'store_url'          => home_url(),
            'store_name'         => get_bloginfo( 'name' ),
            'store_id'           => get_option( 'wcm_store_id', '' ),
            'subscription_id'    => $sub_id,
            'order_id'           => $order->get_id(),
            'customer_name'      => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
            'customer_email'     => $order->get_billing_email(),
            'subscription_price' => $pricing['subscription_price'],
            'regular_price'      => $pricing['regular_price'],
            'difference_charged' => $difference,
            'product_name'       => $pricing['product_name'],
            'timestamp'          => current_time( 'mysql' ),
        ) );
    }

    private function send_cancel_event( $order, $sub_id, $reason ) {
        if ( ! class_exists( 'WCM_Helpers' ) ) return;

        WCM_Helpers::send_event_to_server( array(
            'type'            => 'subscription_cancelled',
            'site'            => home_url(),
            'store_url'       => home_url(),
            'store_name'      => get_bloginfo( 'name' ),
            'store_id'        => get_option( 'wcm_store_id', '' ),
            'subscription_id' => $sub_id,
            'order_id'        => $order->get_id(),
            'customer_name'   => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
            'customer_email'  => $order->get_billing_email(),
            'cancel_reason'   => $reason,
            'cancelled_by'    => 'customer',
            'timestamp'       => current_time( 'mysql' ),
        ) );
    }
}
