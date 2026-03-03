prehensive-monitor'); ?></th>
                            <td>
                                <?php
                                $trial_end = $subscription->meta['_trial_end_date'] ?? '';
                                if ($trial_end) {
                                    echo date_i18n(get_option('date_format'), strtotime($trial_end));
                                } else {
                                    echo '—';
                                }
                                ?>
                            </td>
                        </tr>
                    </table>
                </div>
                
                <div class="wcm-details-section">
                    <h3><?php _e('Customer Details', 'woo-comprehensive-monitor'); ?></h3>
                    <table class="widefat">
                        <tr>
                            <th><?php _e('Customer', 'woo-comprehensive-monitor'); ?></th>
                            <td><?php echo esc_html($subscription->customer_name); ?></td>
                        </tr>
                        <tr>
                            <th><?php _e('Email', 'woo-comprehensive-monitor'); ?></th>
                            <td>
                                <a href="mailto:<?php echo esc_attr($subscription->customer_email); ?>">
                                    <?php echo esc_html($subscription->customer_email); ?>
                                </a>
                            </td>
                        </tr>
                        <tr>
                            <th><?php _e('User ID', 'woo-comprehensive-monitor'); ?></th>
                            <td>
                                <?php if ($subscription->user_id) : ?>
                                    <a href="<?php echo admin_url('user-edit.php?user_id=' . $subscription->user_id); ?>">
                                        <?php echo esc_html($subscription->user_id); ?>
                                    </a>
                                <?php else : ?>
                                    —
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr>
                            <th><?php _e('Gateway', 'woo-comprehensive-monitor'); ?></th>
                            <td><?php echo esc_html($subscription->payment_method); ?></td>
                        </tr>
                    </table>
                </div>
            </div>
            
            <div class="wcm-details-section">
                <h3><?php _e('Related Orders', 'woo-comprehensive-monitor'); ?></h3>
                <?php if (!empty($orders)) : ?>
                    <table class="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <th><?php _e('Order', 'woo-comprehensive-monitor'); ?></th>
                                <th><?php _e('Date', 'woo-comprehensive-monitor'); ?></th>
                                <th><?php _e('Status', 'woo-comprehensive-monitor'); ?></th>
                                <th><?php _e('Total', 'woo-comprehensive-monitor'); ?></th>
                                <th><?php _e('Actions', 'woo-comprehensive-monitor'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($orders as $order) : ?>
                            <tr>
                                <td>
                                    <a href="<?php echo admin_url('post.php?post=' . $order->get_id() . '&action=edit'); ?>">
                                        #<?php echo esc_html($order->get_id()); ?>
                                    </a>
                                </td>
                                <td><?php echo date_i18n(get_option('date_format'), $order->get_date_created()->getTimestamp()); ?></td>
                                <td>
                                    <span class="order-status status-<?php echo esc_attr($order->get_status()); ?>">
                                        <?php echo esc_html($order->get_status()); ?>
                                    </span>
                                </td>
                                <td><?php echo wc_price($order->get_total()); ?></td>
                                <td>
                                    <a href="<?php echo admin_url('post.php?post=' . $order->get_id() . '&action=edit'); ?>" class="button button-small">
                                        <?php _e('View Order', 'woo-comprehensive-monitor'); ?>
                                    </a>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php else : ?>
                    <p><?php _e('No related orders found.', 'woo-comprehensive-monitor'); ?></p>
                <?php endif; ?>
            </div>
            
            <div class="wcm-details-section">
                <h3><?php _e('Subscription Actions', 'woo-comprehensive-monitor'); ?></h3>
                <div class="wcm-actions-grid">
                    <?php if ($status === 'active') : ?>
                        <button type="button" class="button button-danger wcm-cancel-subscription" data-subscription-id="<?php echo esc_attr($subscription->id); ?>">
                            <?php _e('Cancel Subscription', 'woo-comprehensive-monitor'); ?>
                        </button>
                    <?php endif; ?>
                    
                    <?php if ($status === 'cancelled') : ?>
                        <button type="button" class="button wcm-update-status" data-subscription-id="<?php echo esc_attr($subscription->id); ?>" data-status="active">
                            <?php _e('Reactivate', 'woo-comprehensive-monitor'); ?>
                        </button>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * AJAX: Cancel subscription
     */
    public function ajax_cancel_subscription() {
        check_ajax_referer('wcm_subscriptions_nonce', 'nonce');
        
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }
        
        if (!$this->is_wpsubscription_active()) {
            wp_send_json_error('WPSubscription not active');
        }
        
        $subscription_id = isset($_POST['subscription_id']) ? absint($_POST['subscription_id']) : 0;
        
        try {
            // Update subscription status in database
            global $wpdb;
            
            $result = $wpdb->update(
                $wpdb->prefix . 'wps_subscriptions',
                array('status' => 'wps-cancelled'),
                array('id' => $subscription_id),
                array('%s'),
                array('%d')
            );
            
            if ($result) {
                // Add meta for cancellation
                $wpdb->insert(
                    $wpdb->prefix . 'wps_subscriptionmeta',
                    array(
                        'subscription_id' => $subscription_id,
                        'meta_key' => '_cancelled_at',
                        'meta_value' => current_time('mysql'),
                    ),
                    array('%d', '%s', '%s')
                );
                
                // Send alert to monitoring server
                $this->send_subscription_cancellation_alert($subscription_id);
                
                wp_send_json_success(array(
                    'message' => __('Subscription cancelled successfully.', 'woo-comprehensive-monitor'),
                    'subscription_id' => $subscription_id,
                ));
            } else {
                wp_send_json_error('Failed to cancel subscription');
            }
        } catch (Exception $e) {
            wp_send_json_error($e->getMessage());
        }
    }

    /**
     * AJAX: Update subscription status
     */
    public function ajax_update_subscription_status() {
        check_ajax_referer('wcm_subscriptions_nonce', 'nonce');
        
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }
        
        if (!$this->is_wpsubscription_active()) {
            wp_send_json_error('WPSubscription not active');
        }
        
        $subscription_id = isset($_POST['subscription_id']) ? absint($_POST['subscription_id']) : 0;
        $status = isset($_POST['status']) ? sanitize_text_field($_POST['status']) : '';
        
        if (!in_array($status, array('active', 'cancelled', 'on-hold', 'expired'))) {
            wp_send_json_error('Invalid status');
        }
        
        try {
            global $wpdb;
            
            $result = $wpdb->update(
                $wpdb->prefix . 'wps_subscriptions',
                array('status' => 'wps-' . $status),
                array('id' => $subscription_id),
                array('%s'),
                array('%d')
            );
            
            if ($result) {
                wp_send_json_success(array(
                    'message' => sprintf(__('Subscription status updated to %s.', 'woo-comprehensive-monitor'), $status),
                    'subscription_id' => $subscription_id,
                    'status' => $status,
                ));
            } else {
                wp_send_json_error('Failed to update subscription status');
            }
        } catch (Exception $e) {
            wp_send_json_error($e->getMessage());
        }
    }

    /**
     * AJAX: Get subscription orders
     */
    public function ajax_get_subscription_orders() {
        check_ajax_referer('wcm_subscriptions_nonce', 'nonce');
        
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }
        
        if (!$this->is_wpsubscription_active()) {
            wp_send_json_error('WPSubscription not active');
        }
        
        $subscription_id = isset($_POST['subscription_id']) ? absint($_POST['subscription_id']) : 0;
        $orders = $this->get_subscription_orders($subscription_id);
        
        ob_start();
        if (!empty($orders)) :
        ?>
        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th><?php _e('Order', 'woo-comprehensive-monitor'); ?></th>
                    <th><?php _e('Date', 'woo-comprehensive-monitor'); ?></th>
                    <th><?php _e('Status', 'woo-comprehensive-monitor'); ?></th>
                    <th><?php _e('Total', 'woo-comprehensive-monitor'); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($orders as $order) : ?>
                <tr>
                    <td>
                        <a href="<?php echo admin_url('post.php?post=' . $order->get_id() . '&action=edit'); ?>">
                            #<?php echo esc_html($order->get_id()); ?>
                        </a>
                    </td>
                    <td><?php echo date_i18n(get_option('date_format'), $order->get_date_created()->getTimestamp()); ?></td>
                    <td>
                        <span class="order-status status-<?php echo esc_attr($order->get_status()); ?>">
                            <?php echo esc_html($order->get_status()); ?>
                        </span>
                    </td>
                    <td><?php echo wc_price($order->get_total()); ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php
        else :
        ?>
        <p><?php _e('No related orders found.', 'woo-comprehensive-monitor'); ?></p>
        <?php
        endif;
        
        $html = ob_get_clean();
        
        wp_send_json_success(array(
            'html' => $html,
            'count' => count($orders),
        ));
    }

    /**
     * Send subscription cancellation alert to monitoring server
     */
    private function send_subscription_cancellation_alert($subscription_id) {
        $subscription = $this->get_subscription($subscription_id);
        if (!$subscription) {
            return;
        }
        
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        if (empty($monitoring_server)) {
            return;
        }
        
        $product_id = $subscription->meta['_product_id'] ?? 0;
        $product = wc_get_product($product_id);
        
        $alert_data = array(
            'type' => 'subscription_cancelled',
            'store_url' => home_url(),
            'store_name' => get_bloginfo('name'),
            'subscription_id' => $subscription->id,
            'customer_email' => $subscription->customer_email,
            'customer_name' => $subscription->customer_name,
            'product_name' => $product ? $product->get_name() : 'Unknown',
            'total' => $subscription->amount,
            'billing_period' => $subscription->billing_period,
            'cancelled_by' => 'admin',
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
     * Add subscription health check
     */
    public function add_subscription_health_check($checks) {
        if (!$this->is_wpsubscription_active()) {
            return $checks;
        }
        
        $check = array(
            'name' => 'WPSubscription',
            'status' => 'good',
            'details' => array(),
        );
        
        // Check subscription counts
        $stats = $this->get_subscription_stats();
        $check['details']['total_subscriptions'] = $stats['total'];
        $check['details']['active_subscriptions'] = $stats['active'];
        $check['details']['cancelled_subscriptions'] = $stats['cancelled'];
        
        // Check for subscriptions ending soon (next 7 days)
        $ending_soon = 0;
        $subscriptions = $this->get_subscriptions(array('status' => 'active', 'limit' => 0));
        
        foreach ($subscriptions as $subscription) {
            $end_date = $subscription->meta['_end_date'] ?? '';
            if ($end_date && strtotime($end_date) < (time() + 7 * 24 * 60 * 60)) {
                $ending_soon++;
            }
        }
        
        $check['details']['subscriptions_ending_soon'] = $ending_soon;
        
        if ($ending_soon > 10) {
            $check['status'] = 'warning';
            $check['details']['ending_soon_message'] = sprintf(
                __('%d subscriptions ending in next 7 days. Consider renewal campaigns.', 'woo-comprehensive-monitor'),
                $ending_soon
            );
        }
        
        // Check for failed payments
        $failed_payments = 0;
        foreach ($subscriptions as $subscription) {
            $failed_attempts = $subscription->meta['_failed_payment_attempts'] ?? 0;
            if ($failed_attempts > 0) {
                $failed_payments++;
            }
        }
        
        $check['details']['subscriptions_with_failed_payments'] = $failed_payments;
        
        if ($failed_payments > 5) {
            $check['status'] = 'warning';
            $check['details']['failed_payments_message'] = sprintf(
                __('%d subscriptions have failed payment attempts. Check payment methods.', 'woo-comprehensive-monitor'),
                $failed_payments
            );
        }
        
        $checks[] = $check;
        return $checks;
    }

    /**
     * Get dashboard statistics for WPSubscription
     */
    public function get_dashboard_stats() {
        if (!$this->is_wpsubscription_active()) {
            return array();
        }
        
        $stats = $this->get_subscription_stats();
        
        // Get revenue from active subscriptions
        $active_revenue = 0;
        $active_subscriptions = $this->get_subscriptions(array('status' => 'active', 'limit' => 0));
        
        foreach ($active_subscriptions as $subscription) {
            $active_revenue += $subscription->amount;
        }
        
        // Get upcoming renewals (next 30 days)
        $upcoming_renewals = 0;
        $upcoming_revenue = 0;
        
        foreach ($active_subscriptions as $subscription) {
            $next_payment = $subscription->meta['_next_payment_date'] ?? '';
            if ($next_payment && strtotime($next_payment) < (time() + 30 * 24 * 60 * 60)) {
                $upcoming_renewals++;
                $upcoming_revenue += $subscription->amount;
            }
        }
        
        return array(
            'total' => $stats['total'],
            'active' => $stats['active'],
            'active_revenue' => wc_price($active_revenue),
            'upcoming_renewals' => $upcoming_renewals,
            'upcoming_revenue' => wc_price($upcoming_revenue),
            'cancelled' => $stats['cancelled'],
            'failed_payments' => 0, // Would need to query meta for this
        );
    }
}