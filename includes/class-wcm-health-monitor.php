        // Check if any shipping zones are configured
        $shipping_zones = WC_Shipping_Zones::get_zones();
        $check['details']['shipping_zones'] = count($shipping_zones);
        
        if (count($shipping_zones) === 0) {
            $check['status'] = 'warning';
            $check['details']['shipping_message'] = 'No shipping zones configured';
        }
        
        // Check tax settings
        $tax_enabled = wc_tax_enabled();
        $check['details']['tax_enabled'] = $tax_enabled ? 'Yes' : 'No';
        
        if (!$tax_enabled) {
            $check['status'] = 'warning';
            $check['details']['tax_message'] = 'Tax calculation is disabled';
        }
        
        // Check if prices include tax
        $prices_include_tax = get_option('woocommerce_prices_include_tax');
        $check['details']['prices_include_tax'] = $prices_include_tax === 'yes' ? 'Yes' : 'No';
        
        return $check;
    }

    /**
     * Log health check results
     */
    private function log_health_check_results($checks) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_health_logs';
        
        foreach ($checks as $check) {
            $wpdb->insert(
                $table_name,
                array(
                    'check_type' => $check['name'],
                    'status' => $check['status'],
                    'details' => json_encode($check['details']),
                    'created_at' => current_time('mysql'),
                )
            );
        }
    }

    /**
     * Send health alerts to monitoring server
     */
    private function send_health_alerts($checks) {
        $critical_checks = array_filter($checks, function($check) {
            return $check['status'] === 'critical';
        });
        
        if (empty($critical_checks)) {
            return;
        }
        
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        if (empty($monitoring_server)) {
            return;
        }
        
        $alert_data = array(
            'type' => 'health_check_critical',
            'store_url' => home_url(),
            'store_name' => get_bloginfo('name'),
            'critical_checks' => array(),
            'timestamp' => current_time('mysql'),
        );
        
        foreach ($critical_checks as $check) {
            $alert_data['critical_checks'][] = array(
                'name' => $check['name'],
                'details' => $check['details'],
            );
        }
        
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
     * Update overall health score
     */
    private function update_health_score($checks) {
        $scores = array(
            'good' => 100,
            'warning' => 50,
            'critical' => 0,
        );
        
        $total_score = 0;
        $check_count = count($checks);
        
        foreach ($checks as $check) {
            $total_score += $scores[$check['status']];
        }
        
        $average_score = $check_count > 0 ? round($total_score / $check_count) : 100;
        
        update_option('wcm_health_score', $average_score);
        update_option('wcm_health_score_updated', current_time('mysql'));
        
        // Store detailed breakdown
        $breakdown = array();
        foreach ($checks as $check) {
            $breakdown[$check['name']] = array(
                'status' => $check['status'],
                'score' => $scores[$check['status']],
            );
        }
        
        update_option('wcm_health_breakdown', $breakdown);
    }

    /**
     * Get current health score
     */
    public function get_health_score() {
        return array(
            'score' => get_option('wcm_health_score', 100),
            'updated' => get_option('wcm_health_score_updated', ''),
            'breakdown' => get_option('wcm_health_breakdown', array()),
        );
    }

    /**
     * Get recent health check logs
     */
    public function get_recent_health_logs($limit = 50) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_health_logs';
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table_name} ORDER BY created_at DESC LIMIT %d", $limit)
        );
    }

    /**
     * Get health statistics
     */
    public function get_health_stats($days = 30) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'wcm_health_logs';
        $date_cutoff = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        $stats = array(
            'total_checks' => 0,
            'by_status' => array(
                'good' => 0,
                'warning' => 0,
                'critical' => 0,
            ),
            'by_check_type' => array(),
        );
        
        // Total checks
        $stats['total_checks'] = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table_name} WHERE created_at >= %s",
            $date_cutoff
        ));
        
        // Checks by status
        $status_counts = $wpdb->get_results($wpdb->prepare(
            "SELECT status, COUNT(*) as count 
             FROM {$table_name} 
             WHERE created_at >= %s 
             GROUP BY status",
            $date_cutoff
        ));
        
        foreach ($status_counts as $status) {
            $stats['by_status'][$status->status] = $status->count;
        }
        
        // Most common issues
        $common_issues = $wpdb->get_results($wpdb->prepare(
            "SELECT check_type, status, COUNT(*) as count 
             FROM {$table_name} 
             WHERE created_at >= %s AND status IN ('warning', 'critical')
             GROUP BY check_type, status 
             ORDER BY count DESC 
             LIMIT 10",
            $date_cutoff
        ));
        
        foreach ($common_issues as $issue) {
            $stats['by_check_type'][$issue->check_type] = array(
                'status' => $issue->status,
                'count' => $issue->count,
            );
        }
        
        return $stats;
    }
}