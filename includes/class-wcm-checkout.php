<?php
/**
 * Checkout — adds subscription acknowledgment checkbox and saves records
 * Ported from woo-dispute-evidence plugin
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Checkout {

    private static $instance = null;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action( 'woocommerce_review_order_before_submit', array( $this, 'add_acknowledgment_checkbox' ) );
        add_action( 'woocommerce_checkout_process', array( $this, 'validate_acknowledgment' ) );
        add_action( 'woocommerce_checkout_create_order', array( $this, 'save_acknowledgment_to_order' ), 10, 2 );
        add_action( 'woocommerce_checkout_order_processed', array( $this, 'save_acknowledgment_data' ), 10, 3 );
    }

    public function add_acknowledgment_checkbox() {
        $force_all = get_option( 'wcm_force_all_products', '0' );
        if ( ! $force_all && ! WCM_Helpers::cart_has_subscription() ) {
            return;
        }
        $text = WCM_Helpers::get_acknowledgment_text();
        ?>
        <div class="wcm-acknowledgment-wrapper" style="margin-bottom: 20px;">
            <label class="woocommerce-form__label woocommerce-form__label-for-checkbox checkbox">
                <input type="checkbox" class="woocommerce-form__input woocommerce-form__input-checkbox input-checkbox" name="wcm_subscription_acknowledgment" id="wcm_subscription_acknowledgment" required />
                <span><?php echo wp_kses_post( $text ); ?></span>
            </label>
        </div>
        <?php
    }

    public function validate_acknowledgment() {
        $force_all = get_option( 'wcm_force_all_products', '0' );
        if ( ! $force_all && ! WCM_Helpers::cart_has_subscription() ) {
            return;
        }
        if ( empty( $_POST['wcm_subscription_acknowledgment'] ) ) {
            wc_add_notice( __( 'You must acknowledge the recurring payment terms before completing your purchase.', 'woo-comprehensive-monitor' ), 'error' );
        }
    }

    public function save_acknowledgment_to_order( $order, $data ) {
        $force_all = get_option( 'wcm_force_all_products', '0' );
        if ( ! $force_all && ! WCM_Helpers::cart_has_subscription() ) {
            return;
        }
        if ( ! empty( $_POST['wcm_subscription_acknowledgment'] ) ) {
            $order->update_meta_data( '_wcm_acknowledgment', 'yes' );
            $order->update_meta_data( '_wcm_acknowledgment_timestamp', current_time( 'mysql' ) );
            $order->update_meta_data( '_wcm_acknowledgment_ip', WCM_Helpers::get_customer_ip() );
        }
    }

    public function save_acknowledgment_data( $order_id, $data, $order ) {
        $force_all = get_option( 'wcm_force_all_products', '0' );
        if ( ! $force_all && ! WCM_Helpers::cart_has_subscription() ) {
            return;
        }

        $customer_id = $order->get_customer_id();
        if ( ! $customer_id ) {
            $user = get_user_by( 'email', $order->get_billing_email() );
            if ( $user ) {
                $customer_id = $user->ID;
            }
        }

        $ip = WCM_Helpers::get_customer_ip();

        if ( $customer_id ) {
            WCM_Helpers::save_acknowledgment( $customer_id, $order_id, $ip );
        } else {
            // Guest checkout
            global $wpdb;
            $wpdb->insert( $wpdb->prefix . 'woo_subscription_acknowledgments', array(
                'user_id'             => 0,
                'order_id'            => $order_id,
                'acknowledgment_text' => WCM_Helpers::get_acknowledgment_text(),
                'ip_address'          => $ip,
                'user_agent'          => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '',
                'created_at'          => current_time( 'mysql' ),
            ) );
        }
    }
}
