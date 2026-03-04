<?php
/**
 * Pre-Order System — transforms WooCommerce backorders into pre-orders.
 * Saves card via Stripe SetupIntent, charges on ship. Ported from preorder-wp.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_PreOrder {

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
        // --- Custom order statuses ---
        add_filter( 'woocommerce_register_shop_order_post_statuses', array( $this, 'register_order_statuses' ) );
        add_filter( 'wc_order_statuses', array( $this, 'add_order_statuses' ) );
        add_filter( 'bulk_actions-edit-shop_order', array( $this, 'add_bulk_actions' ) );
        add_filter( 'bulk_actions-woocommerce_page_wc-orders', array( $this, 'add_bulk_actions' ) );

        // --- Product meta fields ---
        add_action( 'woocommerce_product_options_stock_status', array( $this, 'add_preorder_fields' ) );
        add_action( 'woocommerce_process_product_meta', array( $this, 'save_preorder_fields' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_scripts' ) );

        // --- Frontend display ---
        add_filter( 'woocommerce_product_single_add_to_cart_text', array( $this, 'single_add_to_cart_text' ), 10, 2 );
        add_filter( 'woocommerce_product_add_to_cart_text', array( $this, 'loop_add_to_cart_text' ), 10, 2 );
        add_action( 'woocommerce_after_add_to_cart_button', array( $this, 'display_preorder_message' ) );
        add_filter( 'woocommerce_get_item_data', array( $this, 'cart_item_preorder_label' ), 10, 2 );
        add_action( 'woocommerce_review_order_before_payment', array( $this, 'checkout_preorder_notice' ) );
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_styles' ) );
        add_filter( 'woocommerce_loop_add_to_cart_args', array( $this, 'add_button_class' ), 10, 2 );

        // --- Checkout: SetupIntent, mixed cart, payment token ---
        add_action( 'woocommerce_check_cart_items', array( $this, 'validate_cart' ) );
        add_filter( 'woocommerce_stripe_force_save_source', array( $this, 'force_save_source' ), 10, 2 );
        add_filter( 'wc_stripe_force_setup_intent', array( $this, 'force_setup_intent' ) );
        add_filter( 'woocommerce_cart_needs_payment', array( $this, 'cart_needs_payment' ), 10, 2 );
        add_action( 'woocommerce_checkout_order_processed', array( $this, 'mark_preorder_pending' ), 10, 3 );
        add_action( 'woocommerce_payment_complete', array( $this, 'handle_payment_complete' ) );
        add_action( 'woocommerce_order_status_processing', array( $this, 'maybe_intercept_processing' ) );

        // --- Charge on ship ---
        add_action( 'woocommerce_order_status_changed', array( $this, 'handle_status_change' ), 10, 4 );
        add_action( 'wcm_preorder_retry_charge', array( $this, 'retry_charge' ) );
        add_filter( 'woocommerce_admin_order_actions', array( $this, 'add_order_actions' ), 10, 2 );

        // --- Emails ---
        add_filter( 'woocommerce_email_actions', array( $this, 'register_email_actions' ) );
    }

    // ==========================================================
    // CORE HELPERS
    // ==========================================================

    /**
     * A product is a pre-order if its stock status is "onbackorder".
     */
    public static function is_preorder_product( $product ) {
        if ( ! $product instanceof WC_Product ) {
            $product = wc_get_product( $product );
        }
        return $product && 'onbackorder' === $product->get_stock_status();
    }

    public static function order_has_preorder_items( $order ) {
        foreach ( $order->get_items() as $item ) {
            $product = $item->get_product();
            if ( $product && self::is_preorder_product( $product ) ) {
                return true;
            }
        }
        return false;
    }

    public static function cart_has_preorder_items() {
        if ( ! WC()->cart ) return false;
        foreach ( WC()->cart->get_cart() as $item ) {
            if ( self::is_preorder_product( $item['data'] ) ) return true;
        }
        return false;
    }

    public static function cart_is_all_preorder() {
        if ( ! WC()->cart ) return false;
        $count = 0;
        foreach ( WC()->cart->get_cart() as $item ) {
            if ( ! self::is_preorder_product( $item['data'] ) ) return false;
            $count++;
        }
        return $count > 0;
    }

    // ==========================================================
    // CUSTOM ORDER STATUSES
    // ==========================================================

    public function register_order_statuses( $statuses ) {
        $statuses['wc-pre-ordered'] = array(
            'label'                     => _x( 'Pre-Ordered', 'Order status', 'woo-comprehensive-monitor' ),
            'public'                    => false,
            'exclude_from_search'       => false,
            'show_in_admin_all_list'    => true,
            'show_in_admin_status_list' => true,
            'label_count'               => _n_noop( 'Pre-Ordered <span class="count">(%s)</span>', 'Pre-Ordered <span class="count">(%s)</span>', 'woo-comprehensive-monitor' ),
        );
        $statuses['wc-pre-order-fail'] = array(
            'label'                     => _x( 'Pre-Order Payment Failed', 'Order status', 'woo-comprehensive-monitor' ),
            'public'                    => false,
            'exclude_from_search'       => false,
            'show_in_admin_all_list'    => true,
            'show_in_admin_status_list' => true,
            'label_count'               => _n_noop( 'Pre-Order Payment Failed <span class="count">(%s)</span>', 'Pre-Order Payment Failed <span class="count">(%s)</span>', 'woo-comprehensive-monitor' ),
        );
        return $statuses;
    }

    public function add_order_statuses( $statuses ) {
        $statuses['wc-pre-ordered']    = _x( 'Pre-Ordered', 'Order status', 'woo-comprehensive-monitor' );
        $statuses['wc-pre-order-fail'] = _x( 'Pre-Order Payment Failed', 'Order status', 'woo-comprehensive-monitor' );
        return $statuses;
    }

    public function add_bulk_actions( $actions ) {
        $actions['mark_pre-ordered'] = __( 'Change status to Pre-Ordered', 'woo-comprehensive-monitor' );
        return $actions;
    }

    // ==========================================================
    // PRODUCT META FIELDS
    // ==========================================================

    public function add_preorder_fields() {
        echo '<div class="options_group preorder-wp-fields" style="display:none;">';
        echo '<p class="form-field"><strong>' . esc_html__( 'Pre-Order Settings', 'woo-comprehensive-monitor' ) . '</strong></p>';

        woocommerce_wp_text_input( array(
            'id'          => '_preorder_availability_date',
            'label'       => __( 'Availability Date', 'woo-comprehensive-monitor' ),
            'type'        => 'date',
            'desc_tip'    => true,
            'description' => __( 'Estimated date the product will be available to ship.', 'woo-comprehensive-monitor' ),
        ) );

        woocommerce_wp_text_input( array(
            'id'          => '_preorder_button_text',
            'label'       => __( 'Button Text', 'woo-comprehensive-monitor' ),
            'placeholder' => __( 'Pre-Order Now', 'woo-comprehensive-monitor' ),
            'desc_tip'    => true,
            'description' => __( 'Custom text for the Add to Cart button.', 'woo-comprehensive-monitor' ),
        ) );

        woocommerce_wp_textarea_input( array(
            'id'          => '_preorder_message',
            'label'       => __( 'Pre-Order Message', 'woo-comprehensive-monitor' ),
            'placeholder' => __( 'e.g. Expected to ship March 2026', 'woo-comprehensive-monitor' ),
            'desc_tip'    => true,
            'description' => __( 'Message displayed below the pre-order button.', 'woo-comprehensive-monitor' ),
        ) );

        echo '</div>';
    }

    public function save_preorder_fields( $post_id ) {
        $product = wc_get_product( $post_id );
        if ( ! $product ) return;

        foreach ( array( '_preorder_availability_date', '_preorder_button_text' ) as $key ) {
            if ( isset( $_POST[ $key ] ) ) {
                $product->update_meta_data( $key, sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) );
            }
        }
        if ( isset( $_POST['_preorder_message'] ) ) {
            $product->update_meta_data( '_preorder_message', sanitize_textarea_field( wp_unslash( $_POST['_preorder_message'] ) ) );
        }
        $product->save();
    }

    public function enqueue_admin_scripts( $hook ) {
        if ( ! in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) return;
        $screen = get_current_screen();
        if ( ! $screen || 'product' !== $screen->post_type ) return;

        wp_add_inline_script( 'wc-admin-product-meta-boxes', "
            jQuery(function($) {
                function togglePreorderFields() {
                    var b = $('#_backorders').val();
                    $('.preorder-wp-fields').toggle(b === 'yes' || b === 'notify');
                }
                $('#_backorders').on('change', togglePreorderFields);
                togglePreorderFields();
            });
        " );
    }

    // ==========================================================
    // FRONTEND DISPLAY
    // ==========================================================

    public function single_add_to_cart_text( $text, $product ) {
        if ( ! self::is_preorder_product( $product ) ) return $text;
        $custom = $product->get_meta( '_preorder_button_text' );
        return ! empty( $custom ) ? $custom : __( 'Pre-Order Now', 'woo-comprehensive-monitor' );
    }

    public function loop_add_to_cart_text( $text, $product ) {
        if ( ! self::is_preorder_product( $product ) ) return $text;
        $custom = $product->get_meta( '_preorder_button_text' );
        return ! empty( $custom ) ? $custom : __( 'Pre-Order Now', 'woo-comprehensive-monitor' );
    }

    public function display_preorder_message() {
        global $product;
        if ( ! $product || ! self::is_preorder_product( $product ) ) return;

        $date    = $product->get_meta( '_preorder_availability_date' );
        $message = $product->get_meta( '_preorder_message' );
        if ( empty( $date ) && empty( $message ) ) return;

        echo '<div class="wcm-preorder-info">';
        if ( $date ) {
            $formatted = date_i18n( get_option( 'date_format' ), strtotime( $date ) );
            printf( '<p class="wcm-preorder-date">%s %s</p>', esc_html__( 'Estimated availability:', 'woo-comprehensive-monitor' ), esc_html( $formatted ) );
        }
        if ( $message ) {
            printf( '<p class="wcm-preorder-message">%s</p>', esc_html( $message ) );
        }
        echo '</div>';
    }

    public function cart_item_preorder_label( $item_data, $cart_item ) {
        if ( self::is_preorder_product( $cart_item['data'] ) ) {
            $item_data[] = array( 'key' => __( 'Type', 'woo-comprehensive-monitor' ), 'value' => __( 'Pre-Order', 'woo-comprehensive-monitor' ) );
        }
        return $item_data;
    }

    public function checkout_preorder_notice() {
        if ( ! self::cart_has_preorder_items() ) return;
        echo '<div class="wcm-preorder-checkout-notice woocommerce-info">';
        echo '<p>' . esc_html__( 'This order contains pre-order items. Your payment method will be saved securely and charged only when your order ships.', 'woo-comprehensive-monitor' ) . '</p>';
        echo '</div>';
    }

    public function enqueue_frontend_styles() {
        if ( ! ( is_product() || is_cart() || is_checkout() || is_shop() ) ) return;
        wp_enqueue_style( 'wcm-preorder-frontend', WCM_PLUGIN_URL . 'assets/css/preorder-frontend.css', array(), WCM_VERSION );
    }

    public function add_button_class( $args, $product ) {
        if ( self::is_preorder_product( $product ) ) {
            $args['class'] .= ' preorder-product';
        }
        return $args;
    }

    // ==========================================================
    // CHECKOUT: SetupIntent + Token Storage
    // ==========================================================

    public function validate_cart() {
        if ( ! WC()->cart ) return;
        $has_preorder = false;
        $has_regular  = false;
        foreach ( WC()->cart->get_cart() as $item ) {
            if ( self::is_preorder_product( $item['data'] ) ) { $has_preorder = true; } else { $has_regular = true; }
        }
        if ( $has_preorder && $has_regular ) {
            wc_add_notice( __( 'Pre-order items must be ordered separately from in-stock items. Please remove one type to continue.', 'woo-comprehensive-monitor' ), 'error' );
        }
    }

    public function force_save_source( $force, $customer ) {
        return self::cart_has_preorder_items() ? true : $force;
    }

    public function force_setup_intent( $force ) {
        return self::cart_has_preorder_items() ? true : $force;
    }

    public function cart_needs_payment( $needs, $cart ) {
        return self::cart_has_preorder_items() ? true : $needs;
    }

    public function mark_preorder_pending( $order_id, $posted_data, $order ) {
        if ( ! self::order_has_preorder_items( $order ) ) return;
        $order->update_meta_data( '_preorder_charge_status', 'pending' );
        $order->save();
    }

    public function handle_payment_complete( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order || ! self::order_has_preorder_items( $order ) ) return;
        $this->save_stripe_meta( $order );
        $order->update_status( 'pre-ordered', __( 'Payment method saved. Order will be charged when shipped.', 'woo-comprehensive-monitor' ) );
    }

    public function maybe_intercept_processing( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order || $order->has_status( 'pre-ordered' ) ) return;
        if ( 'pending' !== $order->get_meta( '_preorder_charge_status' ) ) return;
        if ( ! self::order_has_preorder_items( $order ) ) return;
        $this->save_stripe_meta( $order );
        $order->update_status( 'pre-ordered', __( 'Payment method saved. Order will be charged when shipped.', 'woo-comprehensive-monitor' ) );
    }

    private function save_stripe_meta( $order ) {
        $source = $order->get_meta( '_stripe_source_id' ) ?: $order->get_meta( '_stripe_payment_method' );
        $cust   = $order->get_meta( '_stripe_customer_id' );
        if ( $source ) $order->update_meta_data( '_preorder_payment_token', $source );
        if ( $cust )   $order->update_meta_data( '_preorder_stripe_customer_id', $cust );
        $order->save();
    }

    // ==========================================================
    // CHARGE ON SHIP
    // ==========================================================

    public function handle_status_change( $order_id, $old_status, $new_status, $order ) {
        if ( 'pre-ordered' !== $old_status || 'completed' !== $new_status ) return;
        $this->charge_order( $order );
    }

    public function charge_order( $order ) {
        $payment_method_id = $order->get_meta( '_preorder_payment_token' );
        $customer_id       = $order->get_meta( '_preorder_stripe_customer_id' );
        $charge_status     = $order->get_meta( '_preorder_charge_status' );

        if ( 'charged' === $charge_status ) {
            $order->add_order_note( __( 'Pre-order charge skipped: already charged.', 'woo-comprehensive-monitor' ) );
            return;
        }

        if ( empty( $payment_method_id ) || empty( $customer_id ) ) {
            $order->update_status( 'pre-order-fail', __( 'Missing payment token or customer ID.', 'woo-comprehensive-monitor' ) );
            $order->update_meta_data( '_preorder_charge_status', 'failed' );
            $order->save();
            return;
        }

        if ( ! class_exists( 'WC_Stripe_API' ) || ! class_exists( 'WC_Stripe_Helper' ) ) {
            $order->add_order_note( __( 'Pre-order charge failed: Stripe Gateway not active.', 'woo-comprehensive-monitor' ) );
            $order->update_status( 'pre-order-fail' );
            $order->update_meta_data( '_preorder_charge_status', 'failed' );
            $order->save();
            return;
        }

        $amount   = $order->get_total();
        $currency = strtolower( $order->get_currency() );

        $request = array(
            'amount'         => WC_Stripe_Helper::get_stripe_amount( $amount, $currency ),
            'currency'       => $currency,
            'customer'       => $customer_id,
            'payment_method' => $payment_method_id,
            'confirm'        => 'true',
            'off_session'    => 'true',
            'description'    => sprintf( '%s — Pre-Order #%s', wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $order->get_order_number() ),
            'metadata'       => array( 'order_id' => $order->get_id() ),
        );

        $response = WC_Stripe_API::request( $request, 'payment_intents' );

        if ( is_wp_error( $response ) || ! empty( $response->error ) ) {
            $error = is_wp_error( $response ) ? $response->get_error_message() : ( $response->error->message ?? 'Unknown' );
            $order->add_order_note( sprintf( __( 'Pre-order charge failed: %s', 'woo-comprehensive-monitor' ), $error ) );

            if ( 'retry' !== $charge_status ) {
                $order->update_meta_data( '_preorder_charge_status', 'retry' );
                $order->update_status( 'pre-ordered', __( 'Charge failed. Retry in 24h.', 'woo-comprehensive-monitor' ) );
                $order->save();
                wp_schedule_single_event( time() + DAY_IN_SECONDS, 'wcm_preorder_retry_charge', array( $order->get_id() ) );
                do_action( 'wcm_preorder_payment_failed', $order->get_id() );
            } else {
                $order->update_meta_data( '_preorder_charge_status', 'failed' );
                $order->update_status( 'pre-order-fail', __( 'Pre-order charge failed after retry.', 'woo-comprehensive-monitor' ) );
                $order->save();
                do_action( 'wcm_preorder_payment_failed', $order->get_id() );
            }
            return;
        }

        if ( isset( $response->status ) && 'succeeded' === $response->status ) {
            $order->update_meta_data( '_preorder_charge_status', 'charged' );
            $order->update_meta_data( '_preorder_stripe_payment_intent', $response->id );
            $order->set_transaction_id( $response->id );
            $order->save();
            $order->payment_complete( $response->id );
            $order->add_order_note( sprintf( __( 'Pre-order charged. PaymentIntent: %s', 'woo-comprehensive-monitor' ), $response->id ) );
            do_action( 'wcm_preorder_payment_charged', $order->get_id() );
        } else {
            $order->add_order_note( sprintf( __( 'Pre-order requires additional authentication. Status: %s', 'woo-comprehensive-monitor' ), $response->status ?? 'unknown' ) );
            $order->update_status( 'pre-order-fail' );
            $order->update_meta_data( '_preorder_charge_status', 'failed' );
            $order->save();
        }
    }

    public function retry_charge( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) return;
        $order->add_order_note( __( 'Retrying pre-order charge (auto-retry).', 'woo-comprehensive-monitor' ) );
        $this->charge_order( $order );
    }

    public function add_order_actions( $actions, $order ) {
        if ( $order->has_status( 'pre-ordered' ) ) {
            $actions['complete'] = array(
                'url'    => wp_nonce_url( admin_url( 'admin-ajax.php?action=woocommerce_mark_order_status&status=completed&order_id=' . $order->get_id() ), 'woocommerce-mark-order-status' ),
                'name'   => __( 'Ship & Charge', 'woo-comprehensive-monitor' ),
                'action' => 'complete',
            );
        }
        return $actions;
    }

    // ==========================================================
    // EMAIL ACTIONS
    // ==========================================================

    public function register_email_actions( $actions ) {
        $actions[] = 'woocommerce_order_status_pre-ordered';
        $actions[] = 'wcm_preorder_payment_charged';
        $actions[] = 'wcm_preorder_payment_failed';
        return $actions;
    }

    // ==========================================================
    // ADMIN: Pre-order stats
    // ==========================================================

    public function get_preorder_stats() {
        $stats = array(
            'pre_ordered' => 0,
            'charged'     => 0,
            'failed'      => 0,
        );

        // Count orders in each status
        $statuses = wc_get_order_statuses();
        if ( isset( $statuses['wc-pre-ordered'] ) ) {
            $stats['pre_ordered'] = (int) wc_orders_count( 'pre-ordered' );
        }
        if ( isset( $statuses['wc-pre-order-fail'] ) ) {
            $stats['failed'] = (int) wc_orders_count( 'pre-order-fail' );
        }

        // Count charged — HPOS compatible
        $charged_orders = wc_get_orders( array(
            'limit'      => -1,
            'return'     => 'ids',
            'meta_query' => array(
                array( 'key' => '_preorder_charge_status', 'value' => 'charged' ),
            ),
        ) );
        $stats['charged'] = count( $charged_orders );

        return $stats;
    }
}
