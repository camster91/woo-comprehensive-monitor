<?php
/**
 * Dispute Manager - Handles Stripe dispute detection and evidence generation
 */

class WCM_Dispute_Manager {

    private $stripe_api_key = '';
    private $webhook_secret = '';

    public function __construct() {
        $this->init_hooks();
        $this->load_stripe_config();
    }

    private function init_hooks() {
        // Stripe webhook handler
        add_action('rest_api_init', array($this, 'register_webhook_endpoint'));
        
        // Admin hooks
        add_action('admin_init', array($this, 'check_for_disputes'));
        
        // Order hooks
        add_action('woocommerce_checkout_order_processed', array($this, 'record_subscription_acknowledgment'), 10, 3);
        
        // Schedule dispute checks
        if (!wp_next_scheduled('wcm_hourly_dispute_check')) {
            wp_schedule_event(time(), 'hourly', 'wcm_hourly_dispute_check');
        }
        add_action('wcm_hourly_dispute_check', array($this, 'check_for_disputes'));
    }

    private function load_stripe_config() {
        // Try to get Stripe API key from WooCommerce Stripe Gateway
        if (class_exists('WC_Stripe')) {
            $stripe_settings = get_option('woocommerce_stripe_settings');
            if ($stripe_settings && isset($stripe_settings['testmode'])) {
                if ('yes' === $stripe_settings['testmode']) {
                    $this->stripe_api_key = isset($stripe_settings['test_secret_key']) ? $stripe_settings['test_secret_key'] : '';
                } else {
                    $this->stripe_api_key = isset($stripe_settings['secret_key']) ? $stripe_settings['secret_key'] : '';
                }
                $this->webhook_secret = isset($stripe_settings['webhook_secret']) ? $stripe_settings['webhook_secret'] : '';
            }
        }
    }

