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
    private function send_subscription_cancellation_alert($subscription) {
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        if (empty($monitoring_server)) {
            return;
        }
        
        $customer = $subscription->get_user();
        $items = $subscription->get_items();
        $product = !empty($items) ? reset($items)->get_product() : null;
        
        $alert_data = array(
            'type' => 'subscription_cancelled',
            'store_url' => home_url(),
            'store_name' => get_bloginfo('name'),
            'subscription_id' => $subscription->get_id(),
            'customer_email' => $subscription->get_billing_email(),
            'customer_name' => $subscription->get_billing_first_name() . ' ' . $subscription->get_billing_last_name(),
            'product_name' => $product ? $product->get_name() : 'Unknown',
            'total' => $subscription->get_total(),
            'billing_period' => $subscription->get_billing_period(),
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
        if (!class_exists('WC_Subscriptions')) {
            return $checks;
        }
        
        $check = array(
            'name' => 'WooCommerce Subscriptions',
            'status' => 'good',
            'details' => array(),
        );
        
        // Check subscription counts
        $stats = $this->get_subscription_stats();
        $check['details']['total_subscriptions'] = $stats['total'];
        $check['details']['active_subscriptions'] = $stats['active'];
        $check['details']['cancelled_subscriptions'] = $stats['cancelled'];
        
        // Check for failed renewal orders in last 24 hours
        $failed_renewals = wcs_get_subscriptions(array(
            'subscription_status' => 'any',
            'meta_query' => array(
                array(
                    'key' => '_failed_order_count',
                    'value' => '0',
                    'compare' => '>',
                ),
            ),
        ));
        
        $check['details']['subscriptions_with_failed_renewals'] = count($failed_renewals);
        
        if (count($failed_renewals) > 5) {
            $check['status'] = 'warning';
            $check['details']['message'] = sprintf(
                __('%d subscriptions have failed renewal attempts. Check payment methods and customer notifications.', 'woo-comprehensive-monitor'),
                count($failed_renewals)
            );
        }
        
        // Check for subscriptions ending soon (next 7 days)
        $ending_soon = array();
        $subscriptions = wcs_get_subscriptions(array(
            'subscription_status' => 'active',
            'subscriptions_per_page' => -1,
        ));
        
        foreach ($subscriptions as $subscription) {
            $end_date = $subscription->get_time('end');
            if ($end_date && $end_date < (time() + 7 * 24 * 60 * 60)) {
                $ending_soon[] = $subscription;
            }
        }
        
        $check['details']['subscriptions_ending_soon'] = count($ending_soon);
        
        if (count($ending_soon) > 10) {
            $check['status'] = 'warning';
            $check['details']['ending_soon_message'] = sprintf(
                __('%d subscriptions ending in next 7 days. Consider renewal campaigns.', 'woo-comprehensive-monitor'),
                count($ending_soon)
            );
        }
        
        $checks[] = $check;
        return $checks;
    }

    /**
     * Get subscription by search term
     */
    public function search_subscriptions($search_term, $status = 'all') {
        if (!class_exists('WC_Subscriptions')) {
            return array();
        }
        
        $args = array(
            'subscriptions_per_page' => -1,
        );
        
        if ($status !== 'all') {
            $args['post_status'] = 'wc-' . $status;
        }
        
        // If search term is numeric, try to get by ID
        if (is_numeric($search_term)) {
            $subscription = wcs_get_subscription($search_term);
            return $subscription ? array($subscription) : array();
        }
        
        // Search by customer details
        $args['meta_query'] = array(
            'relation' => 'OR',
            array(
                'key' => '_billing_email',
                'value' => $search_term,
                'compare' => 'LIKE',
            ),
            array(
                'key' => '_billing_first_name',
                'value' => $search_term,
                'compare' => 'LIKE',
            ),
            array(
                'key' => '_billing_last_name',
                'value' => $search_term,
                'compare' => 'LIKE',
            ),
        );
        
        return wcs_get_subscriptions($args);
    }

    /**
     * Get subscription statistics for dashboard
     */
    public function get_dashboard_stats() {
        if (!class_exists('WC_Subscriptions')) {
            return array();
        }
        
        $stats = $this->get_subscription_stats();
        
        // Get revenue from active subscriptions
        $active_revenue = 0;
        $active_subscriptions = wcs_get_subscriptions(array(
            'subscription_status' => 'active',
            'subscriptions_per_page' => -1,
        ));
        
        foreach ($active_subscriptions as $subscription) {
            $active_revenue += $subscription->get_total();
        }
        
        // Get upcoming renewals (next 30 days)
        $upcoming_renewals = 0;
        $upcoming_revenue = 0;
        
        foreach ($active_subscriptions as $subscription) {
            $next_payment = $subscription->get_time('next_payment');
            if ($next_payment && $next_payment < (time() + 30 * 24 * 60 * 60)) {
                $upcoming_renewals++;
                $upcoming_revenue += $subscription->get_total();
            }
        }
        
        return array(
            'total' => $stats['total'],
            'active' => $stats['active'],
            'active_revenue' => wc_price($active_revenue),
            'upcoming_renewals' => $upcoming_renewals,
            'upcoming_revenue' => wc_price($upcoming_revenue),
            'cancelled' => $stats['cancelled'],
            'failed_renewals' => count(wcs_get_subscriptions(array(
                'subscription_status' => 'any',
                'meta_query' => array(
                    array(
                        'key' => '_failed_order_count',
                        'value' => '0',
                        'compare' => '>',
                    ),
                ),
            ))),
        );
    }
}