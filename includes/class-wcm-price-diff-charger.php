<?php
/**
 * Subscription Price Difference Charger — charges the difference between
 * subscription (discounted) and regular (one-time) price when a customer
 * converts or cancels their subscription.
 * Ported from subscription-price-diff-charger plugin.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Price_Diff_Charger {

    private static $instance = null;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Only load if WooCommerce Subscriptions is active
        if ( ! class_exists( 'WC_Subscriptions' ) ) {
            return;
        }
        $this->init_hooks();
    }

    private function init_hooks() {
        // Auto-charge on cancellation
        add_action( 'woocommerce_subscription_status_updated', array( $this, 'on_subscription_status_change' ), 10, 3 );

        // Admin: meta-box on Edit Subscription
        add_action( 'add_meta_boxes', array( $this, 'add_subscription_meta_box' ) );

        // Admin: subscription list column
        add_filter( 'manage_edit-shop_subscription_columns', array( $this, 'add_list_column' ), 20 );
        add_action( 'manage_shop_subscription_posts_custom_column', array( $this, 'render_list_column' ), 10, 2 );
        add_filter( 'manage_woocommerce_page_wc-orders--shop_subscription_columns', array( $this, 'add_list_column' ), 20 );
        add_action( 'manage_woocommerce_page_wc-orders--shop_subscription_custom_column', array( $this, 'render_list_column' ), 10, 2 );

        // Admin: AJAX handlers
        add_action( 'wp_ajax_wcm_spd_charge', array( $this, 'ajax_charge_difference' ) );
        add_action( 'wp_ajax_wcm_spd_preview', array( $this, 'ajax_preview_difference' ) );

        // Admin: enqueue assets on subscription screens
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );

        // Frontend: customer self-service "Convert to One-Time Purchase"
        if ( 'yes' === get_option( 'wcm_spd_customer_self_service', 'yes' ) ) {
            add_action( 'woocommerce_subscription_details_after_subscription_table', array( $this, 'render_conversion_ui' ) );
            add_action( 'wp_ajax_wcm_spd_customer_convert', array( $this, 'ajax_customer_convert' ) );
            add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );
        }
    }

    // ==========================================================
    // CALCULATOR
    // ==========================================================

    /**
     * Get the price difference for a WooCommerce Subscription.
     *
     * @param  int|WC_Subscription $subscription
     * @return array|false  Array with difference, regular_price, subscription_price, items
     */
    public function get_price_difference( $subscription ) {
        if ( ! is_a( $subscription, 'WC_Subscription' ) ) {
            if ( function_exists( 'wcs_get_subscription' ) ) {
                $subscription = wcs_get_subscription( $subscription );
            }
        }
        if ( ! $subscription ) {
            return false;
        }

        $items              = array();
        $total_regular      = 0;
        $total_subscription = 0;

        foreach ( $subscription->get_items() as $item_id => $item ) {
            $product = $item->get_product();
            if ( ! $product ) {
                continue;
            }

            $qty       = $item->get_quantity();
            $sub_price = (float) $item->get_subtotal() / max( $qty, 1 );

            // Get regular (one-time) price
            $regular_price = $this->get_product_regular_price( $product );
            $item_diff     = ( $regular_price - $sub_price ) * $qty;

            if ( $item_diff > 0 ) {
                $items[] = array(
                    'item_id'            => $item_id,
                    'product_id'         => $product->get_id(),
                    'product_name'       => $product->get_name(),
                    'qty'                => $qty,
                    'subscription_price' => round( $sub_price, 2 ),
                    'regular_price'      => round( $regular_price, 2 ),
                    'difference'         => round( $item_diff, 2 ),
                );
                $total_regular      += $regular_price * $qty;
                $total_subscription += $sub_price * $qty;
            }
        }

        $total_difference = round( $total_regular - $total_subscription, 2 );

        if ( $total_difference <= 0 ) {
            return false;
        }

        return array(
            'difference'         => $total_difference,
            'regular_price'      => round( $total_regular, 2 ),
            'subscription_price' => round( $total_subscription, 2 ),
            'items'              => $items,
        );
    }

    private function get_product_regular_price( $product ) {
        // Custom one-time price override
        $override = $product->get_meta( '_spd_onetime_price' );
        if ( $override !== '' && $override !== false ) {
            return (float) $override;
        }

        // Variable subscription — check parent
        if ( $product->is_type( 'subscription_variation' ) ) {
            $parent = wc_get_product( $product->get_parent_id() );
            if ( $parent ) {
                $parent_override = $parent->get_meta( '_spd_onetime_price' );
                if ( $parent_override !== '' && $parent_override !== false ) {
                    return (float) $parent_override;
                }
            }
        }

        $regular = (float) $product->get_regular_price();
        return $regular > 0 ? $regular : (float) $product->get_price();
    }

    public function has_price_difference( $subscription ) {
        return false !== $this->get_price_difference( $subscription );
    }

    // ==========================================================
    // CHARGER
    // ==========================================================

    /**
     * Charge the price difference for a subscription.
     *
     * @param  int|WC_Subscription $subscription
     * @param  string              $charged_by  'admin', 'customer', or 'auto'
     * @return array|false
     */
    public function charge_difference( $subscription, $charged_by = 'admin' ) {
        if ( ! is_a( $subscription, 'WC_Subscription' ) ) {
            $subscription = function_exists( 'wcs_get_subscription' ) ? wcs_get_subscription( $subscription ) : null;
        }
        if ( ! $subscription ) {
            return false;
        }

        // Don't double-charge
        if ( 'yes' === $subscription->get_meta( '_spd_difference_charged' ) ) {
            return false;
        }

        $price_data = $this->get_price_difference( $subscription );
        if ( ! $price_data || $price_data['difference'] <= 0 ) {
            return false;
        }

        // Create the charge order
        $order = $this->create_difference_order( $subscription, $price_data );
        if ( is_wp_error( $order ) ) {
            return false;
        }

        // Attempt payment via WCS renewal hook (works with any gateway)
        $charged = $this->process_payment( $order, $subscription, $price_data['difference'] );
        $order   = wc_get_order( $order->get_id() ); // refresh

        // Log to recovery log table
        $this->log_charge( $subscription, $order, $price_data, $charged, $charged_by );

        // Mark subscription
        $subscription->update_meta_data( '_spd_difference_charged', 'yes' );
        $subscription->update_meta_data( '_spd_difference_order_id', $order->get_id() );
        $subscription->save();

        // Notify monitoring server
        $this->notify_monitoring_server( $subscription, $price_data, $charged );

        return array(
            'order_id' => $order->get_id(),
            'amount'   => $price_data['difference'],
            'status'   => $charged ? 'completed' : 'pending',
            'pay_url'  => $charged ? '' : $order->get_checkout_payment_url(),
        );
    }

    private function create_difference_order( $subscription, $price_data ) {
        try {
            $order = wc_create_order( array(
                'customer_id' => $subscription->get_customer_id(),
                'status'      => 'pending',
            ) );

            $order->set_address( $subscription->get_address( 'billing' ), 'billing' );
            $order->set_address( $subscription->get_address( 'shipping' ), 'shipping' );
            $order->set_payment_method( $subscription->get_payment_method() );
            $order->set_payment_method_title( $subscription->get_payment_method_title() );

            $fee = new WC_Order_Item_Fee();
            $fee->set_name( sprintf( __( 'Subscription #%d — One-Time Purchase Price Adjustment', 'woo-comprehensive-monitor' ), $subscription->get_id() ) );
            $fee->set_amount( $price_data['difference'] );
            $fee->set_total( $price_data['difference'] );
            $fee->set_tax_status( 'none' );
            $order->add_item( $fee );

            $order->calculate_totals();
            $order->update_meta_data( '_wcm_spd_source_subscription', $subscription->get_id() );
            $order->update_meta_data( '_wcm_spd_charge_type', 'price_difference' );

            // Detailed note
            $notes = array();
            foreach ( $price_data['items'] as $item ) {
                $notes[] = sprintf( '%s (×%d): %s → %s = %s diff', $item['product_name'], $item['qty'], wc_price( $item['subscription_price'] ), wc_price( $item['regular_price'] ), wc_price( $item['difference'] ) );
            }
            $order->add_order_note( __( 'Price difference charge created by WC Monitor.', 'woo-comprehensive-monitor' ) . "\n\n" . implode( "\n", $notes ) );
            $order->save();

            return $order;
        } catch ( Exception $e ) {
            return new WP_Error( 'order_creation_failed', $e->getMessage() );
        }
    }

    /**
     * Process payment via WCS renewal hook — works with any gateway (Stripe, PayPal, Square, etc.)
     */
    private function process_payment( $order, $subscription, $amount ) {
        $payment_method = $subscription->get_payment_method();
        if ( empty( $payment_method ) ) {
            $order->add_order_note( __( 'No payment method on subscription; customer must pay manually.', 'woo-comprehensive-monitor' ) );
            return false;
        }

        // Copy gateway-specific payment meta from subscription to order
        $this->copy_payment_meta( $order, $subscription );

        try {
            // Fire the WCS scheduled payment hook — the proper off-session API
            do_action( 'woocommerce_scheduled_subscription_payment_' . $payment_method, $amount, $order );

            $order = wc_get_order( $order->get_id() );
            if ( $order && $order->is_paid() ) {
                $order->add_order_note( __( 'Price difference charged via saved payment method.', 'woo-comprehensive-monitor' ) );
                return true;
            }

            if ( $order && 'failed' === $order->get_status() ) {
                $order->update_status( 'pending', __( 'Auto-charge failed. Reset for manual payment.', 'woo-comprehensive-monitor' ) );
            }
        } catch ( Exception $e ) {
            $order->add_order_note( sprintf( __( 'Auto-charge exception: %s', 'woo-comprehensive-monitor' ), $e->getMessage() ) );
        }

        return false;
    }

    private function copy_payment_meta( $order, $subscription ) {
        $meta_keys = apply_filters( 'wcm_spd_payment_meta_keys', array(
            '_stripe_customer_id', '_stripe_source_id', '_stripe_payment_method',
            '_ppec_billing_agreement_id', '_ppcp_billing_agreement_id',
            '_square_customer_id', '_square_card_id',
            '_wc_authorize_net_cim_credit_card_customer_id', '_wc_authorize_net_cim_credit_card_payment_id',
            '_payment_tokens',
        ), $subscription );

        foreach ( $meta_keys as $key ) {
            $value = $subscription->get_meta( $key );
            if ( ! empty( $value ) ) {
                $order->update_meta_data( $key, $value );
            }
        }

        $payment_tokens = $subscription->get_payment_tokens();
        if ( ! empty( $payment_tokens ) ) {
            foreach ( $payment_tokens as $token_id ) {
                $token = WC_Payment_Tokens::get( $token_id );
                if ( $token ) {
                    $order->add_payment_token( $token );
                }
            }
        }
        $order->save();
    }

    // ==========================================================
    // AUTO-CHARGE ON CANCELLATION
    // ==========================================================

    public function on_subscription_status_change( $subscription, $new_status, $old_status ) {
        if ( 'yes' !== get_option( 'wcm_spd_auto_charge_on_cancel', 'no' ) ) {
            return;
        }
        if ( 'cancelled' !== $new_status ) {
            return;
        }
        if ( 'yes' === $subscription->get_meta( '_spd_difference_charged' ) ) {
            return;
        }
        if ( ! $this->has_price_difference( $subscription ) ) {
            return;
        }
        $this->charge_difference( $subscription, 'auto' );
    }

    // ==========================================================
    // LOGGING
    // ==========================================================

    private function log_charge( $subscription, $order, $price_data, $charged, $charged_by ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_recovery_log';

        // Reuse the recovery log table with a note indicating price-diff
        $wpdb->insert( $table, array(
            'subscription_id'    => $subscription->get_id(),
            'recovery_order_id'  => $order->get_id(),
            'customer_id'        => $subscription->get_customer_id(),
            'discount_amount'    => $price_data['difference'],
            'regular_total'      => $price_data['regular_price'],
            'subscription_total' => $price_data['subscription_price'],
            'charge_status'      => $charged ? 'charged' : 'pending',
            'charge_date'        => $charged ? current_time( 'mysql' ) : null,
            'notes'              => sprintf( 'Price diff conversion (%s)', $charged_by ),
            'created_at'         => current_time( 'mysql' ),
        ) );
    }

    private function notify_monitoring_server( $subscription, $price_data, $charged ) {
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
                'type'            => 'subscription_price_diff',
                'store_url'       => home_url(),
                'store_name'      => get_bloginfo( 'name' ),
                'subscription_id' => $subscription->get_id(),
                'amount'          => $price_data['difference'],
                'status'          => $charged ? 'charged' : 'pending',
                'timestamp'       => current_time( 'mysql' ),
            ) ),
        ) );
    }

    // ==========================================================
    // ADMIN: META-BOX ON SUBSCRIPTION EDIT PAGE
    // ==========================================================

    public function add_subscription_meta_box() {
        $screens = array( 'shop_subscription' );
        if ( function_exists( 'wc_get_page_screen_id' ) ) {
            $screens[] = wc_get_page_screen_id( 'shop_subscription' );
        }
        foreach ( $screens as $screen ) {
            add_meta_box( 'wcm-price-difference', __( 'Price Difference Charger', 'woo-comprehensive-monitor' ), array( $this, 'render_meta_box' ), $screen, 'side', 'default' );
        }
    }

    public function render_meta_box( $post_or_order ) {
        $sub_id = is_a( $post_or_order, 'WC_Subscription' ) ? $post_or_order->get_id() : ( is_a( $post_or_order, 'WP_Post' ) ? $post_or_order->ID : 0 );
        $subscription = wcs_get_subscription( $sub_id );
        if ( ! $subscription ) {
            echo '<p>' . esc_html__( 'Unable to load subscription.', 'woo-comprehensive-monitor' ) . '</p>';
            return;
        }

        $already_charged = 'yes' === $subscription->get_meta( '_spd_difference_charged' );
        $price_data      = $this->get_price_difference( $subscription );

        wp_nonce_field( 'wcm_spd_nonce', 'wcm_spd_nonce_field' );

        if ( $already_charged ) {
            $diff_order_id = $subscription->get_meta( '_spd_difference_order_id' );
            echo '<p style="color:#4CAF50;font-weight:bold;">✓ ' . esc_html__( 'Price difference already charged.', 'woo-comprehensive-monitor' ) . '</p>';
            if ( $diff_order_id ) {
                $diff_order = wc_get_order( $diff_order_id );
                if ( $diff_order ) {
                    printf( '<p><a href="%s">%s</a></p>', esc_url( $diff_order->get_edit_order_url() ), sprintf( esc_html__( 'View order #%d', 'woo-comprehensive-monitor' ), $diff_order_id ) );
                }
            }
        } elseif ( ! $price_data ) {
            echo '<p>' . esc_html__( 'No price difference found.', 'woo-comprehensive-monitor' ) . '</p>';
        } else {
            ?>
            <table style="width:100%;margin-bottom:12px;">
                <tr><td><?php esc_html_e( 'Subscription price:', 'woo-comprehensive-monitor' ); ?></td><td style="text-align:right;"><?php echo wc_price( $price_data['subscription_price'] ); ?></td></tr>
                <tr><td><?php esc_html_e( 'Regular price:', 'woo-comprehensive-monitor' ); ?></td><td style="text-align:right;"><?php echo wc_price( $price_data['regular_price'] ); ?></td></tr>
                <tr style="border-top:1px solid #ddd;font-weight:bold;"><td><?php esc_html_e( 'Difference:', 'woo-comprehensive-monitor' ); ?></td><td style="text-align:right;color:#d63638;"><?php echo wc_price( $price_data['difference'] ); ?></td></tr>
            </table>
            <?php foreach ( $price_data['items'] as $item ) : ?>
                <p class="description" style="margin-bottom:4px;">&bull; <?php echo esc_html( $item['product_name'] ); ?> (×<?php echo (int) $item['qty']; ?>): <?php echo wc_price( $item['subscription_price'] ); ?> → <?php echo wc_price( $item['regular_price'] ); ?></p>
            <?php endforeach; ?>
            <button type="button" id="wcm-spd-charge-btn" class="button button-primary" data-subscription-id="<?php echo esc_attr( $subscription->get_id() ); ?>" style="margin-top:12px;width:100%;">
                <?php printf( esc_html__( 'Charge %s Difference', 'woo-comprehensive-monitor' ), wp_strip_all_tags( wc_price( $price_data['difference'] ) ) ); ?>
            </button>
            <div id="wcm-spd-result" style="margin-top:8px;display:none;"></div>
            <?php
        }
    }

    // ==========================================================
    // ADMIN: SUBSCRIPTION LIST COLUMN
    // ==========================================================

    public function add_list_column( $columns ) {
        $columns['wcm_spd_status'] = __( 'Price Diff', 'woo-comprehensive-monitor' );
        return $columns;
    }

    public function render_list_column( $column, $post_id ) {
        if ( 'wcm_spd_status' !== $column ) {
            return;
        }
        $subscription = wcs_get_subscription( $post_id );
        if ( ! $subscription ) {
            echo '—';
            return;
        }
        if ( 'yes' === $subscription->get_meta( '_spd_difference_charged' ) ) {
            echo '<span style="color:#4CAF50;font-weight:bold;">Charged</span>';
        } else {
            $data = $this->get_price_difference( $subscription );
            echo $data ? '<span style="color:#FF9800;font-weight:bold;">' . wc_price( $data['difference'] ) . '</span>' : '—';
        }
    }

    // ==========================================================
    // ADMIN: AJAX
    // ==========================================================

    public function ajax_charge_difference() {
        check_ajax_referer( 'wcm_spd_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( 'Permission denied.' );
        }

        $sub_id = isset( $_POST['subscription_id'] ) ? absint( $_POST['subscription_id'] ) : 0;
        if ( ! $sub_id ) {
            wp_send_json_error( 'Missing subscription ID.' );
        }

        $result = $this->charge_difference( $sub_id, 'admin' );
        if ( ! $result ) {
            wp_send_json_error( 'Failed to charge. Already charged or no difference.' );
        }
        wp_send_json_success( $result );
    }

    public function ajax_preview_difference() {
        check_ajax_referer( 'wcm_spd_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( 'Permission denied.' );
        }

        $sub_id = isset( $_POST['subscription_id'] ) ? absint( $_POST['subscription_id'] ) : 0;
        $data   = $this->get_price_difference( $sub_id );
        if ( ! $data ) {
            wp_send_json_error( 'No price difference.' );
        }
        wp_send_json_success( $data );
    }

    // ==========================================================
    // ADMIN: ASSETS
    // ==========================================================

    public function enqueue_admin_assets( $hook ) {
        $screen = get_current_screen();
        if ( ! $screen ) {
            return;
        }

        $allowed = array( 'shop_subscription', 'woocommerce_page_wc-orders--shop_subscription' );
        if ( ! in_array( $screen->id, $allowed, true ) ) {
            return;
        }

        wp_add_inline_script( 'jquery', "
            jQuery(function($) {
                $('#wcm-spd-charge-btn').on('click', function() {
                    var btn = $(this), result = $('#wcm-spd-result');
                    if (!confirm('Are you sure you want to charge this customer the price difference?')) return;
                    btn.prop('disabled', true).text('Processing...');
                    result.hide();
                    $.post(ajaxurl, {
                        action: 'wcm_spd_charge',
                        subscription_id: btn.data('subscription-id'),
                        nonce: $('#wcm_spd_nonce_field').val()
                    }, function(r) {
                        if (r.success) {
                            result.html('<p style=\"color:#4CAF50;\">✓ Charged! Order #' + r.data.order_id + ' created.</p>').show();
                            btn.hide();
                        } else {
                            result.html('<p style=\"color:#d63638;\">Error: ' + (r.data || 'Unknown') + '</p>').show();
                            btn.prop('disabled', false).text('Retry');
                        }
                    }).fail(function() {
                        result.html('<p style=\"color:#d63638;\">Request failed.</p>').show();
                        btn.prop('disabled', false).text('Retry');
                    });
                });
            });
        " );
    }

    // ==========================================================
    // FRONTEND: CUSTOMER SELF-SERVICE CONVERSION
    // ==========================================================

    public function render_conversion_ui( $subscription ) {
        if ( ! $subscription || $subscription->get_customer_id() !== get_current_user_id() ) {
            return;
        }
        if ( ! in_array( $subscription->get_status(), array( 'active', 'on-hold' ), true ) ) {
            return;
        }

        $already_charged = 'yes' === $subscription->get_meta( '_spd_difference_charged' );
        $price_data      = $this->get_price_difference( $subscription );
        if ( ! $price_data ) {
            return;
        }
        ?>
        <div class="wcm-spd-convert" style="margin:20px 0;padding:20px;background:#f8f9fa;border:1px solid #ddd;border-radius:4px;">
            <h3><?php esc_html_e( 'Convert to One-Time Purchase', 'woo-comprehensive-monitor' ); ?></h3>

            <?php if ( $already_charged ) : ?>
                <p style="color:#4CAF50;font-weight:bold;"><?php esc_html_e( 'Already converted to one-time purchase.', 'woo-comprehensive-monitor' ); ?></p>
                <?php
                $diff_order_id = $subscription->get_meta( '_spd_difference_order_id' );
                if ( $diff_order_id ) {
                    $diff_order = wc_get_order( $diff_order_id );
                    if ( $diff_order && ! $diff_order->is_paid() ) {
                        printf( '<p><a href="%s" class="button">%s</a></p>', esc_url( $diff_order->get_checkout_payment_url() ), esc_html__( 'Pay Remaining Balance', 'woo-comprehensive-monitor' ) );
                    }
                }
                ?>
            <?php else : ?>
                <p><?php esc_html_e( 'Convert this subscription to a one-time purchase. The price difference between your subscription discount and the regular price will be charged.', 'woo-comprehensive-monitor' ); ?></p>
                <table class="shop_table" style="margin:10px 0;">
                    <?php foreach ( $price_data['items'] as $item ) : ?>
                    <tr>
                        <td><strong><?php echo esc_html( $item['product_name'] ); ?></strong><?php if ( $item['qty'] > 1 ) echo ' × ' . (int) $item['qty']; ?></td>
                        <td><?php echo wc_price( $item['subscription_price'] ); ?> → <?php echo wc_price( $item['regular_price'] ); ?></td>
                    </tr>
                    <?php endforeach; ?>
                    <tr style="font-weight:bold;border-top:2px solid #ddd;">
                        <td><?php esc_html_e( 'Additional amount due:', 'woo-comprehensive-monitor' ); ?></td>
                        <td style="color:#d63638;"><?php echo wc_price( $price_data['difference'] ); ?></td>
                    </tr>
                </table>
                <p style="font-size:13px;color:#666;"><?php esc_html_e( 'Your subscription will be cancelled and you will be charged the difference.', 'woo-comprehensive-monitor' ); ?></p>
                <button type="button" id="wcm-spd-convert-btn" class="button alt" data-subscription-id="<?php echo esc_attr( $subscription->get_id() ); ?>">
                    <?php printf( esc_html__( 'Pay %s & Convert', 'woo-comprehensive-monitor' ), wp_strip_all_tags( wc_price( $price_data['difference'] ) ) ); ?>
                </button>
                <div id="wcm-spd-convert-result" style="display:none;margin-top:12px;"></div>
            <?php endif; ?>
        </div>
        <?php
    }

    public function ajax_customer_convert() {
        check_ajax_referer( 'wcm_spd_customer_nonce', 'nonce' );
        if ( ! is_user_logged_in() ) {
            wp_send_json_error( 'You must be logged in.' );
        }

        $sub_id       = isset( $_POST['subscription_id'] ) ? absint( $_POST['subscription_id'] ) : 0;
        $subscription = function_exists( 'wcs_get_subscription' ) ? wcs_get_subscription( $sub_id ) : null;
        if ( ! $subscription || $subscription->get_customer_id() !== get_current_user_id() ) {
            wp_send_json_error( 'Invalid subscription.' );
        }

        $result = $this->charge_difference( $subscription, 'customer' );
        if ( ! $result ) {
            wp_send_json_error( 'Failed to charge or already charged.' );
        }

        // Cancel or set pending-cancel based on payment result
        if ( 'completed' === $result['status'] ) {
            $subscription->update_status( 'cancelled', __( 'Customer converted to one-time purchase via WC Monitor.', 'woo-comprehensive-monitor' ) );
        } else {
            $subscription->update_status( 'pending-cancel', __( 'Pending: awaiting price difference payment.', 'woo-comprehensive-monitor' ) );
        }

        wp_send_json_success( $result );
    }

    public function enqueue_frontend_assets() {
        if ( ! is_account_page() || ! function_exists( 'is_wc_endpoint_url' ) || ! is_wc_endpoint_url( 'view-subscription' ) ) {
            return;
        }

        wp_add_inline_script( 'jquery', "
            jQuery(function($) {
                $('#wcm-spd-convert-btn').on('click', function() {
                    var btn = $(this), result = $('#wcm-spd-convert-result');
                    if (!confirm('Are you sure? You will be charged the price difference and your subscription will be cancelled.')) return;
                    btn.prop('disabled', true).text('Processing...');
                    result.hide();
                    $.post('" . admin_url( 'admin-ajax.php' ) . "', {
                        action: 'wcm_spd_customer_convert',
                        subscription_id: btn.data('subscription-id'),
                        nonce: '" . wp_create_nonce( 'wcm_spd_customer_nonce' ) . "'
                    }, function(r) {
                        if (r.success) {
                            if (r.data.status === 'completed') {
                                result.html('<p style=\"color:#4CAF50;\">✓ Converted! Difference charged successfully.</p>').show();
                            } else {
                                result.html('<p style=\"color:#FF9800;\">Conversion started. <a href=\"' + r.data.pay_url + '\">Complete payment</a>.</p>').show();
                            }
                            btn.hide();
                        } else {
                            result.html('<p style=\"color:#d63638;\">Error: ' + (r.data || 'Unknown') + '</p>').show();
                            btn.prop('disabled', false).text('Retry');
                        }
                    }).fail(function() {
                        result.html('<p style=\"color:#d63638;\">Request failed.</p>').show();
                        btn.prop('disabled', false).text('Retry');
                    });
                });
            });
        " );
    }

    // ==========================================================
    // STATS (for dashboard)
    // ==========================================================

    public function get_stats() {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_recovery_log';

        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return array( 'total' => 0, 'charged' => 0, 'pending' => 0, 'total_amount' => 0 );
        }

        return array(
            'total'        => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE notes LIKE '%Price diff%'" ),
            'charged'      => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE notes LIKE '%Price diff%' AND charge_status = 'charged'" ),
            'pending'      => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE notes LIKE '%Price diff%' AND charge_status = 'pending'" ),
            'total_amount' => (float) $wpdb->get_var( "SELECT COALESCE(SUM(discount_amount), 0) FROM {$table} WHERE notes LIKE '%Price diff%' AND charge_status = 'charged'" ),
        );
    }
}
