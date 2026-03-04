<?php
/**
 * Subscription Price Protection — prevents customers from subscribing
 * just to get a discount, then switching to one-time purchase.
 *
 * When a customer cancels or converts their subscription, this module
 * finds the correct one-time product/variation price and charges
 * the difference between what they paid and the one-time price.
 *
 * Replaces: class-wcm-refund-recovery.php + class-wcm-price-diff-charger.php
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Subscription_Protector {

    private static $instance = null;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->init_hooks();
    }

    private function init_hooks() {
        // ── Cancellation triggers ──
        // WooCommerce Subscriptions
        if ( class_exists( 'WC_Subscriptions' ) || function_exists( 'wcs_get_subscription' ) ) {
            add_action( 'woocommerce_subscription_status_updated', array( $this, 'on_wcs_cancel' ), 10, 3 );
        }
        // WPSubscription
        add_action( 'wpsubscription_subscription_status_changed', array( $this, 'on_wps_cancel' ), 10, 3 );

        // ── Admin: subscription edit meta-box ──
        add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_js' ) );
        add_action( 'wp_ajax_wcm_sp_charge', array( $this, 'ajax_admin_charge' ) );

        // ── Admin: subscription list column (WCS) ──
        add_filter( 'manage_edit-shop_subscription_columns', array( $this, 'add_list_column' ), 20 );
        add_action( 'manage_shop_subscription_posts_custom_column', array( $this, 'render_list_column' ), 10, 2 );
        add_filter( 'manage_woocommerce_page_wc-orders--shop_subscription_columns', array( $this, 'add_list_column' ), 20 );
        add_action( 'manage_woocommerce_page_wc-orders--shop_subscription_custom_column', array( $this, 'render_list_column' ), 10, 2 );

        // ── Admin: product meta field (one-time price override) ──
        add_action( 'woocommerce_product_options_pricing', array( $this, 'add_product_field' ) );
        add_action( 'woocommerce_process_product_meta', array( $this, 'save_product_field' ) );
        add_action( 'woocommerce_variation_options_pricing', array( $this, 'add_variation_field' ), 10, 3 );
        add_action( 'woocommerce_save_product_variation', array( $this, 'save_variation_field' ), 10, 2 );

        // ── Frontend: customer self-service conversion ──
        if ( 'yes' === get_option( 'wcm_sp_customer_conversion', 'yes' ) ) {
            add_action( 'woocommerce_subscription_details_after_subscription_table', array( $this, 'render_conversion_ui' ) );
            add_action( 'wp_ajax_wcm_sp_customer_convert', array( $this, 'ajax_customer_convert' ) );
            add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_js' ) );
        }

        // ── Frontend: cancel warning + My Account page ──
        add_action( 'init', array( $this, 'add_endpoints' ) );
        add_filter( 'woocommerce_account_menu_items', array( $this, 'add_menu_item' ) );
        add_action( 'woocommerce_account_price-adjustments_endpoint', array( $this, 'render_my_account_page' ) );
        add_action( 'wp_footer', array( $this, 'cancel_warning_js' ) );
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_css' ) );
    }

    // ================================================================
    // PRICE RESOLUTION — find the correct one-time price
    // ================================================================

    /**
     * Find what the one-time price should be for a subscription product.
     *
     * Priority:
     * 1. Custom meta _wcm_onetime_price (admin override on product)
     * 2. Sibling non-subscription variation of the same parent
     * 3. Product regular_price
     * 4. Product price
     */
    public function get_onetime_price( $product ) {
        if ( ! $product instanceof WC_Product ) {
            $product = wc_get_product( $product );
        }
        if ( ! $product ) {
            return 0;
        }

        // 1. Explicit admin override
        $override = $product->get_meta( '_wcm_onetime_price' );
        if ( '' !== $override && false !== $override ) {
            return (float) $override;
        }

        // 2. Check parent for override
        $parent_id = $product->get_parent_id();
        if ( $parent_id ) {
            $parent = wc_get_product( $parent_id );
            if ( $parent ) {
                $parent_override = $parent->get_meta( '_wcm_onetime_price' );
                if ( '' !== $parent_override && false !== $parent_override ) {
                    return (float) $parent_override;
                }
            }
        }

        // 3. Find sibling non-subscription variation
        if ( $parent_id && $product->is_type( 'subscription_variation' ) ) {
            $sibling_price = $this->find_sibling_onetime_price( $product );
            if ( $sibling_price > 0 ) {
                return $sibling_price;
            }
        }

        // 4. Regular price (often the "full" price before subscription discount)
        $regular = (float) $product->get_regular_price();
        if ( $regular > 0 ) {
            return $regular;
        }

        // 5. Current price as last resort
        return (float) $product->get_price();
    }

    /**
     * Look at sibling variations of the same parent to find a non-subscription
     * variation and use its price. This handles the case where:
     * - Variation A: "Subscribe & Save" $8/mo (subscription_variation)
     * - Variation B: "One-Time Purchase" $12 (product_variation)
     */
    private function find_sibling_onetime_price( $subscription_variation ) {
        $parent = wc_get_product( $subscription_variation->get_parent_id() );
        if ( ! $parent || ! $parent->is_type( 'variable' ) ) {
            return 0;
        }

        $children = $parent->get_children();
        foreach ( $children as $child_id ) {
            if ( $child_id === $subscription_variation->get_id() ) {
                continue;
            }
            $sibling = wc_get_product( $child_id );
            if ( ! $sibling ) {
                continue;
            }
            // If this sibling is NOT a subscription variation, it's the one-time version
            if ( ! $sibling->is_type( 'subscription_variation' ) ) {
                $price = (float) $sibling->get_price();
                if ( $price > 0 ) {
                    return $price;
                }
            }
        }

        return 0;
    }

    // ================================================================
    // CALCULATOR — compute the difference
    // ================================================================

    /**
     * Calculate the price difference for a subscription.
     *
     * @param  WC_Subscription|int $subscription  WCS subscription object or WPS subscription ID
     * @return array|false  { difference, onetime_total, subscription_total, items[] }
     */
    public function calculate_difference( $subscription ) {
        $items           = array();
        $total_onetime   = 0;
        $total_sub_price = 0;

        // WooCommerce Subscriptions
        if ( is_a( $subscription, 'WC_Subscription' ) || ( is_numeric( $subscription ) && function_exists( 'wcs_get_subscription' ) ) ) {
            if ( is_numeric( $subscription ) ) {
                $subscription = wcs_get_subscription( $subscription );
            }
            if ( ! $subscription ) {
                return false;
            }

            foreach ( $subscription->get_items() as $item_id => $item ) {
                $product = $item->get_product();
                if ( ! $product ) {
                    continue;
                }

                $qty           = $item->get_quantity();
                $sub_unit_price = (float) $item->get_subtotal() / max( $qty, 1 );
                $onetime_price  = $this->get_onetime_price( $product );
                $diff           = ( $onetime_price - $sub_unit_price ) * $qty;

                if ( $diff > 0 ) {
                    $items[] = array(
                        'product_id'   => $product->get_id(),
                        'product_name' => $product->get_name(),
                        'qty'          => $qty,
                        'sub_price'    => round( $sub_unit_price, 2 ),
                        'onetime_price'=> round( $onetime_price, 2 ),
                        'difference'   => round( $diff, 2 ),
                    );
                    $total_onetime   += $onetime_price * $qty;
                    $total_sub_price += $sub_unit_price * $qty;
                }
            }
        }
        // WPSubscription
        elseif ( is_numeric( $subscription ) ) {
            $result = $this->calculate_wps_difference( (int) $subscription );
            if ( $result ) {
                return $result;
            }
            return false;
        }

        $total_diff = round( $total_onetime - $total_sub_price, 2 );
        if ( $total_diff <= 0 || empty( $items ) ) {
            return false;
        }

        return array(
            'difference'         => $total_diff,
            'onetime_total'      => round( $total_onetime, 2 ),
            'subscription_total' => round( $total_sub_price, 2 ),
            'items'              => $items,
        );
    }

    /**
     * Calculate difference for WPSubscription (custom table).
     */
    private function calculate_wps_difference( $subscription_id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wps_subscriptions';
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return false;
        }

        $sub = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $subscription_id ) );
        if ( ! $sub || empty( $sub->order_id ) ) {
            return false;
        }

        $order = wc_get_order( $sub->order_id );
        if ( ! $order ) {
            return false;
        }

        $items           = array();
        $total_onetime   = 0;
        $total_sub_price = 0;

        foreach ( $order->get_items() as $item ) {
            $product = $item->get_product();
            if ( ! $product ) {
                continue;
            }

            $qty            = $item->get_quantity();
            $sub_unit_price = (float) $item->get_subtotal() / max( $qty, 1 );
            $onetime_price  = $this->get_onetime_price( $product );
            $diff           = ( $onetime_price - $sub_unit_price ) * $qty;

            if ( $diff > 0 ) {
                $items[] = array(
                    'product_id'   => $product->get_id(),
                    'product_name' => $product->get_name(),
                    'qty'          => $qty,
                    'sub_price'    => round( $sub_unit_price, 2 ),
                    'onetime_price'=> round( $onetime_price, 2 ),
                    'difference'   => round( $diff, 2 ),
                );
                $total_onetime   += $onetime_price * $qty;
                $total_sub_price += $sub_unit_price * $qty;
            }
        }

        $total_diff = round( $total_onetime - $total_sub_price, 2 );
        if ( $total_diff <= 0 || empty( $items ) ) {
            return false;
        }

        return array(
            'difference'         => $total_diff,
            'onetime_total'      => round( $total_onetime, 2 ),
            'subscription_total' => round( $total_sub_price, 2 ),
            'items'              => $items,
        );
    }

    // ================================================================
    // CHARGE ENGINE — one path for all triggers
    // ================================================================

    /**
     * Charge the price difference.
     *
     * @param  WC_Subscription|int $subscription  WCS object or WPS subscription ID
     * @param  string              $trigger       'cancel_auto', 'convert_customer', 'admin_manual'
     * @return array|false         { order_id, amount, status, pay_url }
     */
    public function charge( $subscription, $trigger = 'admin_manual' ) {
        // Resolve subscription
        $sub_id      = 0;
        $customer_id = 0;
        $is_wcs      = false;

        if ( is_a( $subscription, 'WC_Subscription' ) ) {
            $sub_id      = $subscription->get_id();
            $customer_id = $subscription->get_customer_id();
            $is_wcs      = true;
        } elseif ( is_numeric( $subscription ) && function_exists( 'wcs_get_subscription' ) ) {
            $wcs_sub = wcs_get_subscription( $subscription );
            if ( $wcs_sub ) {
                $subscription = $wcs_sub;
                $sub_id       = $wcs_sub->get_id();
                $customer_id  = $wcs_sub->get_customer_id();
                $is_wcs       = true;
            } else {
                $sub_id      = (int) $subscription;
                $customer_id = $this->get_wps_customer_id( $sub_id );
            }
        } else {
            $sub_id      = (int) $subscription;
            $customer_id = $this->get_wps_customer_id( $sub_id );
        }

        if ( ! $sub_id || ! $customer_id ) {
            return false;
        }

        // Deduplication — don't charge twice
        $charged_key = '_wcm_difference_charged';
        if ( $is_wcs && 'yes' === $subscription->get_meta( $charged_key ) ) {
            return false;
        }
        if ( get_transient( 'wcm_sp_lock_' . $sub_id ) ) {
            return false;
        }
        set_transient( 'wcm_sp_lock_' . $sub_id, true, 300 ); // 5 min lock

        // Calculate
        $calc = $this->calculate_difference( $is_wcs ? $subscription : $sub_id );
        if ( ! $calc || $calc['difference'] <= 0 ) {
            delete_transient( 'wcm_sp_lock_' . $sub_id );
            return false;
        }

        // Create order
        $order = $this->create_order( $subscription, $sub_id, $customer_id, $calc, $is_wcs );
        if ( is_wp_error( $order ) ) {
            delete_transient( 'wcm_sp_lock_' . $sub_id );
            return false;
        }

        // Process payment
        $paid = false;
        $method = get_option( 'wcm_sp_charge_method', 'automatic' );

        if ( 'automatic' === $method ) {
            if ( $is_wcs ) {
                $paid = $this->pay_via_wcs_hook( $order, $subscription, $calc['difference'] );
            }
            if ( ! $paid ) {
                $paid = $this->pay_via_stripe_api( $order, $subscription, $sub_id, $is_wcs );
            }
        }

        $status = $paid ? 'charged' : 'pending';

        // Mark as charged
        if ( $is_wcs ) {
            $subscription->update_meta_data( $charged_key, 'yes' );
            $subscription->update_meta_data( '_wcm_difference_order_id', $order->get_id() );
            $subscription->save();
        }

        // Log
        $this->log( $sub_id, $customer_id, $order->get_id(), $calc, $status, $trigger );

        // Notify
        $this->notify( $sub_id, $customer_id, $calc, $status, $trigger );

        delete_transient( 'wcm_sp_lock_' . $sub_id );

        return array(
            'order_id' => $order->get_id(),
            'amount'   => $calc['difference'],
            'status'   => $status,
            'pay_url'  => $paid ? '' : $order->get_checkout_payment_url(),
        );
    }

    private function create_order( $subscription, $sub_id, $customer_id, $calc, $is_wcs ) {
        try {
            $order = wc_create_order( array(
                'customer_id' => $customer_id,
                'status'      => 'pending',
            ) );

            // Copy billing/payment from subscription
            if ( $is_wcs && is_a( $subscription, 'WC_Subscription' ) ) {
                $order->set_address( $subscription->get_address( 'billing' ), 'billing' );
                $order->set_address( $subscription->get_address( 'shipping' ), 'shipping' );
                $order->set_payment_method( $subscription->get_payment_method() );
                $order->set_payment_method_title( $subscription->get_payment_method_title() );
            } else {
                $this->copy_billing_from_wps( $order, $sub_id );
            }

            // Add fee for the difference
            $fee = new WC_Order_Item_Fee();
            $fee->set_name( sprintf(
                __( 'Price adjustment — Subscription #%d converted to one-time purchase', 'woo-comprehensive-monitor' ),
                $sub_id
            ) );
            $fee->set_amount( $calc['difference'] );
            $fee->set_total( $calc['difference'] );
            $fee->set_tax_status( 'none' );
            $order->add_item( $fee );

            $order->calculate_totals();

            // Meta
            $order->update_meta_data( '_wcm_price_adjustment', 'yes' );
            $order->update_meta_data( '_wcm_source_subscription', $sub_id );
            $order->update_meta_data( '_wcm_adjustment_amount', $calc['difference'] );
            $order->update_meta_data( '_wcm_onetime_total', $calc['onetime_total'] );
            $order->update_meta_data( '_wcm_subscription_total', $calc['subscription_total'] );

            // Order note with breakdown
            $lines = array();
            foreach ( $calc['items'] as $item ) {
                $lines[] = sprintf(
                    '%s (×%d): subscription %s → one-time %s = %s',
                    $item['product_name'], $item['qty'],
                    wc_price( $item['sub_price'] ),
                    wc_price( $item['onetime_price'] ),
                    wc_price( $item['difference'] )
                );
            }
            $order->add_order_note(
                __( 'Subscription price adjustment — customer converting to one-time purchase.', 'woo-comprehensive-monitor' )
                . "\n\n" . implode( "\n", $lines )
                . "\n\n" . sprintf( __( 'Total adjustment: %s', 'woo-comprehensive-monitor' ), wc_price( $calc['difference'] ) )
            );

            $order->save();
            return $order;
        } catch ( Exception $e ) {
            return new WP_Error( 'order_failed', $e->getMessage() );
        }
    }

    // ================================================================
    // PAYMENT — try WCS hook first, then Stripe API, then leave pending
    // ================================================================

    /**
     * Pay via WCS renewal hook — works with any gateway (Stripe, PayPal, Square, etc.)
     */
    private function pay_via_wcs_hook( $order, $subscription, $amount ) {
        $gateway = $subscription->get_payment_method();
        if ( empty( $gateway ) ) {
            return false;
        }

        // Copy payment meta from subscription to order
        $meta_keys = apply_filters( 'wcm_sp_payment_meta_keys', array(
            '_stripe_customer_id', '_stripe_source_id', '_stripe_payment_method',
            '_ppec_billing_agreement_id', '_ppcp_billing_agreement_id',
            '_square_customer_id', '_square_card_id',
            '_wc_authorize_net_cim_credit_card_customer_id',
            '_wc_authorize_net_cim_credit_card_payment_id',
        ) );

        foreach ( $meta_keys as $key ) {
            $val = $subscription->get_meta( $key );
            if ( ! empty( $val ) ) {
                $order->update_meta_data( $key, $val );
            }
        }

        // Copy payment tokens
        $tokens = $subscription->get_payment_tokens();
        if ( ! empty( $tokens ) ) {
            foreach ( $tokens as $token_id ) {
                $token = WC_Payment_Tokens::get( $token_id );
                if ( $token ) {
                    $order->add_payment_token( $token );
                }
            }
        }
        $order->save();

        try {
            do_action( 'woocommerce_scheduled_subscription_payment_' . $gateway, $amount, $order );

            $order = wc_get_order( $order->get_id() );
            if ( $order && $order->is_paid() ) {
                return true;
            }
        } catch ( Exception $e ) {
            $order->add_order_note( sprintf( __( 'WCS payment hook failed: %s', 'woo-comprehensive-monitor' ), $e->getMessage() ) );
        }

        return false;
    }

    /**
     * Pay via direct Stripe API — fallback for WPSubscription or when WCS hook fails.
     */
    private function pay_via_stripe_api( $order, $subscription, $sub_id, $is_wcs ) {
        if ( ! class_exists( 'WC_Stripe_API' ) || ! class_exists( 'WC_Stripe_Helper' ) ) {
            $order->add_order_note( __( 'Auto-charge skipped: Stripe gateway not active.', 'woo-comprehensive-monitor' ) );
            return false;
        }

        // Find Stripe customer ID and payment method
        $stripe_customer = '';
        $stripe_pm       = '';

        if ( $is_wcs && is_a( $subscription, 'WC_Subscription' ) ) {
            $stripe_customer = $subscription->get_meta( '_stripe_customer_id' );
            $stripe_pm       = $subscription->get_meta( '_stripe_source_id' ) ?: $subscription->get_meta( '_stripe_payment_method' );
        } else {
            // WPSubscription — look at previous orders
            $source = $this->get_wps_source_order( $sub_id );
            if ( $source ) {
                $stripe_customer = $source->get_meta( '_stripe_customer_id' );
                $stripe_pm       = $source->get_meta( '_stripe_source_id' ) ?: $source->get_meta( '_stripe_payment_method' );
            }
        }

        if ( empty( $stripe_customer ) || empty( $stripe_pm ) ) {
            $order->add_order_note( __( 'Auto-charge skipped: no saved Stripe payment method.', 'woo-comprehensive-monitor' ) );
            return false;
        }

        $amount   = $order->get_total();
        $currency = strtolower( $order->get_currency() );

        $response = WC_Stripe_API::request( array(
            'amount'         => WC_Stripe_Helper::get_stripe_amount( $amount, $currency ),
            'currency'       => $currency,
            'customer'       => $stripe_customer,
            'payment_method' => $stripe_pm,
            'confirm'        => 'true',
            'off_session'    => 'true',
            'description'    => sprintf( '%s — Price Adjustment #%s', wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $order->get_order_number() ),
            'metadata'       => array( 'order_id' => $order->get_id(), 'subscription_id' => $sub_id ),
        ), 'payment_intents' );

        if ( is_wp_error( $response ) || ! empty( $response->error ) ) {
            $err = is_wp_error( $response ) ? $response->get_error_message() : ( $response->error->message ?? 'Unknown' );
            $order->add_order_note( sprintf( __( 'Stripe auto-charge failed: %s', 'woo-comprehensive-monitor' ), $err ) );
            return false;
        }

        if ( isset( $response->status ) && 'succeeded' === $response->status ) {
            $order->set_transaction_id( $response->id );
            $order->payment_complete( $response->id );
            $order->add_order_note( sprintf( __( 'Price adjustment charged. PaymentIntent: %s', 'woo-comprehensive-monitor' ), $response->id ) );
            return true;
        }

        return false;
    }

    // ================================================================
    // CANCELLATION TRIGGERS
    // ================================================================

    /**
     * WooCommerce Subscriptions cancellation.
     */
    public function on_wcs_cancel( $subscription, $new_status, $old_status ) {
        if ( 'yes' !== get_option( 'wcm_sp_auto_charge_on_cancel', 'yes' ) ) {
            return;
        }
        if ( 'cancelled' !== $new_status && 'pending-cancel' !== $new_status ) {
            return;
        }
        $this->charge( $subscription, 'cancel_auto' );
    }

    /**
     * WPSubscription cancellation.
     */
    public function on_wps_cancel( $subscription_id, $old_status, $new_status ) {
        if ( 'yes' !== get_option( 'wcm_sp_auto_charge_on_cancel', 'yes' ) ) {
            return;
        }
        if ( ! in_array( $new_status, array( 'cancelled', 'wps-cancelled', 'pending-cancel' ), true ) ) {
            return;
        }
        $this->charge( $subscription_id, 'cancel_auto' );
    }

    // ================================================================
    // WPS HELPERS
    // ================================================================

    private function get_wps_customer_id( $subscription_id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wps_subscriptions';
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return 0;
        }
        return (int) $wpdb->get_var( $wpdb->prepare( "SELECT customer_id FROM {$table} WHERE id = %d", $subscription_id ) );
    }

    private function get_wps_source_order( $subscription_id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wps_subscriptions';
        $order_id = $wpdb->get_var( $wpdb->prepare( "SELECT order_id FROM {$table} WHERE id = %d", $subscription_id ) );
        return $order_id ? wc_get_order( $order_id ) : null;
    }

    private function copy_billing_from_wps( $order, $subscription_id ) {
        $source = $this->get_wps_source_order( $subscription_id );
        if ( ! $source ) {
            return;
        }
        $order->set_billing_first_name( $source->get_billing_first_name() );
        $order->set_billing_last_name( $source->get_billing_last_name() );
        $order->set_billing_email( $source->get_billing_email() );
        $order->set_billing_phone( $source->get_billing_phone() );
        $order->set_billing_address_1( $source->get_billing_address_1() );
        $order->set_billing_city( $source->get_billing_city() );
        $order->set_billing_state( $source->get_billing_state() );
        $order->set_billing_postcode( $source->get_billing_postcode() );
        $order->set_billing_country( $source->get_billing_country() );
        $order->set_payment_method( $source->get_payment_method() );
        $order->set_payment_method_title( $source->get_payment_method_title() );
    }

    // ================================================================
    // LOGGING
    // ================================================================

    private function log( $sub_id, $customer_id, $order_id, $calc, $status, $trigger ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_recovery_log';

        $wpdb->insert( $table, array(
            'subscription_id'    => $sub_id,
            'recovery_order_id'  => $order_id,
            'customer_id'        => $customer_id,
            'discount_amount'    => $calc['difference'],
            'regular_total'      => $calc['onetime_total'],
            'subscription_total' => $calc['subscription_total'],
            'charge_status'      => $status,
            'charge_type'        => $trigger,
            'charge_date'        => 'charged' === $status ? current_time( 'mysql' ) : null,
            'notes'              => $this->trigger_label( $trigger ),
            'created_at'         => current_time( 'mysql' ),
        ) );
    }

    private function trigger_label( $trigger ) {
        $labels = array(
            'cancel_auto'      => 'Auto-charged on cancellation',
            'convert_customer' => 'Customer converted to one-time',
            'admin_manual'     => 'Admin manual charge',
        );
        return $labels[ $trigger ] ?? $trigger;
    }

    // ================================================================
    // NOTIFICATIONS
    // ================================================================

    private function notify( $sub_id, $customer_id, $calc, $status, $trigger ) {
        $user = get_userdata( $customer_id );
        if ( ! $user ) {
            return;
        }

        $store_name = get_bloginfo( 'name' );

        // Customer email
        if ( 'yes' === get_option( 'wcm_sp_notify_customer', 'yes' ) ) {
            $subject = sprintf( '[%s] Subscription Price Adjustment', $store_name );

            $lines = array();
            foreach ( $calc['items'] as $item ) {
                $lines[] = sprintf( '  %s: %s (subscription) → %s (one-time)', $item['product_name'], wc_price( $item['sub_price'] ), wc_price( $item['onetime_price'] ) );
            }

            $message = sprintf(
                "Hello %s,\n\nYour subscription #%d has been converted to a one-time purchase.\n\nPrice breakdown:\n%s\n\nAdjustment amount: %s\nStatus: %s\n\nIf you have questions, please contact us.\n\n%s",
                $user->display_name,
                $sub_id,
                implode( "\n", $lines ),
                wp_strip_all_tags( wc_price( $calc['difference'] ) ),
                ucfirst( $status ),
                $store_name
            );
            wp_mail( $user->user_email, $subject, $message );
        }

        // Admin email
        if ( 'yes' === get_option( 'wcm_sp_notify_admin', 'yes' ) ) {
            $admin_email = get_option( 'wcm_alert_email', get_bloginfo( 'admin_email' ) );
            $subject     = sprintf( '[%s] Price Adjustment — Subscription #%d (%s)', $store_name, $sub_id, $this->trigger_label( $trigger ) );
            $message     = sprintf(
                "Subscription: #%d\nCustomer: %s (%s)\nOne-time total: %s\nSubscription total: %s\nAdjustment: %s\nStatus: %s\nTrigger: %s",
                $sub_id,
                $user->display_name,
                $user->user_email,
                wp_strip_all_tags( wc_price( $calc['onetime_total'] ) ),
                wp_strip_all_tags( wc_price( $calc['subscription_total'] ) ),
                wp_strip_all_tags( wc_price( $calc['difference'] ) ),
                $status,
                $this->trigger_label( $trigger )
            );
            wp_mail( $admin_email, $subject, $message );
        }

        // Monitoring server
        $server = get_option( 'wcm_monitoring_server', '' );
        if ( ! empty( $server ) ) {
            wp_remote_post( $server, array(
                'method'   => 'POST',
                'timeout'  => 5,
                'blocking' => false,
                'headers'  => array( 'Content-Type' => 'application/json' ),
                'body'     => wp_json_encode( array(
                    'type'            => 'subscription_price_adjustment',
                    'store_url'       => home_url(),
                    'store_name'      => $store_name,
                    'subscription_id' => $sub_id,
                    'amount'          => $calc['difference'],
                    'status'          => $status,
                    'trigger'         => $trigger,
                    'timestamp'       => current_time( 'mysql' ),
                ) ),
            ) );
        }
    }

    // ================================================================
    // ADMIN: META-BOX ON SUBSCRIPTION EDIT
    // ================================================================

    public function add_meta_box() {
        $screens = array( 'shop_subscription' );
        if ( function_exists( 'wc_get_page_screen_id' ) ) {
            $screens[] = wc_get_page_screen_id( 'shop_subscription' );
        }
        foreach ( $screens as $screen ) {
            add_meta_box(
                'wcm-price-protection',
                __( 'Price Protection', 'woo-comprehensive-monitor' ),
                array( $this, 'render_meta_box' ),
                $screen, 'side', 'default'
            );
        }
    }

    public function render_meta_box( $post_or_order ) {
        $sub_id = is_a( $post_or_order, 'WC_Subscription' )
            ? $post_or_order->get_id()
            : ( is_a( $post_or_order, 'WP_Post' ) ? $post_or_order->ID : 0 );

        if ( ! function_exists( 'wcs_get_subscription' ) ) {
            return;
        }

        $subscription = wcs_get_subscription( $sub_id );
        if ( ! $subscription ) {
            echo '<p>' . esc_html__( 'Unable to load subscription.', 'woo-comprehensive-monitor' ) . '</p>';
            return;
        }

        $already = 'yes' === $subscription->get_meta( '_wcm_difference_charged' );
        $calc    = $this->calculate_difference( $subscription );

        wp_nonce_field( 'wcm_sp_nonce', 'wcm_sp_nonce_field' );

        if ( $already ) {
            $diff_order_id = $subscription->get_meta( '_wcm_difference_order_id' );
            echo '<p style="color:#4CAF50;font-weight:bold;">✓ ' . esc_html__( 'Already charged.', 'woo-comprehensive-monitor' ) . '</p>';
            if ( $diff_order_id ) {
                $diff_order = wc_get_order( $diff_order_id );
                if ( $diff_order ) {
                    printf( '<p><a href="%s">' . esc_html__( 'View order #%d', 'woo-comprehensive-monitor' ) . '</a></p>',
                        esc_url( $diff_order->get_edit_order_url() ), $diff_order_id );
                }
            }
        } elseif ( ! $calc ) {
            echo '<p>' . esc_html__( 'No price difference found.', 'woo-comprehensive-monitor' ) . '</p>';
        } else {
            ?>
            <table style="width:100%;margin-bottom:10px;font-size:13px;">
                <?php foreach ( $calc['items'] as $item ) : ?>
                <tr>
                    <td><?php echo esc_html( $item['product_name'] ); ?><?php if ( $item['qty'] > 1 ) echo ' ×' . (int) $item['qty']; ?></td>
                    <td style="text-align:right;"><?php echo wc_price( $item['sub_price'] ); ?> → <?php echo wc_price( $item['onetime_price'] ); ?></td>
                </tr>
                <?php endforeach; ?>
                <tr style="border-top:1px solid #ddd;font-weight:bold;">
                    <td><?php esc_html_e( 'Difference:', 'woo-comprehensive-monitor' ); ?></td>
                    <td style="text-align:right;color:#d63638;"><?php echo wc_price( $calc['difference'] ); ?></td>
                </tr>
            </table>
            <button type="button" id="wcm-sp-charge-btn" class="button button-primary"
                    data-sub-id="<?php echo esc_attr( $sub_id ); ?>"
                    style="width:100%;">
                <?php printf( esc_html__( 'Charge %s', 'woo-comprehensive-monitor' ), wp_strip_all_tags( wc_price( $calc['difference'] ) ) ); ?>
            </button>
            <div id="wcm-sp-result" style="margin-top:8px;display:none;"></div>
            <?php
        }
    }

    // ================================================================
    // ADMIN: SUBSCRIPTION LIST COLUMN
    // ================================================================

    public function add_list_column( $columns ) {
        $columns['wcm_sp_diff'] = __( 'Price Diff', 'woo-comprehensive-monitor' );
        return $columns;
    }

    public function render_list_column( $column, $post_id ) {
        if ( 'wcm_sp_diff' !== $column || ! function_exists( 'wcs_get_subscription' ) ) {
            return;
        }
        $sub = wcs_get_subscription( $post_id );
        if ( ! $sub ) {
            echo '—';
            return;
        }
        if ( 'yes' === $sub->get_meta( '_wcm_difference_charged' ) ) {
            echo '<span style="color:#4CAF50;font-weight:bold;">✓ Charged</span>';
        } else {
            $calc = $this->calculate_difference( $sub );
            echo $calc
                ? '<span style="color:#FF9800;font-weight:bold;">' . wc_price( $calc['difference'] ) . '</span>'
                : '—';
        }
    }

    // ================================================================
    // ADMIN: PRODUCT META FIELD — one-time price override
    // ================================================================

    public function add_product_field() {
        woocommerce_wp_text_input( array(
            'id'          => '_wcm_onetime_price',
            'label'       => __( 'One-Time Price (for price protection)', 'woo-comprehensive-monitor' ),
            'type'        => 'text',
            'data_type'   => 'price',
            'desc_tip'    => true,
            'description' => __( 'If this is a subscription product, enter the equivalent one-time purchase price. Used to calculate the difference when a customer converts. Leave blank to auto-detect from variations or regular price.', 'woo-comprehensive-monitor' ),
        ) );
    }

    public function save_product_field( $post_id ) {
        if ( isset( $_POST['_wcm_onetime_price'] ) ) {
            $product = wc_get_product( $post_id );
            if ( $product ) {
                $val = '' === $_POST['_wcm_onetime_price'] ? '' : wc_format_decimal( sanitize_text_field( $_POST['_wcm_onetime_price'] ) );
                $product->update_meta_data( '_wcm_onetime_price', $val );
                $product->save();
            }
        }
    }

    public function add_variation_field( $loop, $variation_data, $variation ) {
        woocommerce_wp_text_input( array(
            'id'          => "_wcm_onetime_price_{$loop}",
            'name'        => "_wcm_onetime_price[{$loop}]",
            'label'       => __( 'One-Time Price', 'woo-comprehensive-monitor' ),
            'type'        => 'text',
            'data_type'   => 'price',
            'desc_tip'    => true,
            'description' => __( 'Equivalent one-time price for this variation.', 'woo-comprehensive-monitor' ),
            'value'       => get_post_meta( $variation->ID, '_wcm_onetime_price', true ),
            'wrapper_class' => 'form-row form-row-first',
        ) );
    }

    public function save_variation_field( $variation_id, $loop ) {
        if ( isset( $_POST['_wcm_onetime_price'][ $loop ] ) ) {
            $val = '' === $_POST['_wcm_onetime_price'][ $loop ] ? '' : wc_format_decimal( sanitize_text_field( $_POST['_wcm_onetime_price'][ $loop ] ) );
            update_post_meta( $variation_id, '_wcm_onetime_price', $val );
        }
    }

    // ================================================================
    // ADMIN: AJAX
    // ================================================================

    public function ajax_admin_charge() {
        check_ajax_referer( 'wcm_sp_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( 'Permission denied.' );
        }
        $sub_id = isset( $_POST['sub_id'] ) ? absint( $_POST['sub_id'] ) : 0;
        if ( ! $sub_id ) {
            wp_send_json_error( 'Missing subscription ID.' );
        }
        $result = $this->charge( $sub_id, 'admin_manual' );
        if ( ! $result ) {
            wp_send_json_error( 'No difference to charge, or already charged.' );
        }
        wp_send_json_success( $result );
    }

    public function enqueue_admin_js( $hook ) {
        $screen = get_current_screen();
        if ( ! $screen ) {
            return;
        }
        $allowed = array( 'shop_subscription', 'woocommerce_page_wc-orders--shop_subscription' );
        if ( ! in_array( $screen->id, $allowed, true ) ) {
            return;
        }

        wp_add_inline_script( 'jquery', "
            jQuery(function($){
                $('#wcm-sp-charge-btn').on('click', function(){
                    var btn=$(this), res=$('#wcm-sp-result');
                    if(!confirm('Charge this customer the one-time price difference?')) return;
                    btn.prop('disabled',true).text('Processing...');
                    res.hide();
                    $.post(ajaxurl, {
                        action:'wcm_sp_charge',
                        sub_id:btn.data('sub-id'),
                        nonce:$('#wcm_sp_nonce_field').val()
                    }, function(r){
                        if(r.success){
                            res.html('<p style=\"color:#4CAF50\">✓ Charged! Order #'+r.data.order_id+'</p>').show();
                            btn.hide();
                        } else {
                            res.html('<p style=\"color:#d63638\">'+( r.data||'Failed')+'</p>').show();
                            btn.prop('disabled',false).text('Retry');
                        }
                    }).fail(function(){
                        res.html('<p style=\"color:#d63638\">Request failed.</p>').show();
                        btn.prop('disabled',false).text('Retry');
                    });
                });
            });
        " );
    }

    // ================================================================
    // FRONTEND: CUSTOMER SELF-SERVICE CONVERSION
    // ================================================================

    public function render_conversion_ui( $subscription ) {
        if ( ! $subscription || ! is_a( $subscription, 'WC_Subscription' ) ) {
            return;
        }
        if ( $subscription->get_customer_id() !== get_current_user_id() ) {
            return;
        }
        if ( ! in_array( $subscription->get_status(), array( 'active', 'on-hold' ), true ) ) {
            return;
        }

        $already = 'yes' === $subscription->get_meta( '_wcm_difference_charged' );
        $calc    = $this->calculate_difference( $subscription );
        if ( ! $calc ) {
            return;
        }

        ?>
        <div class="wcm-sp-convert" style="margin:20px 0;padding:20px;background:#f8f9fa;border:1px solid #ddd;border-radius:4px;">
            <h3><?php esc_html_e( 'Switch to One-Time Purchase', 'woo-comprehensive-monitor' ); ?></h3>

            <?php if ( $already ) : ?>
                <p style="color:#4CAF50;font-weight:bold;"><?php esc_html_e( '✓ Already converted.', 'woo-comprehensive-monitor' ); ?></p>
                <?php
                $oid = $subscription->get_meta( '_wcm_difference_order_id' );
                if ( $oid ) {
                    $o = wc_get_order( $oid );
                    if ( $o && ! $o->is_paid() ) {
                        printf( '<p><a href="%s" class="button">%s</a></p>', esc_url( $o->get_checkout_payment_url() ), esc_html__( 'Complete Payment', 'woo-comprehensive-monitor' ) );
                    }
                }
                ?>
            <?php else : ?>
                <p><?php esc_html_e( 'Switch your subscription to a one-time purchase. You\'ll be charged the difference between your subscription price and the regular one-time price.', 'woo-comprehensive-monitor' ); ?></p>

                <table class="shop_table" style="margin:12px 0;">
                    <thead><tr><th><?php esc_html_e( 'Product', 'woo-comprehensive-monitor' ); ?></th><th><?php esc_html_e( 'You paid', 'woo-comprehensive-monitor' ); ?></th><th><?php esc_html_e( 'One-time price', 'woo-comprehensive-monitor' ); ?></th></tr></thead>
                    <tbody>
                    <?php foreach ( $calc['items'] as $item ) : ?>
                        <tr>
                            <td><strong><?php echo esc_html( $item['product_name'] ); ?></strong><?php if ( $item['qty'] > 1 ) echo ' × ' . (int) $item['qty']; ?></td>
                            <td><?php echo wc_price( $item['sub_price'] ); ?></td>
                            <td><?php echo wc_price( $item['onetime_price'] ); ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:bold;">
                            <td colspan="2"><?php esc_html_e( 'Amount due:', 'woo-comprehensive-monitor' ); ?></td>
                            <td style="color:#d63638;"><?php echo wc_price( $calc['difference'] ); ?></td>
                        </tr>
                    </tfoot>
                </table>

                <p style="font-size:13px;color:#666;"><?php esc_html_e( 'Your subscription will be cancelled after payment.', 'woo-comprehensive-monitor' ); ?></p>

                <button type="button" id="wcm-sp-convert-btn" class="button alt"
                        data-sub-id="<?php echo esc_attr( $subscription->get_id() ); ?>">
                    <?php printf( esc_html__( 'Pay %s & Switch to One-Time', 'woo-comprehensive-monitor' ), wp_strip_all_tags( wc_price( $calc['difference'] ) ) ); ?>
                </button>
                <div id="wcm-sp-convert-result" style="display:none;margin-top:12px;"></div>
            <?php endif; ?>
        </div>
        <?php
    }

    public function ajax_customer_convert() {
        check_ajax_referer( 'wcm_sp_customer_nonce', 'nonce' );
        if ( ! is_user_logged_in() ) {
            wp_send_json_error( 'Not logged in.' );
        }

        $sub_id = isset( $_POST['sub_id'] ) ? absint( $_POST['sub_id'] ) : 0;
        if ( ! function_exists( 'wcs_get_subscription' ) ) {
            wp_send_json_error( 'WooCommerce Subscriptions not active.' );
        }

        $subscription = wcs_get_subscription( $sub_id );
        if ( ! $subscription || $subscription->get_customer_id() !== get_current_user_id() ) {
            wp_send_json_error( 'Invalid subscription.' );
        }

        $result = $this->charge( $subscription, 'convert_customer' );
        if ( ! $result ) {
            wp_send_json_error( 'No difference or already charged.' );
        }

        // Cancel subscription
        if ( 'charged' === $result['status'] ) {
            $subscription->update_status( 'cancelled', __( 'Customer converted to one-time purchase.', 'woo-comprehensive-monitor' ) );
        } else {
            $subscription->update_status( 'pending-cancel', __( 'Pending price adjustment payment.', 'woo-comprehensive-monitor' ) );
        }

        wp_send_json_success( $result );
    }

    public function enqueue_frontend_js() {
        if ( ! is_account_page() ) {
            return;
        }

        wp_add_inline_script( 'jquery', "
            jQuery(function($){
                $('#wcm-sp-convert-btn').on('click', function(){
                    var btn=$(this), res=$('#wcm-sp-convert-result');
                    if(!confirm('Switch to one-time purchase? You will be charged the price difference and your subscription will be cancelled.')) return;
                    btn.prop('disabled',true).text('Processing...');
                    res.hide();
                    $.post('" . esc_url( admin_url( 'admin-ajax.php' ) ) . "', {
                        action:'wcm_sp_customer_convert',
                        sub_id:btn.data('sub-id'),
                        nonce:'" . wp_create_nonce( 'wcm_sp_customer_nonce' ) . "'
                    }, function(r){
                        if(r.success){
                            var msg = r.data.status==='charged'
                                ? '<p style=\"color:#4CAF50\">✓ Done! Switched to one-time purchase.</p>'
                                : '<p style=\"color:#FF9800\">Almost there — <a href=\"'+r.data.pay_url+'\">complete payment</a> to finish.</p>';
                            res.html(msg).show();
                            btn.hide();
                        } else {
                            res.html('<p style=\"color:#d63638\">'+(r.data||'Failed')+'</p>').show();
                            btn.prop('disabled',false).text('Retry');
                        }
                    }).fail(function(){
                        res.html('<p style=\"color:#d63638\">Request failed.</p>').show();
                        btn.prop('disabled',false).text('Retry');
                    });
                });
            });
        " );
    }

    // ================================================================
    // FRONTEND: CANCEL WARNING + MY ACCOUNT PAGE
    // ================================================================

    public function add_endpoints() {
        add_rewrite_endpoint( 'price-adjustments', EP_ROOT | EP_PAGES );
    }

    public function add_menu_item( $items ) {
        $new = array();
        foreach ( $items as $key => $label ) {
            $new[ $key ] = $label;
            if ( 'orders' === $key ) {
                $new['price-adjustments'] = __( 'Price Adjustments', 'woo-comprehensive-monitor' );
            }
        }
        return $new;
    }

    public function render_my_account_page() {
        $customer_id = get_current_user_id();
        if ( ! $customer_id ) {
            return;
        }

        global $wpdb;
        $table   = $wpdb->prefix . 'wcm_recovery_log';
        $charges = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$table} WHERE customer_id = %d ORDER BY created_at DESC",
            $customer_id
        ) );

        if ( empty( $charges ) ) {
            echo '<p>' . esc_html__( 'No price adjustments found.', 'woo-comprehensive-monitor' ) . '</p>';
            return;
        }

        echo '<h3>' . esc_html__( 'Price Adjustments', 'woo-comprehensive-monitor' ) . '</h3>';
        echo '<table class="woocommerce-orders-table shop_table shop_table_responsive"><thead><tr>';
        echo '<th>' . esc_html__( 'Date', 'woo-comprehensive-monitor' ) . '</th>';
        echo '<th>' . esc_html__( 'Subscription', 'woo-comprehensive-monitor' ) . '</th>';
        echo '<th>' . esc_html__( 'Amount', 'woo-comprehensive-monitor' ) . '</th>';
        echo '<th>' . esc_html__( 'Status', 'woo-comprehensive-monitor' ) . '</th>';
        echo '</tr></thead><tbody>';

        foreach ( $charges as $c ) {
            echo '<tr>';
            echo '<td>' . esc_html( date_i18n( get_option( 'date_format' ), strtotime( $c->created_at ) ) ) . '</td>';
            echo '<td>#' . esc_html( $c->subscription_id ) . '</td>';
            echo '<td>' . wc_price( $c->discount_amount ) . '</td>';
            $color = 'charged' === $c->charge_status ? '#4CAF50' : ( 'pending' === $c->charge_status ? '#FF9800' : '#666' );
            echo '<td><span style="color:' . esc_attr( $color ) . ';font-weight:bold;">' . esc_html( ucfirst( $c->charge_status ) ) . '</span></td>';
            echo '</tr>';
        }

        echo '</tbody></table>';
    }

    public function cancel_warning_js() {
        if ( ! is_account_page() ) {
            return;
        }
        ?>
        <script>
        jQuery(function($){
            $('a[href*="cancel"]').on('click', function(e){
                var msg = '<?php echo esc_js( __( 'Note: If you cancel, you may be charged the difference between your subscription price and the regular one-time price. Continue?', 'woo-comprehensive-monitor' ) ); ?>';
                if(!confirm(msg)) e.preventDefault();
            });
        });
        </script>
        <?php
    }

    public function enqueue_frontend_css() {
        if ( ! is_account_page() ) {
            return;
        }
        wp_enqueue_style( 'wcm-my-account', WCM_PLUGIN_URL . 'assets/css/my-account.css', array(), WCM_VERSION );
    }

    // ================================================================
    // STATS — for admin dashboard
    // ================================================================

    public function get_stats() {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_recovery_log';

        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return array( 'total' => 0, 'charged' => 0, 'pending' => 0, 'total_amount' => 0 );
        }

        return array(
            'total'        => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ),
            'charged'      => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE charge_status = 'charged'" ),
            'pending'      => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE charge_status = 'pending'" ),
            'total_amount' => (float) $wpdb->get_var( "SELECT COALESCE(SUM(discount_amount), 0) FROM {$table} WHERE charge_status = 'charged'" ),
        );
    }
}
