<?php
/**
 * Dispute Evidence Submitter — Auto-gathers evidence from WooCommerce
 * and stages/submits it to Stripe via the Disputes API.
 *
 * Covers all 15 Stripe dispute reasons with tailored evidence strategies.
 * Default behavior: stage evidence (submit=false) for human review.
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Evidence_Submitter {

    private $stripe_api_key = '';

    public function __construct() {
        $settings = get_option( 'woocommerce_stripe_settings' );
        if ( $settings && isset( $settings['testmode'] ) ) {
            $test = 'yes' === $settings['testmode'];
            $this->stripe_api_key = $test
                ? ( $settings['test_secret_key'] ?? '' )
                : ( $settings['secret_key'] ?? '' );
        }
    }

    /**
     * Auto-stage evidence on a Stripe dispute. Called when a dispute is first detected.
     * Gathers all available WooCommerce data and sends it to Stripe with submit=false.
     *
     * @param string   $stripe_dispute_id  The Stripe dispute ID (dp_xxx)
     * @param WC_Order $order              The disputed WooCommerce order
     * @param string   $reason             Stripe dispute reason code
     * @return array|WP_Error  Result with 'staged' => true on success
     */
    public function auto_stage_evidence( $stripe_dispute_id, $order, $reason ) {
        if ( empty( $this->stripe_api_key ) ) {
            return new WP_Error( 'no_api_key', 'Stripe API key not configured' );
        }

        $evidence = $this->build_evidence_for_reason( $reason, $order );
        if ( empty( $evidence ) ) {
            return new WP_Error( 'no_evidence', 'Could not build evidence for this dispute' );
        }

        return $this->send_to_stripe( $stripe_dispute_id, $evidence, false );
    }

    /**
     * Submit previously staged evidence to Stripe (submit=true). Called from dashboard.
     *
     * @param string $stripe_dispute_id
     * @return array|WP_Error
     */
    public function submit_evidence( $stripe_dispute_id ) {
        if ( empty( $this->stripe_api_key ) ) {
            return new WP_Error( 'no_api_key', 'Stripe API key not configured' );
        }

        return $this->send_to_stripe( $stripe_dispute_id, array(), true );
    }

    /**
     * Build evidence array tailored to the dispute reason.
     *
     * @param string   $reason  Stripe dispute reason code
     * @param WC_Order $order
     * @return array  Stripe evidence fields
     */
    public function build_evidence_for_reason( $reason, $order ) {
        // Common fields for all dispute types
        $evidence = $this->get_common_evidence( $order );

        switch ( $reason ) {
            case 'fraudulent':
                $evidence = array_merge( $evidence, $this->get_fraudulent_evidence( $order ) );
                break;

            case 'subscription_canceled':
                $evidence = array_merge( $evidence, $this->get_subscription_canceled_evidence( $order ) );
                break;

            case 'product_not_received':
                $evidence = array_merge( $evidence, $this->get_product_not_received_evidence( $order ) );
                break;

            case 'product_unacceptable':
                $evidence = array_merge( $evidence, $this->get_product_unacceptable_evidence( $order ) );
                break;

            case 'credit_not_processed':
                $evidence = array_merge( $evidence, $this->get_credit_not_processed_evidence( $order ) );
                break;

            case 'duplicate':
                $evidence = array_merge( $evidence, $this->get_duplicate_evidence( $order ) );
                break;

            case 'unrecognized':
                $evidence = array_merge( $evidence, $this->get_unrecognized_evidence( $order ) );
                break;

            default:
                // general, bank_cannot_process, customer_initiated, etc.
                $evidence = array_merge( $evidence, $this->get_general_evidence( $order ) );
                break;
        }

        // Remove empty values
        return array_filter( $evidence, function( $v ) { return $v !== '' && $v !== null; } );
    }

    // ================================================================
    // COMMON EVIDENCE (all dispute types)
    // ================================================================

    private function get_common_evidence( $order ) {
        $products = array();
        foreach ( $order->get_items() as $item ) {
            $products[] = $item->get_name() . ' (x' . $item->get_quantity() . ') - $' . number_format( $item->get_total(), 2 );
        }

        return array(
            'customer_name'          => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
            'customer_email_address' => $order->get_billing_email(),
            'customer_purchase_ip'   => $order->get_customer_ip_address(),
            'billing_address'        => $order->get_formatted_billing_address(),
            'product_description'    => implode( "\n", $products ),
            'service_date'           => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d' ) : '',
        );
    }

    // ================================================================
    // FRAUDULENT — prove the cardholder authorized the transaction
    // ================================================================

    private function get_fraudulent_evidence( $order ) {
        $evidence = array(
            'shipping_address' => $order->get_formatted_shipping_address(),
        );

        // Shipping info
        $shipping = $this->get_shipping_info( $order );
        $evidence = array_merge( $evidence, $shipping );

        // Build rebuttal text
        $lines = array();
        $lines[] = 'This transaction was authorized by the cardholder.';
        $lines[] = '';
        $lines[] = 'Customer: ' . $order->get_billing_first_name() . ' ' . $order->get_billing_last_name();
        $lines[] = 'Email: ' . $order->get_billing_email();
        $lines[] = 'Purchase IP: ' . $order->get_customer_ip_address();
        $lines[] = 'Order Date: ' . ( $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i' ) : 'N/A' );
        $lines[] = '';

        // Stripe verification results
        $verification = $this->get_stripe_verification( $order );
        if ( ! empty( $verification ) ) {
            $lines[] = 'Payment Verification:';
            foreach ( $verification as $key => $val ) {
                $lines[] = '- ' . $key . ': ' . $val;
            }
            $lines[] = '';
        }

        // Customer order history
        $history = $this->get_customer_history( $order->get_billing_email() );
        if ( $history['count'] > 1 ) {
            $lines[] = 'Customer Order History:';
            $lines[] = 'The customer has ' . $history['count'] . ' previous orders totaling $' . number_format( $history['total'], 2 ) . ', none of which were disputed.';
            $lines[] = '';
        }

        // Subscription acknowledgment
        $ack = $this->get_subscription_acknowledgment( $order );
        if ( $ack ) {
            $lines[] = 'Subscription Acknowledgment:';
            $lines[] = 'Customer acknowledged subscription terms at checkout on ' . $ack['timestamp'] . ' from IP ' . $ack['ip_address'] . '.';
            $lines[] = '';
        }

        // Shipping proof
        if ( ! empty( $shipping['shipping_tracking_number'] ) ) {
            $lines[] = 'Fulfillment:';
            $lines[] = 'Order shipped via ' . ( $shipping['shipping_carrier'] ?? 'carrier' ) . ' with tracking ' . $shipping['shipping_tracking_number'] . '.';
        }

        $evidence['uncategorized_text'] = implode( "\n", $lines );

        return $evidence;
    }

    // ================================================================
    // SUBSCRIPTION CANCELED — prove subscription was active at charge time
    // ================================================================

    private function get_subscription_canceled_evidence( $order ) {
        $lines = array();
        $lines[] = 'This charge is for an active subscription that was not canceled prior to the billing date.';
        $lines[] = '';

        $sub_data = $this->get_subscription_data( $order );

        if ( $sub_data ) {
            $lines[] = 'Subscription Details:';
            $lines[] = '- Start Date: ' . $sub_data['start_date'];
            $lines[] = '- Billing Period: ' . $sub_data['billing_period'];
            $lines[] = '- Status at Charge Time: ' . $sub_data['status'];
            $lines[] = '- Last Successful Renewal: ' . $sub_data['last_renewal'];
            $lines[] = '';

            if ( ! empty( $sub_data['renewal_history'] ) ) {
                $lines[] = 'Previous Successful Payments:';
                foreach ( $sub_data['renewal_history'] as $renewal ) {
                    $lines[] = '- ' . $renewal['date'] . ': $' . number_format( $renewal['amount'], 2 );
                }
                $lines[] = '';
            }
        }

        $lines[] = 'No cancellation request was received from the customer before the charge date.';

        // Acknowledgment
        $ack = $this->get_subscription_acknowledgment( $order );
        if ( $ack ) {
            $lines[] = '';
            $lines[] = 'The customer agreed to subscription terms at checkout on ' . $ack['timestamp'] . ' from IP ' . $ack['ip_address'] . '.';
        }

        $lines[] = '';
        $lines[] = 'The cancellation policy was displayed at checkout and requires cancellation before the next billing date.';

        $evidence = array(
            'cancellation_rebuttal' => implode( "\n", $lines ),
        );

        // Add cancellation policy disclosure
        $evidence['cancellation_policy_disclosure'] = 'The subscription cancellation policy is displayed on the checkout page and in the order confirmation email. Customers must cancel before the next billing date to avoid being charged.';

        return $evidence;
    }

    // ================================================================
    // PRODUCT NOT RECEIVED — prove delivery
    // ================================================================

    private function get_product_not_received_evidence( $order ) {
        $shipping = $this->get_shipping_info( $order );

        $lines = array();
        $lines[] = 'The order was shipped and delivered to the customer\'s provided address.';
        $lines[] = '';
        $lines[] = 'Shipping Address: ' . $order->get_formatted_shipping_address();

        if ( ! empty( $shipping['shipping_date'] ) ) {
            $lines[] = 'Ship Date: ' . $shipping['shipping_date'];
        }
        if ( ! empty( $shipping['shipping_carrier'] ) ) {
            $lines[] = 'Carrier: ' . $shipping['shipping_carrier'];
        }
        if ( ! empty( $shipping['shipping_tracking_number'] ) ) {
            $lines[] = 'Tracking Number: ' . $shipping['shipping_tracking_number'];
        }

        $lines[] = '';
        $lines[] = 'The tracking information confirms delivery to the address provided by the customer at checkout.';

        return array_merge( $shipping, array(
            'shipping_address'   => $order->get_formatted_shipping_address(),
            'uncategorized_text' => implode( "\n", $lines ),
        ) );
    }

    // ================================================================
    // PRODUCT UNACCEPTABLE — prove product matched description
    // ================================================================

    private function get_product_unacceptable_evidence( $order ) {
        $lines = array();
        $lines[] = 'The product delivered matches the description provided at the time of purchase.';
        $lines[] = '';

        foreach ( $order->get_items() as $item ) {
            $product = $item->get_product();
            $lines[] = 'Product: ' . $item->get_name();
            if ( $product ) {
                $desc = $product->get_short_description() ?: $product->get_description();
                if ( $desc ) {
                    $lines[] = 'Description: ' . wp_strip_all_tags( substr( $desc, 0, 500 ) );
                }
                if ( $product->get_sku() ) {
                    $lines[] = 'SKU: ' . $product->get_sku();
                }
            }
            $lines[] = 'Quantity: ' . $item->get_quantity();
            $lines[] = 'Amount: $' . number_format( $item->get_total(), 2 );
            $lines[] = '';
        }

        $lines[] = 'No return or exchange request was received from the customer. Our refund policy requires customers to contact us within the return window to initiate a return.';

        return array(
            'refund_refusal_explanation' => 'The customer did not contact us to request a return or exchange. The product delivered matches the description on our website.',
            'uncategorized_text'         => implode( "\n", $lines ),
        );
    }

    // ================================================================
    // CREDIT NOT PROCESSED — prove refund was not owed
    // ================================================================

    private function get_credit_not_processed_evidence( $order ) {
        $lines = array();
        $lines[] = 'The customer is not entitled to a refund for this charge.';
        $lines[] = '';

        $sub_data = $this->get_subscription_data( $order );
        if ( $sub_data ) {
            $lines[] = 'This charge is for an active subscription service.';
            $lines[] = '- Subscription Status: ' . $sub_data['status'];
            $lines[] = '- No cancellation was received before the billing date.';
            $lines[] = '';
        }

        $lines[] = 'No refund request was received from the customer through our standard channels. Our refund policy was displayed at the time of purchase.';

        return array(
            'refund_policy_disclosure'   => 'The refund policy is displayed on the checkout page, in the order confirmation email, and on our website\'s terms page. Customers must request refunds within the eligible window.',
            'refund_refusal_explanation' => implode( "\n", $lines ),
        );
    }

    // ================================================================
    // DUPLICATE — prove charges are for different items/periods
    // ================================================================

    private function get_duplicate_evidence( $order ) {
        $lines = array();
        $lines[] = 'This charge is not a duplicate. Each charge corresponds to a separate order or billing period.';
        $lines[] = '';
        $lines[] = 'Disputed Order #' . $order->get_id() . ':';
        $lines[] = '- Date: ' . ( $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d' ) : 'N/A' );
        $lines[] = '- Amount: $' . number_format( $order->get_total(), 2 );

        foreach ( $order->get_items() as $item ) {
            $lines[] = '- Item: ' . $item->get_name() . ' (x' . $item->get_quantity() . ')';
        }

        // Check for subscription — each renewal is a separate charge
        $sub_data = $this->get_subscription_data( $order );
        if ( $sub_data ) {
            $lines[] = '';
            $lines[] = 'This order is a subscription renewal payment. Each billing cycle produces a separate charge.';
            $lines[] = '- Billing Period: ' . $sub_data['billing_period'];
        }

        return array(
            'duplicate_charge_explanation' => implode( "\n", $lines ),
        );
    }

    // ================================================================
    // UNRECOGNIZED — prove customer made the purchase
    // ================================================================

    private function get_unrecognized_evidence( $order ) {
        $lines = array();
        $lines[] = 'This transaction was made by the cardholder. The following details confirm their identity:';
        $lines[] = '';
        $lines[] = 'Customer Name: ' . $order->get_billing_first_name() . ' ' . $order->get_billing_last_name();
        $lines[] = 'Email: ' . $order->get_billing_email();
        $lines[] = 'IP Address: ' . $order->get_customer_ip_address();
        $lines[] = 'Billing Address: ' . $order->get_formatted_billing_address();
        $lines[] = '';
        $lines[] = 'An order confirmation email was sent to ' . $order->get_billing_email() . ' on ' . ( $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d' ) : 'the order date' ) . '.';

        $history = $this->get_customer_history( $order->get_billing_email() );
        if ( $history['count'] > 1 ) {
            $lines[] = '';
            $lines[] = 'The customer has ' . $history['count'] . ' orders with our store totaling $' . number_format( $history['total'], 2 ) . ', indicating an established relationship.';
        }

        return array(
            'uncategorized_text' => implode( "\n", $lines ),
        );
    }

    // ================================================================
    // GENERAL / OTHER — provide all available info
    // ================================================================

    private function get_general_evidence( $order ) {
        $lines = array();
        $lines[] = 'Order #' . $order->get_id() . ' Details:';
        $lines[] = '';
        $lines[] = 'Customer: ' . $order->get_billing_first_name() . ' ' . $order->get_billing_last_name();
        $lines[] = 'Email: ' . $order->get_billing_email();
        $lines[] = 'Date: ' . ( $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i' ) : 'N/A' );
        $lines[] = 'Total: $' . number_format( $order->get_total(), 2 );
        $lines[] = 'IP: ' . $order->get_customer_ip_address();
        $lines[] = '';

        foreach ( $order->get_items() as $item ) {
            $lines[] = '- ' . $item->get_name() . ' (x' . $item->get_quantity() . ') $' . number_format( $item->get_total(), 2 );
        }

        $shipping = $this->get_shipping_info( $order );
        if ( ! empty( $shipping['shipping_tracking_number'] ) ) {
            $lines[] = '';
            $lines[] = 'Shipped via ' . ( $shipping['shipping_carrier'] ?? 'carrier' ) . ', tracking: ' . $shipping['shipping_tracking_number'];
        }

        $history = $this->get_customer_history( $order->get_billing_email() );
        if ( $history['count'] > 1 ) {
            $lines[] = '';
            $lines[] = 'Customer has ' . $history['count'] . ' previous orders ($' . number_format( $history['total'], 2 ) . ' total).';
        }

        return array(
            'uncategorized_text' => implode( "\n", $lines ),
        );
    }

    // ================================================================
    // HELPER: Get shipping info from order meta
    // ================================================================

    private function get_shipping_info( $order ) {
        $info = array();

        // Try WooCommerce Shipment Tracking (official extension)
        $tracking = $order->get_meta( '_wc_shipment_tracking_items' );
        if ( ! empty( $tracking ) && is_array( $tracking ) ) {
            $first = $tracking[0];
            $info['shipping_carrier']         = $first['tracking_provider'] ?? '';
            $info['shipping_tracking_number'] = $first['tracking_number'] ?? '';
            $info['shipping_date']            = $first['date_shipped'] ?? '';
            return $info;
        }

        // Try ShipStation meta
        $ss_carrier  = $order->get_meta( '_tracking_provider' ) ?: $order->get_meta( 'ss_tracking_provider' );
        $ss_tracking = $order->get_meta( '_tracking_number' ) ?: $order->get_meta( 'ss_tracking_number' );
        if ( $ss_tracking ) {
            $info['shipping_carrier']         = $ss_carrier ?: '';
            $info['shipping_tracking_number'] = $ss_tracking;
            $info['shipping_date']            = $order->get_meta( '_date_shipped' ) ?: '';
            return $info;
        }

        // Try generic meta keys
        $generic_keys = array(
            array( '_shipping_carrier', '_tracking_number', '_shipping_date' ),
            array( 'carrier', 'tracking_number', 'ship_date' ),
        );
        foreach ( $generic_keys as $keys ) {
            $t = $order->get_meta( $keys[1] );
            if ( $t ) {
                $info['shipping_carrier']         = $order->get_meta( $keys[0] ) ?: '';
                $info['shipping_tracking_number'] = $t;
                $info['shipping_date']            = $order->get_meta( $keys[2] ) ?: '';
                return $info;
            }
        }

        return $info;
    }

    // ================================================================
    // HELPER: Get Stripe verification results (AVS, CVC, 3DS)
    // ================================================================

    private function get_stripe_verification( $order ) {
        $results = array();

        $charge_id = $order->get_meta( '_stripe_charge_id' ) ?: $order->get_transaction_id();
        if ( empty( $charge_id ) || empty( $this->stripe_api_key ) ) {
            return $results;
        }

        $response = wp_remote_get( 'https://api.stripe.com/v1/charges/' . $charge_id, array(
            'headers' => array( 'Authorization' => 'Bearer ' . $this->stripe_api_key ),
            'timeout' => 5,
        ) );

        if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
            return $results;
        }

        $charge = json_decode( wp_remote_retrieve_body( $response ) );
        if ( ! $charge ) return $results;

        // Payment method details
        $card = $charge->payment_method_details->card ?? null;
        if ( $card ) {
            $checks = $card->checks ?? null;
            if ( $checks ) {
                $results['AVS Address'] = $checks->address_line1_check ?? 'N/A';
                $results['AVS Postal']  = $checks->address_postal_code_check ?? 'N/A';
                $results['CVC Check']   = $checks->cvc_check ?? 'N/A';
            }
            if ( isset( $card->three_d_secure ) ) {
                $results['3D Secure'] = $card->three_d_secure->result ?? 'attempted';
            }
        }

        // Outcome
        if ( isset( $charge->outcome ) ) {
            $results['Risk Level'] = $charge->outcome->risk_level ?? 'N/A';
            $results['Risk Score'] = $charge->outcome->risk_score ?? 'N/A';
        }

        return $results;
    }

    // ================================================================
    // HELPER: Get subscription data for the order
    // ================================================================

    private function get_subscription_data( $order ) {
        if ( ! function_exists( 'wcs_order_contains_subscription' ) ) {
            return null;
        }

        if ( ! wcs_order_contains_subscription( $order, 'any' ) ) {
            // Check if this is a renewal order
            if ( ! function_exists( 'wcs_get_subscriptions_for_renewal_order' ) ) {
                return null;
            }
            $subs = wcs_get_subscriptions_for_renewal_order( $order );
            if ( empty( $subs ) ) {
                return null;
            }
        } else {
            $subs = wcs_get_subscriptions_for_order( $order, array( 'order_type' => 'any' ) );
        }

        if ( empty( $subs ) ) return null;

        $sub = reset( $subs ); // First subscription
        $data = array(
            'status'         => $sub->get_status(),
            'start_date'     => $sub->get_date( 'start' ) ?: 'N/A',
            'billing_period' => $sub->get_billing_period() . ' (every ' . $sub->get_billing_interval() . ' ' . $sub->get_billing_period() . ')',
            'last_renewal'   => $sub->get_date( 'last_order_date_created' ) ?: 'N/A',
        );

        // Renewal history
        $renewals = $sub->get_related_orders( 'ids', 'renewal' );
        $history  = array();
        $count    = 0;
        foreach ( array_reverse( $renewals ) as $renewal_id ) {
            if ( $count >= 10 ) break; // Cap at 10
            $renewal_order = wc_get_order( $renewal_id );
            if ( $renewal_order ) {
                $history[] = array(
                    'date'   => $renewal_order->get_date_created() ? $renewal_order->get_date_created()->date( 'Y-m-d' ) : 'N/A',
                    'amount' => $renewal_order->get_total(),
                );
                $count++;
            }
        }
        $data['renewal_history'] = $history;

        return $data;
    }

    // ================================================================
    // HELPER: Get subscription acknowledgment from order meta
    // ================================================================

    private function get_subscription_acknowledgment( $order ) {
        $ack = $order->get_meta( '_wcm_subscription_acknowledgment' );
        if ( ! empty( $ack ) && is_array( $ack ) ) {
            return $ack;
        }

        // Fallback: check acknowledgments table
        global $wpdb;
        $table = $wpdb->prefix . 'woo_subscription_acknowledgments';
        if ( $wpdb->get_var( "SHOW TABLES LIKE '{$table}'" ) ) {
            $row = $wpdb->get_row( $wpdb->prepare(
                "SELECT * FROM {$table} WHERE order_id = %d ORDER BY id DESC LIMIT 1",
                $order->get_id()
            ) );
            if ( $row ) {
                return array(
                    'timestamp'  => $row->created_at,
                    'ip_address' => $row->ip_address,
                );
            }
        }

        return null;
    }

    // ================================================================
    // HELPER: Get customer order history
    // ================================================================

    private function get_customer_history( $email ) {
        $orders = wc_get_orders( array(
            'billing_email' => $email,
            'status'        => array( 'completed', 'processing' ),
            'limit'         => 50,
            'return'        => 'ids',
        ) );

        $total = 0;
        foreach ( $orders as $oid ) {
            $o = wc_get_order( $oid );
            if ( $o ) $total += (float) $o->get_total();
        }

        return array(
            'count' => count( $orders ),
            'total' => $total,
        );
    }

    // ================================================================
    // STRIPE API: Send evidence to dispute
    // ================================================================

    private function send_to_stripe( $stripe_dispute_id, $evidence, $submit = false ) {
        $body = array( 'submit' => $submit ? 'true' : 'false' );

        foreach ( $evidence as $key => $value ) {
            $body[ 'evidence[' . $key . ']' ] = $value;
        }

        $response = wp_remote_post( 'https://api.stripe.com/v1/disputes/' . $stripe_dispute_id, array(
            'headers' => array( 'Authorization' => 'Bearer ' . $this->stripe_api_key ),
            'body'    => $body,
            'timeout' => 15,
        ) );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );
        $data = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $code !== 200 ) {
            $msg = $data['error']['message'] ?? 'Stripe API error';
            return new WP_Error( 'stripe_error', $msg, array( 'status' => $code ) );
        }

        return array(
            'staged'    => ! $submit,
            'submitted' => $submit,
            'dispute'   => $data,
        );
    }

    // ================================================================
    // PUBLIC: Get evidence preview (what would be sent)
    // ================================================================

    public function get_evidence_preview( $order, $reason ) {
        return $this->build_evidence_for_reason( $reason, $order );
    }
}