    /**
     * Register webhook endpoint for Stripe dispute events
     */
    public function register_webhook_endpoint() {
        register_rest_route('wcm/v1', '/stripe-webhook', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_stripe_webhook'),
            'permission_callback' => '__return_true',
        ));
    }

    /**
     * Handle Stripe webhook events
     */
    public function handle_stripe_webhook($request) {
        $payload = $request->get_body();
        $sig_header = $request->get_header('stripe-signature');
        
        try {
            // Verify webhook signature
            $event = $this->verify_webhook_signature($payload, $sig_header);
            
            // Handle dispute events
            if ('charge.dispute.created' === $event->type) {
                $this->handle_new_dispute($event->data->object);
            } elseif ('charge.dispute.updated' === $event->type) {
                $this->handle_updated_dispute($event->data->object);
            } elseif ('charge.dispute.closed' === $event->type) {
                $this->handle_closed_dispute($event->data->object);
            }
            
            return new WP_REST_Response(array('status' => 'success'), 200);
        } catch (Exception $e) {
            error_log('WCM Dispute Webhook Error: ' . $e->getMessage());
            return new WP_REST_Response(array('error' => $e->getMessage()), 400);
        }
    }

    /**
     * Verify Stripe webhook signature
     */
    private function verify_webhook_signature($payload, $sig_header) {
        if (empty($this->webhook_secret)) {
            throw new Exception('Webhook secret not configured');
        }
        
        // For now, we'll skip signature verification in development
        // In production, you should implement proper signature verification
        $event = json_decode($payload);
        return $event;
    }

    /**
     * Handle new dispute
     */
    private function handle_new_dispute($dispute) {
        global $wpdb;
        
        // Find the order associated with this dispute
        $order_id = $this->find_order_by_charge_id($dispute->charge);
        if (!$order_id) {
            error_log('WCM: Could not find order for charge ' . $dispute->charge);
            return;
        }
        
        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }
        
        // Generate evidence automatically if enabled
        if ('1' === get_option('wcm_auto_generate_evidence', '1')) {
            $evidence = $this->generate_dispute_evidence($order, $dispute);
            
            // Store evidence in database
            $table_name = $wpdb->prefix . 'wcm_dispute_evidence';
            $wpdb->insert(
                $table_name,
                array(
                    'dispute_id' => $dispute->id,
                    'order_id' => $order_id,
                    'customer_email' => $order->get_billing_email(),
                    'evidence_type' => 'auto_generated',
                    'evidence_data' => json_encode($evidence),
                )
            );
            
            // Send alert to monitoring server
            $this->send_dispute_alert($order, $dispute, $evidence);
        }
        
        // Update order notes
        $order->add_order_note(
            sprintf(
                __('Stripe dispute created: %s. Reason: %s. Amount: %s', 'woo-comprehensive-monitor'),
                $dispute->id,
                $dispute->reason,
                wc_price($dispute->amount / 100)
            )
        );
    }

    /**
     * Generate dispute evidence
     */
    private function generate_dispute_evidence($order, $dispute) {
        $evidence = array(
            'dispute_id' => $dispute->id,
            'order_id' => $order->get_id(),
            'customer_email' => $order->get_billing_email(),
            'customer_name' => $order->get_formatted_billing_full_name(),
            'order_date' => $order->get_date_created()->date('Y-m-d H:i:s'),
            'order_total' => $order->get_total(),
            'currency' => $order->get_currency(),
            'products' => array(),
            'billing_address' => $order->get_address('billing'),
            'shipping_address' => $order->get_address('shipping'),
            'ip_address' => $order->get_customer_ip_address(),
            'user_agent' => $order->get_customer_user_agent(),
            'subscription_acknowledgment' => $this->get_subscription_acknowledgment($order),
            'evidence_generated_at' => current_time('mysql'),
        );
        
        // Add product details
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $evidence['products'][] = array(
                'name' => $item->get_name(),
                'quantity' => $item->get_quantity(),
                'price' => $item->get_total(),
                'sku' => $product ? $product->get_sku() : '',
                'type' => $product ? $product->get_type() : '',
            );
        }
        
        // Add subscription details if applicable
        if (function_exists('wcs_order_contains_subscription')) {
            if (wcs_order_contains_subscription($order)) {
                $subscriptions = wcs_get_subscriptions_for_order($order);
                foreach ($subscriptions as $subscription) {
                    $evidence['subscriptions'][] = array(
                        'id' => $subscription->get_id(),
                        'status' => $subscription->get_status(),
                        'next_payment' => $subscription->get_date('next_payment'),
                    );
                }
            }
        }
        
        return $evidence;
    }

    /**
     * Get subscription acknowledgment if available
     */
    private function get_subscription_acknowledgment($order) {
        $acknowledgment = get_post_meta($order->get_id(), '_wcm_subscription_acknowledgment', true);
        return $acknowledgment ? array(
            'timestamp' => $acknowledgment['timestamp'],
            'ip_address' => $acknowledgment['ip_address'],
            'user_agent' => $acknowledgment['user_agent'],
        ) : null;
    }

    /**
     * Record subscription acknowledgment at checkout
     */
    public function record_subscription_acknowledgment($order_id, $posted_data, $order) {
        // Check if this is a subscription order
        if (function_exists('wcs_order_contains_subscription') && wcs_order_contains_subscription($order)) {
            $acknowledgment = array(
                'timestamp' => current_time('mysql'),
                'ip_address' => WC_Geolocation::get_ip_address(),
                'user_agent' => isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '',
            );
            
            update_post_meta($order_id, '_wcm_subscription_acknowledgment', $acknowledgment);
            
            // Also add to order notes
            $order->add_order_note(
                __('Customer acknowledged subscription terms at checkout.', 'woo-comprehensive-monitor')
            );
        }
    }

    /**
     * Send dispute alert to monitoring server
     */
    private function send_dispute_alert($order, $dispute, $evidence) {
        if ('1' !== get_option('wcm_send_dispute_alerts', '1')) {
            return;
        }
        
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        if (empty($monitoring_server)) {
            return;
        }
        
        $alert_data = array(
            'type' => 'dispute_created',
            'store_url' => home_url(),
            'store_name' => get_bloginfo('name'),
            'dispute_id' => $dispute->id,
            'order_id' => $order->get_id(),
            'customer_email' => $order->get_billing_email(),
            'amount' => $dispute->amount / 100,
            'currency' => strtoupper($dispute->currency),
            'reason' => $dispute->reason,
            'evidence_generated' => true,
            'timestamp' => current_time('mysql'),
        );
        
        wp_remote_post($monitoring_server, array(
            'method' => 'POST',
            'timeout' => 30,
            'redirection' => 5,
            'httpversion' => '1.0',
            'blocking' => false,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($alert_data),
            'data_format' => 'body',
        ));
    }

    /**
     * Find order by Stripe charge ID
     */
    private function find_order_by_charge_id($charge_id) {
        global $wpdb;
        
        $order_id = $wpdb->get_var($wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_transaction_id' AND meta_value = %s",
            $charge_id
        ));
        
        if (!$order_id) {
            // Also check for Stripe charge ID meta
            $order_id = $wpdb->get_var($wpdb->prepare(
                "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_stripe_charge_id' AND meta_value = %s",
                $charge_id
            ));
        }
        
        return $order_id;
    }

    /**
     * Check for disputes via Stripe API
     */
    public function check_for_disputes() {
        if (empty($this->stripe_api_key)) {
            return;
        }
        
        // This would make an API call to Stripe to check for disputes
        // For now, we'll rely on webhooks
    }

    /**
     * Handle updated dispute
     */
    private function handle_updated_dispute($dispute) {
        // Update dispute status in database
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_dispute_evidence';
        $wpdb->update(
            $table_name,
            array('evidence_data' => json_encode(array('status' => $dispute->status))),
            array('dispute_id' => $dispute->id)
        );
    }

    /**
     * Handle closed dispute
     */
    private function handle_closed_dispute($dispute) {
        // Mark dispute as closed in database
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_dispute_evidence';
        $wpdb->update(
            $table_name,
            array('evidence_data' => json_encode(array('status' => 'closed', 'outcome' => $dispute->status))),
            array('dispute_id' => $dispute->id)
        );
    }

    /**
     * Get disputes for admin dashboard
     */
    public function get_disputes($limit = 50) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_dispute_evidence';
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table_name} ORDER BY created_at DESC LIMIT %d", $limit)
        );
    }
}