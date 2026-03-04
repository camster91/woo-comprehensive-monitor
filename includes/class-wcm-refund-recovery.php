<?php
/**
 * Subscription Discount Recovery — charges customers who cancel early
 * the difference between regular and subscription pricing.
 * Ported from Wp-Refund plugin.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Refund_Recovery {

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
        // WPSubscription cancellation hooks
        add_action( 'wpsubscription_subscription_status_changed', array( $this, 'handle_status_change' ), 10, 3 );

        // WooCommerce Subscriptions cancellation hook (if active)
        add_action( 'woocommerce_subscription_status_cancelled', array( $this, 'handle_wcs_cancellation' ) );
        add_action( 'woocommerce_subscription_status_pending-cancel', array( $this, 'handle_wcs_cancellation' ) );

        // My Account integration
        add_action( 'init', array( $this, 'add_endpoints' ) );
        add_filter( 'woocommerce_account_menu_items', array( $this, 'add_menu_item' ) );
        add_action( 'woocommerce_account_recovery-charges_endpoint', array( $this, 'render_recovery_charges_page' ) );

        // Admin: show recovery info on order page
        add_action( 'woocommerce_admin_order_data_after_billing_address', array( $this, 'show_recovery_info_on_order' ) );

        // Frontend: show recovery warning on subscription page
        add_action( 'wpsubscription_subscription_details_after_table', array( $this, 'show_recovery_notice' ) );

        // Enqueue cancel confirmation JS
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_scripts' ) );
        add_action( 'wp_footer', array( $this, 'output_cancel_confirmation_data' ) );
    }

    // ==========================================================
    // SETTINGS HELPERS
    // ==========================================================

    public static function is_enabled() {
        return 'yes' === get_option( 'wcm_recovery_enabled', 'yes' );
    }

    public static function get_minimum_orders() {
        return max( 1, absint( get_option( 'wcm_recovery_minimum_orders', 2 ) ) );
    }

    public static function get_grace_period_days() {
        return absint( get_option( 'wcm_recovery_grace_period', 0 ) );
    }

    public static function get_charge_method() {
        return get_option( 'wcm_recovery_charge_method', 'manual' );
    }

    public static function is_user_exempt( $user_id ) {
        $exempt_roles = (array) get_option( 'wcm_recovery_exempt_roles', array() );
        if ( empty( $exempt_roles ) ) {
            return false;
        }
        $user = get_userdata( $user_id );
        if ( ! $user ) {
            return false;
        }
        return ! empty( array_intersect( $user->roles, $exempt_roles ) );
    }

    // ==========================================================
    // DISCOUNT CALCULATOR
    // ==========================================================

    /**
     * Calculate the discount difference for a subscription.
     *
     * @param int $subscription_id
     * @return array|false
     */
    public function calculate_discount( $subscription_id ) {
        // Try WPSubscription first
        $orders = $this->get_subscription_orders( $subscription_id );
        if ( empty( $orders ) ) {
            return false;
        }

        $regular_total      = 0;
        $subscription_total = 0;
        $line_items         = array();
        $completed_count    = 0;

        foreach ( $orders as $order ) {
            if ( ! $order instanceof WC_Order ) {
                $order = wc_get_order( $order );
            }
            if ( ! $order || ! in_array( $order->get_status(), array( 'completed', 'processing' ), true ) ) {
                continue;
            }
            $completed_count++;

            foreach ( $order->get_items() as $item ) {
                $product = $item->get_product();
                if ( ! $product ) {
                    continue;
                }

                $qty           = $item->get_quantity();
                $regular_price = (float) $product->get_regular_price() * $qty;
                $paid_price    = (float) $item->get_subtotal();
                $discount      = $regular_price - $paid_price;

                if ( $discount > 0 ) {
                    $regular_total      += $regular_price;
                    $subscription_total += $paid_price;
                    $line_items[]        = array(
                        'product_name'    => $product->get_name(),
                        'regular_price'   => $regular_price,
                        'paid_price'      => $paid_price,
                        'discount_amount' => $discount,
                        'order_id'        => $order->get_id(),
                    );
                }
            }
        }

        $discount_total = $regular_total - $subscription_total;

        if ( $discount_total <= 0 ) {
            return false;
        }

        return array(
            'discount_total'     => round( $discount_total, 2 ),
            'regular_total'      => round( $regular_total, 2 ),
            'subscription_total' => round( $subscription_total, 2 ),
            'orders_completed'   => $completed_count,
            'line_items'         => $line_items,
        );
    }

    /**
     * Check if a subscription qualifies for recovery charge.
     */
    public function qualifies_for_recovery( $subscription_id, $customer_id ) {
        if ( ! self::is_enabled() ) {
            return false;
        }
        if ( self::is_user_exempt( $customer_id ) ) {
            return false;
        }

        // Grace period check
        $grace_days = self::get_grace_period_days();
        if ( $grace_days > 0 ) {
            $sub_date = $this->get_subscription_start_date( $subscription_id );
            if ( $sub_date && ( time() - strtotime( $sub_date ) ) < ( $grace_days * DAY_IN_SECONDS ) ) {
                return false;
            }
        }

        $calculation = $this->calculate_discount( $subscription_id );
        if ( ! $calculation || $calculation['discount_total'] <= 0 ) {
            return false;
        }

        // Check minimum orders
        if ( $calculation['orders_completed'] >= self::get_minimum_orders() ) {
            return false; // Met commitment — no recovery needed
        }

        return $calculation;
    }

    // ==========================================================
    // SUBSCRIPTION HELPERS (multi-plugin)
    // ==========================================================

    private function get_subscription_orders( $subscription_id ) {
        // WPSubscription
        if ( class_exists( 'WPSubscription' ) || defined( 'WPS_PLUGIN_DIR' ) ) {
            return $this->get_wps_subscription_orders( $subscription_id );
        }
        // WooCommerce Subscriptions
        if ( function_exists( 'wcs_get_subscription' ) ) {
            $sub = wcs_get_subscription( $subscription_id );
            if ( $sub ) {
                return $sub->get_related_orders( 'all', array( 'parent', 'renewal' ) );
            }
        }
        return array();
    }

    private function get_wps_subscription_orders( $subscription_id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wps_subscriptions';
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return array();
        }

        $sub = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $subscription_id ) );
        if ( ! $sub ) {
            return array();
        }

        $orders   = array();
        $parent   = wc_get_order( $sub->order_id ?? 0 );
        if ( $parent ) {
            $orders[] = $parent;
        }

        // Get renewal orders
        $renewals = $wpdb->get_col( $wpdb->prepare(
            "SELECT DISTINCT pm.post_id FROM {$wpdb->postmeta} pm WHERE pm.meta_key = '_subscription_renewal' AND pm.meta_value = %s",
            $subscription_id
        ) );
        foreach ( $renewals as $rid ) {
            $ro = wc_get_order( $rid );
            if ( $ro ) {
                $orders[] = $ro;
            }
        }
        return $orders;
    }

    private function get_subscription_start_date( $subscription_id ) {
        global $wpdb;
        if ( class_exists( 'WPSubscription' ) || defined( 'WPS_PLUGIN_DIR' ) ) {
            $table = $wpdb->prefix . 'wps_subscriptions';
            return $wpdb->get_var( $wpdb->prepare( "SELECT created_at FROM {$table} WHERE id = %d", $subscription_id ) );
        }
        if ( function_exists( 'wcs_get_subscription' ) ) {
            $sub = wcs_get_subscription( $subscription_id );
            return $sub ? $sub->get_date( 'start' ) : null;
        }
        return null;
    }

    private function get_subscription_customer_id( $subscription_id ) {
        global $wpdb;
        if ( class_exists( 'WPSubscription' ) || defined( 'WPS_PLUGIN_DIR' ) ) {
            $table = $wpdb->prefix . 'wps_subscriptions';
            return (int) $wpdb->get_var( $wpdb->prepare( "SELECT customer_id FROM {$table} WHERE id = %d", $subscription_id ) );
        }
        if ( function_exists( 'wcs_get_subscription' ) ) {
            $sub = wcs_get_subscription( $subscription_id );
            return $sub ? $sub->get_customer_id() : 0;
        }
        return 0;
    }

    // ==========================================================
    // CANCELLATION HANDLERS
    // ==========================================================

    public function handle_status_change( $subscription_id, $old_status, $new_status ) {
        if ( ! in_array( $new_status, array( 'cancelled', 'wps-cancelled', 'pending-cancel' ), true ) ) {
            return;
        }
        $this->process_recovery( $subscription_id, 'wpsubscription' );
    }

    public function handle_wcs_cancellation( $subscription ) {
        $this->process_recovery( $subscription->get_id(), 'woocommerce_subscriptions' );
    }

    private function process_recovery( $subscription_id, $trigger ) {
        // Prevent duplicates
        $processed = get_transient( 'wcm_recovery_processed_' . $subscription_id );
        if ( $processed ) {
            return;
        }
        set_transient( 'wcm_recovery_processed_' . $subscription_id, true, HOUR_IN_SECONDS );

        $customer_id = $this->get_subscription_customer_id( $subscription_id );
        if ( ! $customer_id ) {
            return;
        }

        $calculation = $this->qualifies_for_recovery( $subscription_id, $customer_id );
        if ( ! $calculation ) {
            return;
        }

        // Create recovery charge
        if ( 'automatic' === self::get_charge_method() ) {
            $result = $this->create_and_charge( $subscription_id, $customer_id, $calculation );
        } else {
            $result = $this->create_pending_charge( $subscription_id, $customer_id, $calculation );
        }

        // Log the recovery
        $this->log_recovery( $subscription_id, $customer_id, $calculation, $result );

        // Send notifications
        $this->send_notifications( $subscription_id, $customer_id, $calculation, $result );

        // Notify monitoring server
        $this->notify_monitoring_server( $subscription_id, $customer_id, $calculation, $result );
    }

    // ==========================================================
    // CHARGE CREATION
    // ==========================================================

    private function create_and_charge( $subscription_id, $customer_id, $calculation ) {
        $order = $this->create_recovery_order( $subscription_id, $customer_id, $calculation );
        if ( is_wp_error( $order ) ) {
            return array( 'status' => 'failed', 'order_id' => 0, 'message' => $order->get_error_message() );
        }

        // Attempt payment with saved method
        $charged = $this->process_payment( $order, $subscription_id );
        if ( $charged ) {
            return array( 'status' => 'charged', 'order_id' => $order->get_id(), 'message' => 'Successfully charged.' );
        }

        return array( 'status' => 'pending', 'order_id' => $order->get_id(), 'message' => 'Auto-charge failed. Order created for manual processing.' );
    }

    private function create_pending_charge( $subscription_id, $customer_id, $calculation ) {
        $order = $this->create_recovery_order( $subscription_id, $customer_id, $calculation );
        if ( is_wp_error( $order ) ) {
            return array( 'status' => 'failed', 'order_id' => 0, 'message' => $order->get_error_message() );
        }
        return array( 'status' => 'pending', 'order_id' => $order->get_id(), 'message' => 'Pending order created.' );
    }

    private function create_recovery_order( $subscription_id, $customer_id, $calculation ) {
        $order = wc_create_order( array( 'customer_id' => $customer_id ) );
        if ( is_wp_error( $order ) ) {
            return $order;
        }

        // Add fee item for recovery amount
        $fee = new WC_Order_Item_Fee();
        $fee->set_name( sprintf( __( 'Subscription Discount Recovery (Sub #%d)', 'woo-comprehensive-monitor' ), $subscription_id ) );
        $fee->set_amount( $calculation['discount_total'] );
        $fee->set_total( $calculation['discount_total'] );
        $fee->set_tax_status( 'none' );
        $order->add_item( $fee );

        // Copy billing from an existing subscription order
        $sub_orders = $this->get_subscription_orders( $subscription_id );
        if ( ! empty( $sub_orders ) ) {
            $source_order = is_numeric( $sub_orders[0] ) ? wc_get_order( $sub_orders[0] ) : $sub_orders[0];
            if ( $source_order ) {
                $order->set_billing_first_name( $source_order->get_billing_first_name() );
                $order->set_billing_last_name( $source_order->get_billing_last_name() );
                $order->set_billing_email( $source_order->get_billing_email() );
                $order->set_billing_phone( $source_order->get_billing_phone() );
                $order->set_billing_address_1( $source_order->get_billing_address_1() );
                $order->set_billing_city( $source_order->get_billing_city() );
                $order->set_billing_state( $source_order->get_billing_state() );
                $order->set_billing_postcode( $source_order->get_billing_postcode() );
                $order->set_billing_country( $source_order->get_billing_country() );
                $order->set_payment_method( $source_order->get_payment_method() );
                $order->set_payment_method_title( $source_order->get_payment_method_title() );
            }
        }

        // Meta data
        $order->update_meta_data( '_wcm_recovery_order', 'yes' );
        $order->update_meta_data( '_wcm_subscription_id', $subscription_id );
        $order->update_meta_data( '_wcm_recovery_amount', $calculation['discount_total'] );
        $order->update_meta_data( '_wcm_regular_total', $calculation['regular_total'] );
        $order->update_meta_data( '_wcm_subscription_total', $calculation['subscription_total'] );

        $order->calculate_totals();
        $order->set_status( 'pending', __( 'Recovery charge for early subscription cancellation.', 'woo-comprehensive-monitor' ) );
        $order->save();

        return $order;
    }

    private function process_payment( $order, $subscription_id ) {
        // Try to charge saved payment method via Stripe
        if ( ! class_exists( 'WC_Stripe_API' ) || ! class_exists( 'WC_Stripe_Helper' ) ) {
            return false;
        }

        // Get Stripe customer ID and payment method from a previous order
        $sub_orders = $this->get_subscription_orders( $subscription_id );
        $stripe_customer_id = '';
        $payment_method_id  = '';

        foreach ( $sub_orders as $so ) {
            $so = is_numeric( $so ) ? wc_get_order( $so ) : $so;
            if ( ! $so ) continue;
            if ( empty( $stripe_customer_id ) ) $stripe_customer_id = $so->get_meta( '_stripe_customer_id' );
            if ( empty( $payment_method_id ) ) $payment_method_id = $so->get_meta( '_stripe_source_id' ) ?: $so->get_meta( '_stripe_payment_method' );
            if ( $stripe_customer_id && $payment_method_id ) break;
        }

        if ( empty( $stripe_customer_id ) || empty( $payment_method_id ) ) {
            $order->add_order_note( __( 'Auto-charge failed: no saved Stripe payment method found.', 'woo-comprehensive-monitor' ) );
            return false;
        }

        $amount   = $order->get_total();
        $currency = strtolower( $order->get_currency() );

        $request = array(
            'amount'         => WC_Stripe_Helper::get_stripe_amount( $amount, $currency ),
            'currency'       => $currency,
            'customer'       => $stripe_customer_id,
            'payment_method' => $payment_method_id,
            'confirm'        => 'true',
            'off_session'    => 'true',
            'description'    => sprintf( '%s - Recovery Charge #%s', wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $order->get_order_number() ),
            'metadata'       => array( 'order_id' => $order->get_id() ),
        );

        $response = WC_Stripe_API::request( $request, 'payment_intents' );

        if ( is_wp_error( $response ) || ! empty( $response->error ) ) {
            $error = is_wp_error( $response ) ? $response->get_error_message() : ( $response->error->message ?? 'Unknown' );
            $order->add_order_note( sprintf( __( 'Auto-charge failed: %s', 'woo-comprehensive-monitor' ), $error ) );
            return false;
        }

        if ( isset( $response->status ) && 'succeeded' === $response->status ) {
            $order->set_transaction_id( $response->id );
            $order->payment_complete( $response->id );
            $order->add_order_note( sprintf( __( 'Recovery charge successful. PaymentIntent: %s', 'woo-comprehensive-monitor' ), $response->id ) );
            return true;
        }

        return false;
    }

    // ==========================================================
    // LOGGING
    // ==========================================================

    private function log_recovery( $subscription_id, $customer_id, $calculation, $result ) {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_recovery_log';

        $wpdb->insert( $table, array(
            'subscription_id'    => $subscription_id,
            'customer_id'        => $customer_id,
            'recovery_order_id'  => $result['order_id'] ?? 0,
            'discount_amount'    => $calculation['discount_total'],
            'regular_total'      => $calculation['regular_total'],
            'subscription_total' => $calculation['subscription_total'],
            'charge_status'      => $result['status'],
            'charge_date'        => 'charged' === $result['status'] ? current_time( 'mysql' ) : null,
            'notes'              => $result['message'],
            'created_at'         => current_time( 'mysql' ),
        ) );
    }

    // ==========================================================
    // NOTIFICATIONS
    // ==========================================================

    private function send_notifications( $subscription_id, $customer_id, $calculation, $result ) {
        $user = get_userdata( $customer_id );
        if ( ! $user ) return;

        // Customer notification
        if ( 'yes' === get_option( 'wcm_recovery_notify_customer', 'yes' ) ) {
            $subject = sprintf( '[%s] Subscription Cancellation — Discount Recovery', get_bloginfo( 'name' ) );
            $message = sprintf(
                "Hello %s,\n\nYour subscription #%d has been cancelled before the minimum commitment period.\n\n" .
                "Regular price total: %s\nYou paid: %s\nRecovery charge: %s\n\nStatus: %s\n\n" .
                "If you have questions, please contact us.\n\n%s",
                $user->display_name,
                $subscription_id,
                wc_price( $calculation['regular_total'] ),
                wc_price( $calculation['subscription_total'] ),
                wc_price( $calculation['discount_total'] ),
                ucfirst( $result['status'] ),
                get_bloginfo( 'name' )
            );
            wp_mail( $user->user_email, $subject, $message );
        }

        // Admin notification
        if ( 'yes' === get_option( 'wcm_recovery_notify_admin', 'yes' ) ) {
            $admin_email = get_option( 'wcm_alert_email', get_bloginfo( 'admin_email' ) );
            $subject     = sprintf( '[%s] Discount Recovery — Subscription #%d', get_bloginfo( 'name' ), $subscription_id );
            $message     = sprintf(
                "Recovery charge processed.\n\nSubscription: #%d\nCustomer: %s (ID: %d)\n" .
                "Regular Total: %s\nPaid: %s\nRecovery: %s\nStatus: %s\nOrder: %s",
                $subscription_id,
                $user->display_name,
                $customer_id,
                wc_price( $calculation['regular_total'] ),
                wc_price( $calculation['subscription_total'] ),
                wc_price( $calculation['discount_total'] ),
                $result['status'],
                $result['order_id'] ? admin_url( 'post.php?post=' . $result['order_id'] . '&action=edit' ) : 'N/A'
            );
            wp_mail( $admin_email, $subject, $message );
        }
    }

    private function notify_monitoring_server( $subscription_id, $customer_id, $calculation, $result ) {
        $server = get_option( 'wcm_monitoring_server', '' );
        if ( empty( $server ) ) return;

        wp_remote_post( $server, array(
            'method'   => 'POST',
            'timeout'  => 5,
            'blocking' => false,
            'headers'  => array( 'Content-Type' => 'application/json' ),
            'body'     => wp_json_encode( array(
                'type'            => 'subscription_recovery',
                'store_url'       => home_url(),
                'store_name'      => get_bloginfo( 'name' ),
                'subscription_id' => $subscription_id,
                'customer_id'     => $customer_id,
                'amount'          => $calculation['discount_total'],
                'status'          => $result['status'],
                'timestamp'       => current_time( 'mysql' ),
            ) ),
        ) );
    }

    // ==========================================================
    // MY ACCOUNT INTEGRATION
    // ==========================================================

    public function add_endpoints() {
        add_rewrite_endpoint( 'recovery-charges', EP_ROOT | EP_PAGES );
    }

    public function add_menu_item( $items ) {
        if ( ! self::is_enabled() ) return $items;

        $new_items = array();
        foreach ( $items as $key => $label ) {
            $new_items[ $key ] = $label;
            if ( 'orders' === $key ) {
                $new_items['recovery-charges'] = __( 'Recovery Charges', 'woo-comprehensive-monitor' );
            }
        }
        return $new_items;
    }

    public function render_recovery_charges_page() {
        $customer_id = get_current_user_id();
        if ( ! $customer_id ) return;

        global $wpdb;
        $table   = $wpdb->prefix . 'wcm_recovery_log';
        $charges = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$table} WHERE customer_id = %d ORDER BY created_at DESC",
            $customer_id
        ) );

        if ( empty( $charges ) ) {
            echo '<p>' . esc_html__( 'No recovery charges found.', 'woo-comprehensive-monitor' ) . '</p>';
            return;
        }

        echo '<table class="woocommerce-orders-table shop_table shop_table_responsive"><thead><tr>';
        echo '<th>' . esc_html__( 'Date', 'woo-comprehensive-monitor' ) . '</th>';
        echo '<th>' . esc_html__( 'Subscription', 'woo-comprehensive-monitor' ) . '</th>';
        echo '<th>' . esc_html__( 'Amount', 'woo-comprehensive-monitor' ) . '</th>';
        echo '<th>' . esc_html__( 'Status', 'woo-comprehensive-monitor' ) . '</th>';
        echo '</tr></thead><tbody>';

        foreach ( $charges as $charge ) {
            echo '<tr>';
            echo '<td>' . esc_html( date_i18n( get_option( 'date_format' ), strtotime( $charge->created_at ) ) ) . '</td>';
            echo '<td>#' . esc_html( $charge->subscription_id ) . '</td>';
            echo '<td>' . wc_price( $charge->discount_amount ) . '</td>';
            echo '<td>' . esc_html( ucfirst( $charge->charge_status ) ) . '</td>';
            echo '</tr>';
        }

        echo '</tbody></table>';
    }

    public function show_recovery_notice( $subscription ) {
        if ( ! self::is_enabled() ) return;

        $sub_id = is_object( $subscription ) ? ( method_exists( $subscription, 'get_id' ) ? $subscription->get_id() : $subscription->id ) : $subscription;
        $customer_id = get_current_user_id();
        if ( ! $customer_id ) return;

        $calculation = $this->qualifies_for_recovery( $sub_id, $customer_id );
        if ( ! $calculation ) return;

        echo '<div class="woocommerce-info" style="background:#fff3cd;border-color:#ffc107;padding:15px;margin:15px 0;">';
        echo '<strong>' . esc_html__( '⚠️ Early Cancellation Notice', 'woo-comprehensive-monitor' ) . '</strong><br>';
        printf(
            esc_html__( 'If you cancel this subscription before completing %d orders, a recovery charge of %s will apply (difference between regular price %s and your subscription price %s).', 'woo-comprehensive-monitor' ),
            self::get_minimum_orders(),
            wc_price( $calculation['discount_total'] ),
            wc_price( $calculation['regular_total'] ),
            wc_price( $calculation['subscription_total'] )
        );
        echo '</div>';
    }

    public function show_recovery_info_on_order( $order ) {
        if ( 'yes' !== $order->get_meta( '_wcm_recovery_order' ) ) return;

        $sub_id = $order->get_meta( '_wcm_subscription_id' );
        $amount = $order->get_meta( '_wcm_recovery_amount' );
        echo '<div style="margin-top:12px;padding:8px 12px;background:#fff3cd;border-left:4px solid #ffc107;">';
        echo '<strong>' . esc_html__( 'Recovery Charge', 'woo-comprehensive-monitor' ) . '</strong><br>';
        printf( 'Subscription: #%s | Recovery Amount: %s', esc_html( $sub_id ), wc_price( $amount ) );
        echo '</div>';
    }

    // ==========================================================
    // FRONTEND SCRIPTS
    // ==========================================================

    public function enqueue_frontend_scripts() {
        if ( ! self::is_enabled() || ! is_account_page() ) return;

        wp_enqueue_style( 'wcm-my-account', WCM_PLUGIN_URL . 'assets/css/my-account.css', array(), WCM_VERSION );
    }

    public function output_cancel_confirmation_data() {
        if ( ! self::is_enabled() || ! is_account_page() ) return;

        $customer_id = get_current_user_id();
        if ( ! $customer_id ) return;

        // Build recovery data for all active subscriptions
        $recovery_data = array();
        // This will be populated dynamically when subscription pages load
        ?>
        <script>
        jQuery(function($) {
            $('a[href*="cancel"]').on('click', function(e) {
                var href = $(this).attr('href');
                var match = href.match(/subscription[_-]?id[=\/](\d+)/i);
                if (!match) return;
                var msg = '<?php echo esc_js( __( 'Warning: Cancelling this subscription early may result in a recovery charge for the discount difference. Are you sure?', 'woo-comprehensive-monitor' ) ); ?>';
                if (!confirm(msg)) {
                    e.preventDefault();
                }
            });
        });
        </script>
        <?php
    }

    // ==========================================================
    // ADMIN: GET RECOVERY LOG DATA
    // ==========================================================

    public function get_recovery_log( $per_page = 25, $page = 1 ) {
        global $wpdb;
        $table  = $wpdb->prefix . 'wcm_recovery_log';
        $offset = ( $page - 1 ) * $per_page;

        return $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $per_page,
            $offset
        ) );
    }

    public function get_recovery_stats() {
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_recovery_log';

        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return array( 'total' => 0, 'charged' => 0, 'pending' => 0, 'failed' => 0, 'total_recovered' => 0 );
        }

        return array(
            'total'           => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ),
            'charged'         => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE charge_status = 'charged'" ),
            'pending'         => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE charge_status = 'pending'" ),
            'failed'          => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE charge_status = 'failed'" ),
            'total_recovered' => (float) $wpdb->get_var( "SELECT COALESCE(SUM(discount_amount), 0) FROM {$table} WHERE charge_status = 'charged'" ),
        );
    }
}
